import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, STRAND, openLoom } from '../lib/envelope.js';
import { changedFields, keepMine, takeTheirs, theirBody } from '../lib/conflicts.js';
import { pendingChanges } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { runSend } from '../lib/sender.js';
import { fakeString, photo } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

const T = '2026-09-13T10:00:00Z';
const onString = (id, extra = {}) => ({ id, type: BEAD, sourceApp: 'rounds', createdAt: T, state: 'kept', dedupeKey: `rounds:${id}`,
  body: { $type: BEAD, createdAt: T, kind: 'listen', note: `note ${id}` }, ...extra });

/* A record edited in Loom and on the String, then sent: marked conflict by the 412. */
async function inConflict({ remove = false } = {}) {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records: [onString('u1')] });
  const send = () => runSend({ store, client: s.client });
  await runImport({ store, registry: reg, client: s.client });
  s.editOnString('u1', { note: 'edited in Rounds', tags: ['live'] });
  const key = `${BEAD}/u1`;
  const local = await store.getRecord(key);
  if (remove) await loom.remove(key);
  else await loom.save(key, { ...local.body, note: 'edited in Loom' });
  const [result] = await send();
  assert.equal(result.status, 'conflict');
  return { store, loom, s, key, send, reg };
}

const pending = async (store) => [...(await pendingChanges(await store.allRecords()))];

test('changedFields lists the differing top-level fields, Loom’s order first', () => {
  assert.deepEqual(changedFields({ kind: 'listen', note: 'mine', tags: ['a'] }, { kind: 'listen', note: 'theirs', place: { name: 'x' } }), [
    { field: 'note', mine: 'mine', theirs: 'theirs' },
    { field: 'tags', mine: ['a'], theirs: undefined },
    { field: 'place', mine: undefined, theirs: { name: 'x' } },
  ]);
  assert.deepEqual(changedFields({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(changedFields(undefined, null), []);
});

test('keep mine: the next Send carries Loom’s edit over the String’s version', async () => {
  const { store, s, key, send } = await inConflict();
  await keepMine(store, key);
  const r = await store.getRecord(key);
  assert.equal('conflict' in r, false);
  assert.equal(r.stringHlc, s.records[0].hlc);
  assert.deepEqual(await pending(store), [[key, 'edit']]);
  const [result] = await send();
  assert.deepEqual([result.op, result.status], ['patch', 'sent']);
  assert.equal(s.records[0].body.note, 'edited in Loom');
  assert.equal('tags' in s.records[0].body, false, 'the String’s added field is removed: Loom’s version stands whole');
});

test('take theirs: the String’s version replaces Loom’s, nothing to send, and a draft is left alone', async () => {
  const { store, loom, key } = await inConflict();
  await loom.saveDraft(key, { note: 'typed but not saved' }, 'x');
  const before = await store.getRecord(key);
  const next = await takeTheirs(store, key, { now: () => Date.parse('2026-09-15T12:00:00Z') });
  assert.equal(next.body.note, 'edited in Rounds');
  assert.deepEqual(next.body.tags, ['live']);
  assert.equal(next.updatedAt, '2026-09-15T12:00:00.000Z');
  assert.notEqual(next.updatedAt, before.updatedAt, 'an open editor sees the record moved on');
  assert.equal('conflict' in next, false);
  assert.deepEqual(await pending(store), []);
  assert.equal((await loom.getDraft(key)).body.note, 'typed but not saved');
});

test('a delete refused because the String moved on: keep mine deletes it next Send; take theirs brings it back', async () => {
  const first = await inConflict({ remove: true });
  await keepMine(first.store, first.key);
  assert.deepEqual(await pending(first.store), [[first.key, 'delete']]);
  const [result] = await first.send();
  assert.deepEqual([result.op, result.status], ['delete', 'sent']);
  assert.equal(first.s.records.length, 0);

  const second = await inConflict({ remove: true });
  const back = await takeTheirs(second.store, second.key);
  assert.equal('deleted' in back, false);
  assert.equal(back.body.note, 'edited in Rounds');
  assert.deepEqual(await pending(second.store), []);
});

test('deleted on the String: keep mine posts Loom’s copy again as new; take theirs lets it go', async () => {
  const setup = async () => {
    const store = createMemStore();
    const reg = await registry();
    const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
    const s = fakeString({ records: [onString('u1')] });
    await runImport({ store, registry: reg, client: s.client });
    const local = await store.getRecord(`${BEAD}/u1`);
    await loom.save(local.key, { ...local.body, note: 'still mine' });
    s.records.length = 0;
    await runSend({ store, client: s.client });
    return { store, s, key: local.key };
  };
  const a = await setup();
  const mine = await keepMine(a.store, a.key);
  assert.equal(mine.stringId, undefined);
  assert.deepEqual(await pending(a.store), [[a.key, 'new']]);
  const [result] = await runSend({ store: a.store, client: a.s.client });
  assert.deepEqual([result.op, result.status], ['post', 'sent']);
  assert.equal(a.s.records[0].body.note, 'still mine');

  const b = await setup();
  assert.equal(await takeTheirs(b.store, b.key), null);
  assert.equal(await b.store.getRecord(b.key), undefined);
});

test('a record deleted on both sides simply goes when Loom’s side is kept', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records: [onString('u1')] });
  await runImport({ store, registry: reg, client: s.client });
  await loom.remove(`${BEAD}/u1`);
  await store.putRecord({ ...(await store.getRecord(`${BEAD}/u1`)), conflict: { theirs: null, reason: 'send' } });
  assert.equal(await keepMine(store, `${BEAD}/u1`), null);
  assert.equal(await store.getRecord(`${BEAD}/u1`), undefined);
});

