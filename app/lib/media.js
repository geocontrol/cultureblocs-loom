/* Photos are content-addressed exactly as the String names them:
 * /media/<sha256 hex><ext>, the extension chosen by MIME type
 * (cultureblocs-string string/app/main.py MEDIA_EXT). So a photo imported
 * from the String, one added in Loom, and the String's copy of it share one
 * name, and the blobs store is keyed by the hash. */

export const MEDIA_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/heic': '.heic' };

const NAME_RE = /^([0-9a-f]{64})\.[a-z0-9]{2,5}$/;

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const mediaName = (hash, mime) => `${hash}${MEDIA_EXT[mime] || '.bin'}`;
export const mediaUri = (name) => `/media/${name}`;

/* The file name from a media uri, relative ("/media/x.jpg") or absolute. */
export function nameFromUri(uri) {
  const name = typeof uri === 'string' ? uri.split('/').pop() : '';
  return NAME_RE.test(name) ? name : null;
}

export const hashFromName = (name) => NAME_RE.exec(name)?.[1] ?? null;

/* The media names a record body references. */
export const mediaNames = (body) =>
  (Array.isArray(body?.media) ? body.media : []).map((m) => nameFromUri(m?.uri)).filter(Boolean);

/* Store a photo; returns its media uri. */
export async function putPhoto(store, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const mime = blob.type || 'application/octet-stream';
  await store.putBlob({ hash, mime, blob });
  return mediaUri(mediaName(hash, mime));
}

/* Blob hashes no record references any more; the orphan sweep deletes these. */
export function orphanedHashes(records, storedHashes) {
  const live = new Set(records.flatMap((r) => mediaNames(r.body).map(hashFromName)));
  return storedHashes.filter((h) => !live.has(h));
}
