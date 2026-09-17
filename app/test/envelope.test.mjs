import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, Conflict, InvalidRecord, STRAND, openLoom, whyNotDeletable } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { isTid } from '../lib/tid.js';
import { createMemStore } from '../lib/memstore.js';
import { registry, steppingNow } from './helpers.mjs';

async function loom(store = createMemStore()) {
  return { store, loom: await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' }) };
}

const bead = (l, body = {}, opts) => l.createBead(l.newKey(BEAD), { kind: 'visit', note: 'x', ...body }, opts);
const strand = (l, keys, body = {}) => l.createStrand(l.newKey(STRAND),
  { day: '2026-09-14T00:00:00Z', title: 'Sunday', items: keys.map((k) => ({ uri: itemUri(k) })), ...body });

test('createBead writes the whole bead once: kept, made in Loom, provenance at the save', async () => {
  const { store, loom: l } = await loom();
  const key = l.newKey(BEAD);
  const env = await l.createBead(key, { kind: 'visit', createdAt: '2026-09-14T18:30:00Z', note: 'Rothko room, empty.',
    tags: ['art'], media: [{ uri: `/media/${'a'.repeat(64)}.jpg`, alt: 'red' }] }, { timeAnchored: false });
  assert.equal(env.key, key);
  assert.ok(isTid(env.rkey));
  assert.equal(env.key, `${BEAD}/${env.rkey}`);
  assert.equal(env.state, 'kept');
  assert.equal(env.origin, 'loom');
  assert.equal(env.sourceApp, 'loom');
  assert.equal(env.createdAt, '2026-09-14T18:30:00Z', 'when it happened, from the form');
  assert.equal(env.day, '2026-09-14');
  assert.deepEqual(env.body.tags, ['art']);
  assert.deepEqual(env.body.provenance, { app: 'loom', device: 'desk-1', mintedAt: env.updatedAt, timeAnchored: false });
  assert.match(env.hlc, /^\d{13}-\d{5}-desk-1$/);
  assert.deepEqual(await store.getRecord(key), env);
});

test('a bead with no time is made now, and anchored to that time', async () => {
  const { loom: l } = await loom();
  const env = await bead(l, {});
  assert.equal(env.createdAt, env.body.provenance.mintedAt);
  assert.equal(env.body.provenance.timeAnchored, true);
});

test('saving a new record clears its draft; a key cannot be created twice', async () => {
  const { loom: l } = await loom();
  const key = l.newKey(BEAD);
  await l.saveDraft(key, { kind: 'read', note: 'half' }, null, BEAD);
  assert.deepEqual((await l.newDrafts()).map((d) => [d.key, d.type, d.body.note]), [[key, BEAD, 'half']]);
  await l.createBead(key, { kind: 'read', note: 'whole' });
  assert.equal(await l.getDraft(key), undefined);
  assert.deepEqual(await l.newDrafts(), []);
  await assert.rejects(l.createBead(key, { kind: 'read' }), /already exists/);
});

test('an invalid record is refused and nothing is stored', async () => {
  const { store, loom: l } = await loom();
  await assert.rejects(l.createBead(l.newKey(BEAD), { kind: 'not-a-kind', note: 'x'.repeat(3001) }),
    (e) => e instanceof InvalidRecord && e.problems.some((p) => p.startsWith('$.note')));
  assert.deepEqual(await store.allRecords(), []);
});

test('an anchor outside the text is refused', async () => {
  const { loom: l } = await loom();
  const b = await bead(l, { note: 'Saw Severance' });
  const body = { ...b.body, refs: [{ type: 'work', role: 'subject', descriptor: { label: 'Severance' },
    index: { byteStart: 4, byteEnd: 99 } }] };
  await assert.rejects(l.save(b.key, body), (e) => e instanceof InvalidRecord
    && e.problems[0] === '$.refs[0].index: 4..99 is outside note (13 bytes)');
});

test('createStrand is made now for its day and points at beads by local item uri', async () => {
  const { loom: l } = await loom();
  const b = await bead(l);
  const s = await strand(l, [b.key]);
  assert.equal(s.day, '2026-09-14');
  assert.equal(s.state, 'kept');
  assert.equal(s.createdAt, s.updatedAt);
  assert.deepEqual(s.body.items, [{ uri: `loom://${b.key}` }]);
});

test('save refuses when another tab wrote first, and writes when it did not', async () => {
  const { loom: l } = await loom();
  const b = await bead(l, { note: 'one' });
  const other = await l.save(b.key, { ...b.body, note: 'other tab' }, { expectUpdatedAt: b.updatedAt });
  await assert.rejects(l.save(b.key, { ...b.body, note: 'mine' }, { expectUpdatedAt: b.updatedAt }),
    (e) => e instanceof Conflict && e.current.body.note === 'other tab');
  const mine = await l.save(b.key, { ...b.body, note: 'mine' }, { expectUpdatedAt: other.updatedAt });
  assert.equal(mine.body.note, 'mine');
  assert.ok(mine.hlc > other.hlc);
});

test('provenance is fixed: content can change, provenance cannot, on any app’s record', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  await assert.rejects(l.save(b.key, { ...b.body, provenance: { ...b.body.provenance, mintedAt: '2020-01-01T00:00:00Z' } }),
    (e) => e instanceof InvalidRecord && /provenance/.test(e.problems[0]));
  const rounds = { ...b, key: `${BEAD}/r1`, rkey: 'r1', sourceApp: 'rounds', origin: 'import', stringId: 'r1',
    body: { $type: BEAD, createdAt: '2026-09-10T10:00:00Z', kind: 'listen', provenance: { app: 'rounds', mintedAt: '2026-09-10T10:00:00Z' } } };
  await store.putRecord(rounds);
  const edited = await l.save(rounds.key, { ...rounds.body, note: 'corrected in Loom' });
  assert.equal(edited.sourceApp, 'rounds');
  assert.equal(edited.body.provenance.app, 'rounds');
});

