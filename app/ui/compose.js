/* Compose controller: edit a strand or a bead. Typing updates the problems
 * list and publish hints in place (a full re-render would steal focus);
 * structural actions re-render. Every change autosaves as a draft (with the
 * updatedAt it was typed against); Save goes through the envelope's validation
 * gate, after any draft write in flight, so no draft outlives the save. */
import { reanchor, selectionToIndex } from '../lib/anchors.js';
import { BEAD, Conflict, STRAND, isAbandonable } from '../lib/envelope.js';
import { preparePhoto } from '../lib/images.js';
import { itemUri } from '../lib/keys.js';
import { mediaNames, putPhoto } from '../lib/media.js';
import { errorLine, html, surfaceErrors } from './html.js';
import { bodyFromFields, composeView, problemsView, readOnlyView } from './view-compose.js';
import { publishHint, refFromFields } from './view-refs.js';

export async function newStrand(ctx, { day, wrap }) {
  const createdAt = new Date(ctx.now()).toISOString();
  const body = { $type: STRAND, createdAt, day: `${day || createdAt.slice(0, 10)}T00:00:00Z`, items: [] };
  if (wrap) {
    const bead = await ctx.store.getRecord(wrap);
    if (bead) {
      body.items.push({ uri: itemUri(bead.key) });
      // The bead's refs are offered as mentions; its subject is not necessarily the entry's.
      const refs = list(bead.body?.refs).filter((r) => r && typeof r === 'object').map(({ index: _, ...r }) => ({ ...r, role: 'mention' }));
      if (refs.length) body.refs = refs;
    }
  }
  return ctx.loom.create(STRAND, body, { origin: 'compose', state: 'draft' });
}

const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const textField = (type) => (type === STRAND ? 'narrative' : 'note');
const EDITABLE = [BEAD, STRAND];

