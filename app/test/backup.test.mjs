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
  await fresh.setMeta('deviceId', 'other-desk');
  assert.deepEqual(await restoreBackup(fresh, doc), { records: 1, photos: 1 });
  assert.deepEqual(await fresh.allRecords(), await store.allRecords());
  const hash = uri.split('/').pop().slice(0, 64);
  assert.equal(await (await fresh.getBlob(hash)).blob.text(), 'pixels');
  assert.equal(await fresh.getMeta('stringUrl'), 'http://localhost:8100');
  assert.equal(await fresh.getMeta('deviceId'), 'other-desk', "this browser keeps its own device id");
  assert.equal(await fresh.getMeta('stringToken'), 'this-browser');
});

test('restore refuses anything that is not a Loom backup, and leaves the store alone', async () => {
  const store = createMemStore();
  await store.setMeta('deviceId', 'keep');
  await assert.rejects(restoreBackup(store, { $type: 'com.cultureblocs.easel.export', version: 1 }), /not a Loom backup/);
  await assert.rejects(restoreBackup(store, { $type: BACKUP_TYPE, version: 2, records: [] }), /unsupported backup version/);
  assert.equal(await store.getMeta('deviceId'), 'keep');
});

async function filled() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  await loom.mint({ note: 'the only copy' });
  await store.setMeta('stringToken', 'secret');
  return store;
}

const snapshot = async (store) => ({ records: await store.allRecords(), meta: await store.allMeta(), blobs: await store.blobHashes() });

test('a backup that is malformed anywhere is refused before anything in the store is touched', async () => {
  const store = await filled();
  const before = await snapshot(store);
  const good = { $type: BACKUP_TYPE, version: 1, records: [], meta: {}, blobs: {} };
  const bad = [
    { ...good, records: [{ key: 'com.cultureblocs.bead/x', type: 'com.cultureblocs.bead' }] },          // no body
    { ...good, records: [{ key: 7, type: 'com.cultureblocs.bead', body: {} }] },
    { ...good, records: [null] },
    { ...good, blobs: [] },
    { ...good, blobs: { h1: { mime: 'image/jpeg', data: '%%% not base64 %%%' } } },
    { ...good, blobs: { h1: 'x' } },
    { ...good, meta: [] },
    { ...good, meta: { hlc: 'not a stamp' } },
  ];
  for (const doc of bad) {
    await assert.rejects(restoreBackup(store, doc), undefined, JSON.stringify(doc));
    assert.deepEqual(await snapshot(store), before, JSON.stringify(doc));
  }
});

test("restore keeps this browser's device id and merges the clock forward", async () => {
  const store = await filled();
  const mine = await store.getMeta('hlc');
  const later = `${String(Number(mine.slice(0, 13)) + 60_000).padStart(13, '0')}-00000-desk-9`;
  const doc = { $type: BACKUP_TYPE, version: 1, records: [], blobs: {}, meta: { deviceId: 'desk-9', hlc: later } };
  await restoreBackup(store, doc);
  assert.equal(await store.getMeta('deviceId'), 'desk-1');
  assert.equal(await store.getMeta('hlc'), later, "the file's later stamp wins");
  await restoreBackup(store, { ...doc, meta: { hlc: '0000000000001-00000-desk-9' } });
  assert.equal(await store.getMeta('hlc'), later, "an earlier stamp never moves this browser's clock back");
});

test('a restore that fails part way through still puts back the token, device id and clock', async () => {
  const store = await filled();
  const hlc = await store.getMeta('hlc');
  let puts = 0;
  const failing = { ...store, async putRecord(env) { if (++puts === 2) throw new Error('QuotaExceededError'); return store.putRecord(env); } };
  const rec = (await store.allRecords())[0];
  const doc = { $type: BACKUP_TYPE, version: 1, meta: {}, blobs: {},
    records: [{ ...rec, key: `${rec.key}1` }, { ...rec, key: `${rec.key}2` }] };
  await assert.rejects(restoreBackup(failing, doc), /QuotaExceededError/);
  assert.equal(await store.getMeta('stringToken'), 'secret');
  assert.equal(await store.getMeta('deviceId'), 'desk-1');
  assert.equal(await store.getMeta('hlc'), hlc);
});
