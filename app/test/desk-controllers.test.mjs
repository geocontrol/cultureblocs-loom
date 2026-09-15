/* The desk's controllers, each mounted on a minimal fake root against a real
 * in-memory Loom: they render, and their actions reach the store. Fields are
 * fake inputs handed back for the selectors the controllers read; the DOM
 * itself is covered by the end-to-end browser run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TYPE } from '../lib/backup.js';
import { BEAD, STRAND, openLoom } from '../lib/envelope.js';
import { runImport } from '../lib/importer.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { mountEditor, startingBody } from '../ui/editor.js';
import { localInput } from '../ui/view-form.js';
import { mountDay, mountSend, mountTopbar, sendAll } from '../ui/pages.js';
import { mountSettings } from '../ui/settings.js';
import { mountString } from '../ui/string.js';
import { fakeString } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A root whose querySelectorAll('form.editor [name]') answers with `fields`. */
function fakeRoot(fields = []) {
  const listeners = {};
  return {
    innerHTML: '', textContent: '',
    fields,
    addEventListener: (t, f) => { listeners[t] = f; },
    removeEventListener: (t) => { delete listeners[t]; },
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === 'form.editor [name]' ? fields : []),
    fire: (t, target) => listeners[t]?.({ target, preventDefault() {} }),
  };
}

const field = (name, value) => ({ name, value, type: 'text', closest: (sel) => (sel === 'form.editor' ? {} : null) });

const button = (action, data = {}, parents = {}) => ({
  dataset: { action, ...data },
  closest: (sel) => (sel === 'button[data-action]' ? button(action, data, parents) : parents[sel] ?? null),
  set textContent(_) {},
});
const inRow = (action, key) => button(action, {}, { '[data-key]': { dataset: { key } } });

async function context({ records = [] } = {}) {
  const store = createMemStore();
  const reg = await registry();
  const now = steppingNow();
  const loom = await openLoom({ store, registry: reg, now, newDeviceId: () => 'desk-1' });
  const s = fakeString({ records });
  const events = [];
  const ctx = { store, registry: reg, loom, now, s, events,
    broadcast: (kind = 'changed') => events.push(`broadcast ${kind}`), setDirty() {}, persisted: async () => false,
    photoUrls: async () => new Map(), download: (name) => events.push(`download ${name}`), reload: () => events.push('reload'),
    navigate: (hash) => events.push(`navigate ${hash}`),
    fetch: async () => { throw new Error('offline'); },
    desk: { results: [], busy: false, tick: null, refreshColumn: () => events.push('refresh column'), refresh() {} } };
  return ctx;
}

test('startingBody: a bead now, or at noon on a chosen day; a strand for today or that day', () => {
  const now = Date.parse('2026-09-15T09:30:00Z');
  assert.deepEqual(startingBody(BEAD, { now }), { kind: 'bloc', createdAt: '2026-09-15T09:30:00.000Z' });
  assert.equal(localInput(startingBody(BEAD, { day: '2026-09-14', now }).createdAt), '2026-09-14T12:00');
  assert.deepEqual(startingBody(STRAND, { now }), { day: '2026-09-15T00:00:00Z', items: [] });
  assert.deepEqual(startingBody(STRAND, { day: '2026-09-01', now }), { day: '2026-09-01T00:00:00Z', items: [] });
});

test('a new bead is typed in full and written once, on save; nothing exists before', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('kind', 'visit'), field('text', 'Rothko room, almost empty.'), field('tags', 'art, tate'),
    field('place', 'Tate Modern'), field('links', 'https://tate.test | Tate')]);
  await mountEditor(root, ctx, { key, isNew: true });
  assert.match(root.innerHTML, /New bead/);
  await root.fire('input', root.fields[1]);
  await sleep(600);
  assert.equal(await ctx.store.getRecord(key), undefined, 'typing writes a draft, not a record');
  assert.deepEqual((await ctx.loom.newDrafts()).map((d) => d.body.note), ['Rothko room, almost empty.']);
  assert.ok(ctx.events.includes('refresh column'));
  await root.fire('click', button('save'));
  const saved = await ctx.store.getRecord(key);
  assert.deepEqual([saved.body.kind, saved.body.note, saved.body.tags, saved.body.subject, saved.body.links],
    ['visit', 'Rothko room, almost empty.', ['art', 'tate'], { name: 'Tate Modern' }, [{ uri: 'https://tate.test', title: 'Tate' }]]);
  assert.equal(saved.body.provenance.timeAnchored, true);
  assert.equal(await ctx.loom.getDraft(key), undefined);
  assert.match(root.innerHTML, /<h2>Bead<\/h2>/);
  assert.ok(ctx.events.includes('broadcast changed'));
});

