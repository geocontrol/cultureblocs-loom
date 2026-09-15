/* In-memory store with the same interface as store.js's IndexedDB store.
 * Used by the node tests and by anything that needs a scratch store. */

export function createMemStore() {
  const records = new Map(), blobs = new Map(), meta = new Map();
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    async getRecord(key) { return clone(records.get(key)); },
    async putRecord(env) { records.set(env.key, clone(env)); },
    async deleteRecord(key) { records.delete(key); },
    async allRecords() { return [...records.values()].map(clone); },
    async recordsByDay(day) { return [...records.values()].filter((r) => r.day === day).map(clone); },
    async recordByStringId(id) { return clone([...records.values()].find((r) => r.stringId === id)); },
    async getBlob(hash) { return blobs.get(hash); },
    async putBlob(row) { blobs.set(row.hash, row); },
    async deleteBlob(hash) { blobs.delete(hash); },
    async blobHashes() { return [...blobs.keys()]; },
    async getMeta(k) { return clone(meta.get(k)); },
    async setMeta(k, v) { meta.set(k, clone(v)); },
    async deleteMeta(k) { meta.delete(k); },
    async allMeta() { return Object.fromEntries([...meta].map(([k, v]) => [k, clone(v)])); },
    async clear() { records.clear(); blobs.clear(); meta.clear(); },
  };
}
