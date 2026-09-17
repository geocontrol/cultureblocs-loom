import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DumpError, MARKERS, parseClearReply, parseDump, parseWardrobe, wardrobePayload }
  from '../lib/totem-protocol.js';
import { CLEAN, CLEAR_OK, CLEAR_REFUSED, MALFORMED, NO_ANCHOR, TRUNCATED, WARDROBE }
  from './fixtures/totem-dumps.mjs';

test('a clean dump yields the device, its clock anchor and every bead', () => {
  const d = parseDump(CLEAN);
  assert.equal(d.deviceId, 'bloc-7');
  assert.equal(d.now, 9000);
  assert.equal(d.epoch, 3);
  assert.equal(d.beads.length, 3);
  assert.deepEqual(d.unparsed, []);
  assert.equal(d.beads[1].with.mask, 'punk');
});

test('a truncated dump throws rather than returning the beads it managed to read', () => {
  // A partial pull followed by a clear is how beads are lost.
  assert.throws(() => parseDump(TRUNCATED), (e) => e instanceof DumpError && /truncated/.test(e.message));
});

test('a bead line that will not parse is reported, never silently dropped', () => {
  const d = parseDump(MALFORMED);
  assert.equal(d.beads.length, 2);
  assert.equal(d.unparsed.length, 1);
});

test('a dump with no clock anchor still parses, with nothing to resolve against', () => {
  const d = parseDump(NO_ANCHOR);
  assert.equal(d.now, null);
  assert.equal(d.epoch, null);
  assert.equal(d.beads.length, 1);
});

test('a dump with no begin marker is not a dump', () => {
  assert.throws(() => parseDump('hello'), DumpError);
  assert.throws(() => parseDump(''), DumpError);
});

test('the wardrobe parses to masks with their colours', () => {
  assert.deepEqual(parseWardrobe(WARDROBE), [
    { name: 'cinema', r: 13, g: 217, b: 53 },
    { name: 'gig', r: 200, g: 40, b: 90 },
  ]);
});

test('a wardrobe payload is pipe-delimited lines closed by a lone dot', () => {
  assert.equal(wardrobePayload([{ name: 'cinema', r: 13, g: 217, b: 53 }]), 'cinema|13|217|53\n.\n');
  assert.equal(wardrobePayload([]), '.\n', 'an empty wardrobe still terminates');
});

test('the clear reply says how many went, or refuses with both counts', () => {
  assert.deepEqual(parseClearReply(CLEAR_OK), { ok: true, cleared: 3 });
  assert.deepEqual(parseClearReply(CLEAR_REFUSED), { ok: false, have: 4, want: 3 });
  assert.throws(() => parseClearReply('nothing useful'), DumpError);
});

test('the markers are exported, so the port knows what to read until', () => {
  assert.equal(MARKERS.beadsEnd, '---BEADS-END---');
  assert.equal(MARKERS.masksEnd, '---MASKS-DUMP-END---');
});
