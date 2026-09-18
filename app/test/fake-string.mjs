// A fake String client for importer and sender tests: records and media held
// in memory, with the String's dedupe, naming, version-stamp (hlc) and
// precondition behaviour. Errors are StringErrors shaped as the real client
// throws them: `status`, and `detail` from the answer.
import { mediaName, sha256Hex } from '../lib/media.js';
import { StringError } from '../lib/string-client.js';

export function fakeString({ records = [], media = {}, failMedia = new Set(), reject = {},
  identities = [{ name: 'personal', handle: 'someone.example', pds: 'https://bsky.social' }],
  destinations = [{ name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } }] } = {}) {
  let n = 0, clock = 0;
  const posted = [];
  const calls = [];
  const published = [];
  const unpublished = [];
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
    async listIdentities() {
      reach('/identities');
      calls.push('listIdentities');
      return structuredClone(identities);
    },
    async listDestinations() {
      reach('/destinations');
      calls.push('listDestinations');
      return structuredClone(destinations);
    },
    /* The String publishes to the PDS and stamps `publishedUri` on the record;
     * then posts to each destination not already used, keeping one row each. */
    async publish(id, identity, { destinations: chosen = [], postText } = {}) {
      const path = `/publish/${id}`;
      reach(path);
      calls.push(`publish ${id} ${identity}`);
      const rec = find(id, path);
      if (!identities.some((i) => i.name === identity)) throw fail(path, 404, 'unknown identity');
      if (out.failPublish) throw fail(path, 400, out.failPublish);
      published.push(chosen.length ? { id, identity, destinations: chosen, postText } : { id, identity });
      const uri = `at://did:plc:fake/${rec.type}/${id}`;
      rec.publishedUri = uri;
      const key = rec.type.endsWith('strand') ? 'strandUri' : 'uri';
      const result = { identity, handle: 'someone.example', did: 'did:plc:fake', records: [uri], [key]: uri };
      if (!chosen.length) return result;
      rec.syndications ??= [];
      result.syndications = chosen.map((destination) => {
        const had = rec.syndications.find((s) => s.destination === destination);
        if (had) return { destination, status: 'already', remoteUrl: had.remoteUrl, postedAt: had.postedAt };
        if (out.failSyndicate) return { destination, status: 'failed', reason: out.failSyndicate };
        const row = { destination, remoteId: `${destination}-${id}`,
          remoteUrl: `https://${destination}.example/post/${id}`, postedAt: '2026-09-18T12:00:00Z' };
        rec.syndications.push(row);
        return { destination, status: 'posted', remoteUrl: row.remoteUrl, postedAt: row.postedAt, droppedImages: 0 };
      });
      return result;
    },
    async unpublish(id, identity) {
      const path = `/unpublish/${id}`;
      reach(path);
      calls.push(`unpublish ${id} ${identity}`);
      const rec = find(id, path);
      if (out.failUnpublish) throw fail(path, 502, out.failUnpublish);
      unpublished.push({ id, identity });
      const had = Boolean(rec.publishedUri);
      rec.publishedUri = null;
      return had ? 1 : 0;
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

  /* `failPublish` / `failUnpublish` / `failSyndicate` are set by a test to make the String refuse. */
  const out = { client, records, media, posted, calls, published, unpublished, identities, destinations,
    editOnString, state, failPublish: null, failUnpublish: null, failSyndicate: null };
  return out;
}

export const photo = (text = 'jpeg-bytes', type = 'image/jpeg') => new Blob([text], { type });
