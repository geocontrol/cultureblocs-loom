/* One-way import from the String (Phase 1; replaced by sync in Phase 2).
 *
 * Re-runnable. Each String record is planned against its local copy:
 *   add        not held locally
 *   link       a record Loom sent (dedupeKey "loom:<rkey>") whose local copy
 *              lost its stringId, e.g. after restoring an older backup
 *   update     unchanged in Loom since the last import, changed on the String
 *   unchanged  the same on both sides
 *   conflict   changed on both sides: left alone and reported (merging is Phase 2)
 * "Changed in Loom" compares the local body with `importedHash` (its hash as
 * stored at import) and the state with `importedState`; "changed on the String"
 * compares the String's body with `stringHash` and its state with `importedState`.
 * Two hashes, because import rewrites a strand's items from spine:// to loom://.
 *
 * Every write re-reads the local record first: the network awaits in between
 * give another tab time to save, and a stale snapshot must never undo that. */
import { contentHash } from '../vendor/strip.js';
import { dayOf, recordKey, toLoomItems } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const STRAND = 'com.cultureblocs.strand';
const LOOM_DEDUPE = 'loom:';

/* The action for one String record against one local record (held under its stringId). */
async function decide(rec, local) {
  const stringState = rec.state || 'kept';
  const bodyChanged = (await contentHash(rec.body)) !== local.stringHash;
  const stringChanged = bodyChanged || stringState !== local.importedState;
  if (!stringChanged) return 'unchanged';
  const loomChanged = (await contentHash(local.body)) !== local.importedHash || local.state !== local.importedState;
  return loomChanged ? 'conflict' : 'update';
}

/* The local record a String record was sent from, if it has not been linked yet. */
function sentFrom(rec, localByKey) {
  if (typeof rec.dedupeKey !== 'string' || !rec.dedupeKey.startsWith(LOOM_DEDUPE)) return null;
  const local = localByKey.get(recordKey(rec.type, rec.dedupeKey.slice(LOOM_DEDUPE.length)));
  return local && local.sourceApp === 'loom' && !local.stringId ? local : null;
}

export async function planImport(stringRecords, localByStringId, localByKey = new Map()) {
  const plan = [];
  for (const rec of stringRecords) {
    const local = localByStringId.get(rec.id);
    if (local) { plan.push({ action: await decide(rec, local), rec, local }); continue; }
    const origin = sentFrom(rec, localByKey);
    plan.push(origin ? { action: 'link', rec, local: origin } : { action: 'add', rec });
  }
  return plan;
}

export async function runImport({ store, registry, client, now = () => Date.now(), onProgress = () => {} }) {
  const iso = () => new Date(now()).toISOString();
  const types = (await client.health()).filter((t) => registry.recordTypes().includes(t));
  const stringRecords = [];
  for (const type of types) stringRecords.push(...await client.listRecords(type));

  const all = await store.allRecords();
  const locals = new Map(all.filter((r) => r.stringId).map((r) => [r.stringId, r]));
  const plan = await planImport(stringRecords, locals, new Map(all.map((r) => [r.key, r])));
  const counts = { add: 0, link: 0, update: 0, unchanged: 0, conflict: 0, invalid: 0, photos: 0, missing: 0 };
  const conflicts = [];

  const keyByStringId = new Map([...locals.values()].map((r) => [r.stringId, r.key]));
  for (const { action, rec, local } of plan) {
    if (action === 'add') keyByStringId.set(rec.id, recordKey(rec.type, rec.id));
    if (action === 'link') keyByStringId.set(rec.id, local.key);
  }

  const conflict = (key) => { counts.conflict += 1; conflicts.push(key); };

  // Strands last, so every item they point at is already held.
  const ordered = [...plan].sort((a, b) => (a.rec.type === STRAND) - (b.rec.type === STRAND));
  for (const { action, rec, local } of ordered) {
    if (action === 'unchanged') { counts.unchanged += 1; continue; }
    if (action === 'conflict') { conflict(local.key); continue; }
    const body = rec.type === STRAND ? toLoomItems(rec.body, keyByStringId) : rec.body;
    const key = local?.key ?? recordKey(rec.type, rec.id);

    if (action === 'link') {
      const cur = await store.getRecord(key);
      if (!cur || cur.stringId) { counts.unchanged += 1; continue; }   // linked meanwhile (another tab)
      await store.putRecord({ ...cur, stringId: rec.id, sentAt: cur.sentAt ?? iso(),
        stringHash: await contentHash(rec.body), importedHash: await contentHash(body),
        importedState: rec.state || 'kept' });
      counts.link += 1;
      onProgress(counts);
      continue;
    }

    const problems = registry.validateRecord(rec.type, rec.body);
    const env = {
      key, type: rec.type, rkey: local?.rkey ?? rec.id,
      body, state: rec.state || 'kept', origin: local?.origin ?? 'import', sourceApp: rec.sourceApp,
      createdAt: rec.createdAt, updatedAt: iso(), hlc: rec.hlc ?? null, deviceId: 'string',
      day: dayOf(rec.type, body, rec.createdAt), stringId: rec.id,
      stringHash: await contentHash(rec.body), importedHash: await contentHash(body),
      importedState: rec.state || 'kept',
    };
    if (local?.sentAt) env.sentAt = local.sentAt;
    if (problems.length) env.invalid = problems;
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
    if (missing.length) env.missing = missing;

    // Re-read immediately before writing: plan it again against what is stored now.
    const cur = await store.getRecord(key);
    const again = cur ? (cur.stringId === rec.id ? await decide(rec, cur) : 'conflict') : 'add';
    if (again === 'unchanged') { counts.unchanged += 1; continue; }
    if (again === 'conflict' || (again === 'add') !== (action === 'add')) { conflict(key); continue; }

    counts[action] += 1;
    if (problems.length) counts.invalid += 1;
    counts.missing += missing.length;
    await store.putRecord(env);   // one record per write: an interrupted import leaves a consistent store
    onProgress(counts);
  }

  // Records added or updated before their photos could be fetched retry next time.
  for (const r of await store.allRecords()) {
    if (!r.missing?.length || plan.some((p) => p.rec.id === r.stringId && (p.action === 'add' || p.action === 'update'))) continue;
    const still = [];
    for (const name of r.missing) {
      const hash = hashFromName(name);
      if (await store.getBlob(hash)) continue;          // another record fetched it this run
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash, mime: blob.type, blob });
        counts.photos += 1;
      } catch { still.push(name); }
    }
    const cur = await store.getRecord(r.key);
    if (!cur) continue;
    const referenced = new Set(mediaNames(cur.body));
    const left = still.filter((n) => referenced.has(n));
    const { missing: _, ...rest } = cur;
    await store.putRecord(left.length ? { ...rest, missing: left } : rest);   // only `missing` changes
  }
  await store.setMeta('lastImportAt', iso());
  return { counts, conflicts };
}
