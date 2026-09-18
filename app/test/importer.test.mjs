import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, runImport } from '../lib/importer.js';
import { createMemStore } from '../lib/memstore.js';
import { mediaName, sha256Hex } from '../lib/media.js';
import { migrateStore } from '../lib/migrate.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { openLoom } from '../lib/envelope.js';
import { runSend } from '../lib/sender.js';
import { makeBead, registry, steppingNow } from './helpers.mjs';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const T = '2026-09-13T10:00:00Z';
const bead = (id, note, extra = {}) => ({ id, type: B, sourceApp: 'pocket', createdAt: T, state: 'kept', hlc: null,
  body: { $type: B, createdAt: T, kind: 'bloc', note }, ...extra });

async function nameOf(blob) {
  return mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
}

test('first import adds records, rewrites strand items to local keys, fetches photos', async () => {
  const pic = photo();
  const name = await nameOf(pic);
  const s = fakeString({
    records: [
      bead('u1', 'with a photo', { body: { $type: B, createdAt: T, kind: 'bloc', note: 'p', media: [{ uri: `/media/${name}` }] } }),
      bead('u2', 'plain'),
      { id: 'u3', type: S, sourceApp: 'timeline', createdAt: T, state: 'draft',
        body: { $type: S, createdAt: T, title: 'Saturday', items: [{ uri: 'spine://records/u1' }, { uri: 'spine://records/elsewhere' }] } },
    ],
    media: { [name]: pic },
  });
  const store = createMemStore();
  const { counts, conflicts } = await runImport({ store, registry: await registry(), client: s.client, now: () => 1 });
  assert.equal(counts.add, 3);
  assert.equal(counts.photos, 1);
  assert.deepEqual(conflicts, []);
  const strand = await store.getRecord(`${S}/u3`);
  assert.deepEqual(strand.body.items, [{ uri: `loom://${B}/u1` }, { uri: 'spine://records/elsewhere' }]);
  assert.equal(strand.state, 'draft');
  assert.equal(strand.stringId, 'u3');
  assert.equal(strand.origin, 'import');
  assert.ok(await store.getBlob(name.slice(0, 64)));
  assert.equal(await store.getMeta('lastImportAt'), new Date(1).toISOString());
});

test('re-import: unchanged, updated from the String, and a conflict marked with the String’s version', async () => {
  const s = fakeString({ records: [bead('u1', 'one'), bead('u2', 'two'), bead('u3', 'three')] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });

  s.records[1].body.note = 'two, edited on the String';                 // u2: String changed
  s.records[2].body.note = 'three, edited on the String';               // u3: both changed
  const u3 = await store.getRecord(`${B}/u3`);
  await store.putRecord({ ...u3, body: { ...u3.body, note: 'three, edited in Loom' } });

  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.add, counts.update, counts.unchanged, counts.conflict], [0, 1, 1, 1]);
  assert.deepEqual(conflicts, [`${B}/u3`]);
  assert.equal((await store.getRecord(`${B}/u2`)).body.note, 'two, edited on the String');
  const u3After = await store.getRecord(`${B}/u3`);
  assert.equal(u3After.body.note, 'three, edited in Loom');
  assert.equal(u3After.conflict.reason, 'import');
  assert.equal(u3After.conflict.theirs.body.note, 'three, edited on the String');
  assert.equal('conflict' in (await store.getRecord(`${B}/u2`)), false);
});

test('every imported record keeps the String’s version, body keys and photos, for Send', async () => {
  const name = `${'c'.repeat(64)}.jpg`;
  const s = fakeString({ records: [bead('u1', 'one', { body: { $type: B, createdAt: T, kind: 'bloc', note: 'one', media: [{ uri: `/media/${name}` }] } })],
    media: { [name]: photo('c') } });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const local = await store.getRecord(`${B}/u1`);
  assert.equal(local.stringHlc, s.records[0].hlc);
  assert.deepEqual(local.stringKeys, ['$type', 'createdAt', 'kind', 'note', 'media']);
  assert.deepEqual(local.stringMedia, [name]);

  s.records[0].hlc = '0000000000099-00000-fake';                    // restamped on the String, body unchanged (a publish)
  const again = await runImport({ store, registry: reg, client: s.client });
  assert.equal(again.counts.unchanged, 1);
  assert.equal((await store.getRecord(`${B}/u1`)).stringHlc, '0000000000099-00000-fake');
});

