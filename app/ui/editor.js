/* The editor: one controller for the bead form and the strand form, for a
 * record that exists and for one not yet saved (a key with no record: its
 * type is the key's). Typing updates problems and publish hints in place (a
 * full re-render would steal focus); structural actions re-render. Every change
 * autosaves as a draft; Save writes the record whole through the envelope's
 * validation gate, after any draft write in flight, so no draft outlives it.
 *
 * While a strand is open, `ctx.desk.tick` lets the String column add and
 * remove beads; adding a proposal keeps it. A record in `conflict` shows both
 * versions and the two choices; one waiting to be deleted offers undo, and
 * one deleted here that is also in conflict shows its form read-only. A key
 * with no record and no draft opens a new form only when the route says it
 * is new (`isNew`); otherwise the record has gone. */
import { reanchor, selectionToIndex } from '../lib/anchors.js';
import { changedFields, keepMine, takeTheirs, theirBody } from '../lib/conflicts.js';
import { BEAD, Conflict, EDITABLE, STRAND } from '../lib/envelope.js';
import { preparePhoto } from '../lib/images.js';
import { itemUri, keyFromItemUri, splitKey } from '../lib/keys.js';
import { mediaNames, putPhoto } from '../lib/media.js';
import { beadFormView } from './view-bead.js';
import { bodyFromFields, fromLocalInput, problemsView, readOnlyView } from './view-form.js';
import { conflictView, deleteView, deletedView } from './view-panels.js';
import { publishHint, refFromFields } from './view-refs.js';
import { strandFormView } from './view-strand.js';
import { errorLine, html, surfaceErrors } from './html.js';

const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const textField = (type) => (type === STRAND ? 'narrative' : 'note');

/* The body a new record's form starts with. `day` puts a bead at noon on that day. */
export function startingBody(type, { day = '', now = Date.now() } = {}) {
  if (type === STRAND) return { day: `${day || new Date(now).toISOString().slice(0, 10)}T00:00:00Z`, items: [] };
  return { kind: 'bloc', createdAt: (day && fromLocalInput(`${day}T12:00`)) || new Date(now).toISOString() };
}

