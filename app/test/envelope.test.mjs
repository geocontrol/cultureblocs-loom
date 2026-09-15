import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, Conflict, InvalidRecord, STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { isTid } from '../lib/tid.js';
import { createMemStore } from '../lib/memstore.js';
import { registry, steppingNow } from './helpers.mjs';

async function loom(store = createMemStore()) {
  return { store, loom: await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' }) };
}

test('mint writes a valid kept bead with Loom provenance and a TID key', async () => {
  const { store, loom: l } = await loom();
  const env = await l.mint({ mask: 'ART', note: '  Rothko room, empty.  ', kind: 'visit' });
  assert.ok(isTid(env.rkey));
  assert.equal(env.key, `${BEAD}/${env.rkey}`);
  assert.equal(env.state, 'kept');
  assert.equal(env.origin, 'mint');
  assert.equal(env.sourceApp, 'loom');
  assert.equal(env.day, env.createdAt.slice(0, 10));
  assert.deepEqual(env.body.tags, ['art']);
  assert.equal(env.body.note, 'Rothko room, empty.');
  assert.equal(env.body.provenance.app, 'loom');
  assert.equal(env.body.provenance.mintedAt, env.createdAt);
  assert.match(env.hlc, /^\d{13}-\d{5}-desk-1$/);
  assert.deepEqual(await store.getRecord(env.key), env);
});

test('an invalid record is refused and nothing is stored', async () => {
  const { store, loom: l } = await loom();
  await assert.rejects(
    l.create(STRAND, { $type: STRAND, createdAt: '2026-09-15T09:00:00Z' }, { origin: 'compose', state: 'draft' }),
    (e) => e instanceof InvalidRecord && e.problems.includes('$.items: required field missing'));
  assert.deepEqual(await store.allRecords(), []);
});

test('an anchor outside the text is refused', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'Saw Severance' });
  const body = { ...bead.body, refs: [{ type: 'work', role: 'subject', descriptor: { label: 'Severance' },
    index: { byteStart: 4, byteEnd: 99 } }] };
  await assert.rejects(l.save(bead.key, body), (e) => e instanceof InvalidRecord
    && e.problems[0] === '$.refs[0].index: 4..99 is outside note (13 bytes)');
});

test('a strand wraps a bead by local item uri and indexes by its day', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  const strand = await l.create(STRAND, { $type: STRAND, createdAt: '2026-09-15T20:00:00Z', day: '2026-09-14T00:00:00Z',
    title: 'Sunday', items: [{ uri: itemUri(bead.key) }] }, { origin: 'compose', state: 'draft' });
  assert.equal(strand.day, '2026-09-14');
  assert.equal(strand.body.items[0].uri, `loom://${bead.key}`);
});

test('save refuses when another tab wrote first, and writes when it did not', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'one' });
  const other = await l.save(bead.key, { ...bead.body, note: 'other tab' }, { expectUpdatedAt: bead.updatedAt });
  await assert.rejects(l.save(bead.key, { ...bead.body, note: 'mine' }, { expectUpdatedAt: bead.updatedAt }),
    (e) => e instanceof Conflict && e.current.body.note === 'other tab');
  const mine = await l.save(bead.key, { ...bead.body, note: 'mine' }, { expectUpdatedAt: other.updatedAt });
  assert.equal(mine.body.note, 'mine');
  assert.ok(mine.hlc > other.hlc);
});

test('editing a proposal keeps it; keep and release only apply to proposals', async () => {
  const { store, loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await store.putRecord({ ...bead, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal', origin: 'import' });
  const edited = await l.save(`${BEAD}/p1`, { ...bead.body, note: 'kept by editing' });
  assert.equal(edited.state, 'kept');
  await assert.rejects(l.release(bead.key), /only a proposal/);
  await assert.rejects(l.keep(bead.key), /a kept record cannot become kept/);
  await store.putRecord({ ...bead, key: `${BEAD}/p2`, rkey: 'p2', state: 'proposal' });
  assert.equal((await l.keep(`${BEAD}/p2`)).state, 'kept');
  await store.putRecord({ ...bead, key: `${BEAD}/p3`, rkey: 'p3', state: 'proposal' });
  await l.release(`${BEAD}/p3`);
  assert.equal(await store.getRecord(`${BEAD}/p3`), undefined);
});

test('releasing a proposal the String holds leaves a released tombstone; a Loom-only one is deleted; drafts go too', async () => {
  const { store, loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await store.putRecord({ ...bead, key: `${BEAD}/s1`, rkey: 's1', state: 'proposal', origin: 'import', stringId: 's1' });
  await store.putRecord({ ...bead, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal' });
  await l.saveDraft(`${BEAD}/s1`, { ...bead.body, note: 'half' });
  await l.saveDraft(`${BEAD}/p1`, { ...bead.body, note: 'half' });
  await l.release(`${BEAD}/s1`);
  await l.release(`${BEAD}/p1`);
  const tomb = await store.getRecord(`${BEAD}/s1`);
  assert.equal(tomb.state, 'released');
  assert.equal(tomb.stringId, 's1');
  assert.equal(await store.getRecord(`${BEAD}/p1`), undefined);
  assert.equal(await l.getDraft(`${BEAD}/s1`), undefined);
  assert.equal(await l.getDraft(`${BEAD}/p1`), undefined);
  await assert.rejects(l.keep(`${BEAD}/s1`), /a released record cannot become kept/);
});

test('the device id and clock survive reopening the store', async () => {
  const { store, loom: first } = await loom();
  const a = await first.mint({ note: 'a' });
  const second = await openLoom({ store, registry: await registry(), now: () => 1, newDeviceId: () => 'never-used' });
  assert.equal(second.deviceId, 'desk-1');
  const b = await second.mint({ note: 'b' });
  assert.ok(b.hlc > a.hlc, 'a reopened clock must not go backwards even if the wall clock did');
});

test('drafts persist until saved or discarded', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await l.saveDraft(bead.key, { ...bead.body, note: 'half-typed' });
  assert.equal((await l.getDraft(bead.key)).body.note, 'half-typed');
  await l.save(bead.key, { ...bead.body, note: 'done' });
  assert.equal(await l.getDraft(bead.key), undefined);
});
