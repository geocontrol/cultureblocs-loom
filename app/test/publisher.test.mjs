import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { stringPublisher, whyNotPublishable } from '../lib/publisher.js';
import { fakeString } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

async function desk({ records = [], identities } = {}) {
  const store = createMemStore();
  const now = steppingNow();
  const loom = await openLoom({ store, registry: await registry(), now, newDeviceId: () => 'loom-test' });
  const s = fakeString({ records, identities });
  const publisher = stringPublisher({ store, client: s.client });
  return { store, loom, publisher, s };
}

/* A strand already on the String, as Send would have left it: linked here by
 * `stringId`, and present there for publish to find. */
async function sentStrand({ loom, store, s }, stringId = 'sid-1') {
  const strand = await makeStrand(loom, { title: 'A day out' });
  await store.putRecord({ ...(await store.getRecord(strand.key)), stringId });
  s.records.push({ id: stringId, type: strand.type, state: 'kept', hlc: 'h1', body: strand.body });
  return strand.key;
}

test('only a strand publishes, and only once it is on the String', async () => {
  const d = await desk();
  const { loom, store } = d;
  const bead = await makeBead(loom);
  const local = await makeStrand(loom, { title: 'not sent yet' });
  const key = await sentStrand(d);

  assert.equal(whyNotPublishable(await store.getRecord(key)), null);
  assert.match(whyNotPublishable(await store.getRecord(bead.key)), /part of a strand/);
  assert.match(whyNotPublishable(await store.getRecord(local.key)), /send it first/i);
  assert.match(whyNotPublishable(null), /no such record/);
});

test('a strand waiting to be deleted, or in conflict, does not publish', async () => {
  const d = await desk();
  const { loom, store } = d;
  const key = await sentStrand(d);
  const rec = await store.getRecord(key);

  assert.match(whyNotPublishable({ ...rec, deleted: true }), /deleted/);
  assert.match(whyNotPublishable({ ...rec, conflict: { theirs: {}, reason: 'send' } }), /both sides/);
});

test('publish sends the record’s String id with the identity name, never a credential', async () => {
  const d = await desk();
  const { loom, store, publisher, s } = d;
  const key = await sentStrand(d);

  const result = await publisher.publish(key, 'personal');

  assert.deepEqual(s.published, [{ id: 'sid-1', identity: 'personal' }]);
  assert.match(result.strandUri, /^at:\/\//);
});

test('publish records the public URI on the local record, so the desk can say it is published', async () => {
  const d = await desk();
  const { loom, store, publisher } = d;
  const key = await sentStrand(d);
  assert.equal((await store.getRecord(key)).publishedUri, undefined);

  await publisher.publish(key, 'personal');

  assert.match((await store.getRecord(key)).publishedUri, /^at:\/\/.*com\.cultureblocs\.strand/);
});

test('publish refuses a bead without asking the String', async () => {
  const { loom, publisher, s } = await desk();
  const bead = await makeBead(loom);

  await assert.rejects(publisher.publish(bead.key, 'personal'), /part of a strand/);
  assert.deepEqual(s.published, []);
});

test('a publish the String refuses leaves the local record exactly as it was', async () => {
  const d = await desk();
  const { loom, store, publisher, s } = d;
  const key = await sentStrand(d);
  s.failPublish = 'refusing to publish seeded data: seed:artworld';
  const before = await store.getRecord(key);

  // The String's reason travels in `detail`; the message is only the status.
  await assert.rejects(publisher.publish(key, 'personal'),
    (e) => e.status === 400 && /seeded/.test(e.detail));

  assert.deepEqual(await store.getRecord(key), before);
});

test('unpublish clears the public URI', async () => {
  const d = await desk();
  const { loom, store, publisher, s } = d;
  const key = await sentStrand(d);
  await publisher.publish(key, 'personal');

  const removed = await publisher.unpublish(key, 'personal');

  assert.equal(removed, 1);
  assert.equal((await store.getRecord(key)).publishedUri, null);
  assert.deepEqual(s.unpublished, [{ id: 'sid-1', identity: 'personal' }]);
});

test('the identities come from the String, which holds the app passwords', async () => {
  const { publisher } = await desk({ identities: [{ name: 'personal', handle: 'someone.example' }] });
  assert.deepEqual((await publisher.identities()).map((i) => i.name), ['personal']);
});