export async function mountEditor(root, ctx, { key, day = '', isNew = false }) {
  const { type } = splitKey(key);
  const inert = { render() {}, async flush() {}, unmount() {} };
  let record = await ctx.store.getRecord(key);
  if (!record && !EDITABLE.includes(type)) { root.textContent = `No record ${key}.`; return inert; }
  if (record && !EDITABLE.includes(record.type)) { root.innerHTML = String(readOnlyView(record)); return inert; }

  const draft = await ctx.loom.getDraft(key);
  // Only the shell's #/new/* redirect opens an empty form under a fresh key; a
  // link to a record that has since gone (a Send result, another tab) must not.
  if (!record && !draft && !isNew) { root.textContent = 'This record is no longer in this browser.'; return inert; }
  const state = {
    body: structuredClone(draft?.body ?? record?.body ?? startingBody(type, { day, now: ctx.now() })),
    restoredDraftAt: draft?.at ?? null, dirtyDraft: Boolean(draft), error: '', confirmDelete: null, tabConflict: null, armTheirs: false,
    members: new Map(), urls: new Map(),
  };
  // The updatedAt the body was typed against: a restored draft's own, so saving it
  // over a record changed since is a Conflict (a draft without one always asks).
  let base = record ? (draft ? (draft.baseUpdatedAt ?? null) : record.updatedAt) : null;
  let anchored = !draft && !day;       // a new bead's time is the moment it was written, unless someone set it
  let saveTimer = null;
  let draftWrite = Promise.resolve();
  let gone = false;

  const text = () => state.body[textField(type)] || '';

  /* What Save would write, for validation before there is a record. */
  function candidate() {
    if (record) return state.body;
    const at = new Date(ctx.now()).toISOString();
    if (type === STRAND) return { ...state.body, $type: STRAND, createdAt: at, items: list(state.body.items) };
    return { ...state.body, $type: BEAD, createdAt: state.body.createdAt || at, provenance: { app: 'loom', device: ctx.loom.deviceId, mintedAt: at, timeAnchored: anchored } };
  }
  const problems = () => ctx.loom.validate(type, candidate());

  async function loadContext() {
    if (type === STRAND) {
      const keys = list(state.body.items).map((it) => keyFromItemUri(it?.uri)).filter(Boolean);
      state.members = new Map((await Promise.all(keys.map((k) => ctx.store.getRecord(k)))).filter(Boolean).map((r) => [r.key, r]));
    }
    state.urls = await ctx.photoUrls(mediaNames(state.body));
  }

  async function render() {
    if (gone) return;
    await loadContext();
    const status = html`<div class="status-slot">${errorLine(state.error)}${state.tabConflict ? html`<p class="error" role="alert">
      This changed in another tab, or by an import, after you opened it.
      <button type="button" data-action="tab-theirs">use the newer version</button>
      <button type="button" data-action="tab-mine">save mine over it</button></p>` : ''}</div>`;
    if (record?.deleted && !record.conflict) {
      root.innerHTML = String(html`${status}${deletedView(record)}`);
      return;
    }
    let conflict = '';
    if (record?.conflict) {
      const theirs = await theirBody(ctx.store, record);
      conflict = conflictView({ fields: theirs ? changedFields(state.body, theirs) : [], theirs: Boolean(theirs), deleted: Boolean(record.deleted), armed: state.armTheirs });
    }
    const view = type === STRAND ? strandFormView : beadFormView;
    // Deleted here and changed on the String: only the conflict's choices apply (save would be refused).
    const form = view({ ...state, record, problems: problems(), locked: Boolean(record?.deleted) });
    const confirm = state.confirmDelete ? deleteView({ record, ...state.confirmDelete }) : '';
    root.innerHTML = String(html`${status}<p class="back"><a href="#/day/${record?.day || ''}">back</a></p>${conflict}${form}${confirm}`);
  }

  function refreshInPlace() {
    const found = problems();
    const slot = root.querySelector('.problems-slot');
    if (slot) slot.innerHTML = String(problemsView(found));
    root.querySelectorAll('button[data-action="save"]').forEach((b) => { b.disabled = found.length > 0; });
    list(state.body.refs).forEach((ref, i) => {
      const hint = root.querySelector(`[data-hint="${i}"]`);
      if (hint) hint.textContent = publishHint(ref);
    });
  }

  function showError(message) {
    state.error = message;
    const slot = root.querySelector('.status-slot');
    if (slot) slot.innerHTML = String(errorLine(message));
  }

  /* Draft writes run one after another; `draftWrite` is the last one. */
  function writeDraft() {
    saveTimer = null;
    // Marked synchronously, before the write even starts: an outside render()
    // (another tab's broadcast, the end of a Send) must never replace a body
    // that has unwritten or in-flight edits — waiting until the write resolves
    // would leave a gap where the guard sees neither a timer nor a dirty draft.
    state.dirtyDraft = true;
    const body = structuredClone(state.body), against = base;
    draftWrite = draftWrite.then(async () => {
      try {
        await ctx.loom.saveDraft(key, body, against, record ? null : type);
        if (!saveTimer) ctx.setDirty(false);
        if (!record) ctx.desk?.refreshColumn?.();                 // a new draft appears in the list
      } catch (err) {
        showError(`draft not saved: ${err.message} — your changes are still here; back up from settings`);
      }
    });
    return draftWrite;
  }

  function scheduleDraft() {
    ctx.setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, 500);
  }

  async function flush() {
    if (saveTimer) { clearTimeout(saveTimer); writeDraft(); }
    await draftWrite;
  }

  async function settleDrafts() {
    clearTimeout(saveTimer);
    saveTimer = null;
    await draftWrite;
  }

  function readFields() {
    const f = {};
    root.querySelectorAll('form.editor [name]').forEach((el) => { if (!el.closest('fieldset.ref')) f[el.name] = el.value; });
    return f;
  }

  function onInput(e) {
    if (record?.deleted) return;                      // the form is shown read-only
    if (e.target.type === 'file' || e.target.closest?.('form.editor') === null) return;
    if (e.target.name === 'when') anchored = false;
    const before = text();
    const next = bodyFromFields(type, state.body, readFields());
    const refs = [...root.querySelectorAll('fieldset.ref')].map((fs, i) => {
      const f = {};
      fs.querySelectorAll('[name]').forEach((el) => { f[el.name] = el.value; });
      return refFromFields(f, state.body.refs?.[i]);
    });
    const after = next[textField(type)] || '';
    const carried = after !== before ? reanchor(before, after, refs) : refs;
    if (carried.length) next.refs = carried; else delete next.refs;
    state.body = next;
    scheduleDraft();
    refreshInPlace();
  }

  function changed() {
    ctx.setDirty(false);
    ctx.broadcast();
  }

  async function save(expectUpdatedAt = base) {
    await settleDrafts();
    try {
      if (record) record = await ctx.loom.save(key, state.body, { expectUpdatedAt });
      else if (type === STRAND) record = await ctx.loom.createStrand(key, state.body);
      else record = await ctx.loom.createBead(key, state.body, { timeAnchored: anchored });
      base = record.updatedAt;
      state.body = structuredClone(record.body);
      Object.assign(state, { tabConflict: null, restoredDraftAt: null, dirtyDraft: false });
      changed();
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      state.tabConflict = e.current;
    }
    await render();
  }

  /* Back to what is stored: no draft, nothing pending. A new record's form empties and goes. */
  async function revert() {
    await settleDrafts();
    await ctx.loom.discardDraft(key);
    Object.assign(state, { tabConflict: null, restoredDraftAt: null, dirtyDraft: false });
    record = await ctx.store.getRecord(key);
    changed();
    if (!record) {
      gone = true;
      ctx.navigate(`#/day/${day || ''}`);
      return;
    }
    base = record.updatedAt;
    state.body = structuredClone(record.body);
    await render();
  }

  /* After a conflict choice or an undo: reload the record, or leave if it is gone. */
  async function reload() {
    changed();
    record = await ctx.store.getRecord(key);
    if (!record) {
      gone = true;
      await ctx.loom.discardDraft(key);
      ctx.navigate('#/');
      return;
    }
    if (!state.dirtyDraft) state.body = structuredClone(record.body);
    base = state.dirtyDraft ? base : record.updatedAt;
    await render();
  }

  const tick = {
    has: (beadKey) => list(state.body.items).some((it) => it?.uri === itemUri(beadKey)),
    async toggle(beadKey, on) {
      if (gone) return;                               // discarded or deleted: a tick must not bring a draft back
      const items = list(state.body.items).filter((it) => it?.uri !== itemUri(beadKey));
      if (on) {
        const bead = await ctx.store.getRecord(beadKey);
        if (bead?.state === 'proposal') { await ctx.loom.keep(beadKey); ctx.broadcast(); }
        items.push({ uri: itemUri(beadKey) });
      }
      state.body.items = items;
      scheduleDraft();
      await render();
    },
  };
  if (type === STRAND && ctx.desk) ctx.desk.tick = tick;

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    state.error = '';
    if (action !== 'take-theirs') state.armTheirs = false;
    const refIndex = Number(button.closest('[data-ref]')?.dataset.ref);
    const itemIndex = Number(button.closest('[data-item]')?.dataset.item);
    const items = list(state.body.items);
    if (action === 'save') return save();
    if (action === 'tab-mine') return save(state.tabConflict.updatedAt);
    if (action === 'tab-theirs' || action === 'discard') return revert();
    if (action === 'delete') {
      state.confirmDelete = { strands: await ctx.loom.strandsUsing(key), onString: Boolean(record.stringId) };
      return render();
    }
    if (action === 'delete-cancel') { state.confirmDelete = null; return render(); }
    if (action === 'delete-confirm') {
      await settleDrafts();
      await ctx.loom.remove(key);
      gone = true;
      changed();
      ctx.navigate(`#/day/${record.day || ''}`);
      return;
    }
    // Flush any pending draft first: what was just typed lands in the draft before
    // these replace or discard the record, so it is never lost to the 500ms debounce.
    if (action === 'undo-delete') { await flush(); await ctx.loom.undoRemove(key); return reload(); }
    if (action === 'keep-mine') { await flush(); await keepMine(ctx.store, key); return reload(); }
    if (action === 'take-theirs') {
      if (!state.armTheirs) { state.armTheirs = true; return render(); }   // two presses: Loom's version is replaced
      state.armTheirs = false;
      await flush();
      await takeTheirs(ctx.store, key, { registry: ctx.registry, now: ctx.now });
      state.dirtyDraft = false;                    // the String's version shows; a draft stays stored, and restores next time
      return reload();
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
      state.body.items = items;
    } else if (action === 'item-down' && itemIndex < items.length - 1) {
      [items[itemIndex + 1], items[itemIndex]] = [items[itemIndex], items[itemIndex + 1]];
      state.body.items = items;
    } else if (action === 'item-remove') {
      items.splice(itemIndex, 1);
      state.body.items = items;
    } else if (action === 'photo-remove') {
      state.body.media.splice(Number(button.closest('[data-photo]').dataset.photo), 1);
      if (!state.body.media.length) delete state.body.media;
    } else return;
    scheduleDraft();
    await render();
    if (action === 'item-remove') ctx.desk?.refreshColumn?.();
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
  ctx.desk?.refreshColumn?.();
  return {
    key,
    /* Another tab, an import or a Send changed the store: show the record as it
     * is now. Unsaved edits stay on screen, and still save against the version
     * they were typed on. Nothing happens while typing is in progress. */
    async render() {
      if (saveTimer || gone) return;
      const fresh = await ctx.store.getRecord(key);
      if (!fresh) {
        if (!record) return;
        gone = true;
        root.textContent = 'This record is no longer in this browser.';
        return;
      }
      record = fresh;
      if (!state.dirtyDraft) {
        base = fresh.updatedAt;
        state.body = structuredClone(fresh.body);
      }
      await render();
    },
    flush,
    unmount() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', click);
      root.removeEventListener('change', change);
      root.removeEventListener('submit', submit);
      if (ctx.desk?.tick === tick) { ctx.desk.tick = null; ctx.desk.refreshColumn?.(); }
      return flush();
    },
  };
}
