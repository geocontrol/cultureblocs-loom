/* Phase 1 records and settings, brought to the desk's model. Idempotent: run
 * when Loom opens and after every restore, so a Phase 1 backup restores too.
 *
 *   state "released"   a proposal released in Loom that the String still held:
 *                      now a proposal marked `deleted`, which Send deletes there
 *   posture, masks, mask   settings of the retired Mint and posture: removed */

const RETIRED_META = ['posture', 'masks', 'mask'];

/* The record in the desk's model, or null if it needs no change. Pure. */
export function migrateRecord(r) {
  if (r?.state === 'released') return { ...r, state: 'proposal', deleted: true };
  return null;
}

/* Returns how many records changed. */
export async function migrateStore(store) {
  let changed = 0;
  for (const r of await store.allRecords()) {
    const next = migrateRecord(r);
    if (next) { await store.putRecord(next); changed += 1; }
  }
  for (const k of RETIRED_META) await store.deleteMeta(k);
  return changed;
}