test('a bead whose time was set, or that was opened for a day, is not anchored to the save', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const when = field('when', '2026-09-10T20:15');
  const root = fakeRoot([field('kind', 'watch'), when]);
  await mountEditor(root, ctx, { key, isNew: true });
  await root.fire('input', when);
  await root.fire('click', button('save'));
  const saved = await ctx.store.getRecord(key);
  assert.equal(saved.body.provenance.timeAnchored, false);
  assert.equal(localInput(saved.createdAt), '2026-09-10T20:15');

  const dayKey = ctx.loom.newKey(BEAD);
  const dayRoot = fakeRoot([field('kind', 'read')]);
  await mountEditor(dayRoot, ctx, { key: dayKey, day: '2026-09-01', isNew: true });
  await dayRoot.fire('click', button('save'));
  assert.equal((await ctx.store.getRecord(dayKey)).body.provenance.timeAnchored, false);
});

test('a new form with problems cannot save, and says why', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('kind', 'bloc'), field('text', 'x'.repeat(3001))]);
  await mountEditor(root, ctx, { key, isNew: true });
  await root.fire('input', root.fields[1]);
  await root.fire('click', button('save'));
  assert.match(root.innerHTML, /record is not valid/);
  assert.equal(await ctx.store.getRecord(key), undefined);
});

test('discarding a new record’s draft leaves nothing behind and goes back to the day', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('text', 'half')]);
  await mountEditor(root, ctx, { key, day: '2026-09-14', isNew: true });
  await root.fire('input', root.fields[0]);
  await sleep(600);
  await root.fire('click', button('discard'));
  assert.deepEqual(await ctx.loom.newDrafts(), []);
  assert.ok(ctx.events.includes('navigate #/day/2026-09-14'));
});

test('a draft restored over a record saved since then asks, and saves mine over it only when told', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'original' });
  await ctx.loom.save(bead.key, { ...bead.body, note: 'saved in another tab' });
  await ctx.loom.saveDraft(bead.key, { ...bead.body, note: 'my old draft' }, bead.updatedAt);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /restored an unsaved draft from/);
  await root.fire('click', button('save'));
  assert.match(root.innerHTML, /changed in another tab, or by an import/);
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'saved in another tab');
  await root.fire('click', button('tab-mine'));
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'my old draft');
});

test('delete asks first, naming the strands it changes, then deletes and goes back to the day', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'b', createdAt: '2026-09-14T10:00:00Z' });
  await makeStrand(ctx.loom, { title: 'Sunday', items: [{ uri: itemUri(bead.key) }] });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  await root.fire('click', button('delete'));
  assert.match(root.innerHTML, /Delete this bead[\s\S]*gone at once[\s\S]*taken out of 1 strand:[\s\S]*Sunday/);
  assert.ok(await ctx.store.getRecord(bead.key), 'nothing is deleted before confirming');
  await root.fire('click', button('delete-confirm'));
  assert.equal(await ctx.store.getRecord(bead.key), undefined);
  assert.ok(ctx.events.includes('navigate #/day/2026-09-14'));
});

test('while a strand is open, ticking beads adds and removes its items; a ticked proposal is kept', async () => {
  const ctx = await context();
  const a = await makeBead(ctx.loom, { note: 'a' });
  const p = await makeBead(ctx.loom, { note: 'p' });
  await ctx.store.putRecord({ ...p, state: 'proposal' });
  const key = ctx.loom.newKey(STRAND);
  const root = fakeRoot([field('title', 'Sunday')]);
  const editor = await mountEditor(root, ctx, { key, isNew: true });
  assert.ok(ctx.desk.tick);
  await ctx.desk.tick.toggle(a.key, true);
  await ctx.desk.tick.toggle(p.key, true);
  assert.equal(ctx.desk.tick.has(p.key), true);
  assert.equal((await ctx.store.getRecord(p.key)).state, 'kept');
  await ctx.desk.tick.toggle(a.key, false);
  await root.fire('click', button('save'));
  assert.deepEqual((await ctx.store.getRecord(key)).body.items, [{ uri: itemUri(p.key) }]);
  await editor.unmount();
  assert.equal(ctx.desk.tick, null);
});

