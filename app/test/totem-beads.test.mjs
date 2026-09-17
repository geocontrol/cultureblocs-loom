import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsDay, toBeads } from '../lib/totem-beads.js';
import { parseDump } from '../lib/totem-protocol.js';
import { CLEAN, NO_ANCHOR, WITH_STRUCK } from './fixtures/totem-dumps.mjs';

const SYNC = Date.parse('2026-09-17T12:00:00Z');   // the moment the dump was read
const OPTS = { syncWallClock: SYNC, day: '2026-09-16', deviceLabel: '' };

test('a bead from the dump’s own power session resolves to a true instant', () => {
  // NOW 9000, e 5240 -> 3760s before the sync = 12:00:00 - 1:02:40
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  assert.equal(first.createdAt, '2026-09-17T10:57:20.000Z');
  assert.equal(first.timeAnchored, true);
  assert.equal(first.body.provenance.timeAnchored, true);
});

test('the picked date is ignored for a resolved bead, so a late-night bead keeps its own date', () => {
  const [first] = toBeads(parseDump(CLEAN), { ...OPTS, day: '1999-01-01' });
  assert.equal(first.createdAt.slice(0, 10), '2026-09-17');
});

test('a bead from an earlier power session keeps its order and admits it has no instant', () => {
  // ep 2 against EPOCH 3: the wall clock is honestly unknowable, seq preserves order
  const third = toBeads(parseDump(CLEAN), OPTS).find((b) => b.body.tags[0] === 'cinema'
    && b.timeAnchored === false);
  assert.equal(third.createdAt, '2026-09-16T00:00:03.000Z');
  assert.equal(third.timeAnchored, false);
});

test('a dump with no clock anchor at all falls to the picked date at midnight', () => {
  const [only] = toBeads(parseDump(NO_ANCHOR), OPTS);
  assert.equal(only.createdAt, '2026-09-16T00:00:00.000Z');
  assert.equal(only.timeAnchored, false);
});

test('the date is needed only when a dump holds a bead that cannot be resolved', () => {
  assert.equal(needsDay(parseDump(CLEAN)), true, 'bead 3 is from an earlier epoch');
  assert.equal(needsDay(parseDump(NO_ANCHOR)), true);
  const allCurrent = parseDump(CLEAN);
  allCurrent.beads = allCurrent.beads.filter((b) => b.ep === 3);
  assert.equal(needsDay(allCurrent), false, 'nothing to ask about');
});

test('a mutual mint is an encounter, names its peer, and carries the shared mint id', () => {
  const enc = toBeads(parseDump(CLEAN), OPTS).find((b) => b.body.kind === 'encounter');
  assert.equal(enc.body.note, 'mutual mint with punk · peer-9');
  assert.equal(enc.body.provenance.mutualMint, true);
  assert.equal(enc.body.provenance.mintId, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assert.equal(enc.dedupeKey, 'cb:a1b2c3d4e5f60718293a4b5c6d7e8f90');
});

test('a solo press is a bloc — the neutral default; the totem cannot know you were out', () => {
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  assert.equal(first.body.kind, 'bloc');
  assert.equal(first.body.provenance.mutualMint, false);
  assert.equal('mintId' in first.body.provenance, false);
  assert.equal('note' in first.body, false);
});

test('the mask becomes the only tag, and its colour never reaches the record', () => {
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  assert.deepEqual(first.body.tags, ['cinema']);
  assert.equal(JSON.stringify(first.body).includes('217'), false, 'rgb is wardrobe presentation');
});

test('a bead with no mint id gets Studio’s composite key, byte for byte', () => {
  // Kept identical to Studio's, including `t` — a display string doing
  // identity work. Computed here the same way, so the test is timezone-proof.
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  const t = new Date(Date.parse('2026-09-17T10:57:20Z')).toTimeString().slice(0, 8);
  assert.equal(first.dedupeKey, `cb:bloc-7:2026-09-17:3:1:${t}`);
});

test('an old-epoch bead’s key uses the em dash Studio displays for it', () => {
  const third = toBeads(parseDump(CLEAN), OPTS).find((b) => b.timeAnchored === false);
  assert.equal(third.dedupeKey, 'cb:bloc-7:2026-09-16:2:3:—');
});

test('the device names itself, and an override replaces it in the key', () => {
  const [plain] = toBeads(parseDump(CLEAN), OPTS);
  assert.equal(plain.body.provenance.device, 'bloc-7');
  const [named] = toBeads(parseDump(CLEAN), { ...OPTS, deviceLabel: 'bloc-9' });
  assert.equal(named.body.provenance.device, 'bloc-9');
  assert.match(named.dedupeKey, /^cb:bloc-9:/);
});

test('a bead struck out on the device is not pulled at all', () => {
  const beads = toBeads(parseDump(WITH_STRUCK), OPTS);
  assert.equal(beads.length, 2);
  assert.equal(beads.some((b) => b.dedupeKey.includes(':1:')), false);
});

test('every bead carries the provenance the lexicon requires', () => {
  for (const b of toBeads(parseDump(CLEAN), OPTS)) {
    assert.equal(b.body.provenance.app, 'culturebloc');
    assert.equal(b.body.provenance.mintedAt, b.createdAt);
    assert.equal(b.body.$type, 'com.cultureblocs.bead');
  }
});
