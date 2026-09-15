/* One-file backup of everything Loom holds: records, photos (base64) and
 * settings — except the String token, which does not belong in a file you
 * might copy anywhere. Restore replaces the store's contents. */

export const BACKUP_TYPE = 'com.cultureblocs.loom.backup';
export const BACKUP_VERSION = 1;
const NOT_BACKED_UP = ['stringToken'];

/* btoa needs a binary string; String.fromCharCode(...bytes) overflows the
 * argument stack on large arrays, so chunk it (as easel/lib/backup.js). */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function exportBackup(store, now = () => Date.now()) {
  const meta = await store.allMeta();
  for (const k of NOT_BACKED_UP) delete meta[k];
  const blobs = {};
  for (const hash of await store.blobHashes()) {
    const row = await store.getBlob(hash);
    blobs[hash] = { mime: row.mime, data: bytesToBase64(new Uint8Array(await row.blob.arrayBuffer())) };
  }
  return { $type: BACKUP_TYPE, version: BACKUP_VERSION, exportedAt: new Date(now()).toISOString(),
    records: await store.allRecords(), meta, blobs };
}

export async function restoreBackup(store, doc) {
  if (doc?.$type !== BACKUP_TYPE) throw new Error('not a Loom backup file');
  if (doc.version !== BACKUP_VERSION) throw new Error(`unsupported backup version: ${doc.version}`);
  if (!Array.isArray(doc.records)) throw new Error('backup has no records');
  const token = await store.getMeta('stringToken');
  await store.clear();
  for (const r of doc.records) await store.putRecord(r);
  for (const [hash, b] of Object.entries(doc.blobs || {})) {
    await store.putBlob({ hash, mime: b.mime, blob: new Blob([base64ToBytes(b.data)], { type: b.mime }) });
  }
  for (const [k, v] of Object.entries(doc.meta || {})) await store.setMeta(k, v);
  if (token !== undefined) await store.setMeta('stringToken', token);   // keep this browser's token
  return { records: doc.records.length, photos: Object.keys(doc.blobs || {}).length };
}
