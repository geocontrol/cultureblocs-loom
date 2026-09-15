/* The String column: new-entry buttons, filter, calendar, and the entry list
 * with its markers, proposal buttons and (while a strand is open) tick boxes.
 * Pure. */
import { html } from './html.js';
import { KINDS, list } from './view-form.js';

const BEAD = 'com.cultureblocs.bead';
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Kinds with a colour in loom.css. Only these reach an attribute; the colour
 * itself comes from a stylesheet rule, never an inline style (see the CSP). */
const COLOURED = [...KINDS, 'strand', 'annotation'];

export const monthLabel = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export function dayLabel(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

const CHANGE = { new: 'not sent', edit: 'changed', state: 'changed', delete: 'deleting' };

function markers(row, change) {
  const r = row.record;
  if (row.draft) return html`<span class="mark draft">draft</span>`;
  return html`${r.state === 'proposal' ? html`<span class="mark proposal">proposal</span>` : ''}${
    list(r.body?.media).length ? html`<span class="mark photo">photo</span>` : ''}${
    change ? html`<span class="mark pending">${CHANGE[change]}</span>` : ''}${
    r.conflict ? html`<span class="mark conflict">conflict</span>` : ''}${
    r.invalid?.length || r.problems?.length ? html`<span class="mark invalid">invalid</span>` : ''}${
    r.missing?.length ? html`<span class="mark missing">photo missing</span>` : ''}`;
}

function rowView(row, { pending, selectedKey, ticking, ticked, drafts }) {
  const r = row.record;
  const tickable = ticking && row.type === BEAD && !row.draft;
  return html`
    <li class="row${row.key === selectedKey ? ' on' : ''}" data-key="${row.key}" data-kind="${COLOURED.includes(row.kind) ? row.kind : 'bloc'}">
      ${tickable ? html`<input type="checkbox" data-action="tick" aria-label="in this strand" ${ticked.has(row.key) ? 'checked' : ''}>` : ''}
      <a href="#/edit/${row.key}"><span class="kind">${row.kind}</span> <span class="line">${row.line || '—'}</span></a>
      <span class="marks">${markers(row, pending.get(row.key))}${!row.draft && drafts.has(row.key) ? html`<span class="mark draft">unsaved</span>` : ''}</span>
      ${r?.state === 'proposal' ? html`<span class="tools">
        <button type="button" data-action="keep">keep</button>
        <button type="button" data-action="release">release</button></span>` : ''}
    </li>`;
}

/* state: { month, selectedDay, weeks, days, pending: Map, filter, apps, selectedKey, ticked: Set | null, today, drafts: Set } */
export function stringColumnView(state) {
  const { month, selectedDay = '', weeks = [], days = [], pending = new Map(), filter = {}, apps = [],
    selectedKey = '', ticked = null, today = '', drafts = new Set() } = state;
  const ticking = ticked !== null;
  return html`
    <div class="column">
      <div class="new">
        <a class="button primary" href="#/new/bead">+ New bead</a>
        <a class="button" href="#/new/strand">+ New strand</a>
      </div>
      <form class="filter" role="search">
        <input type="search" name="text" placeholder="filter" aria-label="filter entries" value="${filter.text || ''}">
        <select name="kind" aria-label="kind"><option value="">all kinds</option>
          ${[...KINDS, 'strand'].map((k) => html`<option ${k === filter.kind ? 'selected' : ''}>${k}</option>`)}</select>
        <select name="app" aria-label="app"><option value="">all apps</option>
          ${apps.map((a) => html`<option ${a === filter.app ? 'selected' : ''}>${a}</option>`)}</select>
      </form>
      <section class="calendar" aria-label="calendar">
        <header>
          <button type="button" data-action="month" data-by="-1" aria-label="previous month">‹</button>
          <span class="month">${monthLabel(month)}</span>
          <button type="button" data-action="month" data-by="1" aria-label="next month">›</button>
        </header>
        <table>
          <thead><tr>${WEEKDAYS.map((d) => html`<th scope="col">${d}</th>`)}</tr></thead>
          <tbody>${weeks.map((week) => html`<tr>${week.map((cell) => (cell
            ? html`<td><a href="#/day/${cell.day}" class="${[cell.count ? 'has' : '', cell.day === selectedDay ? 'on' : '', cell.day === today ? 'today' : ''].filter(Boolean).join(' ')}"
                aria-label="${dayLabel(cell.day)}${cell.count ? `, ${cell.count}` : ''}">${cell.date}</a></td>`
            : html`<td></td>`))}</tr>`)}</tbody>
        </table>
      </section>
      ${ticking ? html`<p class="ticking">Tick beads to put them in the strand you are writing.</p>` : ''}
      <ol class="entries">
        ${days.length ? days.map((d) => html`
          <li class="day" id="day-${d.day}">
            <h3><a href="#/day/${d.day}">${dayLabel(d.day)}</a></h3>
            <ol>${d.rows.map((row) => rowView(row, { pending, selectedKey, ticking, ticked: ticked || new Set(), drafts }))}</ol>
          </li>`) : html`<li class="empty">${filter.text || filter.kind || filter.app ? 'Nothing matches the filter.' : 'Nothing on your String yet. Import it from settings, or write a new bead.'}</li>`}
      </ol>
    </div>`;
}
