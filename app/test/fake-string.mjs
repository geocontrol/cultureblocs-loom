// A fake String client for importer and sender tests: records and media held
// in memory, with the String's dedupe, naming, version-stamp (hlc) and
// precondition behaviour. Errors are StringErrors shaped as the real client
// throws them: `status`, and `detail` from the answer.
import { mediaName, sha256Hex } from '../lib/media.js';
import { StringError } from '../lib/string-client.js';

export function fakeString({ records = [], media = {}, failMedia = new Set(), reject = {} } = {}) {
  let n = 0, clock = 0;
  const posted = [];
  const calls = [];
  const stamp = () => `${String(++clock).padStart(13, '0')}-00000-fake`;
  const dayOf = (r) => String(r.createdAt).slice(0, 10);
  const fail = (path, status, detail = null) => new StringError(`http://string.test${path}`, `HTTP ${status}`, { status, detail });
  const find = (id, path) => {
    const rec = records.find((r) => r.id === id);
    if (!rec) throw fail(path, 404, 'not found');
    return rec;
  };
  const stale = (rec, hlc, path) => {
    if (hlc && hlc !== rec.hlc) throw fail(path, 412, { error: 'record has changed since you loaded it', yourHlc: hlc, currentHlc: rec.hlc, current: structuredClone(rec) });
  };
  for (const r of records) r.hlc ??= stamp();

  const state = { offline: false };
  const reach = (path) => { if (state.offline) throw new StringError(`http://string.test${path}`, 'unreachable (offline)'); };

  const client = {
    base: 'http://string.test',
    async health() { reach('/health'); return ['com.cultureblocs.bead', 'com.cultureblocs.strand', 'com.cultureblocs.annotation']; },
    async listDays() {
      reach('/days');
      calls.push('listDays');
      const days = new Map();
      for (const r of records) days.set(dayOf(r), (days.get(dayOf(r)) || 0) + 1);
      return [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, count]) => ({ day, count }));
    },
    async listRecordsForDay(day) {
      reach('/records');
      calls.push(`listRecordsForDay ${day}`);
      return structuredClone(records.filter((r) => dayOf(r) === day));
    },
    async getRecord(id) {
      reach(`/records/${id}`);
      calls.push(`getRecord ${id}`);
      return structuredClone(find(id, `/records/${id}`));
    },
    async getMedia(name) {
      reach(`/media/${name}`);
      if (failMedia.has(name) || !media[name]) throw fail(`/media/${name}`, 404);
      return media[name];
    },
    async postRecords(batch) {
      reach('/records');
      return batch.map((r) => {
        posted.push(structuredClone(r));
        calls.push(`post ${r.dedupeKey}`);
        if (reject[r.dedupeKey]) return { dedupeKey: r.dedupeKey, status: 'invalid', problems: reject[r.dedupeKey] };
        const existing = records.find((x) => x.dedupeKey === r.dedupeKey);
        if (existing) return { dedupeKey: r.dedupeKey, status: 'duplicate', id: existing.id };
        const id = `sid-${++n}`;
        records.push({ ...structuredClone(r), id, state: r.state || 'kept', hlc: stamp() });
        return { dedupeKey: r.dedupeKey, status: 'created', id };
      });
    },
    async patchRecord(id, fields, hlc) {
      const path = `/records/${id}`;
      reach(path);
      calls.push(`patch ${id}`);
      const rec = find(id, path);
      stale(rec, hlc, path);
      if (reject[id]) throw fail(path, 422, reject[id]);
      for (const [k, v] of Object.entries(fields)) { if (v === null) delete rec.body[k]; else rec.body[k] = structuredClone(v); }
      if (rec.state === 'proposal') rec.state = 'kept';
      rec.hlc = stamp();
      return structuredClone(rec);
    },
    async setState(id, next) {
      const path = `/records/${id}/state`;
      reach(path);
      calls.push(`state ${id} ${next}`);
      const rec = find(id, path);
      if (rec.state !== next) { rec.state = next; rec.hlc = stamp(); }
      return structuredClone(rec);
    },
    async deleteRecord(id, hlc) {
      const path = `/records/${id}`;
      reach(path);
      calls.push(`delete ${id}`);
      const rec = find(id, path);
      stale(rec, hlc, path);
      records.splice(records.indexOf(rec), 1);
    },
    async postMedia(blob) {
      reach('/media');
      const name = mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
      calls.push(`media ${name}`);
      media[name] = blob;
      return { uri: `/media/${name}`, mime: blob.type, bytes: blob.size };
    },
  };

  /* Change a record as another app would: body fields merged, a new version stamp. */
  function editOnString(id, fields) {
    const rec = find(id, `/records/${id}`);
    Object.assign(rec.body, structuredClone(fields));
    rec.hlc = stamp();
    return structuredClone(rec);
  }

  return { client, records, media, posted, calls, editOnString, state };
}

export const photo = (text = 'jpeg-bytes', type = 'image/jpeg') => new Blob([text], { type });
