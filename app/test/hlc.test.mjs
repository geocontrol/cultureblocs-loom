import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, parseStamp } from '../lib/hlc.js';

test("stamps use the String's format and round-trip", () => {
  const clock = createClock('desk-1', { now: () => 1757926800123 });
  const s = clock.tick();
  assert.equal(s, '1757926800123-00000-desk-1');
  assert.deepEqual(parseStamp(s), { ms: 1757926800123, counter: 0, node: 'desk-1' });
});

test('ticks stay monotonic when the wall clock stalls or steps back', () => {
  const walls = [1000, 1000, 500, 2000];
  const clock = createClock('d', { now: () => walls.shift() });
  const stamps = [clock.tick(), clock.tick(), clock.tick(), clock.tick()];
  assert.deepEqual([...stamps].sort(), stamps);
  assert.equal(stamps[2], '0000000001000-00002-d');
});

test('observing a later stamp (e.g. from the String) moves past it', () => {
  const clock = createClock('d', { now: () => 1000 });
  clock.tick();
  assert.equal(clock.observe('0000000005000-00007-string'), '0000000005000-00008-d');
  assert.ok(clock.tick() > '0000000005000-00008-d');
});

test('a clock seeded with the last stored stamp never issues an earlier one', () => {
  const clock = createClock('d', { now: () => 10, last: '0000000009999-00003-d' });
  assert.ok(clock.tick() > '0000000009999-00003-d');
});

test('bad node ids and stamps are refused', () => {
  assert.throws(() => createClock('has space'));
  assert.throws(() => parseStamp('1757926800123.00000.d'));
});

test('a malformed stamp is ignored, as the String does: observe falls back to tick, and a clock still starts', () => {
  const clock = createClock('d', { now: () => 1000, last: 'garbage from an old meta' });
  assert.equal(clock.observe('not-a-stamp'), '0000000001000-00001-d');
  assert.ok(clock.tick() > '0000000001000-00001-d');
});