test('editing a proposal keeps it; keep applies only to proposals', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  await store.putRecord({ ...b, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal', origin: 'import' });
  assert.equal((await l.save(`${BEAD}/p1`, { ...b.body, note: 'kept by editing' })).state, 'kept');
  await assert.rejects(l.keep(b.key), /a kept record cannot be kept/);
  await store.putRecord({ ...b, key: `${BEAD}/p2`, rkey: 'p2', state: 'proposal' });
  assert.equal((await l.keep(`${BEAD}/p2`)).state, 'kept');
});

test('saving a Phase 1 draft strand keeps it; a String draft keeps its state', async () => {
  const { store, loom: l } = await loom();
  const s = await strand(l, []);
  await store.putRecord({ ...s, state: 'draft' });
  assert.equal((await l.save(s.key, { ...s.body, title: 'told' })).state, 'kept');
  await store.putRecord({ ...s, key: `${STRAND}/e1`, rkey: 'e1', state: 'draft', stringId: 'e1' });
  assert.equal((await l.save(`${STRAND}/e1`, { ...s.body, title: 'still a draft on the String' })).state, 'draft');
});

test('remove: a record never sent is gone, with its draft; one on the String is marked deleted until Send', async () => {
  const { store, loom: l } = await loom();
  const local = await bead(l);
  await l.saveDraft(local.key, { ...local.body, note: 'half' }, local.updatedAt);
  assert.deepEqual(await l.remove(local.key), []);
  assert.equal(await store.getRecord(local.key), undefined);
  assert.equal(await l.getDraft(local.key), undefined);

  const b = await bead(l);
  await store.putRecord({ ...b, stringId: 's1' });
  await l.remove(b.key);
  const marked = await store.getRecord(b.key);
  assert.equal(marked.deleted, true);
  await assert.rejects(l.save(b.key, { ...b.body, note: 'x' }), /is deleted/);
  const back = await l.undoRemove(b.key);
  assert.equal('deleted' in back, false);
  await assert.rejects(l.undoRemove(b.key), /not waiting to be deleted/);
});

test('releasing a proposal is removing it', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  await store.putRecord({ ...b, key: `${BEAD}/s1`, rkey: 's1', state: 'proposal', origin: 'import', stringId: 's1' });
  await l.remove(`${BEAD}/s1`);
  const marked = await store.getRecord(`${BEAD}/s1`);
  assert.equal(marked.state, 'proposal', 'the state is what the String holds; the delete is the change');
  assert.equal(marked.deleted, true);
});

