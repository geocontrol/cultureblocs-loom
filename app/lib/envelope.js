/* The one write path for records made or edited in Loom.
 *
 * Every write validates against the vendored lexicons and the refs anchor
 * checks before it touches the store; a record with problems is never stored.
 * Every write is stamped with this device's HLC. Imported records arrive
 * through importer.js instead and are the one exception to validation (they
 * are already on the String, so hiding them would be worse).
 *
 * A new record is written whole, once: until Save it exists only as a draft
 * (`draft:<key>` in meta, under a key reserved when its form opened). */
import { anchorProblems } from '../vendor/refs.js';
import { createClock } from './hlc.js';
import { dayOf, itemUri, recordKey, same } from './keys.js';
import { mediaNames } from './media.js';
import { tidGenerator } from './tid.js';

export const BEAD = 'com.cultureblocs.bead';
export const STRAND = 'com.cultureblocs.strand';
export const EDITABLE = [BEAD, STRAND];
const PUBLISHED = ['published', 'edited'];

export class InvalidRecord extends Error {
  constructor(problems) {
    super(`record is not valid: ${problems.join('; ')}`);
    this.problems = problems;
  }
}

/* Another tab (or an import) wrote the record after this editor loaded it. */
export class Conflict extends Error {
  constructor(current) {
    super('record changed since it was loaded');
    this.current = current;
  }
}

/* Why a record cannot be deleted in Loom, or null if it can.
 *
 * `publishedUri` is the signal that matters: publishing stamps that column on
 * the String and deliberately leaves `state` alone, so a published record
 * still reads `kept`. The state check stays for records whose state was set
 * by an app that does keep its own published state (easel does). */
export function whyNotDeletable(r) {
  if (!r) return 'there is no such record';
  if (!EDITABLE.includes(r.type)) return 'records of this type are read-only in Loom';
  if (r.publishedUri || PUBLISHED.includes(r.state)) return 'it is published: unpublish it first';
  return null;
}

