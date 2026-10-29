import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemStore } from '../lib/memstore.js';
import { migrateRecord, migrateStore } from '../lib/migrate.js';

const B = 'com.cultureblocs.bead';
const rec = (key, state, extra = {}) => ({ key, type: B, state, body: { $type: B, kind: 'bloc' }, ...extra });

test('migrateRecord turns a released proposal into a delete waiting for Send, and leaves the rest alone', () => {
  assert.deepEqual(migrateRecord(rec(`${B}/a`, 'released', { stringId: 'a' })), rec(`${B}/a`, 'proposal', { stringId: 'a', deleted: true }));
  for (const state of ['proposal', 'kept', 'draft', 'published', 'edited']) assert.equal(migrateRecord(rec(`${B}/b`, state)), null);
});

test('migrateStore is idempotent and removes the retired settings', async () => {
  const store = createMemStore();
  await store.putRecord(rec(`${B}/a`, 'released', { stringId: 'a' }));
  await store.putRecord(rec(`${B}/b`, 'kept'));
  await store.setMeta('posture', 'totem');
  await store.setMeta('mask', 'ART');
  await store.setMeta('deviceId', 'desk-1');
  assert.equal(await migrateStore(store), 1);
  assert.equal(await migrateStore(store), 0);
  assert.equal((await store.getRecord(`${B}/a`)).deleted, true);
  assert.deepEqual(await store.allMeta(), { deviceId: 'desk-1' });
});

test('migrateRecord moves a bead saved on the wrong day to its body’s time, and is then a no-op', () => {
  const wrong = rec(`${B}/c`, 'kept', { createdAt: '2026-10-26T20:00:00Z', day: '2026-10-26',
    body: { $type: B, kind: 'performance', createdAt: '2026-10-24T20:00:00Z' } });
  const fixed = migrateRecord(wrong);
  assert.equal(fixed.createdAt, '2026-10-24T20:00:00Z');
  assert.equal(fixed.day, '2026-10-24');
  assert.equal(migrateRecord(fixed), null);
});

test('migrateRecord leaves a strand’s time and day alone when they already agree with its day', () => {
  const S = 'com.cultureblocs.strand';
  const s = { key: `${S}/s`, type: S, state: 'kept', createdAt: '2026-09-15T08:00:00Z', day: '2026-09-14',
    body: { $type: S, createdAt: '2026-10-29T09:00:00Z', day: '2026-09-14T00:00:00Z', items: [] } };
  assert.equal(migrateRecord(s), null);
});
