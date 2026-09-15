/* IndexedDB store: database "loom", stores records / blobs / meta.
 * Browser-only; lib/memstore.js implements the same interface for node.
 *
 *   records  keyPath key,  indexes day, stringId
 *   blobs    keyPath hash  { hash, mime, blob }
 *   meta     keyPath k     { k, v }
 */

const DB = 'loom', VERSION = 1;

function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openStore(indexedDB = globalThis.indexedDB, name = DB) {
  const open = indexedDB.open(name, VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    const records = db.createObjectStore('records', { keyPath: 'key' });
    records.createIndex('day', 'day');
    records.createIndex('stringId', 'stringId');
    db.createObjectStore('blobs', { keyPath: 'hash' });
    db.createObjectStore('meta', { keyPath: 'k' });
  };
  const db = await request(open);

  function run(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const result = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  }

  return {
    getRecord: (key) => run('records', 'readonly', (s) => s.get(key)),
    putRecord: (env) => run('records', 'readwrite', (s) => { s.put(env); }),
    deleteRecord: (key) => run('records', 'readwrite', (s) => { s.delete(key); }),
    allRecords: () => run('records', 'readonly', (s) => s.getAll()),
    recordsByDay: (day) => run('records', 'readonly', (s) => s.index('day').getAll(day)),
    recordByStringId: (id) => run('records', 'readonly', (s) => s.index('stringId').get(id)),
    getBlob: (hash) => run('blobs', 'readonly', (s) => s.get(hash)),
    putBlob: (row) => run('blobs', 'readwrite', (s) => { s.put(row); }),
    deleteBlob: (hash) => run('blobs', 'readwrite', (s) => { s.delete(hash); }),
    blobHashes: () => run('blobs', 'readonly', (s) => s.getAllKeys()),
    getMeta: async (k) => (await run('meta', 'readonly', (s) => s.get(k)))?.v,
    setMeta: (k, v) => run('meta', 'readwrite', (s) => { s.put({ k, v }); }),
    deleteMeta: (k) => run('meta', 'readwrite', (s) => { s.delete(k); }),
    allMeta: async () => Object.fromEntries(
      (await run('meta', 'readonly', (s) => s.getAll())).map(({ k, v }) => [k, v])),
    clear: () => Promise.all(['records', 'blobs', 'meta'].map((n) => run(n, 'readwrite', (s) => { s.clear(); }))),
    close: () => db.close(),
  };
}
