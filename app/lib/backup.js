/* One-file backup of everything Loom holds: records, photos (base64) and
 * settings — except the String token, which does not belong in a file you
 * might copy anywhere. Restore replaces the store's contents.
 *
 * Restore checks the whole file and decodes every photo before it clears
 * anything, so a bad file never costs the data already here. This browser
 * keeps its own identity through a restore: its String token, its device id
 * (two browsers must never stamp as one device) and a clock that only moves
 * forward. Those three are put back even if the restore fails part way; the
 * file being restored is still in the user's hands to retry. */
import { parseStamp } from './hlc.js';

export const BACKUP_TYPE = 'com.cultureblocs.loom.backup';
export const BACKUP_VERSION = 1;
const NOT_BACKED_UP = ['stringToken'];
const THIS_BROWSER = ['stringToken', 'deviceId', 'hlc'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

/* Throws, naming the first problem, unless the whole document can be restored.
 * Returns the decoded blob rows. */
export function checkBackup(doc) {
  if (doc?.$type !== BACKUP_TYPE) throw new Error('not a Loom backup file');
  if (doc.version !== BACKUP_VERSION) throw new Error(`unsupported backup version: ${doc.version}`);
  if (!Array.isArray(doc.records)) throw new Error('backup has no records');
  doc.records.forEach((r, i) => {
    if (!isObject(r) || typeof r.key !== 'string' || typeof r.type !== 'string' || !isObject(r.body)) {
      throw new Error(`backup record ${i} needs a string key, a string type and an object body`);
    }
  });
  if (doc.blobs !== undefined && !isObject(doc.blobs)) throw new Error('backup photos are not an object');
  if (doc.meta !== undefined && !isObject(doc.meta)) throw new Error('backup settings are not an object');
  if (doc.meta?.hlc !== undefined) parseStamp(doc.meta.hlc);
  return Object.entries(doc.blobs || {}).map(([hash, b]) => {
    if (!isObject(b) || typeof b.data !== 'string') throw new Error(`backup photo ${hash} has no data`);
    let bytes;
    try { bytes = base64ToBytes(b.data); } catch { throw new Error(`backup photo ${hash} is not valid base64`); }
    const mime = typeof b.mime === 'string' ? b.mime : 'application/octet-stream';
    return { hash, mime, blob: new Blob([bytes], { type: mime }) };
  });
}

const later = (a, b) => {
  const ok = (s) => { try { parseStamp(s); return true; } catch { return false; } };
  if (!ok(a)) return ok(b) ? b : undefined;
  return ok(b) && b > a ? b : a;
};

export async function restoreBackup(store, doc) {
  const rows = checkBackup(doc);
  const kept = { stringToken: await store.getMeta('stringToken'), deviceId: await store.getMeta('deviceId'),
    hlc: later(await store.getMeta('hlc'), doc.meta?.hlc) };
  try {
    await store.clear();
    for (const r of doc.records) await store.putRecord(r);
    for (const row of rows) await store.putBlob(row);
    for (const [k, v] of Object.entries(doc.meta || {})) if (!THIS_BROWSER.includes(k)) await store.setMeta(k, v);
  } finally {
    for (const [k, v] of Object.entries(kept)) if (v !== undefined) await store.setMeta(k, v);
  }
  return { records: doc.records.length, photos: rows.length };
}
