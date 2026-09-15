/* Thread's model, pure: which days hold what, and how a day's records
 * string together. Strands wrap the beads their items point at; everything
 * else stands alone, in time order. */
import { keyFromItemUri } from './keys.js';

const STRAND = 'com.cultureblocs.strand';

/* Made in Loom and not on the String: lives only in this browser. */
export const isLoomOnly = (r) => r.sourceApp === 'loom' && !r.stringId;

/* Waiting to be sent: Loom-only and finished. A draft stays home until told. */
export const isUnsent = (r) => isLoomOnly(r) && r.state !== 'draft';

/* A released proposal the String still holds: kept locally as a tombstone, never shown. */
export const isReleased = (r) => r.state === 'released';

/* [{ day, count, unsent }] newest first. */
export function monthDays(records) {
  const days = new Map();
  for (const r of records) {
    if (!r.day || isReleased(r)) continue;
    const d = days.get(r.day) || { day: r.day, count: 0, unsent: 0 };
    d.count += 1;
    if (isUnsent(r)) d.unsent += 1;
    days.set(r.day, d);
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/* A day's string: [{ kind: 'strand', record, members } | { kind: 'item', record }],
 * ordered by the earliest time in each entry. Members of a strand appear only
 * inside it. `allRecords` resolves members that were made on another day. */
export function dayString(dayRecordsIn, allRecords = dayRecordsIn) {
  const dayRecords = dayRecordsIn.filter((r) => !isReleased(r));
  const byKey = new Map(allRecords.filter((r) => !isReleased(r)).map((r) => [r.key, r]));
  for (const r of dayRecords) byKey.set(r.key, r);
  const strands = dayRecords.filter((r) => r.type === STRAND);
  const inStrand = new Set();
  const entries = strands.map((s) => {
    const members = (s.body.items || [])
      .map((it) => byKey.get(keyFromItemUri(it.uri)))
      .filter(Boolean);
    members.forEach((m) => inStrand.add(m.key));
    return { kind: 'strand', record: s, members };
  });
  for (const r of dayRecords) {
    if (r.type !== STRAND && !inStrand.has(r.key)) entries.push({ kind: 'item', record: r });
  }
  const at = (e) => (e.kind === 'strand' && e.members.length
    ? e.members.map((m) => m.createdAt).sort()[0]
    : e.record.createdAt);
  return entries.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
}
