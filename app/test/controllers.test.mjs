/* Smoke tests for the ui controllers: each mounts against a minimal fake root
 * and a real in-memory Loom, renders, and handles its main action without
 * throwing. The DOM-level behaviour is covered by the end-to-end browser run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { mountCompose, newStrand } from '../ui/compose.js';
import { mountMint } from '../ui/mint.js';
import { localChangeCount, mountPanel } from '../ui/string-panel.js';
import { mountThread } from '../ui/thread.js';
import { BACKUP_TYPE } from '../lib/backup.js';
import { registry, steppingNow } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeRoot() {
  const listeners = {};
  return {
    innerHTML: '', textContent: '',
    addEventListener: (t, f) => { listeners[t] = f; },
    removeEventListener: (t) => { delete listeners[t]; },
    querySelector: () => null,
    querySelectorAll: () => [],
    fire: (t, target) => listeners[t]?.({ target }),
  };
}

const button = (action, data = {}, parents = {}) => ({
  dataset: { action, ...data },
  closest: (sel) => (sel === 'button[data-action]' ? button(action, data, parents) : parents[sel] ?? null),
  set textContent(_) {},
});

async function context() {
  const store = createMemStore();
  const reg = await registry();
  const now = steppingNow();
  const loom = await openLoom({ store, registry: reg, now, newDeviceId: () => 'desk-1' });
  return { store, registry: reg, loom, now, broadcast() {}, setDirty() {}, persisted: async () => false,
    photoUrls: async () => new Map(), download() {}, applyPosture() {}, fetch: async () => { throw new Error('offline'); } };
}

test('thread renders a month, a day, and keeps a proposal', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'hello' });
  await ctx.store.putRecord({ ...bead, key: 'com.cultureblocs.bead/p', rkey: 'p', state: 'proposal' });
  const month = fakeRoot();
  await mountThread(month, ctx, { period: '' });
  assert.match(month.innerHTML, /class="days"/);
  const day = fakeRoot();
  await mountThread(day, ctx, { period: bead.day });
  assert.match(day.innerHTML, /hello/);
  await day.fire('click', button('keep', {}, { '[data-key]': { dataset: { key: 'com.cultureblocs.bead/p' } } }));
  assert.equal((await ctx.store.getRecord('com.cultureblocs.bead/p')).state, 'kept');
});

test('mint mints on press', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountMint(root, ctx);
  await root.fire('click', button('press'));
  const [bead] = await ctx.store.allRecords();
  assert.equal(bead.body.provenance.app, 'loom');
  assert.match(root.innerHTML, /minted bloc/);
});

test('compose opens a new strand wrapping a bead and saves it', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'wrap me' });
  const strand = await newStrand(ctx, { day: bead.day, wrap: bead.key });
  assert.deepEqual(strand.body.items, [{ uri: `loom://${bead.key}` }]);
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: strand.key });
  assert.match(root.innerHTML, /wrap me/);
  await root.fire('click', button('finish'));
  assert.equal((await ctx.store.getRecord(strand.key)).state, 'kept');
});

test('the string panel renders and reports an unreachable String', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountPanel(root, ctx);
  assert.match(root.innerHTML, /0 Loom-made records/);
  await root.fire('click', button('check'));
  assert.match(root.innerHTML, /unreachable \(offline\)/);
});

test('restore asks first, naming what it replaces, then restores and reloads every tab', async () => {
  const ctx = await context();
  const events = [];
  Object.assign(ctx, { broadcast: (kind = 'changed') => events.push(`broadcast ${kind}`), reload: () => events.push('reload'),
    download: (name) => events.push(`download ${name}`) });
  const mine = await ctx.loom.mint({ note: 'not sent yet' });
  const root = fakeRoot();
  await mountPanel(root, ctx);
  const doc = { $type: BACKUP_TYPE, version: 1, records: [], meta: {}, blobs: {} };
  const input = { dataset: { action: 'restore' }, files: [{ name: 'old.json', text: async () => JSON.stringify(doc) }], value: 'old.json' };
  await root.fire('change', input);
  assert.match(root.innerHTML, /replaces 1 record in this browser \(1 not yet sent to the String\)/);
  assert.match(root.innerHTML, /data-action="backup"[^>]*>download a backup first/);
  assert.ok(await ctx.store.getRecord(mine.key), 'nothing is replaced before confirming');
  await root.fire('click', { closest: (sel) => (sel === 'button[data-action]' ? { dataset: { action: 'backup' } } : null) });
  await root.fire('click', { closest: (sel) => (sel === 'button[data-action]' ? { dataset: { action: 'restore-confirm' } } : null) });
  assert.equal(await ctx.store.getRecord(mine.key), undefined);
  assert.deepEqual(events.filter((e) => !e.startsWith('download')), ['broadcast restored', 'reload']);
  assert.ok(events[0].startsWith('download loom-backup-'));
});

test('a draft restored over a record saved since then shows the conflict instead of saving over it', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'original' });
  await ctx.loom.save(bead.key, { ...bead.body, note: 'saved in another tab' });
  await ctx.loom.saveDraft(bead.key, { ...bead.body, note: 'my old draft' }, bead.updatedAt);   // typed against the original
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /restored an unsaved draft from/);
  assert.match(root.innerHTML, /my old draft/);
  await root.fire('click', button('save'));
  assert.match(root.innerHTML, /Another tab saved this/);
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'saved in another tab');
});

test('discarding changes leaves no draft behind, and the editor is clean', async () => {
  const ctx = await context();
  const dirty = [];
  ctx.setDirty = (d) => dirty.push(d);
  const bead = await ctx.loom.mint({ note: 'x' });
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: bead.key });
  await root.fire('click', button('add-ref'));
  await root.fire('click', button('discard'));
  await sleep(600);
  assert.equal(await ctx.loom.getDraft(bead.key), undefined);
  assert.equal(dirty.at(-1), false);
});

test('saving while a draft write is in flight leaves no orphan draft', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'Saw Crash' });
  await ctx.loom.save(bead.key, { ...bead.body, refs: [{ type: 'work', role: 'subject', descriptor: { label: 'Crash' } }] });
  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  const saveDraft = ctx.loom.saveDraft;
  ctx.loom = { ...ctx.loom, async saveDraft(...a) { reached(); await opened; return saveDraft(...a); } };
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: bead.key });
  await root.fire('click', button('remove-ref', {}, { '[data-ref]': { dataset: { ref: '0' } } }));
  await arrived;                                  // the debounced draft write has started
  const saving = root.fire('click', button('save'));
  await Promise.race([saving, sleep(50)]);        // a save that does not wait for the draft is done by now
  open();                                         // ...and only then does the draft write land
  await saving;
  await sleep(10);
  assert.equal(await ctx.loom.getDraft(bead.key), undefined);
  assert.equal('refs' in (await ctx.store.getRecord(bead.key)).body, false);
});

test('flush writes a pending draft at once, with the updatedAt it was typed against', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'x' });
  const root = fakeRoot();
  const c = await mountCompose(root, ctx, { key: bead.key });
  await root.fire('click', button('add-ref'));
  await c.flush();
  const draft = await ctx.loom.getDraft(bead.key);
  assert.equal(draft.baseUpdatedAt, bead.updatedAt);
  assert.equal(draft.body.refs.length, 1);
  c.unmount();
});

test('discard on a draft entry never told deletes it, on the second press', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'x' });
  const strand = await newStrand(ctx, { day: bead.day, wrap: bead.key });
  await ctx.loom.saveDraft(strand.key, strand.body, strand.updatedAt);
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: strand.key });
  assert.match(root.innerHTML, /data-action="discard">discard this draft/);
  await root.fire('click', button('discard'));
  assert.ok(await ctx.store.getRecord(strand.key), 'one press does not delete');
  await root.fire('click', button('discard'));
  assert.equal(await ctx.store.getRecord(strand.key), undefined);
  assert.equal(await ctx.loom.getDraft(strand.key), undefined);
  assert.ok(await ctx.store.getRecord(bead.key), 'the bead it wrapped is untouched');
});

test('the panel counts drafts apart from unsent records, and send is off when nothing is sendable', async () => {
  const ctx = await context();
  await newStrand(ctx, { day: '2026-09-15' });
  const root = fakeRoot();
  await mountPanel(root, ctx);
  assert.match(root.innerHTML, /0 Loom-made records not yet on the String/);
  assert.match(root.innerHTML, /1 draft not sent/);
  assert.match(root.innerHTML, /data-action="send" disabled/);
});

test('an annotation, or a released tombstone, opens read-only in Compose', async () => {
  const ctx = await context();
  const A = 'com.cultureblocs.annotation';
  await ctx.store.putRecord({ key: `${A}/u1`, type: A, rkey: 'u1', state: 'kept', origin: 'import', sourceApp: 'ar',
    createdAt: '2026-09-14T10:00:00Z', day: '2026-09-14', stringId: 'u1', body: { $type: A, note: 'from the AR app' } });
  const root = fakeRoot();
  const c = await mountCompose(root, ctx, { key: `${A}/u1` });
  assert.match(root.innerHTML, /read-only/);
  assert.doesNotMatch(root.innerHTML, /<form/);
  await c.flush();
  const bead = await ctx.loom.mint({ note: 'x' });
  await ctx.store.putRecord({ ...bead, state: 'released', stringId: 's1' });
  const r2 = fakeRoot();
  await mountCompose(r2, ctx, { key: bead.key });
  assert.doesNotMatch(r2.innerHTML, /<form/);
});

const alertIn = (root) => /<p class="error" role="alert">/.test(root.innerHTML);

test('mint ignores a second press while the first is still minting', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountMint(root, ctx);
  await Promise.all([root.fire('click', button('press')), root.fire('click', button('press'))]);
  assert.equal((await ctx.store.allRecords()).length, 1);
});

test('a keep that lost a race with another tab shows why, instead of throwing', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'hello' });
  await ctx.store.putRecord({ ...bead, key: 'com.cultureblocs.bead/p', rkey: 'p', state: 'proposal' });
  const day = fakeRoot();
  await mountThread(day, ctx, { period: bead.day });
  await ctx.loom.keep('com.cultureblocs.bead/p');                 // the other tab
  await day.fire('click', button('keep', {}, { '[data-key]': { dataset: { key: 'com.cultureblocs.bead/p' } } }));
  assert.ok(alertIn(day));
  assert.match(day.innerHTML, /a kept record cannot become kept/);
});

test('compose shows a save that fails, and a photo that cannot be read, in its status line', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'x' });
  ctx.loom = { ...ctx.loom, async save() { throw new Error('QuotaExceededError: the disk is full'); } };
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: bead.key });
  await root.fire('click', button('add-ref'));
  await root.fire('click', button('save'));
  assert.ok(alertIn(root));
  assert.match(root.innerHTML, /the disk is full/);
  assert.match(root.innerHTML, /data-action="remove-ref"/, 'the unsaved edit is still in the editor');
  await root.fire('change', { dataset: { action: 'photo-add' }, files: [new Blob(['not an image'])] });
  assert.ok(alertIn(root));
});

test('the panel shows a failed backup in its status line', async () => {
  const ctx = await context();
  ctx.store = { ...ctx.store, async blobHashes() { throw new Error('storage is gone'); } };
  const root = fakeRoot();
  await mountPanel(root, ctx);
  await root.fire('click', button('backup'));
  assert.ok(alertIn(root));
  assert.match(root.innerHTML, /storage is gone/);
});

test('local changes to records on the String are counted by hash and state, sent or imported alike', async () => {
  const { contentHash } = await import('../vendor/strip.js');
  const body = { note: 'a' }, h = await contentHash(body);
  const base = { stringId: 's', body, importedHash: h, importedState: 'kept', state: 'kept' };
  const records = [
    { ...base, sentAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T09:00:00Z', body: { note: 'linked, but differs' } },
    { ...base, sentAt: '2026-09-15T09:00:00Z', updatedAt: '2026-09-15T10:00:00Z' },   // written after sending, same body
    { ...base, state: 'released' },
    { ...base },
    { sourceApp: 'loom', body },                                                        // not on the String
  ];
  assert.deepEqual(await Promise.all(records.map((r) => localChangeCount([r]))), [1, 0, 1, 0, 0]);
});
