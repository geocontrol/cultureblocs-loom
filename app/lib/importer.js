/* One-way import from the String (Phase 1; replaced by sync in Phase 2).
 *
 * Re-runnable. Each String record is planned against its local copy:
 *   add        not held locally
 *   update     unchanged in Loom since the last import, changed on the String
 *   unchanged  the same on both sides
 *   conflict   changed on both sides: left alone and reported (merging is Phase 2)
 * "Changed in Loom" compares the local body with `importedHash` (its hash as
 * stored at import) and the state with `importedState`; "changed on the String"
 * compares the String's body with `stringHash` and its state with `importedState`.
 * Two hashes, because import rewrites a strand's items from spine:// to loom://. */
import { contentHash } from '../vendor/strip.js';
import { dayOf, idFromSpineUri, itemUri, recordKey } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const STRAND = 'com.cultureblocs.strand';

export async function planImport(stringRecords, localByStringId) {
  const plan = [];
  for (const rec of stringRecords) {
    const local = localByStringId.get(rec.id);
    const stringState = rec.state || 'kept';
    if (!local) { plan.push({ action: 'add', rec }); continue; }
    const stringChanged = (await contentHash(rec.body)) !== local.stringHash || stringState !== local.importedState;
    const loomChanged = (await contentHash(local.body)) !== local.importedHash || local.state !== local.importedState;
    const action = !stringChanged ? 'unchanged' : loomChanged ? 'conflict' : 'update';
    plan.push({ action, rec, local });
  }
  return plan;
}

/* spine://records/<id> -> loom://<key> where that record is held; other uris untouched. */
function rewriteItems(body, keyByStringId) {
  if (!Array.isArray(body.items)) return body;
  return { ...body, items: body.items.map((it) => {
    const key = keyByStringId.get(idFromSpineUri(it?.uri));
    return key ? { ...it, uri: itemUri(key) } : it;
  }) };
}

export async function runImport({ store, registry, client, now = () => Date.now(), onProgress = () => {} }) {
  const iso = () => new Date(now()).toISOString();
  const types = (await client.health()).filter((t) => registry.recordTypes().includes(t));
  const stringRecords = [];
  for (const type of types) stringRecords.push(...await client.listRecords(type));

  const locals = new Map((await store.allRecords()).filter((r) => r.stringId).map((r) => [r.stringId, r]));
  const plan = await planImport(stringRecords, locals);
  const counts = { add: 0, update: 0, unchanged: 0, conflict: 0, invalid: 0, photos: 0, missing: 0 };
  const conflicts = [];

  const keyByStringId = new Map([...locals.values()].map((r) => [r.stringId, r.key]));
  for (const { action, rec } of plan) {
    if (action === 'add') keyByStringId.set(rec.id, recordKey(rec.type, rec.id));
  }

  // Strands last, so every item they point at is already held.
  const ordered = [...plan].sort((a, b) => (a.rec.type === STRAND) - (b.rec.type === STRAND));
  for (const { action, rec, local } of ordered) {
    counts[action] += 1;
    if (action === 'conflict') conflicts.push(local.key);
    if (action !== 'add' && action !== 'update') continue;
    const body = rec.type === STRAND ? rewriteItems(rec.body, keyByStringId) : rec.body;
    const problems = registry.validateRecord(rec.type, rec.body);
    const env = {
      key: local?.key ?? recordKey(rec.type, rec.id), type: rec.type, rkey: local?.rkey ?? rec.id,
      body, state: rec.state || 'kept', origin: local?.origin ?? 'import', sourceApp: rec.sourceApp,
      createdAt: rec.createdAt, updatedAt: iso(), hlc: rec.hlc ?? null, deviceId: 'string',
      day: dayOf(rec.type, body, rec.createdAt), stringId: rec.id,
      stringHash: await contentHash(rec.body), importedHash: await contentHash(body),
      importedState: rec.state || 'kept',
    };
    if (problems.length) { env.invalid = problems; counts.invalid += 1; }
    const missing = [];
    for (const name of mediaNames(body)) {
      const hash = hashFromName(name);
      if (await store.getBlob(hash)) continue;
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash, mime: blob.type, blob });
        counts.photos += 1;
      } catch {
        missing.push(name);
      }
    }
    if (missing.length) { env.missing = missing; counts.missing += missing.length; }
    await store.putRecord(env);   // one record per write: an interrupted import leaves a consistent store
    onProgress(counts);
  }
  // Records added or updated before their photos could be fetched retry next time.
  for (const r of await store.allRecords()) {
    if (!r.missing?.length || plan.some((p) => p.rec.id === r.stringId && (p.action === 'add' || p.action === 'update'))) continue;
    const still = [];
    for (const name of r.missing) {
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash: hashFromName(name), mime: blob.type, blob });
        counts.photos += 1;
      } catch { still.push(name); }
    }
    const { missing: _, ...rest } = r;
    await store.putRecord(still.length ? { ...rest, missing: still } : rest);
  }
  await store.setMeta('lastImportAt', iso());
  return { counts, conflicts };
}
