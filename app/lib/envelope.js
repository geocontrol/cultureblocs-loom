/* The one write path for records made or edited in Loom.
 *
 * Every write validates against the vendored lexicons and the refs anchor
 * checks before it touches the store; a record with problems is never stored.
 * Every write is stamped with this device's HLC. Imported records arrive
 * through importer.js instead and are the one exception to validation (they
 * are already on the String, so hiding them would be worse). */
import { anchorProblems } from '../vendor/refs.js';
import { createClock } from './hlc.js';
import { dayOf, recordKey } from './keys.js';
import { tidGenerator } from './tid.js';

export const BEAD = 'com.cultureblocs.bead';
export const STRAND = 'com.cultureblocs.strand';

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

export const isAbandonable = (r) =>
  r?.type === STRAND && r.state === 'draft' && r.origin === 'compose' && !r.stringId;

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

  async function create(type, body, { origin, state }) {
    check(type, body);
    const rkey = tid();
    const env = {
      key: recordKey(type, rkey), type, rkey, body, state, origin, sourceApp: 'loom',
      createdAt: body.createdAt, updatedAt: iso(), hlc: await stamp(), deviceId,
      day: dayOf(type, body, body.createdAt),
    };
    await store.putRecord(env);
    return env;
  }

  /* The mint fact: a bead written before anything else happens. */
  function mint({ mask, note, kind = 'bloc' }) {
    const at = iso();
    const body = { $type: BEAD, createdAt: at, kind };
    if (note && note.trim()) body.note = note.trim();
    if (mask) body.tags = [mask.toLowerCase()];
    body.provenance = { app: 'loom', device: deviceId, mintedAt: at, timeAnchored: true };
    return create(BEAD, body, { origin: 'mint', state: 'kept' });
  }

  /* Replace a record's body. `expectUpdatedAt` is the updatedAt the editor
   * loaded; if the stored record has moved on, nothing is written. Editing a
   * proposal keeps it: a person has stood behind it. */
  async function save(key, body, { expectUpdatedAt } = {}) {
    const current = await store.getRecord(key);
    if (!current) throw new Error(`no record ${key}`);
    if (expectUpdatedAt !== undefined && current.updatedAt !== expectUpdatedAt) throw new Conflict(current);
    check(current.type, body);
    const env = {
      ...current, body, updatedAt: iso(), hlc: await stamp(), deviceId,
      state: current.state === 'proposal' ? 'kept' : current.state,
      day: dayOf(current.type, body, current.createdAt),
    };
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }

  async function setState(key, state, allowedFrom) {
    const current = await store.getRecord(key);
    if (!current) throw new Error(`no record ${key}`);
    if (!allowedFrom.includes(current.state)) throw new Error(`a ${current.state} record cannot become ${state}`);
    const env = { ...current, state, updatedAt: iso(), hlc: await stamp(), deviceId };
    await store.putRecord(env);
    return env;
  }

  return {
    deviceId,
    validate,
    create,
    mint,
    save,
    get: (key) => store.getRecord(key),
    keep: (key) => setState(key, 'kept', ['proposal']),
    /* A strand leaves draft when its author says it is told. */
    finish: (key) => setState(key, 'kept', ['draft']),
    /* A proposal only Loom holds is deleted. One the String holds stays as a
     * `released` tombstone — a local change awaiting Phase 2 sync, hidden from
     * Thread — so the next import does not bring it back. */
    async release(key) {
      const current = await store.getRecord(key);
      if (current?.state !== 'proposal') throw new Error('only a proposal can be released');
      if (current.stringId) await setState(key, 'released', ['proposal']);
      else await store.deleteRecord(key);
      await store.deleteMeta(`draft:${key}`);
    },
    /* An entry started in Compose and never told: discarding it deletes it. */
    async abandon(key) {
      const current = await store.getRecord(key);
      if (!isAbandonable(current)) throw new Error('only an entry still in draft, never sent, can be discarded');
      await store.deleteRecord(key);
      await store.deleteMeta(`draft:${key}`);
    },
    /* Unsaved edits to an existing record survive reloads here until saved or
     * discarded. `baseUpdatedAt` is the record's updatedAt the edits were typed
     * against, so saving a restored draft over a newer record is a Conflict. */
    saveDraft: (key, body, baseUpdatedAt) => store.setMeta(`draft:${key}`, { body, at: iso(), baseUpdatedAt }),
    getDraft: (key) => store.getMeta(`draft:${key}`),
    discardDraft: (key) => store.deleteMeta(`draft:${key}`),
  };
}
