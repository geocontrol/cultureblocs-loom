import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCounts, entryList, matches, monthGrid, pendingChange, pendingChanges, shiftMonth, sourceApps, summary } from '../lib/day.js';
import { contentHash } from '../vendor/strip.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const rec = (key, type, createdAt, extra = {}) => ({ key, type, createdAt, day: createdAt.slice(0, 10),
  sourceApp: 'loom', state: 'kept', body: { kind: 'visit' }, ...extra });

/* A record as import or send leaves it: in step with the String. */
async function synced(key, body, extra = {}) {
  const h = await contentHash(body);
  return { ...rec(key, B, '2026-09-14T09:00:00Z'), body, stringId: key, stringHash: h, importedHash: h, importedState: 'kept', ...extra };
}

test('pendingChange: new, edit, state and delete — and nothing for a record in step, in conflict, or a Phase 1 draft', async () => {
  const body = { $type: B, kind: 'visit', note: 'a' };
  assert.equal(await pendingChange(rec(`${B}/n`, B, '2026-09-14T09:00:00Z')), 'new');
  assert.equal(await pendingChange(rec(`${B}/d`, B, '2026-09-14T09:00:00Z', { state: 'draft' })), null);
  assert.equal(await pendingChange(await synced('s1', body)), null);
  assert.equal(await pendingChange({ ...(await synced('s1', body)), body: { ...body, note: 'b' } }), 'edit');
  assert.equal(await pendingChange(await synced('s1', body, { state: 'kept', importedState: 'proposal' })), 'state');
  assert.equal(await pendingChange(await synced('s1', body, { deleted: true })), 'delete');
  assert.equal(await pendingChange({ ...(await synced('s1', body)), body: { ...body, note: 'b' }, conflict: { theirs: null } }), null);
  assert.equal(await pendingChange(rec(`${B}/x`, B, '2026-09-14T09:00:00Z', { deleted: true })), null);
});

test('an edit that also kept a proposal is one edit (the String keeps a proposal it is sent an edit for)', async () => {
  const body = { $type: B, kind: 'visit', note: 'a' };
  const r = { ...(await synced('s1', body, { importedState: 'proposal' })), body: { ...body, note: 'b' } };
  assert.equal(await pendingChange(r), 'edit');
  const all = await pendingChanges([r, await synced('s2', body), rec(`${B}/n`, B, '2026-09-14T09:00:00Z')]);
  assert.deepEqual([...all], [['s1', 'edit'], [`${B}/n`, 'new']]);
});

test('dayCounts leave deleted records out', () => {
  const counts = dayCounts([rec('a', B, '2026-09-14T09:00:00Z'), rec('b', B, '2026-09-14T10:00:00Z'),
    rec('c', B, '2026-09-13T10:00:00Z', { deleted: true })]);
  assert.deepEqual([...counts], [['2026-09-14', 2]]);
});

test('monthGrid lays a month out in Monday-first weeks with counts', () => {
  const weeks = monthGrid('2026-09', new Map([['2026-09-14', 3]]));
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0].slice(0, 2), [null, { day: '2026-09-01', date: 1, count: 0 }], '1 September 2026 is a Tuesday');
  assert.deepEqual(weeks[2][0], { day: '2026-09-14', date: 14, count: 3 });
  assert.equal(weeks.flat().filter(Boolean).length, 30);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(monthGrid('2026-02').flat().filter(Boolean).length, 28);
});

test('shiftMonth crosses years both ways', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-09', 0), '2026-09');
});

test('summary: a strand’s title or first narrative line, a bead’s first note line or place', () => {
  assert.equal(summary(S, { title: 'Sunday', narrative: 'x' }), 'Sunday');
  assert.equal(summary(S, { narrative: '\n  The Rothko room\nmore' }), 'The Rothko room');
  assert.equal(summary(S, {}), 'Untitled strand');
  assert.equal(summary(B, { note: 'one\ntwo' }), 'one');
  assert.equal(summary(B, { subject: { name: 'Tate Modern' } }), 'Tate Modern');
  assert.equal(summary(B, { note: 7 }), '');
});

