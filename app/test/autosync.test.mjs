import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSync, describeRun, readSyncSettings, RETRY_MS, SAVE_QUIET_MS } from '../lib/autosync.js';
import { openLoom } from '../lib/envelope.js';
import { entryList, monthGrid } from '../lib/day.js';
import { importChanges, runImport } from '../lib/importer.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { stringPublisher } from '../lib/publisher.js';
import { runSend } from '../lib/sender.js';
import { pullSummary, topbarView } from '../ui/view-panels.js';
import { stringColumnView } from '../ui/view-string.js';
import { fakeString } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

const B = 'com.cultureblocs.bead';

/* Timers a test fires by hand: each `set` is recorded, `fire` runs the latest. */
function fakeTimers() {
  const live = new Map();
  let n = 0;
  return {
    set(fn, ms) { const id = ++n; live.set(id, { fn, ms }); return id; },
    clear(id) { live.delete(id); },
    get pending() { return [...live.values()]; },
    async fire() {
      const [id, t] = [...live].at(-1);
      live.delete(id);
      await t.fn();
      return t.ms;
    },
  };
}

function scheduler({ blocked = async () => null, lock = (fn) => fn() } = {}) {
  const store = createMemStore();
  const timers = fakeTimers();
  const runs = [];
  const sync = createAutoSync({ store, timers, blocked, lock, now: () => Date.parse('2026-10-23T10:00:00Z'),
    run: async (opts) => { runs.push(opts); return { imported: { counts: { add: 2, update: 0 } }, sent: [{ status: 'sent' }] }; } });
  return { store, timers, runs, sync };
}

test('auto-sync is off until switched on, and does nothing while off', async () => {
  const { store, timers, sync } = scheduler();
  assert.deepEqual(await readSyncSettings(store), { autoSync: false, syncMinutes: 15, sendOnSave: false });
  await sync.schedule({ soon: true });
  assert.equal(timers.pending.length, 0);
  sync.saved();
  await timers.fire();                                   // the save timer still arms, but reads the setting
  assert.equal(timers.pending.length, 0);
});

test('switched on, it imports then sends on the interval, and records what it did', async () => {
  const { store, timers, runs, sync } = scheduler();
  await store.setMeta('autoSync', true);
  await store.setMeta('syncMinutes', 5);
  await sync.schedule();
  assert.equal(timers.pending[0].ms, 5 * 60_000);
  const next = await timers.fire();
  assert.equal(next, 5 * 60_000);
  assert.deepEqual(runs, [{ withImport: true }]);
  assert.equal(timers.pending[0].ms, 5 * 60_000, 'the next run is scheduled');
  const last = await store.getMeta('lastAutoSync');
  assert.equal(last.ok, true);
  assert.equal(last.summary, '2 from the String, 1 sent');
});

test('a run that would collide with something else is retried soon, not skipped for a whole interval', async () => {
  let reason = 'an edit is not saved yet';
  const { store, timers, runs, sync } = scheduler({ blocked: async () => reason });
  await store.setMeta('autoSync', true);
  await sync.schedule();
  await timers.fire();
  assert.deepEqual(runs, []);
  assert.equal(timers.pending[0].ms, RETRY_MS);
  reason = null;
  await timers.fire();
  assert.deepEqual(runs, [{ withImport: true }]);
});

test('another tab holding the lock means this one waits for its next turn', async () => {
  const { store, timers, runs, sync } = scheduler({ lock: async () => null });
  await store.setMeta('autoSync', true);
  await sync.schedule();
  await timers.fire();
  assert.deepEqual(runs, []);
  assert.equal(timers.pending[0].ms, 15 * 60_000);
  assert.equal(await store.getMeta('lastAutoSync'), undefined);
});

test('send-on-save waits for saves to go quiet, then sends without importing', async () => {
  const { store, timers, runs, sync } = scheduler();
  await store.setMeta('sendOnSave', true);
  sync.saved();
  sync.saved();
  sync.saved();
  assert.equal(timers.pending.length, 1, 'a burst of saves is one Send');
  assert.equal(timers.pending[0].ms, SAVE_QUIET_MS);
  await timers.fire();
  assert.deepEqual(runs, [{ withImport: false }]);
});