test('keeping an imported proposal in Loom is a local change the String does not overwrite', async () => {
  const s = fakeString({ records: [bead('u1', '5 tracks', { state: 'proposal', sourceApp: 'scrobbler' })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const local = await store.getRecord(`${B}/u1`);
  await store.putRecord({ ...local, state: 'kept' });
  s.records[0].body.note = '6 tracks';
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [`${B}/u1`]);
  assert.equal((await store.getRecord(`${B}/u1`)).state, 'kept');
});

test('a record deleted in Loom is never re-added or updated by import; changed on the String it becomes a conflict', async () => {
  const s = fakeString({ records: [bead('u1', '5 tracks', { state: 'proposal', sourceApp: 'scrobbler' })] });
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  await runImport({ store, registry: reg, client: s.client });
  await loom.remove(`${B}/u1`);                                        // released: deleted on the next Send
  const again = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([again.counts.add, again.counts.update, again.counts.unchanged, again.conflicts.length], [0, 0, 1, 0]);
  s.records[0].body.note = '6 tracks';
  const changed = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([changed.counts.update, changed.conflicts], [0, [`${B}/u1`]]);
  const local = await store.getRecord(`${B}/u1`);
  assert.deepEqual([local.deleted, local.body.note, local.conflict.reason, local.conflict.theirs.body.note], [true, '5 tracks', 'import', '6 tracks']);
  assert.equal((await store.allRecords()).length, 1);
});

test('a local delete never wipes a String-side change: import then Send leaves the edited record on the String', async () => {
  const s = fakeString({ records: [bead('u1', 'one')] });
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  await runImport({ store, registry: reg, client: s.client });
  await loom.remove(`${B}/u1`);
  s.editOnString('u1', { note: 'edited on the String after Loom saw it' });
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [`${B}/u1`]);
  assert.equal((await store.getRecord(`${B}/u1`)).stringHlc === s.records[0].hlc, false, 'the version Send deletes against is not refreshed');
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.key, r.status]), [[`${B}/u1`, 'held']]);
  assert.equal(s.records.length, 1);
  assert.equal(s.records[0].body.note, 'edited on the String after Loom saw it');
});

test('a released Phase 1 proposal, kept and edited on the String, becomes a conflict on import, not a delete', async () => {
  const s = fakeString({ records: [bead('p1', 'proposed', { state: 'proposal' })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const { stringHlc: _h, stringKeys: _k, stringMedia: _m, ...phase1 } = await store.getRecord(`${B}/p1`);
  await store.putRecord({ ...phase1, state: 'released' });
  await migrateStore(store);
  s.editOnString('p1', { note: 'someone kept and edited' });
  s.records[0].state = 'kept';
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [`${B}/p1`]);
  await runSend({ store, client: s.client });
  assert.deepEqual(s.records.map((r) => [r.id, r.state, r.body.note]), [['p1', 'kept', 'someone kept and edited']]);
});

test('a deleted record only restamped on the String stays unchanged and takes the new version', async () => {
  const s = fakeString({ records: [bead('u1', 'one')] });
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  await runImport({ store, registry: reg, client: s.client });
  await loom.remove(`${B}/u1`);
  s.records[0].hlc = '0000000000099-00000-fake';
  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.unchanged, conflicts.length], [1, 0]);
  assert.equal((await store.getRecord(`${B}/u1`)).stringHlc, '0000000000099-00000-fake');
  assert.deepEqual((await runSend({ store, client: s.client })).map((r) => r.status), ['sent']);
  assert.equal(s.records.length, 0);
});

