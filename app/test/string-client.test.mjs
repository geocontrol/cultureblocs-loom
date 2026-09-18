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

/* Publishing. The String holds the identity (handle + app password), so Loom
 * sends only its name and never sees a credential. */

test('listIdentities returns the identities the String holds', async () => {
  const f = scriptedFetch(() => [200, { identities: [
    { name: 'personal', handle: 'someone.example', pds: 'https://bsky.social' }] }]);
  const c = stringClient('http://string.test', 't', f.impl);
  assert.deepEqual(await c.listIdentities(),
    [{ name: 'personal', handle: 'someone.example', pds: 'https://bsky.social' }]);
  assert.deepEqual(f.seen.map((r) => [r.method, r.path]), [['GET', '/identities']]);
});

test('listIdentities is empty when the String holds none, and fails on a shape it does not recognise', async () => {
  const none = stringClient('http://string.test', '', scriptedFetch(() => [200, { identities: [] }]).impl);
  assert.deepEqual(await none.listIdentities(), []);
  const wrong = stringClient('http://string.test', '', scriptedFetch(() => [200, { names: ['personal'] }]).impl);
  await assert.rejects(wrong.listIdentities(), (e) => e instanceof StringError && /identities/.test(e.message));
});

test('publish posts the identity name and returns what went public', async () => {
  const answer = { identity: 'personal', handle: 'someone.example', did: 'did:plc:x',
    records: ['at://did:plc:x/com.cultureblocs.bead/b1', 'at://did:plc:x/com.cultureblocs.strand/s1'],
    strandUri: 'at://did:plc:x/com.cultureblocs.strand/s1' };
  const f = scriptedFetch(() => [200, answer]);
  const c = stringClient('http://string.test', 't', f.impl);
  assert.deepEqual(await c.publish('sid-1', 'personal'), answer);
  const [req] = f.seen;
  assert.equal(req.method, 'POST');
  assert.equal(req.path, '/publish/sid-1');
  assert.equal(req.headers.Authorization, 'Bearer t');
  assert.deepEqual(JSON.parse(req.body), { identity: 'personal' });
});

test('unpublish posts to its own path and reports how many records were removed', async () => {
  const f = scriptedFetch(() => [200, { removed: 2 }]);
  const c = stringClient('http://string.test', '', f.impl);
  assert.equal(await c.unpublish('sid-1', 'personal'), 2);
  assert.deepEqual(f.seen.map((r) => [r.method, r.path]), [['POST', '/unpublish/sid-1']]);
  assert.deepEqual(JSON.parse(f.seen[0].body), { identity: 'personal' });
});

test('publish keeps the String’s refusal: an unknown identity, an unpublishable type, a PDS failure', async () => {
  const unknown = stringClient('http://string.test', '', scriptedFetch(() => [404, { detail: 'unknown identity' }]).impl);
  await assert.rejects(unknown.publish('sid-1', 'ghost'), (e) => e.status === 404 && e.detail === 'unknown identity');
  const lone = stringClient('http://string.test', '', scriptedFetch(() => [400,
    { detail: 'com.cultureblocs.bead is not publishable on its own; beads and annotations publish as part of a strand' }]).impl);
  await assert.rejects(lone.publish('sid-2', 'personal'), (e) => e.status === 400 && /part of a strand/.test(e.detail));
  const pds = stringClient('http://string.test', '', scriptedFetch(() => [502, { detail: 'publish failed: 401' }]).impl);
  await assert.rejects(pds.publish('sid-3', 'personal'), (e) => e.status === 502 && /publish failed/.test(e.detail));
});

test('an id with a slash or a space is escaped into the publish path', async () => {
  const f = scriptedFetch(() => [200, { records: [] }]);
  await stringClient('http://string.test', '', f.impl).publish('a b/c', 'personal');
  assert.equal(f.seen[0].path, '/publish/a%20b%2Fc');
});

/* Destinations (publish-destinations spec §7). A String older than this
 * answers 404, and Loom then offers none and publishes as it always has. */

test('listDestinations returns what the String can post to, with limits', async () => {
  const list = [{ name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } }];
  const f = scriptedFetch(() => [200, { destinations: list }]);
  const c = stringClient('http://string.test', 't', f.impl);
  assert.deepEqual(await c.listDestinations(), list);
  assert.deepEqual(f.seen.map((r) => [r.method, r.path]), [['GET', '/destinations']]);
});

test('a String without /destinations offers none, rather than failing', async () => {
  const c = stringClient('http://string.test', '', scriptedFetch(() => [404, { detail: 'Not Found' }]).impl);
  assert.deepEqual(await c.listDestinations(), []);
});

test('listDestinations still fails loudly on anything but a 404', async () => {
  const down = stringClient('http://string.test', '', scriptedFetch(() => [500, { detail: 'boom' }]).impl);
  await assert.rejects(down.listDestinations(), (e) => e instanceof StringError && e.status === 500);
  const wrong = stringClient('http://string.test', '', scriptedFetch(() => [200, { names: ['bluesky'] }]).impl);
  await assert.rejects(wrong.listDestinations(), (e) => e instanceof StringError && /destinations/.test(e.message));
});

test('publish with destinations sends them and the post text alongside the identity', async () => {
  const answer = { records: [], strandUri: 'at://x/s/1',
    syndications: [{ destination: 'bluesky', status: 'posted', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: 't' }] };
  const f = scriptedFetch(() => [200, answer]);
  const c = stringClient('http://string.test', '', f.impl);
  assert.deepEqual(await c.publish('sid-1', 'personal', { destinations: ['bluesky'], postText: 'A day out' }), answer);
  assert.deepEqual(JSON.parse(f.seen[0].body), { identity: 'personal', destinations: ['bluesky'], postText: 'A day out' });
});

test('publish with no destinations sends exactly what it always did', async () => {
  const f = scriptedFetch(() => [200, { records: [] }]);
  const c = stringClient('http://string.test', '', f.impl);
  await c.publish('sid-1', 'personal', { destinations: [], postText: 'ignored' });
  assert.deepEqual(JSON.parse(f.seen[0].body), { identity: 'personal' });
});