test('a failed run is recorded as failed, with its reason', async () => {
  const store = createMemStore();
  const timers = fakeTimers();
  const sync = createAutoSync({ store, timers, blocked: async () => null, run: async () => { throw new Error('String unreachable'); } });
  assert.equal(await sync.now(), null);
  assert.deepEqual(await store.getMeta('lastAutoSync').then((l) => [l.ok, l.summary]), [false, 'String unreachable']);
});

test('describeRun says what came, went and needs a person', () => {
  assert.equal(describeRun({}), 'nothing to do');
  assert.equal(describeRun({ imported: { counts: { add: 1, update: 1, conflict: 1 } },
    sent: [{ status: 'sent' }, { status: 'held' }, { status: 'conflict' }] }), '2 from the String, 1 conflict, 1 sent, 1 changed on both sides');
});

/* ---- the pieces a run is made of ---- */

async function desk() {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'loom-test' });
  const s = fakeString();
  return { store, reg, loom, s };
}

test('auto-sync never sends a delete: it waits for a person to press Send', async () => {
  const { store, loom, s } = await desk();
  const bead = await makeBead(loom, { note: 'to go' });
  await runSend({ store, client: s.client });
  await loom.remove(bead.key);
  const auto = await runSend({ store, client: s.client, skip: ['delete'] });
  assert.deepEqual(auto, []);
  assert.equal(s.records.length, 1, 'still on the String');
  const manual = await runSend({ store, client: s.client });
  assert.equal(manual[0].op, 'delete');
  assert.equal(s.records.length, 0);
});

test('importChanges: a full import the first time, then only what the change feed names', async () => {
  const { store, reg, s } = await desk();
  s.records.push({ id: 'u1', type: B, sourceApp: 'pocket', createdAt: '2026-10-01T10:00:00Z', state: 'kept',
    body: { $type: B, createdAt: '2026-10-01T10:00:00Z', kind: 'bloc', note: 'one' } },
  { id: 'u2', type: B, sourceApp: 'pocket', createdAt: '2026-10-02T10:00:00Z', state: 'kept',
    body: { $type: B, createdAt: '2026-10-02T10:00:00Z', kind: 'bloc', note: 'two' } });
  s.feed.push({ seq: 1, recordId: 'u1' }, { seq: 2, recordId: 'u2' });

  const first = await importChanges({ store, registry: reg, client: s.client });
  assert.equal(first.full, true);
  assert.equal(first.counts.add, 2);
  assert.equal(await store.getMeta('changesCursor'), 2);

  s.calls.length = 0;
  const quiet = await importChanges({ store, registry: reg, client: s.client });
  assert.equal(quiet.read, 0);
  assert.ok(!s.calls.includes('listDays'), 'no day-by-day read when nothing changed');

  s.editOnString('u2', { note: 'two, revised' });
  s.calls.length = 0;
  const next = await importChanges({ store, registry: reg, client: s.client });
  assert.equal(next.full, false);
  assert.equal(next.counts.update, 1);
  assert.deepEqual(s.calls.filter((c) => c.startsWith('getRecord') || c === 'listDays'), ['getRecord u2']);
  assert.equal((await store.getRecord(`${B}/u2`)).body.note, 'two, revised');
});

test('publishing marks its beads public here at once, and an edit right after it sends without a false conflict', async () => {
  const { store, loom, s } = await desk();
  const bead = await makeBead(loom, { note: 'saw it' });
  const strand = await makeStrand(loom, { title: 'Friday', items: [{ uri: itemUri(bead.key) }] });
  await runSend({ store, client: s.client });
  const publisher = stringPublisher({ store, client: s.client });
  await publisher.publish(strand.key, 'personal');

  assert.ok((await store.getRecord(bead.key)).publishedUri, 'the bead shows as public without an import');
  await loom.save(strand.key, { ...(await store.getRecord(strand.key)).body, title: 'Friday night' });
  await loom.save(bead.key, { ...(await store.getRecord(bead.key)).body, note: 'saw it twice' });
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => r.status), ['sent', 'sent']);
});