test('deleting a bead takes it out of every strand that uses it, keeping each strand’s state', async () => {
  const { store, loom: l } = await loom();
  const a = await bead(l, { note: 'a' }), b = await bead(l, { note: 'b' });
  const s1 = await strand(l, [a.key, b.key]);
  const s2 = await strand(l, [b.key]);
  await store.putRecord({ ...s2, state: 'draft' });
  const other = await strand(l, [a.key]);
  assert.deepEqual((await l.strandsUsing(b.key)).map((s) => s.key).sort(), [s1.key, s2.key].sort());
  const changed = await l.remove(b.key);
  assert.deepEqual(changed.sort(), [s1.key, s2.key].sort());
  assert.deepEqual((await store.getRecord(s1.key)).body.items, [{ uri: itemUri(a.key) }]);
  assert.deepEqual((await store.getRecord(s2.key)).body.items, []);
  assert.equal((await store.getRecord(s2.key)).state, 'draft');
  assert.deepEqual((await store.getRecord(other.key)).body.items, [{ uri: itemUri(a.key) }]);
});

test('a bead delete that one using strand refuses changes no strand at all', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l, { note: 'b' });
  const valid = await strand(l, [b.key]);                               // checked first: it would be rewritten
  const imported = await strand(l, [b.key]);
  const badBody = { ...imported.body, title: 'x'.repeat(301) };        // imported bodies are not validated
  await store.putRecord({ ...imported, body: badBody });
  await assert.rejects(l.remove(b.key), InvalidRecord);
  assert.deepEqual((await store.getRecord(valid.key)).body.items, [{ uri: itemUri(b.key) }], 'nothing half-applied');
  assert.deepEqual(await store.getRecord(valid.key), valid);
  assert.ok(await store.getRecord(b.key));
});

test('published strands and annotations cannot be deleted', async () => {
  const { store, loom: l } = await loom();
  const s = await strand(l, []);
  await store.putRecord({ ...s, state: 'published', stringId: 'p1' });
  await assert.rejects(l.remove(s.key), /unpublish it first/);
  await store.putRecord({ key: 'com.cultureblocs.annotation/a1', type: 'com.cultureblocs.annotation', body: {}, state: 'kept' });
  await assert.rejects(l.remove('com.cultureblocs.annotation/a1'), /read-only/);
  assert.equal(whyNotDeletable({ type: BEAD, state: 'proposal' }), null);
  assert.match(whyNotDeletable(undefined), /no such record/);
});

test('the device id and clock survive reopening the store', async () => {
  const { store, loom: first } = await loom();
  const a = await bead(first);
  const second = await openLoom({ store, registry: await registry(), now: () => 1, newDeviceId: () => 'never-used' });
  assert.equal(second.deviceId, 'desk-1');
  const b = await bead(second);
  assert.ok(b.hlc > a.hlc, 'a reopened clock must not go backwards even if the wall clock did');
});

test('drafts of existing records persist until saved or discarded, and are not new drafts', async () => {
  const { loom: l } = await loom();
  const b = await bead(l);
  await l.saveDraft(b.key, { ...b.body, note: 'half-typed' }, b.updatedAt);
  assert.equal((await l.getDraft(b.key)).body.note, 'half-typed');
  assert.deepEqual(await l.newDrafts(), []);
  await l.save(b.key, { ...b.body, note: 'done' });
  assert.equal(await l.getDraft(b.key), undefined);
});