test('a String edit to a record Loom made updates it like any other; a provenance change is a conflict', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const made = await makeBead(loom, { note: 'as written' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  s.records[0].body.note = 'corrected on the String';
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([first.counts.update, first.counts.conflict], [1, 0]);
  assert.equal((await store.getRecord(made.key)).body.note, 'corrected on the String');

  s.records[0].body.provenance = { ...s.records[0].body.provenance, mintedAt: '2020-01-01T00:00:00Z' };
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(second.conflicts, [made.key]);
  const local = await store.getRecord(made.key);
  assert.equal(local.body.provenance.mintedAt, made.body.provenance.mintedAt);
  assert.equal(local.conflict.theirs.body.provenance.mintedAt, '2020-01-01T00:00:00Z');
});

test('an invalid String record is imported and flagged, not dropped', async () => {
  const s = fakeString({ records: [{ ...bead('u1', 'x'), body: { $type: B, createdAt: T } }] });
  const store = createMemStore();
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.equal(counts.invalid, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).invalid, ['$.kind: required field missing']);
});

test('a photo that cannot be fetched is recorded as missing and retried on the next import', async () => {
  const pic = photo('later');
  const name = await nameOf(pic);
  const failMedia = new Set([name]);
  const s = fakeString({ records: [bead('u1', 'p', { body: { $type: B, createdAt: T, kind: 'bloc', media: [{ uri: `/media/${name}` }] } })],
    media: { [name]: pic }, failMedia });
  const store = createMemStore();
  const reg = await registry();
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.equal(first.counts.missing, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).missing, [name]);
  failMedia.clear();
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.equal(second.counts.photos, 1);
  assert.equal('missing' in (await store.getRecord(`${B}/u1`)), false);
});