test('strand items move up and down and are removed from the form', async () => {
  const ctx = await context();
  const a = await makeBead(ctx.loom, { note: 'a' }), b = await makeBead(ctx.loom, { note: 'b' });
  const s = await makeStrand(ctx.loom, { title: 'Sunday', items: [{ uri: itemUri(a.key) }, { uri: itemUri(b.key) }] });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: s.key });
  await root.fire('click', button('item-down', {}, { '[data-item]': { dataset: { item: '0' } } }));
  await root.fire('click', button('save'));
  assert.deepEqual((await ctx.store.getRecord(s.key)).body.items, [{ uri: itemUri(b.key) }, { uri: itemUri(a.key) }]);
  await root.fire('click', button('item-remove', {}, { '[data-item]': { dataset: { item: '1' } } }));
  await root.fire('click', button('save'));
  assert.deepEqual((await ctx.store.getRecord(s.key)).body.items, [{ uri: itemUri(b.key) }]);
});

test('a record in conflict shows both versions; keeping mine clears the conflict', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'import' } });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /Changed here and on the String[\s\S]*<th scope="row">note<\/th><td><pre>mine<\/pre><\/td><td><pre>theirs<\/pre>/);
  await root.fire('click', button('keep-mine'));
  const after = await ctx.store.getRecord(bead.key);
  assert.equal('conflict' in after, false);
  assert.equal(after.stringHlc, 'h');
  assert.doesNotMatch(root.innerHTML, /Changed here and on the String/);
});

test('taking the String’s version asks with a second press, then replaces the form’s body', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'send' } });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  await root.fire('click', button('take-theirs'));
  assert.match(root.innerHTML, /press again: yours is replaced/);
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'mine', 'the first press only asks');
  await root.fire('click', button('take-theirs'));
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'theirs');
  assert.match(root.innerHTML, />theirs<\/textarea>/);
});

test('typed text is flushed to the draft before keep-mine, so nothing typed is lost', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'import' } });
  const root = fakeRoot([field('text', 'mine plus typed')]);
  await mountEditor(root, ctx, { key: bead.key });
  await root.fire('input', root.fields[0]);
  await root.fire('click', button('keep-mine'));     // pressed within the 500ms draft debounce
  assert.match(root.innerHTML, />mine plus typed<\/textarea>/, 'the form keeps what was typed');
  await sleep(600);
  assert.equal((await ctx.loom.getDraft(bead.key)).body.note, 'mine plus typed', 'the draft keeps what was typed');
});

test('typed text is flushed to the draft before take-theirs replaces the form, so nothing typed is lost', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'send' } });
  const root = fakeRoot([field('text', 'mine plus typed')]);
  await mountEditor(root, ctx, { key: bead.key });
  await root.fire('input', root.fields[0]);
  await root.fire('click', button('take-theirs'));   // first press only asks
  await root.fire('click', button('take-theirs'));   // second press, within the 500ms draft debounce
  assert.match(root.innerHTML, />theirs<\/textarea>/, 'the form is replaced by theirs, as before');
  await sleep(600);
  assert.equal((await ctx.loom.getDraft(bead.key)).body.note, 'mine plus typed', 'the draft still keeps what was typed');
});

test('an outside render arriving while a draft write is in flight never replaces the typed body', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'original' });
  const root = fakeRoot([field('text', 'typed but not yet stored')]);
  const editor = await mountEditor(root, ctx, { key: bead.key });
  let release;
  const gate = new Promise((r) => { release = r; });
  const realSaveDraft = ctx.loom.saveDraft;
  ctx.loom.saveDraft = async (...args) => { await gate; return realSaveDraft(...args); };  // holds the write open
  await root.fire('input', root.fields[0]);
  const flushing = editor.flush();      // starts the (now gated) draft write
  await editor.render();                // an outside render (another tab, or the end of a Send) arrives mid-write
  assert.match(root.innerHTML, />typed but not yet stored<\/textarea>/);
  release();
  await flushing;
  assert.equal((await ctx.loom.getDraft(bead.key)).body.note, 'typed but not yet stored');
});