test('pulling from the network brings an "I went" bead home, public, with its event', async () => {
  const { store, reg, s } = await desk();
  await importChanges({ store, registry: reg, client: s.client });          // cursor taken
  const event = 'at://did:plc:cultureblocs/community.lexicon.calendar.event/frieze';
  s.network.push({ uri: 'at://did:plc:fake/com.cultureblocs.bead/3lwent', type: B, value: {
    $type: B, kind: 'visit', createdAt: '2026-10-16T12:00:00.000Z', note: 'Great booths',
    subject: { $type: 'com.cultureblocs.defs#strongRef', uri: event, cid: 'bafyevent' } } });
  const out = await s.client.importPds('personal');
  const here = await importChanges({ store, registry: reg, client: s.client });
  const pulled = (await store.allRecords()).find((r) => r.body.note === 'Great booths');
  assert.ok(pulled, 'the bead is in Loom');
  assert.equal(pulled.publishedUri, 'at://did:plc:fake/com.cultureblocs.bead/3lwent');
  assert.equal(pulled.body.subject.uri, event);
  assert.match(pullSummary(out, here), /^From the network: 1 new\. Then imported here: 1 changed\.$/);
});

test('the String column marks a public record', () => {
  const rec = { key: `${B}/a`, type: B, rkey: 'a', sourceApp: 'loom', state: 'kept', createdAt: '2026-09-14T21:04:00Z',
    day: '2026-09-14', body: { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'n' } };
  const view = (r) => String(stringColumnView({ month: '2026-09', weeks: monthGrid('2026-09', new Map()), days: entryList([r]) }));
  assert.doesNotMatch(view(rec), /mark public/);
  assert.match(view({ ...rec, publishedUri: 'at://did:plc:x/com.cultureblocs.bead/a' }), /<span class="mark public" title="at:\/\/did:plc:x\/com.cultureblocs.bead\/a">public<\/span>/);
});

test('the top bar says when auto-sync last ran, or that it failed, and nothing when it is off', () => {
  const bar = (auto) => String(topbarView({ connected: true, auto }));
  assert.doesNotMatch(bar(null), /class="auto/);
  assert.match(bar({ on: true, last: null }), />auto</);
  assert.match(bar({ on: true, last: { ok: true, at: '2026-10-23T10:04:00Z', summary: '1 sent' } }), /auto · \d\d:04/);
  assert.match(bar({ on: true, last: { ok: false, at: '2026-10-23T10:04:00Z', summary: 'x' } }), /auto-sync failed/);
});

test('a plain full import still works as before alongside the feed', async () => {
  const { store, reg, s } = await desk();
  s.records.push({ id: 'u9', type: B, sourceApp: 'pocket', createdAt: '2026-10-01T10:00:00Z', state: 'kept',
    body: { $type: B, createdAt: '2026-10-01T10:00:00Z', kind: 'bloc', note: 'nine' } });
  const { counts } = await runImport({ store, registry: reg, client: s.client });
  assert.equal(counts.add, 1);
});

test('a schedule() arriving while a run is under way never leaves two timers', async () => {
  const store = createMemStore();
  const timers = fakeTimers();
  let sync;
  sync = createAutoSync({ store, timers, blocked: async () => null,
    run: async () => { await sync.schedule(); return { sent: [] }; } });   // e.g. coming back online mid-run
  await store.setMeta('autoSync', true);
  await sync.schedule();
  await timers.fire();
  assert.equal(timers.pending.length, 1);
});

test('a run that finds the desk taken is skipped and retried soon', async () => {
  const store = createMemStore();
  const timers = fakeTimers();
  const sync = createAutoSync({ store, timers, blocked: async () => null, run: async () => ({ skipped: 'something else is writing' }) });
  await store.setMeta('autoSync', true);
  await sync.schedule();
  await timers.fire();
  assert.equal(timers.pending[0].ms, RETRY_MS);
  assert.equal(await store.getMeta('lastAutoSync'), undefined);
});

test('a cursor from a String since rebuilt at the same address starts a full import again', async () => {
  const { store, reg, s } = await desk();
  await store.setMeta('changesCursor', 500);
  s.records.push({ id: 'u1', type: B, sourceApp: 'pocket', createdAt: '2026-10-01T10:00:00Z', state: 'kept',
    body: { $type: B, createdAt: '2026-10-01T10:00:00Z', kind: 'bloc', note: 'one' } });
  s.feed.push({ seq: 1, recordId: 'u1' });
  const out = await importChanges({ store, registry: reg, client: s.client });
  assert.equal(out.full, true);
  assert.equal(out.counts.add, 1);
  assert.equal(await store.getMeta('changesCursor'), 1);
});
