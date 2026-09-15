/* The strand form: title, day, narrative, place, links, refs, and the beads it
 * strings together, in order. Beads are added by ticking them in the String
 * column. Pure. */
import { summary } from '../lib/day.js';
import { keyFromItemUri } from '../lib/keys.js';
import { html } from './html.js';
import { footerView, linksText, list, placeName, problemsView, provenanceView, restoredView } from './view-form.js';
import { refsView } from './view-refs.js';

const STRAND = 'com.cultureblocs.strand';
const hhmm = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : '');

/* state: { record, body, problems, members: Map key -> record, restoredDraftAt, dirtyDraft } */
export function strandFormView(state) {
  const { record = null, body, problems = [], members = new Map(), restoredDraftAt = null, dirtyDraft = false } = state;
  const items = list(body.items);
  return html`
    <form class="editor" data-type="${STRAND}">
      <header><h2>${record ? 'Strand' : 'New strand'}</h2></header>
      ${restoredView(restoredDraftAt)}
      <div class="row">
        <label>title <input name="title" value="${body.title || ''}" maxlength="300"></label>
        <label>day <input type="date" name="day" value="${typeof body.day === 'string' ? body.day.slice(0, 10) : ''}"></label>
      </div>
      <label>narrative <textarea name="text" rows="14">${body.narrative || ''}</textarea></label>
      <label>place <input name="place" value="${placeName(STRAND, body)}"></label>
      <fieldset class="items"><legend>beads in this strand</legend>
        ${items.length ? html`<ol>${items.map((it, i) => {
          const key = keyFromItemUri(it?.uri);
          const bead = key ? members.get(key) : null;
          return html`<li data-item="${i}">
            <span class="line">${bead ? `${bead.day || ''} ${hhmm(bead.createdAt)} ${bead.body?.kind || ''} ${summary(bead.type, bead.body)}` : (key ? `${key} (not in this browser)` : String(it?.uri ?? ''))}</span>
            <button type="button" data-action="item-up" aria-label="move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-action="item-down" aria-label="move down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" data-action="item-remove">remove</button></li>`;
        })}</ol>` : html`<p class="empty">No beads yet.</p>`}
        <p class="hint">Tick beads in the String column to add them.</p>
      </fieldset>
      <label>links, one per line: url | label <textarea name="links" rows="2">${linksText(body.links)}</textarea></label>
      <fieldset><legend>refs — what this is about</legend>${refsView(body.refs, body.narrative || '')}</fieldset>
      ${provenanceView(record)}
      <div class="problems-slot">${problemsView(problems)}</div>
      ${footerView({ record, problems, dirtyDraft })}
    </form>`;
}