test('an annotation opens read-only; a record waiting to be deleted offers undo', async () => {
  const ctx = await context();
  await ctx.store.putRecord({ key: 'com.cultureblocs.annotation/a1', type: 'com.cultureblocs.annotation', day: '2026-09-14', body: { note: 'on the wall' } });
  const ro = fakeRoot();
  await mountEditor(ro, ctx, { key: 'com.cultureblocs.annotation/a1' });
  assert.match(ro.innerHTML, /read-only in Loom/);

  const bead = await makeBead(ctx.loom, { note: 'going' });
  await ctx.store.putRecord({ ...bead, stringId: 's1' });
  await ctx.loom.remove(bead.key);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /“going” is deleted here/);
  await root.fire('click', button('undo-delete'));
  assert.equal('deleted' in (await ctx.store.getRecord(bead.key)), false);
  assert.match(root.innerHTML, /<h2>Bead<\/h2>/);
});

test('opening a key with no record, no draft and no new flag — a record just deleted — does not open an empty new form', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('text', 'typed into nothing')]);
  await mountEditor(root, ctx, { key });
  assert.equal(root.textContent, 'This record is no longer in this browser.');
  assert.doesNotMatch(root.innerHTML, /New bead/);
  await root.fire('input', root.fields[0]);
  await sleep(600);
  assert.deepEqual(await ctx.loom.newDrafts(), [], 'nothing typed there becomes a draft');
});

test('ticking in the column after a new strand’s draft was discarded brings nothing back', async () => {
  const ctx = await context();
  const a = await makeBead(ctx.loom, { note: 'a' });
  const key = ctx.loom.newKey(STRAND);
  const root = fakeRoot([field('title', 'Sunday')]);
  await mountEditor(root, ctx, { key, isNew: true });
  const tick = ctx.desk.tick;
  await tick.toggle(a.key, true);
  await root.fire('click', button('discard'));
  assert.deepEqual(await ctx.loom.newDrafts(), []);
  await tick.toggle(a.key, true);                     // the column still holds the tick until the route unmounts
  await sleep(600);
  assert.deepEqual(await ctx.loom.newDrafts(), [], 'the discarded draft does not come back');
});

test('a record deleted here and in conflict shows the conflict and the form without save or delete', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', importedHash: 'x', importedState: 'kept' });
  await ctx.loom.remove(bead.key);
  const deleted = await ctx.store.getRecord(bead.key);
  await ctx.store.putRecord({ ...deleted, conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'import' } });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /You deleted this here[\s\S]*delete it anyway/);
  assert.match(root.innerHTML, />mine<\/textarea>/);
  assert.doesNotMatch(root.innerHTML, /data-action="save"/);
  assert.doesNotMatch(root.innerHTML, /data-action="delete"/);
});

test('settings ignores import while a Send is running', async () => {
  const ctx = await context();
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  const asked = [];
  ctx.fetch = async (url) => { asked.push(url); throw new TypeError('Failed to fetch'); };
  const root = fakeRoot();
  await mountSettings(root, ctx);
  ctx.desk.busy = true;
  await mountSettings(root, ctx);
  assert.match(root.innerHTML, /data-action="import" disabled/);
  await root.fire('click', button('import'));
  assert.deepEqual(asked, [], 'no import started');
  assert.doesNotMatch(root.innerHTML, /Failed to fetch/);
});

test('typing updates problems in place without throwing', async () => {
  const ctx = await context();
  const s = await makeStrand(ctx.loom, { title: 'Sunday' });
  const root = fakeRoot([field('title', 'Tate')]);
  await mountEditor(root, ctx, { key: s.key });
  assert.doesNotThrow(() => root.fire('input', root.fields[0]));
});

