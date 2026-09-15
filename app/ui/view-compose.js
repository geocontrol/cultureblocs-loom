/* Compose: the editor for a strand (an entry) or a bead. Pure: html from the
 * editor state, and the reverse mapping from form fields to a record body. */
import { isAbandonable } from '../lib/envelope.js';
import { itemUri, keyFromItemUri } from '../lib/keys.js';
import { nameFromUri } from '../lib/media.js';
import { html } from './html.js';
import { KINDS } from './view-thread.js';
import { refsView } from './view-refs.js';

const STRAND = 'com.cultureblocs.strand';

const linksText = (links) => (links || []).map((l) => (l.title ? `${l.uri} | ${l.title}` : l.uri)).join('\n');

export function parseLinks(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [uri, ...title] = l.split('|');
    const link = { uri: uri.trim() };
    if (title.join('|').trim()) link.title = title.join('|').trim();
    return link;
  });
}

/* state: { record, body, problems, conflict, dayBeads, urls, restoredDraftAt, discardArmed } */
export function composeView(state) {
  const { record, body, problems = [], conflict = null, dayBeads = [], urls = new Map(),
    restoredDraftAt = null, discardArmed = false } = state;
  const isStrand = record.type === STRAND;
  const text = isStrand ? body.narrative || '' : body.note || '';
  const included = new Set((body.items || []).map((it) => keyFromItemUri(it.uri)));
  return html`
    <form class="compose" data-type="${record.type}" onsubmit="return false">
      <header>
        <h2>${isStrand ? 'Entry' : 'Bead'} · ${record.day || ''}</h2>
        <span class="state chip">${record.state}</span>
        ${record.origin === 'mint' ? html`<span class="chip" title="minted ${record.createdAt}">mint fact</span>` : ''}
      </header>
      ${restoredDraftAt ? html`<p class="restored">restored an unsaved draft from ${restoredDraftAt.replace('T', ' ').slice(0, 16)}</p>` : ''}
      ${conflict ? html`<div class="conflict">Another tab saved this ${conflict.updatedAt}.
        <button type="button" data-action="take-theirs">use theirs</button>
        <button type="button" data-action="keep-mine">keep mine</button></div>` : ''}
      ${isStrand ? html`
        <label>title <input name="title" value="${body.title || ''}" maxlength="300"></label>
        <label>day <input type="date" name="day" value="${(body.day || '').slice(0, 10)}"></label>`
      : html`
        <label>kind <select name="kind">${KINDS.map((k) => html`<option ${k === body.kind ? 'selected' : ''}>${k}</option>`)}</select></label>`}
      <label>place <input name="place" value="${(isStrand ? body.place?.name : body.subject?.name) || ''}"></label>
      <label>${isStrand ? 'narrative' : 'note'}
        <textarea name="text" rows="${isStrand ? 14 : 5}">${text}</textarea></label>
      <label>links, one per line: url | label <textarea name="links" rows="2">${linksText(body.links)}</textarea></label>
      ${isStrand ? html`
        <fieldset class="items"><legend>beads in this entry</legend>
          <ol>${(body.items || []).map((it, i) => {
            const key = keyFromItemUri(it.uri);
            const bead = dayBeads.find((b) => b.key === key);
            return html`<li data-item="${i}">${bead ? `${bead.createdAt.slice(11, 16)} ${bead.body.kind} ${bead.body.note || ''}`.slice(0, 80) : it.uri}
              <button type="button" data-action="item-up">↑</button><button type="button" data-action="item-down">↓</button>
              <button type="button" data-action="item-remove">remove</button></li>`;
          })}</ol>
          <ul class="candidates">${dayBeads.filter((b) => !included.has(b.key)).map((b) => html`
            <li data-bead="${b.key}">${b.createdAt.slice(11, 16)} ${b.body.kind} ${(b.body.note || '').slice(0, 60)}
              ${b.state === 'proposal' ? html`<span class="chip">proposal</span>` : ''}
              <button type="button" data-action="item-add">${b.state === 'proposal' ? 'keep and include' : 'include'}</button></li>`)}</ul>
        </fieldset>`
      : html`
        <fieldset class="photos"><legend>photos</legend>
          <div class="thumbs">${(body.media || []).map((m, i) => html`
            <figure data-photo="${i}">${urls.get(nameFromUri(m.uri)) ? html`<img src="${urls.get(nameFromUri(m.uri))}" alt="">` : ''}
              <input name="alt-${i}" placeholder="what it shows" value="${m.alt || ''}">
              <button type="button" data-action="photo-remove">remove</button></figure>`)}</div>
          <input type="file" accept="image/*" multiple data-action="photo-add">
        </fieldset>`}
      <fieldset><legend>refs — what this is about</legend>${refsView(body.refs, text)}</fieldset>
      <div class="problems-slot">${problemsView(problems)}</div>
      <footer>
        <button type="button" class="primary" data-action="save" ${problems.length ? 'disabled' : ''}>save</button>
        ${isStrand && record.state === 'draft' ? html`<button type="button" data-action="finish" ${problems.length ? 'disabled' : ''}>save as told</button>` : ''}
        ${isAbandonable(record)
          ? html`<button type="button" data-action="discard">${discardArmed ? 'discard this draft? press again to delete it' : 'discard this draft'}</button>`
          : html`<button type="button" data-action="discard">discard changes</button>`}
        <a href="#/thread/${record.day || ''}">back to the day</a>
      </footer>
    </form>`;
}

/* Records Compose does not edit in Phase 1: annotations (the AR app owns them)
 * and other imported types, and released proposals awaiting sync. */
export function readOnlyView(record) {
  const b = record.body || {};
  const why = record.state === 'released'
    ? 'You released this proposal. It stays in this browser only until sync (Phase 2) tells the String.'
    : `${record.type.endsWith('annotation') ? 'Annotations arrive from the AR app' : 'Records of this type arrive from other apps'}; they are read-only in Loom for now.`;
  return html`
    <section class="readonly">
      <h2>${record.type.split('.').pop()} · ${record.day || ''}</h2>
      <p>${why}</p>
      ${typeof b.note === 'string' ? html`<p class="note">${b.note}</p>` : ''}
      <p><a href="#/thread/${record.day || ''}">back to the day</a></p>
    </section>`;
}

export const problemsView = (problems) =>
  html`${problems.length ? html`<ul class="problems">${problems.map((p) => html`<li>${p}</li>`)}</ul>` : ''}`;

/* Form values -> a new body, from the previous body. Refs are handled by the
 * controller (they carry anchors), so they pass through here. */
export function bodyFromFields(type, prev, f) {
  const body = { ...prev };
  const set = (k, v) => { if (v) body[k] = v; else delete body[k]; };
  const text = String(f.text ?? '');
  const place = String(f.place ?? '').trim();
  set('links', parseLinks(f.links).length ? parseLinks(f.links) : null);
  if (type === STRAND) {
    set('title', String(f.title ?? '').trim());
    if (f.day) body.day = `${f.day}T00:00:00Z`;
    set('narrative', text);
    set('place', place ? { ...(prev.place || {}), name: place } : null);
  } else {
    if (f.kind) body.kind = f.kind;
    set('note', text);
    set('subject', place ? { ...(prev.subject || {}), name: place } : (prev.subject && !prev.subject.name ? prev.subject : null));
    if (Array.isArray(prev.media)) body.media = prev.media.map((m, i) => {
      const alt = String(f[`alt-${i}`] ?? m.alt ?? '').trim();
      const { alt: _, ...rest } = m;
      return alt ? { ...rest, alt } : rest;
    });
  }
  return body;
}

export { itemUri };
