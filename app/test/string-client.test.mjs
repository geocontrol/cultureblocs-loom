import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StringError, stringClient } from '../lib/string-client.js';

/* A fetch that answers each path with a body (an object is sent as JSON, a string as text). */
function fakeFetch(routes) {
  const seen = [];
  const impl = async (url) => {
    seen.push(url);
    const path = url.replace('http://string.test', '');
    if (!(path in routes)) return new Response('not found', { status: 404 });
    const body = routes[path];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  };
  return { impl, seen };
}

test('the String is listed day by day', async () => {
  const f = fakeFetch({ '/days': { days: [{ day: '2026-09-14', count: 1 }] },
    '/records?day=2026-09-14&limit=2000': { records: [{ id: 'u1', type: 'com.cultureblocs.bead', body: {} }] } });
  const c = stringClient('http://string.test/', 't', f.impl);
  assert.deepEqual(await c.listDays(), [{ day: '2026-09-14', count: 1 }]);
  assert.equal((await c.listRecordsForDay('2026-09-14'))[0].id, 'u1');
  assert.equal('listRecords' in c, false, 'per-type listing is gone');
});

test('a day answering exactly the 2000-record limit fails loudly, naming the URL', async () => {
  const records = Array.from({ length: 2000 }, (_, i) => ({ id: `u${i}`, type: 'com.cultureblocs.bead', body: {} }));
  const c = stringClient('http://string.test', '', fakeFetch({ '/records?day=2026-09-14&limit=2000': { records } }).impl);
  await assert.rejects(c.listRecordsForDay('2026-09-14'), (e) => e instanceof StringError
    && e.message.startsWith('http://string.test/records?day=2026-09-14&limit=2000: ') && /2000/.test(e.message));
});

test('a 200 that is not JSON, or not the expected shape, is a StringError naming the URL and the problem', async () => {
  const c = stringClient('http://string.test', '', fakeFetch({
    '/days': '<html>a different server</html>',
    '/records?day=2026-09-14&limit=2000': { items: [] },
    '/records/u1': { id: 'u1' },
  }).impl);
  await assert.rejects(c.listDays(), (e) => e instanceof StringError && /^http:\/\/string\.test\/days: .*not JSON/.test(e.message));
  await assert.rejects(c.listRecordsForDay('2026-09-14'), (e) => e instanceof StringError && /records\?day=2026-09-14&limit=2000: .*records/.test(e.message));
  await assert.rejects(c.getRecord('u1'), (e) => e instanceof StringError && /records\/u1: .*body/.test(e.message));
});

/* A fetch that records each request and answers from `answer(method, path, init)` -> [status, body]. */
function scriptedFetch(answer) {
  const seen = [];
  const impl = async (url, init = {}) => {
    const path = url.replace('http://string.test', '');
    seen.push({ method: init.method || 'GET', path, headers: init.headers || {}, body: init.body });
    const [status, body] = answer(init.method || 'GET', path, init);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { impl, seen };
}

const REC = { id: 'u1', type: 'com.cultureblocs.bead', state: 'kept', hlc: 'h2', body: { note: 'b' } };

test('patchRecord sends the fields with If-Match and returns the String record', async () => {
  const f = scriptedFetch(() => [200, REC]);
  const c = stringClient('http://string.test', 't', f.impl);
  assert.deepEqual(await c.patchRecord('u1', { note: 'b', tags: null }, 'h1'), REC);
  const [req] = f.seen;
  assert.equal(req.method, 'PATCH');
  assert.equal(req.path, '/records/u1');
  assert.equal(req.headers['If-Match'], 'h1');
  assert.equal(req.headers.Authorization, 'Bearer t');
  assert.deepEqual(JSON.parse(req.body), { fields: { note: 'b', tags: null } });
});

test('a 412 is a StringError carrying the status and the String’s current record', async () => {
  const f = scriptedFetch(() => [412, { detail: { error: 'record has changed since you loaded it', current: REC } }]);
  const c = stringClient('http://string.test', '', f.impl);
  await assert.rejects(c.patchRecord('u1', { note: 'mine' }, 'h1'), (e) => e instanceof StringError
    && e.status === 412 && e.detail.current.hlc === 'h2' && /records\/u1: HTTP 412/.test(e.message));
});

test('a 422 keeps the problems, and an unreachable String has no status', async () => {
  const c = stringClient('http://string.test', '', scriptedFetch(() => [422, { detail: ['kind: required'] }]).impl);
  await assert.rejects(c.setState('u1', 'kept'), (e) => e.status === 422 && e.detail[0] === 'kind: required');
  const down = stringClient('http://string.test', '', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(down.deleteRecord('u1', 'h1'), (e) => e instanceof StringError && e.status === null && /unreachable/.test(e.message));
});

test('setState posts the state; deleteRecord sends If-Match only when given a version', async () => {
  const f = scriptedFetch((method) => (method === 'DELETE' ? [200, { deleted: 'u1' }] : [200, REC]));
  const c = stringClient('http://string.test', '', f.impl);
  await c.setState('u1', 'kept');
  await c.deleteRecord('u1', 'h2');
  await c.deleteRecord('u1');
  assert.deepEqual(f.seen.map((r) => [r.method, r.path, r.headers['If-Match'] ?? null]),
    [['POST', '/records/u1/state', null], ['DELETE', '/records/u1', 'h2'], ['DELETE', '/records/u1', null]]);
  assert.deepEqual(JSON.parse(f.seen[0].body), { state: 'kept' });
});
