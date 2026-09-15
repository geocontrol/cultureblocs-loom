import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { planSend, runSend } from '../lib/sender.js';
import { runImport } from '../lib/importer.js';
import { exportBackup, restoreBackup } from '../lib/backup.js';
import { pendingChanges } from '../lib/day.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

async function setup(records = []) {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records });
  return { store, loom, s, reg, importAll: () => runImport({ store, registry: reg, client: s.client }) };
}

const T = '2026-09-13T10:00:00Z';
const onString = (id, extra = {}) => ({ id, type: BEAD, sourceApp: 'rounds', createdAt: T, state: 'kept', dedupeKey: `rounds:${id}`,
  body: { $type: BEAD, createdAt: T, kind: 'listen', note: `note ${id}`, tags: ['jazz'] }, ...extra });
const strandBody = (keys, title = 'Sunday') => ({ day: '2026-09-15T00:00:00Z', title, items: keys.map((k) => ({ uri: itemUri(k) })) });
const statuses = (results) => results.map((r) => [r.op ?? null, r.status]);
const pending = async (store) => [...(await pendingChanges(await store.allRecords()))];

test('planSend orders new beads, bead edits, strands, state changes, then deletes strands before beads — and holds what must wait', async () => {
  const { store, loom, s, importAll } = await setup([onString('e1'), onString('p1', { state: 'proposal' }), onString('d1'),
    { id: 'ds', type: STRAND, sourceApp: 'loom', createdAt: T, state: 'kept', body: { $type: STRAND, createdAt: T, items: [] } }]);
  await importAll();
  const fresh = await makeBead(loom, { note: 'new' });
  const e1 = await store.getRecord(`${BEAD}/e1`);
  await loom.save(e1.key, { ...e1.body, note: 'edited' });
  await loom.keep(`${BEAD}/p1`);
  await loom.remove(`${BEAD}/d1`);
  await loom.remove(`${STRAND}/ds`);
  const told = await makeStrand(loom, strandBody([fresh.key]));
  const orphan = await makeStrand(loom, strandBody([`${BEAD}/elsewhere`]));
  const draft = await makeStrand(loom, strandBody([]));
  await store.putRecord({ ...draft, state: 'draft' });                           // a Phase 1 draft
  const conflicted = await makeBead(loom, { note: 'x' });
  await store.putRecord({ ...conflicted, conflict: { theirs: null, reason: 'send' } });

  const { ready, held } = await planSend(await store.allRecords());
  assert.deepEqual(ready, [
    { op: 'post', key: fresh.key }, { op: 'patch', key: `${BEAD}/e1` }, { op: 'post', key: told.key },
    { op: 'state', key: `${BEAD}/p1` }, { op: 'delete', key: `${STRAND}/ds` }, { op: 'delete', key: `${BEAD}/d1` },
  ]);
  assert.deepEqual(held.map((h) => h.key).sort(), [orphan.key, draft.key, conflicted.key].sort());
  assert.match(held.find((h) => h.key === orphan.key).reason, /waiting for com.cultureblocs.bead\/elsewhere/);
  assert.match(held.find((h) => h.key === conflicted.key).reason, /choose a version/);
  assert.equal(s.calls.filter((c) => !c.startsWith('list')).length, 0, 'planning sends nothing');
});

