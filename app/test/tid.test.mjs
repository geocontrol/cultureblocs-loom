import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTid, tidGenerator } from '../lib/tid.js';

test('TIDs are 13 base32-sortable characters', () => {
  const tid = tidGenerator({ nowMicros: () => 1_757_926_800_000_000n, clockId: 7 });
  const t = tid();
  assert.equal(t.length, 13);
  assert.ok(isTid(t), t);
});

test('TIDs sort in the order they were made, even within one microsecond or a clock step back', () => {
  const times = [1_757_926_800_000_000n, 1_757_926_800_000_000n, 1_757_926_799_000_000n, 1_757_926_900_000_000n];
  const tid = tidGenerator({ nowMicros: () => times.shift(), clockId: 3 });
  const made = [tid(), tid(), tid(), tid()];
  assert.deepEqual([...made].sort(), made);
  assert.equal(new Set(made).size, 4);
});

test('isTid rejects the obvious non-TIDs', () => {
  for (const bad of ['', 'self', '3lqk2m4x7c22', 'zzzzzzzzzzzzz', '3LQK2M4X7C22P', 42]) assert.equal(isTid(bad), false, String(bad));
});
