/* The String's HTTP API, as Loom uses it in Phase 1 (import and send).
 * Every error names the URL and the status, because "404" alone once meant a
 * different server was answering on the String's port. */

export const LIST_LIMIT = 2000;   // the most one GET /records returns (the String caps limit here)

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class StringError extends Error {
  constructor(url, detail) {
    super(`${url}: ${detail}`);
    this.url = url;
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
    if (!res.ok) throw new StringError(url, `HTTP ${res.status}`);
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
      return json(`/records/${encodeURIComponent(id)}`, (b) => (isObject(b) && typeof b.id === 'string' && isObject(b.body)
        ? null : 'expected a record with an id and an object body'));
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
    async postMedia(blob) {
      return json('/media', (b) => (typeof b?.uri === 'string' ? null : 'expected { uri, mime, bytes }'),
        { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });   // { uri, mime, bytes }
    },
  };
}
