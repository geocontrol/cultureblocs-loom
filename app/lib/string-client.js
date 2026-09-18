/* The String's HTTP API, as Loom uses it (import and send).
 * Every error names the URL and the status, because "404" alone once meant a
 * different server was answering on the String's port. An error answer keeps
 * its status and its parsed body (`detail`), so send can tell a stale version
 * (412, with the String's current record) from invalid content (422). */

export const LIST_LIMIT = 2000;   // the most one GET /records returns (the String caps limit here)

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRecord = (b) => (isObject(b) && typeof b.id === 'string' && isObject(b.body)
  ? null : 'expected a record with an id and an object body');
const ifMatch = (hlc) => (hlc ? { 'If-Match': hlc } : {});

export class StringError extends Error {
  constructor(url, message, { status = null, detail = null } = {}) {
    super(`${url}: ${message}`);
    this.url = url;
    this.status = status;    // the HTTP status, or null when the String could not be reached
    this.detail = detail;    // the answer's `detail`, when it sent one
  }
}

export function stringClient(baseUrl, token, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const auth = token ? { Authorization: `Bearer ${token}` } : {};

  async function call(path, init = {}) {
    const url = base + path;
    let res;
    try {
      res = await fetchImpl(url, { ...init, headers: { ...auth, ...(init.headers || {}) } });
    } catch (e) {
      throw new StringError(url, `unreachable (${e.message})`);
    }
    if (!res.ok) {
      const detail = await res.json().then((b) => b?.detail ?? null, () => null);
      throw new StringError(url, `HTTP ${res.status}`, { status: res.status, detail });
    }
    return res;
  }

  /* The JSON body of a 200, checked: `check` returns a problem in words, or nothing. */
  async function json(path, check, init) {
    const res = await call(path, init);
    let body;
    try { body = await res.json(); } catch { throw new StringError(base + path, 'the answer is not JSON (is this the String?)'); }
    const problem = check(body);
    if (problem) throw new StringError(base + path, problem);
    return body;
  }

  return {
    base,
    /* Confirms the thing answering is a String: it must list cultureblocs lexicons. */
    async health() {
      const body = await (await call('/health')).json().catch(() => null);
      const types = Array.isArray(body?.lexicons) ? body.lexicons : [];
      if (!body?.ok || !types.some((t) => t.startsWith('com.cultureblocs.'))) {
        throw new StringError(`${base}/health`, 'this does not look like a String (no cultureblocs lexicons)');
      }
      return types;
    },
    /* [{ day, count }] — the days the String holds records for. */
    async listDays() {
      const body = await json('/days', (b) => (Array.isArray(b?.days) && b.days.every((d) => typeof d?.day === 'string')
        ? null : 'expected { days: [{ day, count }] }'));
      return body.days;
    },
    /* Every record created on one day. A full page means some were cut off, so it fails. */
    async listRecordsForDay(day) {
      const path = `/records?day=${encodeURIComponent(day)}&limit=${LIST_LIMIT}`;
      const body = await json(path, (b) => (Array.isArray(b?.records) && b.records.every(isObject)
        ? null : 'expected { records: [...] }'));
      if (body.records.length >= LIST_LIMIT) {
        throw new StringError(base + path, `returned ${body.records.length} records, the most one request returns; `
          + 'some would be missed, so nothing was imported');
      }
      return body.records;
    },
    async getRecord(id) {
      return json(`/records/${encodeURIComponent(id)}`, isRecord);
    },
    async getMedia(name) {
      return (await call(`/media/${encodeURIComponent(name)}`)).blob();
    },
    async postRecords(records) {
      const body = await json('/records', (b) => (Array.isArray(b?.results) && b.results.length === records.length
        ? null : `expected { results: [...] } with ${records.length} entries`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) });
      return body.results;
    },
    /* Edit a record: `fields` merge into its body, a null removes a field.
     * `hlc` is the version being edited; the String answers 412 if it moved on. */
    async patchRecord(id, fields, hlc) {
      return json(`/records/${encodeURIComponent(id)}`, isRecord, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...ifMatch(hlc) }, body: JSON.stringify({ fields }) });
    },
    async setState(id, state) {
      return json(`/records/${encodeURIComponent(id)}/state`, isRecord,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
    },
    /* Delete a record, refused with 412 if `hlc` is no longer its version. */
    async deleteRecord(id, hlc) {
      await call(`/records/${encodeURIComponent(id)}`, { method: 'DELETE', headers: ifMatch(hlc) });
    },
    /* The identities the String can speak as: [{ name, handle, pds }]. The
     * handle's app password stays on the String — Loom sends only the name. */
    async listIdentities() {
      const body = await json('/identities', (b) => (Array.isArray(b?.identities)
        && b.identities.every((i) => isObject(i) && typeof i.name === 'string')
        ? null : 'expected { identities: [{ name, handle, pds }] }'));
      return body.identities;
    },
    /* Where a published strand can also be posted: [{ name, limits }]. A 404
     * is a String older than syndication, so it offers none — and Loom then
     * publishes exactly as it did before — rather than failing the block. */
    async listDestinations() {
      let body;
      try {
        body = await json('/destinations', (b) => (Array.isArray(b?.destinations)
          && b.destinations.every((d) => isObject(d) && typeof d.name === 'string' && isObject(d.limits))
          ? null : 'expected { destinations: [{ name, limits }] }'));
      } catch (e) {
        if (e instanceof StringError && e.status === 404) return [];
        throw e;
      }
      return body.destinations;
    },
    /* Publish a strand and the beads it lists, as `identity`, and post it to
     * any `destinations` with `postText`. The String does the strip and talks
     * to the PDS, inline: this is a slow request, and it is not atomic (see
     * the Publish panel's notes). Re-publishing is how a half-finished publish
     * is repaired — the rkeys are reused — and never posts twice. With no
     * destinations the request is exactly what it always was. */
    async publish(id, identity, { destinations = [], postText } = {}) {
      const payload = destinations.length ? { identity, destinations, postText } : { identity };
      return json(`/publish/${encodeURIComponent(id)}`, (b) => (Array.isArray(b?.records)
        ? null : 'expected { records: [...] }'),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    },
    /* Withdraw a strand and its beads from the PDS. Returns how many went. */
    async unpublish(id, identity) {
      const body = await json(`/unpublish/${encodeURIComponent(id)}`, (b) => (typeof b?.removed === 'number'
        ? null : 'expected { removed: <count> }'),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity }) });
      return body.removed;
    },
    async postMedia(blob) {
      return json('/media', (b) => (typeof b?.uri === 'string' ? null : 'expected { uri, mime, bytes }'),
        { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });   // { uri, mime, bytes }
    },
  };
}
