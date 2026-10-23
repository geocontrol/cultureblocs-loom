/* The bead form: a whole bead in one place. Pure. */
import { aboutLabel } from '../lib/day.js';
import { html } from './html.js';
import { KINDS, footerView, linksText, list, localInput, photosView, placeName, problemsView, provenanceView, restoredView } from './view-form.js';
import { refsView } from './view-refs.js';

const BEAD = 'com.cultureblocs.bead';

/* A subject that is a published record (an event or film the "I went" pages
 * pointed at) is shown, not edited: it is a reference, and the place field
 * would have nowhere to write. Any other subject is the place, as a name. */
function record_subject(body) {
  const uri = typeof body.subject?.uri === 'string' ? body.subject.uri : '';
  if (!uri.startsWith('at://')) return html`<label>place <input name="place" value="${placeName(BEAD, body)}"></label>`;
  const link = (Array.isArray(body.links) ? body.links : []).find((l) => typeof l?.uri === 'string' && /^https?:\/\//.test(l.uri));
  return html`<p class="about"><span class="label">about</span>
    <strong>${aboutLabel(body) || 'a published record'}</strong>
    ${link ? html`<a href="${link.uri}" target="_blank" rel="noopener">open</a>` : ''}
    <code class="uri" title="the record this bead points at">${uri}</code></p>`;
}

/* state: { record, body, problems, urls, restoredDraftAt, dirtyDraft, locked } — record is null for a new bead; locked renders it inert. */
export function beadFormView(state) {
  const { record = null, body, problems = [], urls = new Map(), restoredDraftAt = null, dirtyDraft = false, locked = false } = state;
  const kind = KINDS.includes(body.kind) ? body.kind : null;
  const geo = body.geo && typeof body.geo === 'object' ? body.geo : null;
  return html`
    <form class="editor" data-type="${BEAD}" ${locked ? 'inert' : ''}>
      <header>
        <h2>${record ? 'Bead' : 'New bead'}</h2>
        ${record?.state === 'proposal' ? html`<span class="chip">proposal — saving keeps it</span>` : ''}
      </header>
      ${restoredView(restoredDraftAt)}
      <div class="row">
        <label>kind <select name="kind">
          ${kind ? '' : html`<option value="" selected>${body.kind ? String(body.kind) : 'choose a kind'}</option>`}
          ${KINDS.map((k) => html`<option ${k === kind ? 'selected' : ''}>${k}</option>`)}</select></label>
        <label>when <input type="datetime-local" name="when" value="${localInput(body.createdAt)}"></label>
      </div>
      <label>note <textarea name="text" rows="6" maxlength="3000">${body.note || ''}</textarea></label>
      <div class="row">
        ${record_subject(body)}
        <label>tags, comma separated <input name="tags" value="${list(body.tags).filter((t) => typeof t === 'string').join(', ')}"></label>
      </div>
      ${geo ? html`<p class="geo">coordinates ${String(geo.lat)}, ${String(geo.lng)} (${String(geo.precision || '')}) are kept as they are</p>` : ''}
      ${photosView(body.media, urls)}
      <label>links, one per line: url | label <textarea name="links" rows="2">${linksText(body.links)}</textarea></label>
      <fieldset><legend>refs — what this is about</legend>${refsView(body.refs, body.note || '')}</fieldset>
      ${provenanceView(record)}
      <div class="problems-slot">${problemsView(problems)}</div>
      ${footerView({ record, problems, dirtyDraft, locked })}
    </form>`;
}