test('new records: photos first, beads then strands with spine:// items, each linked to the String’s version', async () => {
  const { store, loom, s, importAll } = await setup();
  const uri = await putPhoto(store, photo());
  const bead = await makeBead(loom, { note: 'with photo', media: [{ uri, mime: 'image/jpeg', alt: 'red' }] });
  const strand = await makeStrand(loom, strandBody([bead.key]));

  const results = await runSend({ store, client: s.client, now: () => 5 });
  assert.deepEqual(statuses(results), [['post', 'sent'], ['post', 'sent']]);
  assert.ok(s.media[uri.split('/').pop()], 'the photo reached the String under the same name');
  assert.deepEqual(s.posted.map((p) => [p.dedupeKey, p.sourceApp]), [[`loom:${bead.rkey}`, 'loom'], [`loom:${strand.rkey}`, 'loom']]);
  assert.deepEqual(s.posted[1].body.items, [{ uri: `spine://records/${results[0].stringId}` }]);
  const sent = await store.getRecord(bead.key);
  assert.deepEqual([sent.stringId, sent.sentAt, sent.stringHlc], [results[0].stringId, new Date(5).toISOString(), s.records[0].hlc]);
  assert.deepEqual(sent.stringMedia, [uri.split('/').pop()]);
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(bead.key) }], 'Loom keeps its local item uris');
  assert.deepEqual(await pending(store), []);
  assert.deepEqual(statuses(await runSend({ store, client: s.client })), []);
  const again = await importAll();
  assert.deepEqual([again.counts.unchanged, again.conflicts.length], [2, 0]);
});

test('an edit is a PATCH against the version Loom saw: removed fields sent as null, photos the String has not uploaded again', async () => {
  const name = `${'d'.repeat(64)}.jpg`;
  const { store, loom, s, importAll } = await setup([onString('u1', { body: { $type: BEAD, createdAt: T, kind: 'listen', note: 'a',
    tags: ['jazz'], media: [{ uri: `/media/${name}` }] } })]);
  s.media[name] = photo('d');
  await importAll();
  const local = await store.getRecord(`${BEAD}/u1`);
  const { tags: _, ...withoutTags } = local.body;
  const added = await putPhoto(store, photo('new'));
  await loom.save(local.key, { ...withoutTags, note: 'corrected', media: [...local.body.media, { uri: added }] });
  const seenHlc = local.stringHlc;
  const client = { ...s.client, async patchRecord(id, fields, hlc) {
    assert.equal(hlc, seenHlc);
    assert.equal(fields.tags, null);
    assert.equal(fields.note, 'corrected');
    return s.client.patchRecord(id, fields, hlc);
  } };
  const results = await runSend({ store, client });
  assert.deepEqual(statuses(results), [['patch', 'sent']]);
  assert.deepEqual(s.calls.filter((c) => c.startsWith('media')), [`media ${added.split('/').pop()}`]);
  assert.equal('tags' in s.records[0].body, false);
  assert.equal(s.records[0].body.note, 'corrected');
  assert.equal(s.records[0].sourceApp, 'rounds');
  const after = await store.getRecord(local.key);
  assert.equal(after.stringHlc, s.records[0].hlc);
  assert.deepEqual(await pending(store), []);
  assert.deepEqual((await importAll()).counts.unchanged, 1);
});

test('keeping a proposal is a state change; releasing it is a delete; both reach the String', async () => {
  const { store, loom, s } = await setup([onString('p1', { state: 'proposal' }), onString('p2', { state: 'proposal' })]);
  await runImport({ store, registry: await registry(), client: s.client });
  await loom.keep(`${BEAD}/p1`);
  await loom.remove(`${BEAD}/p2`);
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(statuses(results), [['state', 'sent'], ['delete', 'sent']]);
  assert.deepEqual(s.records.map((r) => [r.id, r.state]), [['p1', 'kept']]);
  assert.equal((await store.getRecord(`${BEAD}/p1`)).importedState, 'kept');
  assert.equal(await store.getRecord(`${BEAD}/p2`), undefined);
  assert.deepEqual(await pending(store), []);
});

test('deleting a bead a sent strand uses: the strand is patched first, then the bead deleted', async () => {
  const { store, loom, s } = await setup();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  const strand = await makeStrand(loom, strandBody([a.key, b.key]));
  await runSend({ store, client: s.client });
  await loom.remove(b.key);
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.op, r.key, r.status]), [['patch', strand.key, 'sent'], ['delete', b.key, 'sent']]);
  const onStrand = s.records.find((r) => r.type === STRAND);
  assert.deepEqual(onStrand.body.items, [{ uri: `spine://records/${(await store.getRecord(a.key)).stringId}` }]);
  assert.equal(s.records.length, 2);
});

