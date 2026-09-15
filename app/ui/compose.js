/* Compose controller: edit a strand or a bead. Typing updates the problems
 * list and publish hints in place (a full re-render would steal focus);
 * structural actions re-render. Every change autosaves as a draft; Save goes
 * through the envelope's validation gate. */
import { reanchor, selectionToIndex } from '../lib/anchors.js';
import { Conflict, STRAND } from '../lib/envelope.js';
import { preparePhoto } from '../lib/images.js';
import { itemUri } from '../lib/keys.js';
import { mediaNames, putPhoto } from '../lib/media.js';
import { bodyFromFields, composeView, problemsView } from './view-compose.js';
import { publishHint, refFromFields } from './view-refs.js';

export async function newStrand(ctx, { day, wrap }) {
  const createdAt = new Date(ctx.now()).toISOString();
  const body = { $type: STRAND, createdAt, day: `${day || createdAt.slice(0, 10)}T00:00:00Z`, items: [] };
  if (wrap) {
    const bead = await ctx.store.getRecord(wrap);
    if (bead) {
      body.items.push({ uri: itemUri(bead.key) });
      // The bead's refs are offered as mentions; its subject is not necessarily the entry's.
      const refs = (bead.body.refs || []).map(({ index: _, ...r }) => ({ ...r, role: 'mention' }));
      if (refs.length) body.refs = refs;
    }
  }
  return ctx.loom.create(STRAND, body, { origin: 'compose', state: 'draft' });
}

const textField = (type) => (type === STRAND ? 'narrative' : 'note');

export async function mountCompose(root, ctx, { key }) {
  let record = await ctx.store.getRecord(key);
  if (!record) { root.textContent = `No record ${key}.`; return { unmount() {} }; }
  const draft = await ctx.loom.getDraft(key);
  const state = { record, body: structuredClone(draft?.body ?? record.body), conflict: null, dayBeads: [], urls: new Map() };
  let saveTimer = null;

  const text = () => state.body[textField(record.type)] || '';

  async function loadContext() {
    const all = await ctx.store.allRecords();
    state.dayBeads = all.filter((r) => r.day === record.day && r.type !== STRAND && r.state !== 'released').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    state.urls = await ctx.photoUrls(mediaNames(state.body));
  }

  function problems() { return ctx.loom.validate(record.type, state.body); }

  async function render() {
    await loadContext();
    root.innerHTML = String(composeView({ ...state, record, problems: problems() }));
  }

  function refreshInPlace() {
    const list = problems();
    const slot = root.querySelector('.problems-slot');
    if (slot) slot.innerHTML = String(problemsView(list));
    root.querySelectorAll('button[data-action="save"], button[data-action="finish"]').forEach((b) => { b.disabled = list.length > 0; });
    (state.body.refs || []).forEach((ref, i) => {
      const hint = root.querySelector(`[data-hint="${i}"]`);
      if (hint) hint.textContent = publishHint(ref);
    });
  }

  function scheduleDraft() {
    ctx.setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await ctx.loom.saveDraft(record.key, state.body);
      ctx.setDirty(false);
    }, 500);
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

  async function save({ finish = false, expectUpdatedAt = record.updatedAt } = {}) {
    clearTimeout(saveTimer);
    try {
      record = await ctx.loom.save(record.key, state.body, { expectUpdatedAt });
      if (finish) record = await ctx.loom.finish(record.key);
      state.conflict = null;
      ctx.setDirty(false);
      ctx.broadcast();
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      state.conflict = e.current;
    }
    await render();
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const refIndex = Number(button.closest('[data-ref]')?.dataset.ref);
    const itemIndex = Number(button.closest('[data-item]')?.dataset.item);
    const items = state.body.items || [];
    if (action === 'save') return save();
    if (action === 'finish') return save({ finish: true });
    if (action === 'keep-mine') return save({ expectUpdatedAt: state.conflict.updatedAt });
    if (action === 'take-theirs') {
      record = state.conflict;
      state.body = structuredClone(record.body);
      state.conflict = null;
      await ctx.loom.discardDraft(record.key);
    } else if (action === 'discard') {
      await ctx.loom.discardDraft(record.key);
      record = await ctx.store.getRecord(record.key);
      state.body = structuredClone(record.body);
    } else if (action === 'add-ref') {
      state.body.refs = [...(state.body.refs || []), { type: 'work', role: 'subject', descriptor: { label: '' } }];
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
      state.body.media = [...(state.body.media || []), { uri, mime: blob.type, aspectRatio: { width, height } }];
    }
    scheduleDraft();
    await render();
  }

  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  await render();
  return {
    render,
    unmount() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
    },
  };
}
