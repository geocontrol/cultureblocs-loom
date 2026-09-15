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
