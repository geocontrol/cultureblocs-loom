/* What the bead and strand forms share: links, photos, provenance, problems,
 * the footer, the read-only view, date conversions, and the mapping from
 * form fields back to a record body. Pure. */
import { nameFromUri } from '../lib/media.js';
import { html } from './html.js';

const STRAND = 'com.cultureblocs.strand';
export const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const str = (v) => (typeof v === 'string' ? v : '');

export const KINDS = ['bloc', 'visit', 'dwell', 'encounter', 'read', 'listen', 'watch', 'screening', 'performance', 'note'];

/* A datetime as a datetime-local input shows it (this browser's time zone), and back. */
export function localInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  const d = new Date(String(value || ''));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const linksText = (links) => list(links).filter((l) => l && typeof l === 'object')
  .map((l) => (l.title ? `${l.uri} | ${l.title}` : l.uri)).join('\n');

export function parseLinks(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [uri, ...title] = l.split('|');
    const link = { uri: uri.trim() };
    if (title.join('|').trim()) link.title = title.join('|').trim();
    return link;
  });
}

export const parseTags = (text) => String(text ?? '').split(',').map((t) => t.trim()).filter(Boolean);

export function photosView(media, urls = new Map()) {
  return html`
    <fieldset class="photos"><legend>photos</legend>
      <div class="thumbs">${list(media).map((m, i) => html`
        <figure data-photo="${i}">${urls.get(nameFromUri(m?.uri)) ? html`<img src="${urls.get(nameFromUri(m?.uri))}" alt="">` : html`<span class="nophoto">not in this browser</span>`}
          <label>alt text <input name="alt-${i}" placeholder="what it shows" value="${m?.alt || ''}"></label>
          <button type="button" data-action="photo-remove">remove</button></figure>`)}</div>
      <input type="file" accept="image/*" multiple data-action="photo-add" aria-label="add photos">
    </fieldset>`;
}

const when = (iso) => (typeof iso === 'string' ? iso.replace('T', ' ').slice(0, 16) : '');

export function provenanceView(record) {
  if (!record) return html`<p class="provenance">made in Loom when you save it</p>`;
  const p = record.body?.provenance || {};
  return html`<p class="provenance">made in ${p.app || record.sourceApp || 'an unknown app'}${
    p.mintedAt ? html` · ${when(p.mintedAt)}` : ''}${record.stringId ? ' · on the String' : ' · only in this browser'}</p>`;
}

export const problemsView = (problems = []) =>
  html`${problems.length ? html`<ul class="problems">${problems.map((p) => html`<li>${p}</li>`)}</ul>` : ''}`;

/* state: { record, problems, dirtyDraft, confirmDelete } */
export function footerView({ record = null, problems = [], dirtyDraft = false }) {
  return html`
    <footer>
      <button type="button" class="primary" data-action="save" ${problems.length ? 'disabled' : ''}>save</button>
      ${dirtyDraft ? html`<button type="button" data-action="discard">${record ? 'discard changes' : 'discard this draft'}</button>` : ''}
      ${record ? html`<button type="button" class="danger" data-action="delete">delete</button>` : ''}
    </footer>`;
}

/* Records Loom does not edit: annotations (the AR app owns them) and types it does not know. */
export function readOnlyView(record) {
  const b = record.body || {};
  return html`
    <section class="readonly">
      <h2>${record.type.split('.').pop()} · ${record.day || ''}</h2>
      <p>${record.type.endsWith('annotation') ? 'Annotations arrive from the AR app' : 'Records of this type arrive from other apps'}; they are read-only in Loom.</p>
      ${typeof b.note === 'string' ? html`<p class="note">${b.note}</p>` : ''}
    </section>`;
}

export const restoredView = (at) =>
  html`${at ? html`<p class="restored">restored an unsaved draft from ${when(at)}</p>` : ''}`;

/* Form values -> a new body, from the previous body. Refs and photos are the
 * controller's (anchors, files); alt text is read here. */
export function bodyFromFields(type, prev, f) {
  const body = { ...prev };
  const set = (k, v) => { if (v) body[k] = v; else delete body[k]; };
  /* A place with the name typed; without one, whatever else it held (a DID, coordinates), or nothing. */
  const withName = (placeRef, name) => {
    const { name: _, ...rest } = placeRef && typeof placeRef === 'object' ? placeRef : {};
    return name ? { ...rest, name } : (Object.keys(rest).length ? rest : null);
  };
  const text = String(f.text ?? '');
  const place = String(f.place ?? '').trim();
  const links = parseLinks(f.links);
  set('links', links.length ? links : null);
  if (type === STRAND) {
    set('title', String(f.title ?? '').trim());
    if (f.day) body.day = `${f.day}T00:00:00Z`;
    set('narrative', text);
    set('place', withName(prev.place, place));
  } else {
    if (f.kind) body.kind = f.kind;
    if (f.when !== undefined) {
      const at = fromLocalInput(f.when);
      if (at) body.createdAt = at;
    }
    set('note', text);
    const tags = parseTags(f.tags);
    set('tags', tags.length ? tags : null);
    if (!prev.subject?.uri) set('subject', withName(prev.subject, place));   // a subject with a uri is a record, not a place
  }
  if (Array.isArray(prev.media)) {
    const media = prev.media.map((m, i) => {
      const alt = String(f[`alt-${i}`] ?? m?.alt ?? '').trim();
      const { alt: _, ...rest } = m || {};
      return alt ? { ...rest, alt } : rest;
    });
    set('media', media.length ? media : null);
  }
  return body;
}

export const placeName = (type, body) => str(type === STRAND ? body?.place?.name : body?.subject?.name);