test('a bead delete is held until the strand that dropped it is patched, then a later Send sends both', async () => {
  const { store, loom, s } = await setup();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  const strand = await makeStrand(loom, strandBody([a.key, b.key]));
  await runSend({ store, client: s.client });
  const bId = (await store.getRecord(b.key)).stringId;
  await loom.remove(b.key);
  const flaky = { ...s.client, async patchRecord() { throw new Error('timeout'); } };
  const results = await runSend({ store, client: flaky });
  assert.deepEqual(results.map((r) => [r.op, r.key, r.status]), [['patch', strand.key, 'failed'], ['delete', b.key, 'held']]);
  assert.match(results[1].reason, /strand/);
  const onStrand = s.records.find((r) => r.type === STRAND);
  assert.deepEqual(onStrand.body.items.map((it) => it.uri).sort(),
    [`spine://records/${(await store.getRecord(a.key)).stringId}`, `spine://records/${bId}`].sort(),
    'the String strand still lists the bead: the patch never reached it');
  assert.deepEqual(await pending(store), [[b.key, 'delete'], [strand.key, 'edit']]);
  const again = await runSend({ store, client: s.client });
  assert.deepEqual(again.map((r) => [r.op, r.key, r.status]), [['patch', strand.key, 'sent'], ['delete', b.key, 'sent']]);
  assert.deepEqual(await pending(store), []);
});

test('a strand patch answered 412 marks it conflicted and still holds the bead delete', async () => {
  const { store, loom, s } = await setup();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  const strand = await makeStrand(loom, strandBody([a.key, b.key]));
  await runSend({ store, client: s.client });
  const strandId = (await store.getRecord(strand.key)).stringId;
  await loom.remove(b.key);
  s.editOnString(strandId, { title: 'Changed elsewhere' });
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.op, r.key, r.status]), [['patch', strand.key, 'conflict'], ['delete', b.key, 'held']]);
  assert.equal((await store.getRecord(strand.key)).conflict.reason, 'send');
});

test('a PATCH answered 412 marks a conflict with the String’s version and leaves the local edit', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  s.editOnString('u1', { note: 'edited in Rounds' });
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited in Loom' });
  const [result] = await runSend({ store, client: s.client });
  assert.deepEqual([result.op, result.status], ['patch', 'conflict']);
  const after = await store.getRecord(local.key);
  assert.equal(after.body.note, 'edited in Loom');
  assert.deepEqual([after.conflict.reason, after.conflict.theirs.body.note], ['send', 'edited in Rounds']);
  assert.equal(s.records[0].body.note, 'edited in Rounds');
  assert.deepEqual(await pending(store), [], 'a conflict waits for the person');
});

test('a 412 whose String copy already equals the edit is a success: the response was lost', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'sent once' });
  await runSend({ store, client: { ...s.client, async patchRecord(...a) { await s.client.patchRecord(...a); throw new Error('timeout'); } } });
  assert.deepEqual(await pending(store), [[local.key, 'edit']], 'the response never arrived');
  const [again] = await runSend({ store, client: s.client });
  assert.deepEqual([again.op, again.status], ['patch', 'sent']);
  assert.deepEqual(await pending(store), []);
  assert.equal('conflict' in (await store.getRecord(local.key)), false);
});

test('a DELETE answered 412 is a conflict; one answered 404 is done', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1'), onString('u2')]);
  await importAll();
  await loom.remove(`${BEAD}/u1`);
  await loom.remove(`${BEAD}/u2`);
  s.editOnString('u1', { note: 'still wanted in Rounds' });
  s.records.splice(1, 1);                                                   // u2 already gone from the String
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.key, r.status]), [[`${BEAD}/u1`, 'conflict'], [`${BEAD}/u2`, 'sent']]);
  const u1 = await store.getRecord(`${BEAD}/u1`);
  assert.deepEqual([u1.deleted, u1.conflict.theirs.body.note], [true, 'still wanted in Rounds']);
  assert.equal(await store.getRecord(`${BEAD}/u2`), undefined);
  assert.equal(s.records.length, 1);
});

