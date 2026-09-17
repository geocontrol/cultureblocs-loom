/* The String column's model: which days hold records, a month as a grid, the
 * entry list and its filter, and what each record has waiting for Send.
 * Pure, except that telling an edit needs a content hash. Records marked
 * `deleted` are gone from every view here; Send still sees them. */
import { contentHash } from '../vendor/strip.js';

const STRAND = 'com.cultureblocs.strand';
const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const str = (v) => (typeof v === 'string' ? v : '');

/* What Send has to do for a record: 'new' | 'edit' | 'state' | 'delete', or null.
 * A record in conflict waits for the person; a Phase 1 draft never sent stays home. */
export async function pendingChange(r) {
  if (r.conflict) return null;
  if (!r.stringId) return r.deleted || r.state === 'draft' || r.state === 'proposal' ? null : 'new';
  if (r.deleted) return 'delete';
  if ((await contentHash(r.body)) !== r.importedHash) return 'edit';
  if (r.state !== r.importedState) return 'state';
  return null;
}

/* Map key -> change, for the records that have one. */
export async function pendingChanges(records) {
  const out = new Map();
  for (const r of records) {
    const change = await pendingChange(r);
    if (change) out.set(r.key, change);
  }
  return out;
}

/* Map day -> how many records (not deleted) the day holds. */
export function dayCounts(records) {
  const counts = new Map();
  for (const r of records) if (r.day && !r.deleted) counts.set(r.day, (counts.get(r.day) || 0) + 1);
  return counts;
}

/* 'YYYY-MM' moved by `by` months. */
export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/* A month as weeks, Monday first: [[{ day, date, count } | null, ×7], …]. */
export function monthGrid(month, counts = new Map()) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(lead).fill(null);
  for (let date = 1; date <= length; date++) {
    const day = `${month}-${String(date).padStart(2, '0')}`;
    cells.push({ day, date, count: counts.get(day) || 0 });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const firstLine = (s) => str(s).split('\n').find((l) => l.trim())?.trim() ?? '';

/* The words a row shows for a record body. */
export function summary(type, body) {
  const b = body || {};
  if (type === STRAND) return firstLine(b.title) || firstLine(b.narrative) || 'Untitled strand';
  return firstLine(b.note) || str(b.subject?.name) || str(b.work?.title) || '';
}

const kindOf = (type, body) => (type === STRAND ? 'strand' : str(body?.kind) || type.split('.').pop());

/* Does a record match { text, kind, app }? Empty parts match everything. */
export function matches(r, { text = '', kind = '', app = '' } = {}) {
  if (kind && kindOf(r.type, r.body) !== kind) return false;
  if (app && r.sourceApp !== app) return false;
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const b = r.body || {};
  const hay = [b.note, b.title, b.narrative, b.subject?.name, b.place?.name, ...list(b.tags),
    ...list(b.refs).map((ref) => ref?.descriptor?.label)].filter((v) => typeof v === 'string').join('\n').toLowerCase();
  return hay.includes(needle);
}

/* The day a new record's draft belongs to. */
const draftDay = (d, today) => str(d.type === STRAND ? d.body?.day : d.body?.createdAt).slice(0, 10) || today;

/* The entry list: [{ day, rows }] newest day first. Within a day, drafts of new
 * records first, then records newest first. A row is
 * { key, type, kind, line, at, record } for a record, or
 * { key, type, kind, line, at, draft: true } for a draft of a record not yet saved. */
export function entryList(records, { filter = {}, drafts = [], today = '' } = {}) {
  const days = new Map();
  const add = (day, row) => {
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  };
  for (const r of records) {
    if (r.deleted || !r.day || !matches(r, filter)) continue;
    add(r.day, { key: r.key, type: r.type, kind: kindOf(r.type, r.body), line: summary(r.type, r.body), at: str(r.createdAt), record: r });
  }
  for (const d of drafts) {
    const row = { key: d.key, type: d.type, body: d.body, sourceApp: 'loom' };
    if (!matches(row, filter)) continue;
    add(draftDay(d, today), { key: d.key, type: d.type, kind: kindOf(d.type, d.body), line: summary(d.type, d.body), at: str(d.at), draft: true });
  }
  const order = (a, b) => (a.draft !== b.draft ? (a.draft ? -1 : 1) : a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  return [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, rows]) => ({ day, rows: rows.sort(order) }));
}

/* The source apps present, for the filter. */
export const sourceApps = (records) => [...new Set(records.filter((r) => !r.deleted).map((r) => r.sourceApp).filter(Boolean))].sort();
