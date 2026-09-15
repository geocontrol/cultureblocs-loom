/* Behaviours every store implementation must have. Run in node against
 * lib/memstore.js (store.test.mjs) and in a browser against lib/store.js's
 * IndexedDB store (store.html). `assert` is node:assert or the page's shim. */

const rec = (key, day, extra = {}) => ({ key, type: 'com.cultureblocs.bead', rkey: key.split('/').pop(),
  day, body: { note: key }, ...extra });

export const storeContract = {
  async 'records round-trip, list, and delete'(store, assert) {
    await store.putRecord(rec('com.cultureblocs.bead/a', '2026-09-14'));
    await store.putRecord(rec('com.cultureblocs.bead/b', '2026-09-15', { stringId: 'sid-b' }));
    assert.deepEqual((await store.getRecord('com.cultureblocs.bead/a')).body, { note: 'com.cultureblocs.bead/a' });
    assert.equal((await store.allRecords()).length, 2);
    await store.deleteRecord('com.cultureblocs.bead/a');
    assert.equal(await store.getRecord('com.cultureblocs.bead/a'), undefined);
  },
  async 'records are found by day and by String id'(store, assert) {
    await store.putRecord(rec('com.cultureblocs.bead/a', '2026-09-14'));
    await store.putRecord(rec('com.cultureblocs.bead/b', '2026-09-15', { stringId: 'sid-b' }));
    assert.deepEqual((await store.recordsByDay('2026-09-15')).map((r) => r.key), ['com.cultureblocs.bead/b']);
    assert.equal((await store.recordByStringId('sid-b')).key, 'com.cultureblocs.bead/b');
    assert.equal(await store.recordByStringId('nope'), undefined);
  },
  async 'a stored record is a copy, not the caller\'s object'(store, assert) {
    const r = rec('com.cultureblocs.bead/a', '2026-09-14');
    await store.putRecord(r);
    r.body.note = 'mutated after put';
    assert.equal((await store.getRecord('com.cultureblocs.bead/a')).body.note, 'com.cultureblocs.bead/a');
  },
  async 'blobs round-trip and list by hash'(store, assert) {
    await store.putBlob({ hash: 'h1', mime: 'image/jpeg', blob: new Blob(['pixels'], { type: 'image/jpeg' }) });
    const row = await store.getBlob('h1');
    assert.equal(row.mime, 'image/jpeg');
    assert.equal(await row.blob.text(), 'pixels');
    assert.deepEqual(await store.blobHashes(), ['h1']);
    await store.deleteBlob('h1');
    assert.equal(await store.getBlob('h1'), undefined);
  },
  async 'meta values round-trip, list and delete'(store, assert) {
    await store.setMeta('deviceId', 'desk-1');
    await store.setMeta('draft:x', { body: { note: 'half' } });
    assert.equal(await store.getMeta('deviceId'), 'desk-1');
    assert.deepEqual(await store.allMeta(), { deviceId: 'desk-1', 'draft:x': { body: { note: 'half' } } });
    await store.deleteMeta('draft:x');
    assert.equal(await store.getMeta('draft:x'), undefined);
  },
  async 'clear empties every store'(store, assert) {
    await store.putRecord(rec('com.cultureblocs.bead/a', '2026-09-14'));
    await store.putBlob({ hash: 'h1', mime: 'image/png', blob: new Blob(['x']) });
    await store.setMeta('k', 1);
    await store.clear();
    assert.deepEqual(await store.allRecords(), []);
    assert.deepEqual(await store.blobHashes(), []);
    assert.deepEqual(await store.allMeta(), {});
  },
};
