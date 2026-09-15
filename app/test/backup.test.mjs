import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TYPE, base64ToBytes, bytesToBase64, exportBackup, restoreBackup } from '../lib/backup.js';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { photo } from './fake-string.mjs';
import { registry, steppingNow } from './helpers.mjs';

test('base64 round-trips bytes larger than one chunk', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('backup then restore into an empty store gives back records, photos and settings — never the token', async () => {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  const uri = await putPhoto(store, photo('pixels'));
  const bead = await loom.mint({ note: 'keep me' });
  await loom.save(bead.key, { ...bead.body, media: [{ uri }] });
  await store.setMeta('stringUrl', 'http://localhost:8100');
  await store.setMeta('stringToken', 'secret');

  const doc = JSON.parse(JSON.stringify(await exportBackup(store, () => 9)));
  assert.equal(doc.$type, BACKUP_TYPE);
  assert.equal('stringToken' in doc.meta, false);

  const fresh = createMemStore();
  await fresh.setMeta('stringToken', 'this-browser');
  assert.deepEqual(await restoreBackup(fresh, doc), { records: 1, photos: 1 });
  assert.deepEqual(await fresh.allRecords(), await store.allRecords());
  const hash = uri.split('/').pop().slice(0, 64);
  assert.equal(await (await fresh.getBlob(hash)).blob.text(), 'pixels');
  assert.equal(await fresh.getMeta('stringUrl'), 'http://localhost:8100');
  assert.equal(await fresh.getMeta('deviceId'), 'desk-1');
  assert.equal(await fresh.getMeta('stringToken'), 'this-browser');
});

test('restore refuses anything that is not a Loom backup, and leaves the store alone', async () => {
  const store = createMemStore();
  await store.setMeta('deviceId', 'keep');
  await assert.rejects(restoreBackup(store, { $type: 'com.cultureblocs.easel.export', version: 1 }), /not a Loom backup/);
  await assert.rejects(restoreBackup(store, { $type: BACKUP_TYPE, version: 2, records: [] }), /unsupported backup version/);
  assert.equal(await store.getMeta('deviceId'), 'keep');
});
