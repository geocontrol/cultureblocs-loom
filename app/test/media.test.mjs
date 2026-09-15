import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemStore } from '../lib/memstore.js';
import { hashFromName, mediaNames, nameFromUri, orphanedHashes, putPhoto, sha256Hex } from '../lib/media.js';
import { photo } from './fake-string.mjs';

const H = 'ab'.repeat(32);

test("photos are named exactly as the String names them: sha256 of the bytes plus the MIME extension", async () => {
  const store = createMemStore();
  const blob = photo('pixels');
  const uri = await putPhoto(store, blob);
  const hash = await sha256Hex(new TextEncoder().encode('pixels'));
  assert.equal(uri, `/media/${hash}.jpg`);
  assert.equal((await store.getBlob(hash)).mime, 'image/jpeg');
});

test('names are read from relative and absolute media uris, and junk is ignored', () => {
  assert.equal(nameFromUri(`/media/${H}.jpg`), `${H}.jpg`);
  assert.equal(nameFromUri(`http://brick:8100/media/${H}.png`), `${H}.png`);
  assert.equal(nameFromUri('/media/../../etc/passwd'), null);
  assert.equal(hashFromName(`${H}.webp`), H);
  assert.deepEqual(mediaNames({ media: [{ uri: `/media/${H}.jpg` }, { uri: 'nope' }, null] }), [`${H}.jpg`]);
});

test('orphaned photo hashes are those no record references', () => {
  const other = 'cd'.repeat(32);
  assert.deepEqual(orphanedHashes([{ body: { media: [{ uri: `/media/${H}.jpg` }] } }], [H, other]), [other]);
});
