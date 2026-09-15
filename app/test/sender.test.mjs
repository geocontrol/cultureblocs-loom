import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { planSend, runSend } from '../lib/sender.js';
import { runImport } from '../lib/importer.js';
import { exportBackup, restoreBackup } from '../lib/backup.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { registry, steppingNow } from './helpers.mjs';

async function setup() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  return { store, loom };
}

const strandBody = (keys, title = 'Sunday') => ({ $type: STRAND, createdAt: '2026-09-15T20:00:00Z',
  day: '2026-09-15T00:00:00Z', title, items: keys.map((k) => ({ uri: itemUri(k) })) });

test('planSend: beads first, finished strands after, drafts and waiting strands held', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  const told = await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const draft = await loom.create(STRAND, strandBody([bead.key], 'draft'), { origin: 'compose', state: 'draft' });
  const orphan = await loom.create(STRAND, strandBody(['com.cultureblocs.bead/elsewhere']), { origin: 'compose', state: 'kept' });
  const { ready, held } = planSend(await store.allRecords());
  assert.deepEqual(ready.map((r) => r.key), [bead.key, told.key]);
  assert.deepEqual(held, [
    { key: draft.key, reason: 'still a draft' },
    { key: orphan.key, reason: 'waiting for com.cultureblocs.bead/elsewhere' },
  ]);
});

test('runSend uploads photos, posts beads then strands with spine:// items, and records String ids', async () => {
  const { loom, store } = await setup();
  const uri = await putPhoto(store, photo());
  const bead = await loom.mint({ note: 'with photo' });
  await loom.save(bead.key, { ...bead.body, media: [{ uri, mime: 'image/jpeg' }] });
  const strand = await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const s = fakeString();

  const results = await runSend({ store, client: s.client, now: () => 5 });
  assert.deepEqual(results.map((r) => r.status), ['sent', 'sent']);
  assert.ok(s.media[uri.split('/').pop()], 'the photo reached the String under the same name');
  assert.deepEqual(s.posted.map((p) => [p.dedupeKey, p.sourceApp]), [[`loom:${bead.rkey}`, 'loom'], [`loom:${strand.rkey}`, 'loom']]);
  assert.deepEqual(s.posted[1].body.items, [{ uri: `spine://records/${results[0].stringId}` }]);
  const sentBead = await store.getRecord(bead.key);
  assert.equal(sentBead.stringId, results[0].stringId);
  assert.equal(sentBead.sentAt, new Date(5).toISOString());
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(bead.key) }], 'Loom keeps its local item uris');
});

test('sending again is harmless: nothing unsent, and a lost response is recovered by dedupe', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  assert.deepEqual(await runSend({ store, client: s.client }), []);

  const env = await store.getRecord(bead.key);
  const { stringId: _, sentAt: __, ...unsentAgain } = env;          // as if the response never arrived
  await store.putRecord(unsentAgain);
  const [again] = await runSend({ store, client: s.client });
  assert.equal(again.status, 'sent');
  assert.equal(again.stringId, env.stringId);
  assert.equal(s.records.length, 1);
});

test('a record the String rejects stays unsent with its problems; a photo missing locally fails that record only', async () => {
  const { loom, store } = await setup();
  const rejected = await loom.mint({ note: 'String says no' });
  const fine = await loom.mint({ note: 'fine' });
  const nophoto = await loom.mint({ note: 'lost photo' });
  await store.putRecord({ ...nophoto, body: { ...nophoto.body, media: [{ uri: `/media/${'a'.repeat(64)}.jpg` }] } });
  const s = fakeString({ reject: { [`loom:${rejected.rkey}`]: ['$.kind: unknown on this String'] } });
  const results = Object.fromEntries((await runSend({ store, client: s.client })).map((r) => [r.key, r]));
  assert.deepEqual(results[rejected.key], { key: rejected.key, status: 'invalid', problems: ['$.kind: unknown on this String'] });
  assert.equal(results[fine.key].status, 'sent');
  assert.equal(results[nophoto.key].status, 'failed');
  assert.match(results[nophoto.key].reason, /not in this browser/);
  assert.equal((await store.getRecord(rejected.key)).stringId, undefined);
});

const gate = () => {
  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  return { open, arrived, async pass() { reached(); await opened; } };
};

test('an edit saved while its record is being posted survives, and reads as a local change', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'as posted' });
  const s = fakeString();
  const g = gate();
  const client = { ...s.client, async postRecords(batch) { await g.pass(); return s.client.postRecords(batch); } };
  const sending = runSend({ store, client, now: () => 5 });
  await g.arrived;
  await loom.save(bead.key, { ...bead.body, note: 'edited during send' });
  g.open();
  const [result] = await sending;
  assert.equal(result.status, 'sent');
  const after = await store.getRecord(bead.key);
  assert.equal(after.body.note, 'edited during send');
  assert.equal(after.stringId, result.stringId);
  assert.notEqual(await contentHash(after.body), after.importedHash, 'the newer edit is a local change');
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual([counts.update, counts.unchanged], [0, 1]);
  assert.equal((await store.getRecord(bead.key)).body.note, 'edited during send');
});

test('a lost response, a local edit, then a resend answered "duplicate": the edit stays a local change', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'first' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  const { stringId, sentAt: _s, stringHash: _h, importedHash: _i, importedState: _t, ...lost } = await store.getRecord(bead.key);
  await store.putRecord(lost);                                          // the response never arrived
  await loom.save(bead.key, { ...bead.body, note: 'edited after the lost response' });
  const [again] = await runSend({ store, client: s.client });
  assert.deepEqual([again.status, again.stringId, s.records.length], ['sent', stringId, 1]);
  const reg = await registry();
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.equal(first.counts.update, 0);
  assert.equal((await store.getRecord(bead.key)).body.note, 'edited after the lost response');
  s.records[0].body.note = 'changed on the String';
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(second.conflicts, [bead.key]);
  assert.equal((await store.getRecord(bead.key)).body.note, 'edited after the lost response');
});

test('restoring a backup taken before a send, then importing, links the sent records instead of copying them', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const doc = JSON.parse(JSON.stringify(await exportBackup(store)));
  const s = fakeString();
  await runSend({ store, client: s.client });
  await restoreBackup(store, doc);
  const reg = await registry();
  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.add, counts.link, conflicts.length], [0, 2, 0]);
  const all = await store.allRecords();
  assert.equal(all.length, 2);
  assert.ok(all.every((r) => r.stringId && r.sentAt));
  assert.deepEqual(await runSend({ store, client: s.client }), []);
  assert.equal(s.posted.length, 2, 'nothing was posted again');
  const again = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([again.counts.unchanged, again.counts.conflict], [2, 0]);
});

test('a sent record comes back from the next import as unchanged, not as a conflict', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  const { runImport } = await import('../lib/importer.js');
  const { counts, conflicts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual(conflicts, []);
  assert.equal(counts.unchanged, 2);
  assert.equal(counts.add, 0);
});
