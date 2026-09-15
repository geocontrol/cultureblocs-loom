/* Thread: the month's days and a day's string. Pure; returns html. */
import { isUnsent } from '../lib/day.js';
import { nameFromUri } from '../lib/media.js';
import { html } from './html.js';

export const KINDS = ['bloc', 'visit', 'dwell', 'encounter', 'read', 'listen', 'watch', 'screening', 'performance', 'note'];

const hhmm = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : '');

export function monthView(days, { month, today }) {
  const inMonth = days.filter((d) => d.day.startsWith(month));
  const months = [...new Set(days.map((d) => d.day.slice(0, 7)))];
  return html`
    <nav class="months">${months.map((m) => html`<a href="#/thread/${m}" class="${m === month ? 'on' : ''}">${m}</a>`)}</nav>
    <ol class="days">
      ${inMonth.length ? inMonth.map((d) => html`
        <li><a href="#/thread/${d.day}">${d.day}${d.day === today ? ' · today' : ''}</a>
          <span class="count">${d.count}</span>${d.unsent ? html`<span class="chip unsent" title="${d.unsent} not yet sent to the String">${d.unsent} unsent</span>` : ''}</li>`)
      : html`<li class="empty">Nothing on the string in ${month}.</li>`}
    </ol>`;
}

function chips(r) {
  return html`${isUnsent(r) ? html`<span class="chip unsent">unsent</span>` : ''}${
    r.invalid?.length ? html`<span class="chip invalid" title="${r.invalid.join('\n')}">invalid</span>` : ''}${
    r.missing?.length ? html`<span class="chip missing" title="${r.missing.join('\n')}">photo missing</span>` : ''}${
    (r.body.tags || []).map((t) => html`<span class="chip">${t}</span>`)}`;
}

function photos(r, urls) {
  const imgs = (r.body.media || []).map((m) => {
    const url = urls.get(nameFromUri(m?.uri));
    return url ? html`<img src="${url}" alt="${m.alt || ''}">` : '';
  });
  return imgs.some(Boolean) ? html`<div class="thumbs">${imgs}</div>` : '';
}

function bead(r, urls) {
  const b = r.body, kind = b.kind || (r.type.endsWith('annotation') ? 'annotation' : 'note');
  const proposal = r.state === 'proposal';
  const title = b.subject?.name || b.work?.title || '';
  return html`
    <li class="stop${proposal ? ' machine' : ''}" data-key="${r.key}" style="--k:var(--${kind}, var(--bloc))">
      <time>${hhmm(r.createdAt)}</time><span class="bead"></span>
      <div class="kind">${kind}</div>
      ${title ? html`<div class="title">${title}</div>` : ''}
      <div class="meta">${r.sourceApp}</div>
      ${b.note ? html`<p class="note">${b.note}</p>` : ''}
      <div class="chips">${chips(r)}</div>
      ${photos(r, urls)}
      <div class="tools">
        <a href="#/compose/${r.key}">edit</a>
        ${r.type.endsWith('bead') ? html`<a href="#/compose/new?day=${r.day}&wrap=${r.key}">tell this</a>` : ''}
        ${proposal ? html`<button data-action="keep">keep</button><button data-action="release">release</button>` : ''}
      </div>
    </li>`;
}

const dayHeader = (day) => html`<h2 class="dayhead"><a href="#/thread/${day.slice(0, 7)}">${day.slice(0, 7)}</a> / ${day}</h2>`;

export function dayView(entries, { day, urls = new Map(), reminder = null }) {
  if (!entries.length) {
    return html`${dayHeader(day)}<p class="empty">Nothing on the string for ${day}.</p>
      <p><a href="#/compose/new?day=${day}">write an entry for this day</a></p>`;
  }
  const machine = entries.some((e) => e.record.state === 'proposal' || e.members?.some((m) => m.state === 'proposal'));
  return html`
    ${dayHeader(day)}
    ${reminder ? html`<p class="reminder">${reminder}</p>` : ''}
    <ol class="string${machine ? ' has-machine' : ''}">
      ${entries.map((e) => (e.kind === 'strand'
        ? html`<li class="strand" data-key="${e.record.key}">
            <header><a href="#/compose/${e.record.key}">${e.record.body.title || 'Untitled entry'}</a>
              ${e.record.state === 'draft' ? html`<span class="chip">draft</span>` : ''}${chips(e.record)}</header>
            ${e.record.body.narrative ? html`<p class="narrative">${e.record.body.narrative}</p>` : ''}
            <ol>${e.members.map((m) => bead(m, urls))}</ol>
          </li>`
        : bead(e.record, urls)))}
    </ol>
    <p><a href="#/compose/new?day=${day}">write an entry for this day</a></p>`;
}

/* A reminder when unsent work is piling up or the last backup is old. */
export function backupReminder({ unsent, lastBackupAt, now }) {
  if (!unsent) return null;
  const days = lastBackupAt ? (now - Date.parse(lastBackupAt)) / 86_400_000 : Infinity;
  if (unsent < 20 && days < 7) return null;
  return `${unsent} record${unsent === 1 ? '' : 's'} live only in this browser${
    Number.isFinite(days) ? `, last backup ${Math.floor(days)} days ago` : ', never backed up'} — send them to the String or back up.`;
}