test('an edit or state change to a record deleted on the String is a conflict with nothing on their side', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1'), onString('p1', { state: 'proposal' })]);
  await importAll();
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited' });
  await loom.keep(`${BEAD}/p1`);
  s.records.length = 0;
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(statuses(results), [['patch', 'conflict'], ['state', 'conflict']]);
  assert.equal((await store.getRecord(local.key)).conflict.theirs, null);
  assert.match(results[0].reason, /deleted on the String/);
});

test('a record from Phase 1 with no String version fetches it first, and conflicts if the String moved on', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1'), onString('u2')]);
  await importAll();
  for (const key of [`${BEAD}/u1`, `${BEAD}/u2`]) {
    const { stringHlc: _h, stringKeys: _k, stringMedia: _m, ...phase1 } = await store.getRecord(key);
    await store.putRecord(phase1);
    await loom.save(key, { ...phase1.body, note: `edited ${key}` });
  }
  s.editOnString('u2', { note: 'moved on' });
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.key, r.status]), [[`${BEAD}/u1`, 'sent'], [`${BEAD}/u2`, 'conflict']]);
  assert.ok(s.calls.includes('getRecord u1'));
  assert.equal(s.records[0].body.note, `edited ${BEAD}/u1`);
  assert.equal(s.records[1].body.note, 'moved on');
});

test('a Phase 1 record whose String copy was kept/published elsewhere (state changed, body same) is a conflict', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  const { stringHlc: _h, stringKeys: _k, stringMedia: _m, ...phase1 } = await store.getRecord(`${BEAD}/u1`);
  await store.putRecord(phase1);
  await loom.save(phase1.key, { ...phase1.body, note: 'edited locally' });
  await s.client.setState('u1', 'published');
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.op, r.status]), [['patch', 'conflict']]);
  assert.ok(s.calls.includes('getRecord u1'));
  assert.equal(s.calls.includes('patch u1'), false, 'nothing was written to the String');
  const after = await store.getRecord(phase1.key);
  assert.equal(after.body.note, 'edited locally');
  assert.deepEqual([after.conflict.reason, after.conflict.theirs.state], ['send', 'published']);
  assert.equal(s.records[0].body.note, 'note u1');
});

test('content the String refuses stays pending with its problems; a photo missing locally fails that record only', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  const rejected = await makeBead(loom, { note: 'String says no' });
  const fine = await makeBead(loom, { note: 'fine' });
  const nophoto = await makeBead(loom, { note: 'lost photo', media: [{ uri: `/media/${'a'.repeat(64)}.jpg` }] });
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'refused edit' });
  const reject = { [`loom:${rejected.rkey}`]: ['$.kind: unknown on this String'], u1: ['$.note: refused'] };
  const strict = fakeString({ records: s.records, reject });
  const results = Object.fromEntries((await runSend({ store, client: strict.client })).map((r) => [r.key, r]));
  assert.deepEqual([results[rejected.key].status, results[rejected.key].problems], ['invalid', ['$.kind: unknown on this String']]);
  assert.equal(results[fine.key].status, 'sent');
  assert.deepEqual([results[nophoto.key].status, /not in this browser/.test(results[nophoto.key].reason)], ['failed', true]);
  assert.deepEqual([results[local.key].status, results[local.key].problems], ['invalid', ['$.note: refused']]);
  assert.deepEqual((await store.getRecord(local.key)).problems, ['$.note: refused']);
  assert.equal((await store.getRecord(rejected.key)).stringId, undefined);
  assert.deepEqual((await pending(store)).map(([k]) => k).sort(), [rejected.key, nophoto.key, local.key].sort());
});