test('the String column lists records, keeps a proposal, releases one on the second press, and moves months', async () => {
  const ctx = await context();
  const kept = await makeBead(ctx.loom, { note: 'kept one', createdAt: '2026-09-14T10:00:00Z' });
  const p1 = await makeBead(ctx.loom, { note: 'proposal one', createdAt: '2026-09-14T11:00:00Z' });
  const p2 = await makeBead(ctx.loom, { note: 'proposal two', createdAt: '2026-09-14T12:00:00Z' });
  await ctx.store.putRecord({ ...p1, state: 'proposal' });
  await ctx.store.putRecord({ ...p2, state: 'proposal' });
  const root = fakeRoot();
  const column = await mountString(root, ctx, { day: '2026-09-14', key: kept.key });
  assert.match(root.innerHTML, /September 2026[\s\S]*kept one/);
  assert.match(root.innerHTML, /class="row on" data-key="[^"]*"/);
  await root.fire('click', inRow('keep', p1.key));
  assert.equal((await ctx.store.getRecord(p1.key)).state, 'kept');
  await root.fire('click', inRow('release', p2.key));
  assert.ok(await ctx.store.getRecord(p2.key), 'the first press only asks');
  await root.fire('click', inRow('release', p2.key));
  assert.equal(await ctx.store.getRecord(p2.key), undefined);
  await root.fire('click', button('month', { by: '1' }));
  assert.match(root.innerHTML, /October 2026/);
  await column.show({ day: '2026-08-02' });
  assert.match(root.innerHTML, /August 2026/);
});

test('the column’s tick boxes and kind filter reach the open strand and the list', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { kind: 'listen', note: 'Coltrane', createdAt: '2026-09-14T10:00:00Z' });
  await makeBead(ctx.loom, { kind: 'visit', note: 'Tate', createdAt: '2026-09-14T11:00:00Z' });
  const toggled = [];
  ctx.desk.tick = { has: () => false, toggle: async (k, on) => toggled.push([k, on]) };
  const root = fakeRoot();
  await mountString(root, ctx, { day: '2026-09-14' });
  assert.match(root.innerHTML, /data-action="tick"/);
  await root.fire('change', { dataset: { action: 'tick' }, checked: true, closest: (sel) => (sel === '[data-key]' ? { dataset: { key: bead.key } } : null) });
  assert.deepEqual(toggled, [[bead.key, true]]);
  await root.fire('change', { name: 'kind', value: 'listen', dataset: {}, closest: (sel) => (sel === 'form.filter' ? {} : null) });
  assert.match(root.innerHTML, /Coltrane/);
  assert.doesNotMatch(root.innerHTML, /Tate/);
});

test('the top bar counts changes; Send goes to the Send page and sends them', async () => {
  const ctx = await context();
  const bar = fakeRoot();
  await mountTopbar(bar, ctx);
  assert.match(bar.innerHTML, /not connected/);
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  await makeBead(ctx.loom, { note: 'to send' });
  await mountTopbar(bar, ctx);
  assert.match(bar.innerHTML, /1 change to send/);
  ctx.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await bar.fire('click', { closest: (sel) => (sel === 'button[data-action="send"]' ? {} : null) });
  assert.ok(ctx.events.includes('navigate #/send'));
  assert.deepEqual(ctx.desk.results.map((r) => r.status), ['failed']);
  assert.equal(ctx.desk.busy, false);
});

test('sendAll sends through the String client and keeps the results for the Send page', async () => {
  const ctx = await context();
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  const bead = await makeBead(ctx.loom, { note: 'x' });
  const posted = [];
  ctx.fetch = async (url, init = {}) => {
    const path = url.replace('http://string.test', '');
    if (init.method === 'POST' && path === '/records') {
      posted.push(JSON.parse(init.body).records[0].dedupeKey);
      return new Response(JSON.stringify({ results: [{ status: 'created', id: 'sid-1' }] }));
    }
    if (path === '/records/sid-1') return new Response(JSON.stringify({ id: 'sid-1', state: 'kept', hlc: 'h1', body: bead.body }));
    return new Response('{}', { status: 404 });
  };
  const results = await sendAll(ctx);
  assert.deepEqual(results.map((r) => [r.op, r.status]), [['post', 'sent']]);
  assert.deepEqual(posted, [`loom:${bead.rkey}`]);
  const page = fakeRoot();
  await mountSend(page, ctx);
  assert.match(page.innerHTML, /sent \(new\): x/);
  assert.match(page.innerHTML, /Nothing waiting to be sent/);
});

