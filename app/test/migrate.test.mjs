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
