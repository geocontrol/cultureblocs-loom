/* Local record keys and the item URIs strands use to point at them.
 *
 * In Loom a strand's items reference local keys, loom://<nsid>/<rkey>; on the
 * String they reference spine://records/<id>. Import rewrites one way, send the
 * other (see importer.js and sender.js). */

export const recordKey = (type, rkey) => `${type}/${rkey}`;

export function splitKey(key) {
  const i = key.lastIndexOf('/');
  return { type: key.slice(0, i), rkey: key.slice(i + 1) };
}

export const itemUri = (key) => `loom://${key}`;
export const keyFromItemUri = (uri) =>
  typeof uri === 'string' && uri.startsWith('loom://') ? uri.slice('loom://'.length) : null;

export const spineUri = (stringId) => `spine://records/${stringId}`;
export const idFromSpineUri = (uri) =>
  typeof uri === 'string' && uri.startsWith('spine://records/') ? uri.slice('spine://records/'.length) : null;

/* The day a record belongs to, for the Thread index: a strand's `day`, else createdAt. */
export function dayOf(type, body, createdAt) {
  const src = type === 'com.cultureblocs.strand' && typeof body?.day === 'string' ? body.day : createdAt;
  return typeof src === 'string' ? src.slice(0, 10) : null;
}
