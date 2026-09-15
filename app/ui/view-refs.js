/* The refs editor: one row per ref, and what the strip would publish. Pure. */
import { stripRef } from '../vendor/strip.js';
import { anchoredText } from '../lib/anchors.js';
import { html } from './html.js';

export const REF_TYPES = ['work', 'person', 'event', 'venue', 'concept'];

/* What happens to this ref when its entry is published, in words. */
export function publishHint(ref) {
  const out = stripRef(ref);
  if (!out) {
    if (!ref?.descriptor?.label) return 'needs a label';
    return 'stays local: a person needs a DID or an authority id (wikidata, viaf, isni, orcid, musicbrainz, discogs, ipi)';
  }
  const notes = [];
  if (ref.descriptor?.creator && !out.descriptor.creator) notes.push('creator stays local until the work is identified');
  const dropped = (ref.externalIds || []).length - (out.externalIds || []).length;
  if (dropped > 0) notes.push(`${dropped} id${dropped === 1 ? '' : 's'} stay${dropped === 1 ? 's' : ''} local`);
  if (ref.did && !out.did) notes.push('the DID is not well-formed');
  return notes.length ? `publishes, but ${notes.join('; ')}` : 'publishes as shown';
}

const idsText = (ids) => (ids || []).map((e) => `${e.scheme}:${e.id}`).join('\n');

export function refsView(refs, text) {
  return html`
    <div class="refs">
      ${(Array.isArray(refs) ? refs : []).map((ref, i) => {
        const d = ref?.descriptor || {};
        ref = ref || {};
        const covered = ref.index ? anchoredText(text || '', ref.index) : null;
        return html`
        <fieldset class="ref" data-ref="${i}">
          <div class="row">
            <label>type <input name="type" list="ref-types" value="${ref.type || ''}"></label>
            <label>role <select name="role">
              <option ${ref.role !== 'mention' ? 'selected' : ''}>subject</option>
              <option ${ref.role === 'mention' ? 'selected' : ''}>mention</option></select></label>
            <label>label <input name="label" value="${d.label || ''}"></label>
          </div>
          <div class="row">
            <label>creator <input name="creator" value="${d.creator || ''}"></label>
            <label>creator DID <input name="creatorDid" value="${d.creatorDid || ''}"></label>
            <label>date <input name="date" value="${d.date || ''}"></label>
            <label>DID <input name="did" value="${ref.did || ''}"></label>
          </div>
          <label>ids, one per line as scheme:id <textarea name="externalIds" rows="2">${idsText(ref.externalIds)}</textarea></label>
          <div class="row anchor">
            ${covered ? html`anchored to “${covered}” <button type="button" data-action="clear-anchor">clear anchor</button>`
              : html`<button type="button" data-action="anchor">anchor to selected text</button>`}
            <button type="button" data-action="remove-ref">remove</button>
          </div>
          <p class="hint" data-hint="${i}">${publishHint(ref)}</p>
        </fieldset>`;
      })}
      <datalist id="ref-types">${REF_TYPES.map((t) => html`<option value="${t}">`)}</datalist>
      <button type="button" data-action="add-ref">add a ref</button>
    </div>`;
}

/* Read one ref row's inputs back into a ref, keeping its anchor. */
export function refFromFields(fields, previous = {}) {
  const trim = (v) => String(v ?? '').trim();
  const ref = { type: trim(fields.type) || 'work', role: fields.role === 'mention' ? 'mention' : 'subject',
    descriptor: { label: trim(fields.label) } };
  for (const k of ['creator', 'creatorDid', 'date']) if (trim(fields[k])) ref.descriptor[k] = trim(fields[k]);
  if (trim(fields.did)) ref.did = trim(fields.did);
  const ids = String(fields.externalIds ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? { scheme: l.slice(0, i).trim(), id: l.slice(i + 1).trim() } : null;
  }).filter((e) => e && e.id);
  if (ids.length) ref.externalIds = ids;
  if (previous.index) ref.index = previous.index;
  return ref;
}
