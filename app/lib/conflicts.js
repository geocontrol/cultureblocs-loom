/* Choosing a side for a record marked `conflict` — changed in Loom and on the
 * String (by import), or refused by the String with 412 or 404 (by Send).
 * `conflict.theirs` is the String's record as fetched, or null when the String
 * no longer has it. Field-by-field merging waits for Phase 2 sync.
 *
 *   keepMine     Loom's version stands. The String's version becomes the one
 *                Send edits against, so the next Send carries Loom's body (or
 *                its delete); if the String deleted the record, Loom's copy is
 *                posted again as new — or, if Loom was deleting it too, it goes.
 *   takeTheirs   The String's version replaces Loom's, as an import would; if
 *                the String deleted the record, Loom's copy goes. An unsaved
 *                draft of an existing record is left in place, so nothing typed
 *                is lost. */
import { contentHash } from '../vendor/strip.js';
import { stringFields } from './importer.js';
import { dayOf, toLoomItems } from './keys.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const keyByStringId = async (store) =>
  new Map((await store.allRecords()).filter((r) => r.stringId).map((r) => [r.stringId, r.key]));

async function conflicted(store, key) {
  const r = await store.getRecord(key);
  if (!r?.conflict) throw new Error(`${key} is not in conflict`);
  return r;
}

/* The top-level fields that differ: [{ field, mine, theirs }], Loom's field order first. */
export function changedFields(mine = {}, theirs = {}) {
  const fields = [...new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {})])];
  return fields.filter((f) => !same(mine?.[f], theirs?.[f])).map((field) => ({ field, mine: mine?.[field], theirs: theirs?.[field] }));
}

/* The String's side of a conflict in Loom's form (strand items as loom:// keys), or null. */
export async function theirBody(store, record) {
  const theirs = record?.conflict?.theirs;
  return theirs ? toLoomItems(theirs.body, await keyByStringId(store)) : null;
}

export async function keepMine(store, key) {
  const { conflict, ...rest } = await conflicted(store, key);
  const { theirs } = conflict;
  if (!theirs) {
    if (rest.deleted) {                                        // gone on both sides
      await store.deleteRecord(key);
      await store.deleteMeta(`draft:${key}`);
      return null;
    }
    const { stringId: _i, stringHash: _h, importedHash: _m, importedState: _s, stringHlc: _v, stringKeys: _k,
      stringMedia: _p, sentAt: _t, ...local } = rest;
    await store.putRecord(local);                              // posted again as new
    return local;
  }
  const next = { ...rest, stringHash: await contentHash(theirs.body),
    importedHash: await contentHash(toLoomItems(theirs.body, await keyByStringId(store))),
    importedState: theirs.state || 'kept', ...stringFields(theirs) };
  await store.putRecord(next);
  return next;
}

export async function takeTheirs(store, key, { registry = null, now = () => Date.now() } = {}) {
  const { conflict, deleted: _d, problems: _p, invalid: _v, ...rest } = await conflicted(store, key);
  const { theirs } = conflict;
  if (!theirs) {
    await store.deleteRecord(key);
    await store.deleteMeta(`draft:${key}`);
    return null;
  }
  const body = toLoomItems(theirs.body, await keyByStringId(store));
  const next = { ...rest, body, state: theirs.state || 'kept', updatedAt: new Date(now()).toISOString(),
    day: dayOf(rest.type, body, rest.createdAt), stringHash: await contentHash(theirs.body),
    importedHash: await contentHash(body), importedState: theirs.state || 'kept', ...stringFields(theirs) };
  const problems = registry ? registry.validateRecord(rest.type, theirs.body) : [];
  if (problems.length) next.invalid = problems;
  await store.putRecord(next);
  return next;
}
