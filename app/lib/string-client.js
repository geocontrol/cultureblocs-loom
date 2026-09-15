/* The String's HTTP API, as Loom uses it in Phase 1 (import and send).
 * Every error names the URL and the status, because "404" alone once meant a
 * different server was answering on the String's port. */

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
    async listRecords(type) {
      return (await (await call(`/records?type=${encodeURIComponent(type)}&limit=2000`)).json()).records;
    },
    async getMedia(name) {
      return (await call(`/media/${encodeURIComponent(name)}`)).blob();
    },
    async postRecords(records) {
      const res = await call('/records', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }) });
      return (await res.json()).results;
    },
    async postMedia(blob) {
      const res = await call('/media', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      return res.json();   // { uri, mime, bytes }
    },
  };
}