test('saving recomputes the flags import and send set: invalid and problems go, missing keeps only photos still used', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  const kept = `/media/${'a'.repeat(64)}.jpg`, dropped = `/media/${'b'.repeat(64)}.jpg`;
  await store.putRecord({ ...b, body: { ...b.body, media: [{ uri: kept }, { uri: dropped }] },
    invalid: ['$.kind: required field missing'], problems: ['refused'], missing: [kept.slice(7), dropped.slice(7)] });
  const saved = await l.save(b.key, { ...b.body, media: [{ uri: kept }] });
  assert.equal('invalid' in saved, false);
  assert.equal('problems' in saved, false);
  assert.deepEqual(saved.missing, [kept.slice(7)]);
  assert.equal('missing' in await l.save(b.key, { ...b.body }), false);
});

test('a record the String has published cannot be deleted, whatever its state says', async () => {
  // Publishing does not move `state`: the String stamps `published_uri` and
  // leaves the state alone, so a strand published from the timeline or from
  // the desk still reads `kept`. The public URI is the signal that matters.
  const { store, loom: l } = await loom();
  const s = await strand(l, []);
  await store.putRecord({ ...s, state: 'kept', stringId: 'p1',
    publishedUri: 'at://did:plc:x/com.cultureblocs.strand/s1' });

  await assert.rejects(l.remove(s.key), /unpublish it first/);
  assert.match(whyNotDeletable({ type: STRAND, state: 'kept', publishedUri: 'at://x/y/z' }), /unpublish it first/);
  assert.equal(whyNotDeletable({ type: STRAND, state: 'kept', publishedUri: null }), null,
    'a record the String says is not published deletes as normal');
});

test('a bead minted on a device is adopted as a proposal, keeping its own provenance', async () => {
  const { store, loom: l } = await loom();
  const body = {
    $type: BEAD, createdAt: '2026-09-17T10:57:20.000Z', kind: 'bloc', tags: ['cinema'],
    provenance: { app: 'culturebloc', device: 'bloc-7', mintedAt: '2026-09-17T10:57:20.000Z',
      mutualMint: false, timeAnchored: true },
  };
  const env = await l.adoptBead(l.newKey(BEAD), body, { dedupeKey: 'cb:bloc-7:2026-09-17:3:1:x' });

  assert.equal(env.state, 'proposal', 'it sits on the dotted rail until kept');
  assert.equal(env.origin, 'connector:totem');
  assert.equal(env.sourceApp, 'culturebloc-totem');
  assert.equal(env.dedupeKey, 'cb:bloc-7:2026-09-17:3:1:x');
  assert.equal(env.body.provenance.app, 'culturebloc', 'the device’s provenance, not Loom’s');
  assert.equal(env.day, '2026-09-17');
  assert.ok(env.hlc, 'stamped by this device’s clock like any other write');
  assert.deepEqual(await store.getRecord(env.key), env);
});

test('an adopted bead is validated like any other write, because it is not on the String yet', async () => {
  const { loom: l } = await loom();
  await assert.rejects(
    l.adoptBead(l.newKey(BEAD), { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z' }, {}),
    InvalidRecord, 'kind is required',
  );
});

test('adopting over an existing key is refused', async () => {
  const { loom: l } = await loom();
  const body = { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z', kind: 'bloc',
    provenance: { app: 'culturebloc', mintedAt: '2026-09-17T10:00:00.000Z' } };
  const key = l.newKey(BEAD);
  await l.adoptBead(key, body, {});
  await assert.rejects(l.adoptBead(key, body, {}), /already exists/);
});

test('an adopted proposal can be kept, like any other proposal', async () => {
  const { loom: l } = await loom();
  const body = { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z', kind: 'bloc',
    provenance: { app: 'culturebloc', mintedAt: '2026-09-17T10:00:00.000Z' } };
  const env = await l.adoptBead(l.newKey(BEAD), body, {});
  assert.equal((await l.keep(env.key)).state, 'kept');
});