export async function mountCompose(root, ctx, { key }) {
  let record = await ctx.store.getRecord(key);
  const inert = { render() {}, async flush() {}, unmount() {} };
  if (!record) { root.textContent = `No record ${key}.`; return inert; }
  if (!EDITABLE.includes(record.type) || record.state === 'released') { root.innerHTML = String(readOnlyView(record)); return inert; }
  const draft = await ctx.loom.getDraft(key);
  const state = { record, body: structuredClone(draft?.body ?? record.body), conflict: null, dayBeads: [], urls: new Map(),
    restoredDraftAt: draft?.at ?? null, discardArmed: false, error: '' };
  // The updatedAt the body in the editor was typed against. For a restored draft
  // it is the draft's own, so saving it over a record changed since is a Conflict;
  // a draft written before drafts carried one (null) always asks.
  let base = draft ? (draft.baseUpdatedAt ?? null) : record.updatedAt;
  let saveTimer = null;
  let draftWrite = Promise.resolve();
  let gone = false;

  const text = () => state.body[textField(record.type)] || '';

  async function loadContext() {
    const all = await ctx.store.allRecords();
    state.dayBeads = all.filter((r) => r.day === record.day && r.type !== STRAND && r.state !== 'released').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    state.urls = await ctx.photoUrls(mediaNames(state.body));
  }

  function problems() { return ctx.loom.validate(record.type, state.body); }

  async function render() {
    if (gone) return;
    await loadContext();
    root.innerHTML = String(html`<div class="status-slot">${errorLine(state.error)}</div>${composeView({ ...state, record, problems: problems() })}`);
  }

  function refreshInPlace() {
    const found = problems();
    const slot = root.querySelector('.problems-slot');
    if (slot) slot.innerHTML = String(problemsView(found));
    root.querySelectorAll('button[data-action="save"], button[data-action="finish"]').forEach((b) => { b.disabled = found.length > 0; });
    list(state.body.refs).forEach((ref, i) => {
      const hint = root.querySelector(`[data-hint="${i}"]`);
      if (hint) hint.textContent = publishHint(ref);
    });
  }

  /* Show an error without a full re-render (typing keeps its focus). */
  function showError(message) {
    state.error = message;
    const slot = root.querySelector('.status-slot');
    if (slot) slot.innerHTML = String(errorLine(message));
  }

  /* Draft writes run one after another; `draftWrite` is the last one. A failed
   * write is shown and leaves the editor dirty, the edit still in memory. */
  function writeDraft() {
    saveTimer = null;
    const body = structuredClone(state.body), against = base;
    draftWrite = draftWrite.then(async () => {
      try {
        await ctx.loom.saveDraft(record.key, body, against);
        if (!saveTimer) ctx.setDirty(false);
      } catch (err) {
        showError(`draft not saved: ${err.message} — your changes are still here; back up from the string panel`);
      }
    });
    return draftWrite;
  }

  function scheduleDraft() {
    ctx.setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, 500);
  }

  /* Write a pending draft now (before an unmount or a reload). */
  async function flush() {
    if (saveTimer) { clearTimeout(saveTimer); writeDraft(); }
    await draftWrite;
  }

  /* Drop a pending draft and wait out one in flight, so it cannot land after what follows. */
  async function settleDrafts() {
    clearTimeout(saveTimer);
    saveTimer = null;
    await draftWrite;
  }

  function readFields() {
    const f = {};
    root.querySelectorAll('form.compose > label > [name], form.compose [name^="alt-"]').forEach((el) => { f[el.name] = el.value; });
    return f;
  }

  function onInput(e) {
    if (e.target.type === 'file') return;
    const before = text();
    const next = bodyFromFields(record.type, state.body, readFields());
    const refs = [...root.querySelectorAll('fieldset.ref')].map((fs, i) => {
      const f = {};
      fs.querySelectorAll('[name]').forEach((el) => { f[el.name] = el.value; });
      return refFromFields(f, state.body.refs?.[i]);
    });
    const after = next[textField(record.type)] || '';
    const carried = after !== before ? reanchor(before, after, refs) : refs;
    if (carried.length) next.refs = carried; else delete next.refs;
    state.body = next;
    scheduleDraft();
    refreshInPlace();
  }

  async function save({ finish = false, expectUpdatedAt = base } = {}) {
    await settleDrafts();
    try {
      record = await ctx.loom.save(record.key, state.body, { expectUpdatedAt });
      if (finish) record = await ctx.loom.finish(record.key);
      base = record.updatedAt;
      state.conflict = null;
      state.restoredDraftAt = null;
      ctx.setDirty(false);
      ctx.broadcast();
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      state.conflict = e.current;
    }
    await render();
  }

  /* Back to what is stored: no draft, nothing pending. */
  async function revertTo(stored) {
    await settleDrafts();
    await ctx.loom.discardDraft(stored.key);
    record = stored;
    base = stored.updatedAt;
    state.body = structuredClone(stored.body);
    Object.assign(state, { conflict: null, restoredDraftAt: null });
    ctx.setDirty(false);
    await render();
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action !== 'discard') state.discardArmed = false;
    state.error = '';
    const refIndex = Number(button.closest('[data-ref]')?.dataset.ref);
    const itemIndex = Number(button.closest('[data-item]')?.dataset.item);
    const items = list(state.body.items);
    if (action === 'save') return save();
    if (action === 'finish') return save({ finish: true });
    if (action === 'keep-mine') return save({ expectUpdatedAt: state.conflict.updatedAt });
    if (action === 'take-theirs') return revertTo(state.conflict);
    if (action === 'discard') {
      if (!isAbandonable(record)) return revertTo(await ctx.store.getRecord(record.key));
      if (!state.discardArmed) {          // two presses: a discarded draft entry is gone
        state.discardArmed = true;
        return render();
      }
      await settleDrafts();
      await ctx.loom.abandon(record.key);
      gone = true;
      ctx.setDirty(false);
      ctx.broadcast();
      root.innerHTML = String(html`<p>Draft discarded. <a href="#/thread/${record.day || ''}">back to the day</a></p>`);
      ctx.navigate?.(`#/thread/${record.day || ''}`);
      return;
    }
    if (action === 'add-ref') {
      state.body.refs = [...list(state.body.refs), { type: 'work', role: 'subject', descriptor: { label: '' } }];
    } else if (action === 'remove-ref') {
      state.body.refs.splice(refIndex, 1);
      if (!state.body.refs.length) delete state.body.refs;
    } else if (action === 'anchor') {
      const area = root.querySelector('textarea[name="text"]');
      const index = area ? selectionToIndex(area.value, area.selectionStart, area.selectionEnd) : null;
      if (!index) return;
      state.body.refs[refIndex] = { ...state.body.refs[refIndex], index };
    } else if (action === 'clear-anchor') {
      const { index: _, ...rest } = state.body.refs[refIndex];
      state.body.refs[refIndex] = rest;
    } else if (action === 'item-up' && itemIndex > 0) {
      [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
    } else if (action === 'item-down' && itemIndex < items.length - 1) {
      [items[itemIndex + 1], items[itemIndex]] = [items[itemIndex], items[itemIndex + 1]];
    } else if (action === 'item-remove') {
      items.splice(itemIndex, 1);
    } else if (action === 'item-add') {
      const beadKey = button.closest('[data-bead]').dataset.bead;
      const bead = await ctx.store.getRecord(beadKey);
      if (bead?.state === 'proposal') await ctx.loom.keep(beadKey);
      state.body.items = [...items, { uri: itemUri(beadKey) }];
    } else if (action === 'photo-remove') {
      state.body.media.splice(Number(button.closest('[data-photo]').dataset.photo), 1);
      if (!state.body.media.length) delete state.body.media;
    } else return;
    scheduleDraft();
    await render();
  }

  async function onChange(e) {
    if (e.target.dataset?.action !== 'photo-add') return;
    for (const file of e.target.files) {
      const { blob, width, height } = await preparePhoto(file);
      const uri = await putPhoto(ctx.store, blob);
      state.body.media = [...list(state.body.media), { uri, mime: blob.type, aspectRatio: { width, height } }];
    }
    scheduleDraft();
    await render();
  }

  const show = async (message) => { state.error = message; await render(); };
  const click = surfaceErrors(onClick, show), change = surfaceErrors(onChange, show);
  const submit = (e) => e.preventDefault();       // no inline handler: the CSP forbids them
  root.addEventListener('input', onInput);
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('submit', submit);
  await render();
  return {
    render,
    flush,
    unmount() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', click);
      root.removeEventListener('change', change);
      root.removeEventListener('submit', submit);
      return flush();
    },
  };
}
