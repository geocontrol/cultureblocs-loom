/* A totem dump becomes bead bodies. Pure: the clock arrives as
 * `syncWallClock`, taken once when the dump was read.
 *
 * THE EPOCH RULE, which is the whole of this file: a bead resolves to a real
 * instant only within the power session that dumped it. The device counts
 * seconds since boot; a power loss restarts that count, so a bead from an
 * earlier epoch has a known ORDER and an unknowable wall clock. Inventing a
 * time for it would be a lie the lexicon takes seriously, because
 * `timeAnchored` claims a real instant.
 *
 * Dedupe keys are Studio's, byte for byte — including `t`, a display string
 * doing identity work (see the spec, §6.3). Changing them would break dedupe
 * against every bead Studio ever pushed. */
import { BEAD } from './envelope.js';

const struck = (o) => o.keep === false || o.struck === true;

/* Is there a clock anchor to resolve against at all? */
const anchorable = (o, dump) => dump.now != null && typeof o.e === 'number';

/* Was this bead minted in the session that produced this dump? Older firmware
 * sends no `ep`, and a dump may carry no EPOCH — in both cases we have only
 * the device's word for it, and take it. */
const sameEpoch = (o, dump) => (o.ep === undefined || dump.epoch == null) || o.ep === dump.epoch;

const resolved = (o, dump) => anchorable(o, dump) && sameEpoch(o, dump);

/* True when a dump holds a bead whose date the person has to supply. */
export function needsDay(dump) {
  return (dump.beads || []).some((o) => !struck(o) && !resolved(o, dump));
}

export function toBeads(dump, { syncWallClock, day, deviceLabel = '' } = {}) {
  const device = deviceLabel || dump.deviceId || 'bloc-1';
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const out = [];
  for (const o of dump.beads || []) {
    if (struck(o)) continue;
    let createdAt;
    let timeAnchored;
    let t;
    if (resolved(o, dump)) {
      const at = new Date(syncWallClock - (dump.now - o.e) * 1000);
      createdAt = at.toISOString();
      timeAnchored = true;
      t = at.toTimeString().slice(0, 8);            // local HH:MM:SS, as Studio displays it
    } else if (anchorable(o, dump)) {
      createdAt = new Date(midnight + (o.seq ?? 0) * 1000).toISOString();
      timeAnchored = false;
      t = '—';                                       // order known, wall clock not
    } else {
      createdAt = new Date(midnight).toISOString();
      timeAnchored = false;
      t = '?';
    }
    const body = {
      $type: BEAD,
      createdAt,
      kind: o.with ? 'encounter' : 'bloc',
      tags: [o.mask || 'unknown'],
      provenance: {
        app: 'culturebloc',
        device,
        mintedAt: createdAt,
        mutualMint: Boolean(o.with),
        timeAnchored,
      },
    };
    if (o.mintId) body.provenance.mintId = o.mintId;
    if (o.with) body.note = `mutual mint with ${o.with.mask} · ${o.with.id}`;
    const dedupeKey = o.mintId
      ? `cb:${o.mintId}`
      : `cb:${device}:${createdAt.slice(0, 10)}:${o.ep ?? 0}:${o.seq}:${t}`;
    out.push({ dedupeKey, createdAt, timeAnchored, body, seq: o.seq, mask: o.mask });
  }
  return out;
}