test('an unreachable String fails each change and keeps it pending; a refused token stops the Send', async () => {
  const { store, loom, s } = await setup();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  s.state.offline = true;
  assert.deepEqual(statuses(await runSend({ store, client: s.client })), [['post', 'failed'], ['post', 'failed']]);
  assert.equal((await pending(store)).length, 2);
  s.state.offline = false;
  const denied = { ...s.client, async postMedia() { throw Object.assign(new Error('HTTP 401'), { status: 401 }); },
    async postRecords() { throw Object.assign(new Error('HTTP 401'), { status: 401 }); } };
  const results = await runSend({ store, client: denied });
  assert.equal(results.length, 1);
  assert.match(results[0].reason, /check it in settings/);
  assert.ok([a.key, b.key].includes(results[0].key));
});

const gate = () => {
  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  return { open, arrived, async pass() { reached(); await opened; } };
};

test('an edit saved while its record is on its way survives, and reads as a new change', async () => {
  const { store, loom, s, importAll } = await setup();
  const bead = await makeBead(loom, { note: 'as posted' });
  const g = gate();
  const client = { ...s.client, async postRecords(batch) { await g.pass(); return s.client.postRecords(batch); } };
  const sending = runSend({ store, client });
  await g.arrived;
  await loom.save(bead.key, { ...bead.body, note: 'edited during send' });
  g.open();
  const [result] = await sending;
  assert.equal(result.status, 'sent');
  const after = await store.getRecord(bead.key);
  assert.equal(after.body.note, 'edited during send');
  assert.notEqual(await contentHash(after.body), after.importedHash);
  assert.deepEqual(await pending(store), [[bead.key, 'edit']]);
  assert.deepEqual((await importAll()).counts.update, 0);
  assert.deepEqual(statuses(await runSend({ store, client: s.client })), [['patch', 'sent']]);
  assert.equal(s.records[0].body.note, 'edited during send');
});

test('a delete taken back while it was on its way leaves a conflict rather than a record the String no longer has', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  await loom.remove(`${BEAD}/u1`);
  const g = gate();
  const client = { ...s.client, async deleteRecord(...a) { await g.pass(); return s.client.deleteRecord(...a); } };
  const sending = runSend({ store, client });
  await g.arrived;
  await loom.undoRemove(`${BEAD}/u1`);
  g.open();
  const [result] = await sending;
  assert.equal(result.status, 'conflict');
  assert.equal((await store.getRecord(`${BEAD}/u1`)).conflict.theirs, null);
});

test('a lost POST response: the resend is answered duplicate and linked to the one record on the String', async () => {
  const { store, loom, s } = await setup();
  const bead = await makeBead(loom, { note: 'first' });
  await runSend({ store, client: s.client });
  const { stringId, sentAt: _s, stringHash: _h, importedHash: _i, importedState: _t, stringHlc: _v, stringKeys: _k, stringMedia: _m, ...lost } = await store.getRecord(bead.key);
  await store.putRecord(lost);
  const [again] = await runSend({ store, client: s.client });
  assert.deepEqual([again.status, again.stringId, s.records.length], ['sent', stringId, 1]);
  assert.deepEqual(await pending(store), []);
});

test('restoring a backup taken before a send, then importing, links the sent records instead of copying them', async () => {
  const { store, loom, s, importAll } = await setup();
  const bead = await makeBead(loom, { note: 'a' });
  await makeStrand(loom, strandBody([bead.key]));
  const doc = JSON.parse(JSON.stringify(await exportBackup(store)));
  await runSend({ store, client: s.client });
  await restoreBackup(store, doc);
  const { counts, conflicts } = await importAll();
  assert.deepEqual([counts.add, counts.link, conflicts.length], [0, 2, 0]);
  assert.ok((await store.allRecords()).every((r) => r.stringId && r.stringHlc));
  assert.deepEqual(await runSend({ store, client: s.client }), []);
  assert.equal(s.posted.length, 2, 'nothing was posted again');
});
