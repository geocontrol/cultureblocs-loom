import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayString, isUnsent, monthDays } from '../lib/day.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const rec = (key, type, createdAt, extra = {}) => ({ key, type, createdAt, day: createdAt.slice(0, 10),
  sourceApp: 'loom', body: {}, ...extra });

test('monthDays counts records and unsent Loom-made records per day, newest first', () => {
  const days = monthDays([
    rec('b/1', B, '2026-09-14T09:00:00Z', { stringId: 'x' }),
    rec('b/2', B, '2026-09-14T10:00:00Z'),
    rec('b/3', B, '2026-09-15T10:00:00Z', { sourceApp: 'pocket', stringId: 'y' }),
  ]);
  assert.deepEqual(days, [{ day: '2026-09-15', count: 1, unsent: 0 }, { day: '2026-09-14', count: 2, unsent: 1 }]);
});

test('only Loom-made records without a String id are unsent', () => {
  assert.equal(isUnsent({ sourceApp: 'loom' }), true);
  assert.equal(isUnsent({ sourceApp: 'loom', stringId: 'x' }), false);
  assert.equal(isUnsent({ sourceApp: 'scrobbler' }), false);
});

test('dayString wraps strand members, keeps loose items, orders by earliest time', () => {
  const a = rec('b/a', B, '2026-09-14T08:00:00Z');
  const b = rec('b/b', B, '2026-09-14T12:00:00Z');
  const c = rec('b/c', B, '2026-09-14T10:00:00Z');
  const s = rec('s/1', S, '2026-09-14T22:00:00Z', { body: { items: [{ uri: 'loom://b/b' }, { uri: 'loom://b/c' }] } });
  const out = dayString([a, b, c, s]);
  assert.deepEqual(out.map((e) => [e.kind, e.record.key, (e.members || []).map((m) => m.key)]), [
    ['item', 'b/a', []],
    ['strand', 's/1', ['b/b', 'b/c']],
  ]);
});

test('a strand member made on another day still appears inside it', () => {
  const early = rec('b/early', B, '2026-09-13T23:30:00Z');
  const s = rec('s/1', S, '2026-09-14T09:00:00Z', { body: { items: [{ uri: 'loom://b/early' }, { uri: 'loom://b/gone' }] } });
  const out = dayString([s], [early, s]);
  assert.deepEqual(out[0].members.map((m) => m.key), ['b/early']);
});

test('released tombstones are not shown: no count, no entry, not a strand member', () => {
  const kept = rec('b/k', B, '2026-09-14T09:00:00Z');
  const gone = rec('b/r', B, '2026-09-14T10:00:00Z', { state: 'released', sourceApp: 'scrobbler', stringId: 'x' });
  const s = rec('s/1', S, '2026-09-14T22:00:00Z', { body: { items: [{ uri: 'loom://b/r' }] } });
  assert.deepEqual(monthDays([kept, gone]), [{ day: '2026-09-14', count: 1, unsent: 1 }]);
  assert.deepEqual(dayString([kept, gone, s]).map((e) => [e.record.key, (e.members || []).map((m) => m.key)]),
    [['b/k', []], ['s/1', []]]);
});