test('an edit saved while an import fetches a photo is a conflict, and the edit survives', async () => {
  const pic = photo('arrives later');
  const name = await nameOf(pic);
  const s = fakeString({ records: [bead('u1', 'one')], media: { [name]: pic } });
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  await runImport({ store, registry: reg, client: s.client });
  s.records[0].body = { ...s.records[0].body, note: 'one, with a photo', media: [{ uri: `/media/${name}` }] };

  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  const client = { ...s.client, async getMedia(n) { reached(); await opened; return s.client.getMedia(n); } };
  const importing = runImport({ store, registry: reg, client });
  await arrived;
  const local = await store.getRecord(`${B}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited in Loom meanwhile' });
  open();
  const { counts, conflicts } = await importing;
  assert.deepEqual([counts.update, counts.conflict], [0, 1]);
  assert.deepEqual(conflicts, [`${B}/u1`]);
  assert.equal((await store.getRecord(`${B}/u1`)).body.note, 'edited in Loom meanwhile');
});

test('import lists the String day by day and keeps only record types Loom knows', async () => {
  const s = fakeString({ records: [
    bead('u1', 'Saturday'),
    bead('u2', 'Sunday', { createdAt: '2026-09-14T10:00:00Z', body: { $type: B, createdAt: '2026-09-14T10:00:00Z', kind: 'bloc', note: 'Sunday' } }),
    { id: 'x1', type: 'com.example.unknown', sourceApp: 'elsewhere', createdAt: T, state: 'kept', body: { anything: true } },
  ] });
  const store = createMemStore();
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual(s.calls, ['listDays', 'listRecordsForDay 2026-09-14', 'listRecordsForDay 2026-09-13']);
  assert.equal(counts.add, 2);
  assert.deepEqual((await store.allRecords()).map((r) => r.key).sort(), [`${B}/u1`, `${B}/u2`]);
});

const strand = (id, items, extra = {}) => ({ id, type: S, sourceApp: 'timeline', createdAt: T, state: 'kept',
  body: { $type: S, createdAt: T, title: 'Saturday', items: items.map((i) => ({ uri: `spine://records/${i}` })) }, ...extra });

test('a strand re-imported unchanged stays unchanged', async () => {
  const s = fakeString({ records: [bead('u1', 'one'), strand('s1', ['u1'])] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const before = await store.getRecord(`${S}/s1`);
  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.unchanged, counts.update, conflicts.length], [2, 0, 0]);
  assert.deepEqual(await store.getRecord(`${S}/s1`), before);
});

test('a strand member that arrives after its strand is linked in on the next import, with no conflict', async () => {
  const s = fakeString({ records: [strand('s1', ['u9']), strand('s2', ['u9'], { body: { $type: S, createdAt: T, title: 'edited here', items: [{ uri: 'spine://records/u9' }] } })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const s2 = await store.getRecord(`${S}/s2`);
  await store.putRecord({ ...s2, body: { ...s2.body, title: 'retitled in Loom' } });   // s2 changed locally
  s.records.push(bead('u9', 'late'));
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([second.counts.add, second.counts.conflict], [1, 0]);
  const s1 = await store.getRecord(`${S}/s1`);
  assert.deepEqual(s1.body.items, [{ uri: `loom://${B}/u9` }]);
  assert.equal(await contentHash(s1.body), s1.importedHash, 'the rewrite is not a local change');
  assert.deepEqual((await store.getRecord(`${S}/s2`)).body.items, [{ uri: 'spine://records/u9' }], 'a locally changed strand is left alone');
  const third = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([third.counts.unchanged, third.counts.conflict], [3, 0]);
});

test('a photo that still cannot be fetched on retry is counted as missing', async () => {
  const pic = photo('never');
  const name = await nameOf(pic);
  const s = fakeString({ records: [bead('u1', 'p', { body: { $type: B, createdAt: T, kind: 'bloc', media: [{ uri: `/media/${name}` }] } })],
    failMedia: new Set([name]) });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.equal(second.counts.missing, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).missing, [name]);
});

test('planImport is decided by hashes and states alone', async () => {
  const rec = bead('u1', 'x');
  const h = await contentHash(rec.body);
  const local = { key: `${B}/u1`, body: rec.body, state: 'kept', stringHash: h, importedHash: h, importedState: 'kept' };
  assert.equal((await planImport([rec], new Map([['u1', local]])))[0].action, 'unchanged');
  assert.equal((await planImport([{ ...rec, state: 'proposal' }], new Map([['u1', local]])))[0].action, 'update');
});

test('a server that is not a String is refused before anything is read', async () => {
  const store = createMemStore();
  const client = { async health() { throw new Error('http://localhost:8100/health: this does not look like a String'); } };
  await assert.rejects(runImport({ store, registry: await registry(), client }), /does not look like a String/);
  assert.deepEqual(await store.allRecords(), []);
});

test('import carries the String’s published link, so the desk knows what is public', async () => {
  const s = fakeString({ records: [
    bead('u1', 'public', { publishedUri: 'at://did:plc:x/com.cultureblocs.bead/b1', publishedHash: 'ph1' }),
    bead('u2', 'private'),
  ] });
  const store = createMemStore();
  await runImport({ store, registry: await registry(), client: s.client });

  const pub = await store.getRecord(`${B}/u1`);
  assert.equal(pub.publishedUri, 'at://did:plc:x/com.cultureblocs.bead/b1');
  assert.equal(pub.publishedHash, 'ph1');
  assert.equal((await store.getRecord(`${B}/u2`)).publishedUri, null,
    'a record the String has not published reads as not published, not as unknown');
});

test('a record unpublished on the String stops reading as published here', async () => {
  const s = fakeString({ records: [bead('u1', 'public', { publishedUri: 'at://did:plc:x/com.cultureblocs.bead/b1' })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  assert.ok((await store.getRecord(`${B}/u1`)).publishedUri);

  s.records[0].publishedUri = null;
  s.records[0].hlc = '0000000000099-00000-fake';      // restamped, body unchanged
  await runImport({ store, registry: reg, client: s.client });

  assert.equal((await store.getRecord(`${B}/u1`)).publishedUri, null);
});

test('import carries where a strand was posted, so the desk can link to it', async () => {
  const posted = [{ destination: 'bluesky', remoteId: '3p', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: '2026-09-18T12:00:00Z' }];
  const s = fakeString({ records: [
    bead('u1', 'public', { publishedUri: 'at://did:plc:x/com.cultureblocs.bead/b1', syndications: posted }),
    bead('u2', 'private'),
  ] });
  const store = createMemStore();
  await runImport({ store, registry: await registry(), client: s.client });

  assert.deepEqual((await store.getRecord(`${B}/u1`)).syndications,
    [{ destination: 'bluesky', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: '2026-09-18T12:00:00Z' }]);
  assert.deepEqual((await store.getRecord(`${B}/u2`)).syndications, [],
    'a String that says "none" reads as none, not as unknown');
});