test('the Send page undoes a delete not yet sent', async () => {
  const ctx = await context({ records: [] });
  const bead = await makeBead(ctx.loom, { note: 'undo me' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', importedHash: 'x', importedState: 'kept' });
  await ctx.loom.remove(bead.key);
  const page = fakeRoot();
  await mountSend(page, ctx);
  assert.match(page.innerHTML, /delete — undo me[\s\S]*Deletes not yet sent[\s\S]*undo delete/);
  await page.fire('click', inRow('undo-delete', bead.key));
  assert.equal('deleted' in (await ctx.store.getRecord(bead.key)), false);
});

test('the day page lists the day’s records and offers new entries for it', async () => {
  const ctx = await context();
  await makeBead(ctx.loom, { kind: 'visit', note: 'Tate', createdAt: '2026-09-14T10:00:00Z' });
  const root = fakeRoot();
  await mountDay(root, ctx, { day: '2026-09-14' });
  assert.match(root.innerHTML, /Mon 14 Sep 2026[\s\S]*visit — Tate[\s\S]*#\/new\/bead\?day=2026-09-14/);
});

test('settings: check reports an unreachable String, import reports conflicts, and changes are counted for backup', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountSettings(root, ctx);
  await root.fire('click', button('check'));
  assert.match(root.innerHTML, /unreachable \(offline\)/);
  await makeBead(ctx.loom, { note: 'unsent' });
  await mountSettings(root, ctx);
  assert.match(root.innerHTML, /1 change not yet sent/);
});

test('restore asks first, naming what it replaces, then restores and reloads every tab — never while a Send runs', async () => {
  const ctx = await context();
  const mine = await makeBead(ctx.loom, { note: 'not sent yet' });
  const root = fakeRoot();
  await mountSettings(root, ctx);
  const doc = { $type: BACKUP_TYPE, version: 1, records: [], meta: {}, blobs: {} };
  const input = { dataset: { action: 'restore' }, files: [{ name: 'old.json', text: async () => JSON.stringify(doc) }], value: 'old.json' };
  await root.fire('change', input);
  assert.match(root.innerHTML, /replaces 1 record in this browser \(1 not yet sent to the String\)/);
  ctx.desk.busy = true;
  await root.fire('click', button('restore-confirm'));
  assert.ok(await ctx.store.getRecord(mine.key), 'refused while a Send is running');
  ctx.desk.busy = false;
  await root.fire('click', button('backup'));
  await root.fire('click', button('restore-confirm'));
  assert.equal(await ctx.store.getRecord(mine.key), undefined);
  assert.deepEqual(ctx.events.filter((e) => !e.startsWith('download')).slice(-2), ['broadcast restored', 'reload']);
  assert.ok(ctx.events.some((e) => e.startsWith('download loom-backup-')));
});

test('import from settings marks conflicts and says to open them', async () => {
  const T = '2026-09-13T10:00:00Z';
  const ctx = await context({ records: [{ id: 'u1', type: BEAD, sourceApp: 'rounds', createdAt: T, state: 'kept', body: { $type: BEAD, createdAt: T, kind: 'listen', note: 'one' } }] });
  await runImport({ store: ctx.store, registry: ctx.registry, client: ctx.s.client });
  const local = await ctx.store.getRecord(`${BEAD}/u1`);
  await ctx.loom.save(local.key, { ...local.body, note: 'here' });
  ctx.s.editOnString('u1', { note: 'there' });
  const withClient = { ...ctx, fetch: async (url) => {
    const path = url.replace(/^http:\/\/string\.test/, '');
    if (path === '/health') return new Response(JSON.stringify({ ok: true, lexicons: await ctx.s.client.health() }));
    if (path === '/days') return new Response(JSON.stringify({ days: await ctx.s.client.listDays() }));
    if (path.startsWith('/records?day=')) return new Response(JSON.stringify({ records: await ctx.s.client.listRecordsForDay(path.slice(13, 23)) }));
    return new Response('{}', { status: 404 });
  } };
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  const root = fakeRoot();
  await mountSettings(root, withClient);
  await root.fire('click', button('import'));
  assert.match(root.innerHTML, /1 changed on both sides: open them to choose/);
  assert.ok((await ctx.store.getRecord(local.key)).conflict);
});
