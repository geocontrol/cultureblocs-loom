/* Local record keys and the item URIs strands use to point at them.
 *
 * In Loom a strand's items reference local keys, loom://<nsid>/<rkey>; on the
 * String they reference spine://records/<id>. Import rewrites one way, send the
 * other (see importer.js and sender.js). `same` is the JSON comparison the
 * lib modules share. */

/* Two JSON values are the same (absent and null alike): provenance, a conflict's fields. */
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

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

/* A body in Loom form: strand items spine://records/<id> -> loom://<key> where
 * `keyByStringId` knows the record; other uris, and bodies without items, untouched. */
export function toLoomItems(body, keyByStringId) {
  if (!Array.isArray(body?.items)) return body;
  return { ...body, items: body.items.map((it) => {
    const key = keyByStringId.get(idFromSpineUri(it?.uri));
    return key ? { ...it, uri: itemUri(key) } : it;
  }) };
}

/* The day a record belongs to, for the Thread index: a strand's `day`, else createdAt. */
export function dayOf(type, body, createdAt) {
  const src = type === 'com.cultureblocs.strand' && typeof body?.day === 'string' ? body.day : createdAt;
  return typeof src === 'string' ? src.slice(0, 10) : null;
}
