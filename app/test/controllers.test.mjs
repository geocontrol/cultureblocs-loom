/* Smoke tests for the ui controllers: each mounts against a minimal fake root
 * and a real in-memory Loom, renders, and handles its main action without
 * throwing. The DOM-level behaviour is covered by the end-to-end browser run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { mountCompose, newStrand } from '../ui/compose.js';
import { mountMint } from '../ui/mint.js';
import { mountPanel } from '../ui/string-panel.js';
import { mountThread } from '../ui/thread.js';
import { registry, steppingNow } from './helpers.mjs';

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