const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const randomDeviceId = () => `loom-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

export async function openLoom({ store, registry, now = () => Date.now(), newDeviceId = randomDeviceId, nowMicros }) {
  let deviceId = await store.getMeta('deviceId');
  if (!deviceId) {
    deviceId = newDeviceId();
    await store.setMeta('deviceId', deviceId);
  }
  const clock = createClock(deviceId, { now, last: await store.getMeta('hlc') });
  const tid = tidGenerator({ nowMicros: nowMicros ?? (() => BigInt(now()) * 1000n) });
  const iso = () => new Date(now()).toISOString();

  async function stamp() {
    const s = clock.tick();
    await store.setMeta('hlc', s);
    return s;
  }

  function validate(type, body) {
    return [...registry.validateRecord(type, body), ...anchorProblems(type, body)];
  }

  function check(type, body) {
    const problems = validate(type, body);
    if (problems.length) throw new InvalidRecord(problems);
  }

  /* `at` is the moment of the save: the record's updatedAt, and the time its body records. */
  async function create(key, type, body, at, extra = {}) {
    check(type, body);
    if (await store.getRecord(key)) throw new Error(`${key} already exists`);
    const env = {
      key, type, rkey: key.slice(type.length + 1), body, state: 'kept', origin: 'loom', sourceApp: 'loom',
      createdAt: body.createdAt, updatedAt: at, hlc: await stamp(), deviceId,
      day: dayOf(type, body, body.createdAt),
      ...extra,
    };
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }

  /* Replace a record's body. `expectUpdatedAt` is the updatedAt the editor
   * loaded; if the stored record has moved on, nothing is written. Provenance
   * is fixed: a body that changes it is refused. Editing a proposal keeps it;
   * saving a Phase 1 draft that never reached the String keeps it too. */
  async function save(key, body, { expectUpdatedAt } = {}) {
    const current = await store.getRecord(key);
    if (!current) throw new Error(`no record ${key}`);
    if (current.deleted) throw new Error(`${key} is deleted: undo the delete to edit it`);
    if (expectUpdatedAt !== undefined && current.updatedAt !== expectUpdatedAt) throw new Conflict(current);
    if (!same(body?.provenance, current.body?.provenance)) throw new InvalidRecord(['$.provenance: fixed when the record was made']);
    check(current.type, body);
    // The body just passed the gate, so an import's `invalid` flag and the
    // String's last refusal no longer apply; `missing` keeps only photos the new body still uses.
    const { invalid: _i, problems: _p, missing = [], ...rest } = current;
    const keeps = current.state === 'proposal' || (current.state === 'draft' && !current.stringId);
    const env = {
      ...rest, body, updatedAt: iso(), hlc: await stamp(), deviceId,
      state: keeps ? 'kept' : current.state,
      day: dayOf(current.type, body, current.createdAt),
    };
    const used = new Set(mediaNames(body));
    const still = (Array.isArray(missing) ? missing : []).filter((n) => used.has(n));
    if (still.length) env.missing = still;
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }

  async function rewrite(current, changes) {
    const env = { ...current, ...changes, updatedAt: iso(), hlc: await stamp(), deviceId };
    await store.putRecord(env);
    return env;
  }

  /* Strands (not deleted) whose items point at `key`. */
  async function strandsUsing(key) {
    const uri = itemUri(key);
    return (await store.allRecords()).filter((r) => r.type === STRAND && !r.deleted
      && list(r.body?.items).some((it) => it?.uri === uri));
  }

  return {
    deviceId,
    validate,
    get: (key) => store.getRecord(key),
    /* A key for a record not yet written: its draft lives under this key until Save. */
    newKey: (type) => recordKey(type, tid()),

    /* A bead, whole. `createdAt` is when it happened (defaults to now);
     * provenance records the save, and whether the time was left at now. */
    createBead(key, body, { timeAnchored = true } = {}) {
      const at = iso();
      const full = { ...body, $type: BEAD, createdAt: body.createdAt || at,
        provenance: { app: 'loom', device: deviceId, mintedAt: at, timeAnchored } };
      return create(key, BEAD, full, at);
    },
    /* A strand, whole: made now, for the day in its body. */
    createStrand(key, body) {
      const at = iso();
      return create(key, STRAND, { ...body, $type: STRAND, createdAt: at, items: list(body.items) }, at);
    },

    /* A bead minted on a device and pulled in over serial. It arrives whole
     * and already triaged on the device, so its body — provenance included —
     * is the device's own, not Loom's. It lands as a `proposal`: the dotted
     * rail in the String column is the review, kept or released in place.
     *
     * `dedupeKey` is the device's own identity for the bead (`cb:…`), carried
     * so Send posts it instead of `loom:<rkey>` and the String dedupes it
     * against anything Studio pushed. Validated like any other write: unlike
     * an import, this record is not on the String yet. */
    adoptBead(key, body, { dedupeKey = null, sourceApp = 'culturebloc-totem' } = {}) {
      const extra = { state: 'proposal', origin: 'connector:totem', sourceApp };
      if (dedupeKey) extra.dedupeKey = dedupeKey;
      return create(key, BEAD, body, iso(), extra);
    },
    save,

    async keep(key) {
      const current = await store.getRecord(key);
      if (current?.state !== 'proposal') throw new Error(`a ${current?.state ?? 'missing'} record cannot be kept`);
      return rewrite(current, { state: 'kept' });
    },

    strandsUsing,

    /* Delete a record (releasing a proposal is the same act). One never on the
     * String goes now; one on the String is marked `deleted` until Send deletes
     * it there. Strands that use a deleted bead lose that item (validated and
     * stamped, their state untouched; all are checked before any is written).
     * Returns the keys of the strands changed. */
    async remove(key) {
      const current = await store.getRecord(key);
      const why = whyNotDeletable(current);
      if (why) throw new Error(`cannot delete ${key}: ${why}`);
      // Every strand is checked before any is written: one that refuses leaves all as they were.
      const rewrites = (await strandsUsing(key)).map((s) => {
        const body = { ...s.body, items: list(s.body.items).filter((it) => it?.uri !== itemUri(key)) };
        check(STRAND, body);
        return [s, body];
      });
      const changed = [];
      for (const [s, body] of rewrites) {
        await rewrite(s, { body });
        changed.push(s.key);
      }
      await store.deleteMeta(`draft:${key}`);
      if (current.stringId) await rewrite(current, { deleted: true });
      else await store.deleteRecord(key);
      return changed;
    },

    /* Take back a delete Send has not made yet. Strands keep the items they lost. */
    async undoRemove(key) {
      const current = await store.getRecord(key);
      if (!current?.deleted) throw new Error(`${key} is not waiting to be deleted`);
      const { deleted: _, ...rest } = current;
      return rewrite(rest, {});
    },

    /* Unsaved work survives reloads here until saved or discarded. For an
     * existing record `baseUpdatedAt` is the updatedAt the edits were typed
     * against (saving over a newer record is a Conflict); a new record's draft
     * has none and names its type. */
    saveDraft: (key, body, baseUpdatedAt = null, type = null) =>
      store.setMeta(`draft:${key}`, { body, at: iso(), baseUpdatedAt, ...(type ? { type } : {}) }),
    getDraft: (key) => store.getMeta(`draft:${key}`),
    discardDraft: (key) => store.deleteMeta(`draft:${key}`),
    /* Drafts of records not yet written: [{ key, type, body, at }]. */
    async newDrafts() {
      const meta = await store.allMeta();
      const out = [];
      for (const [k, v] of Object.entries(meta)) {
        if (!k.startsWith('draft:') || !v?.type) continue;
        const key = k.slice('draft:'.length);
        if (!(await store.getRecord(key))) out.push({ key, type: v.type, body: v.body, at: v.at });
      }
      return out;
    },
  };
}