test('an import conflict on a strand: their body comes back in Loom’s form; taking it is not a local change', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  const strand = await makeStrand(loom, { title: 'Sunday', items: [{ uri: itemUri(a.key) }] });
  await runSend({ store, client: s.client });
  const onStrand = s.records.find((r) => r.type === STRAND);
  const bId = (await store.getRecord(b.key)).stringId;
  s.editOnString(onStrand.id, { title: 'Sunday, retitled', items: [...onStrand.body.items, { uri: `spine://records/${bId}` }] });
  await loom.save(strand.key, { ...strand.body, title: 'Sunday, in Loom' });
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [strand.key]);
  const record = await store.getRecord(strand.key);
  assert.deepEqual((await theirBody(store, record)).items, [{ uri: itemUri(a.key) }, { uri: itemUri(b.key) }]);
  await takeTheirs(store, strand.key, { registry: reg });
  assert.deepEqual(await pending(store), []);
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(a.key) }, { uri: itemUri(b.key) }]);
});

test('take theirs marks the String version’s photos this browser lacks as missing, and the next import fetches them', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records: [onString('u1')] });
  await runImport({ store, registry: reg, client: s.client });
  const name = `${'e'.repeat(64)}.jpg`;
  s.media[name] = photo('e');
  s.editOnString('u1', { note: 'with a photo now', media: [{ uri: `/media/${name}` }] });
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited in Loom' });
  await runSend({ store, client: s.client });                       // 412: conflict, theirs has the photo
  const next = await takeTheirs(store, local.key);
  assert.deepEqual(next.missing, [name]);
  assert.deepEqual((await store.getRecord(local.key)).missing, [name]);
  const { counts } = await runImport({ store, registry: reg, client: s.client });
  assert.equal(counts.photos, 1);
  assert.ok(await store.getBlob(name.slice(0, 64)));
  assert.equal('missing' in (await store.getRecord(local.key)), false);
});

test('only a record in conflict can be resolved', async () => {
  const store = createMemStore();
  await assert.rejects(keepMine(store, `${BEAD}/none`), /not in conflict/);
  await store.putRecord({ key: `${BEAD}/k`, type: BEAD, body: {} });
  await assert.rejects(takeTheirs(store, `${BEAD}/k`), /not in conflict/);
});