test('matches filters by text across note, title, narrative, place, tags and ref labels; by kind; by app', () => {
  const b = rec('a', B, '2026-09-14T09:00:00Z', { sourceApp: 'rounds',
    body: { kind: 'listen', note: 'Alice Coltrane', tags: ['jazz'], refs: [{ descriptor: { label: 'Journey in Satchidananda' } }] } });
  const s = rec('s', S, '2026-09-14T22:00:00Z', { body: { title: 'Sunday', narrative: 'At the Tate', items: [] } });
  assert.equal(matches(b, { text: 'coltrane' }), true);
  assert.equal(matches(b, { text: 'JAZZ' }), true);
  assert.equal(matches(b, { text: 'satchidananda' }), true);
  assert.equal(matches(s, { text: 'tate' }), true);
  assert.equal(matches(b, { text: 'tate' }), false);
  assert.equal(matches(b, { kind: 'listen' }), true);
  assert.equal(matches(s, { kind: 'strand' }), true);
  assert.equal(matches(s, { kind: 'listen' }), false);
  assert.equal(matches(b, { app: 'rounds' }), true);
  assert.equal(matches(s, { app: 'rounds' }), false);
  assert.equal(matches({ ...b, body: { tags: 'not a list', refs: {} } }, { text: 'x' }), false);
});

test('entryList: newest day first, drafts of new records first in their day, deleted left out, filter applied', () => {
  const rows = entryList([
    rec(`${B}/a`, B, '2026-09-14T08:00:00Z', { body: { kind: 'visit', note: 'morning' } }),
    rec(`${B}/b`, B, '2026-09-14T12:00:00Z', { body: { kind: 'listen', note: 'noon' } }),
    rec(`${B}/c`, B, '2026-09-13T12:00:00Z', { body: { kind: 'read', note: 'yesterday' } }),
    rec(`${B}/gone`, B, '2026-09-14T13:00:00Z', { deleted: true }),
    rec(`${S}/s`, S, '2026-09-15T20:00:00Z', { day: '2026-09-14', body: { title: 'Sunday', items: [] } }),
  ], { drafts: [{ key: `${B}/new`, type: B, body: { kind: 'note', note: 'half', createdAt: '2026-09-14T07:00:00Z' }, at: '2026-09-15T09:00:00Z' },
    { key: `${S}/new`, type: S, body: { day: '' }, at: '2026-09-15T09:00:00Z' }], today: '2026-09-15' });
  assert.deepEqual(rows.map((d) => [d.day, d.rows.map((r) => r.key)]), [
    ['2026-09-15', [`${S}/new`]],
    ['2026-09-14', [`${B}/new`, `${S}/s`, `${B}/b`, `${B}/a`]],
    ['2026-09-13', [`${B}/c`]],
  ]);
  const sunday = rows[1].rows[1];
  assert.deepEqual([sunday.kind, sunday.line, sunday.record.key], ['strand', 'Sunday', `${S}/s`]);
  assert.deepEqual([rows[1].rows[0].draft, rows[1].rows[0].line], [true, 'half']);
  const filtered = entryList([rec(`${B}/a`, B, '2026-09-14T08:00:00Z', { body: { kind: 'visit', note: 'morning' } }),
    rec(`${B}/b`, B, '2026-09-14T12:00:00Z', { body: { kind: 'listen', note: 'noon' } })], { filter: { kind: 'listen' } });
  assert.deepEqual(filtered.map((d) => d.rows.map((r) => r.key)), [[`${B}/b`]]);
});

test('entryList and sourceApps survive records whose shapes are wrong', () => {
  const odd = rec(`${B}/o`, B, '2026-09-14T08:00:00Z', { sourceApp: undefined, body: { kind: 5, note: ['x'], tags: 'y' } });
  assert.deepEqual(entryList([odd]).map((d) => d.rows[0].kind), ['bead']);
  assert.deepEqual(sourceApps([odd, rec('b', B, '2026-09-14T08:00:00Z', { sourceApp: 'rounds' }),
    rec('c', B, '2026-09-14T08:00:00Z', { sourceApp: 'pocket', deleted: true })]), ['rounds']);
});
