/* The smaller surfaces: the day summary, the delete confirmation, the
 * conflict view, the top bar with Send's results, and settings. Pure. */
import { summary } from '../lib/day.js';
import { html } from './html.js';
import { hhmm } from './view-form.js';
import { dayLabel } from './view-string.js';

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : 'never');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/* A record's words, cut to fit one line. */
const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/* The editor column when no entry is open: the selected day at a glance. */
export function dayView({ day, records = [] }) {
  return html`
    <section class="dayview">
      <h2>${dayLabel(day)}</h2>
      ${records.length ? html`<ul>${records.map((r) => html`
        <li><a href="#/edit/${r.key}">${hhmm(r.createdAt)} ${r.type.endsWith('strand') ? 'strand' : r.body?.kind || ''} — ${summary(r.type, r.body) || '—'}</a></li>`)}</ul>`
        : html`<p class="empty">Nothing on your String for this day.</p>`}
      <p><a class="button" href="#/new/bead?day=${day}">+ New bead on this day</a>
        <a class="button" href="#/new/strand?day=${day}">+ New strand for this day</a></p>
    </section>`;
}

/* state: { record, strands: [record], onString: bool } */
export function deleteView({ record, strands = [], onString = false }) {
  const what = record.type.endsWith('strand') ? 'strand' : 'bead';
  return html`
    <div class="confirm" role="alertdialog" aria-label="confirm delete">
      <p>Delete this ${record.state === 'proposal' ? 'proposal' : what}${summary(record.type, record.body) ? html` — “${short(summary(record.type, record.body))}”` : ''}?
        ${onString ? 'It is deleted from the String on the next Send; until then you can undo it from Send.' : 'It is only in this browser, so it is gone at once.'}</p>
      ${strands.length ? html`<p>It is taken out of ${plural(strands.length, 'strand')}:</p>
        <ul>${strands.map((s) => html`<li>${short(summary(s.type, s.body))}</li>`)}</ul>` : ''}
      <button type="button" class="danger" data-action="delete-confirm">delete</button>
      <button type="button" data-action="delete-cancel">cancel</button>
    </div>`;
}

/* A record deleted here that Send has not deleted on the String yet. */
export function deletedView(record) {
  return html`
    <section class="deleted">
      <h2>Deleted</h2>
      <p>“${short(summary(record.type, record.body) || record.key)}” is deleted here, and from the String on the next Send.</p>
      <button type="button" data-action="undo-delete">undo delete</button>
    </section>`;
}

const shown = (v) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v, null, 1));

/* state: { fields: [{ field, mine, theirs }], theirs: bool, deleted: bool, armed: bool } — `armed` after a first press on take-theirs */
export function conflictView({ fields = [], theirs = true, deleted = false, armed = false }) {
  return html`
    <section class="conflict" role="alert">
      <h3>Changed here and on the String</h3>
      ${!theirs ? html`<p>The String no longer has this record.${deleted ? ' You deleted it here too.' : ''}</p>`
        : deleted ? html`<p>You deleted this here, but it changed on the String since you last saw it.</p>` : ''}
      ${theirs && fields.length ? html`<table>
        <thead><tr><th scope="col">field</th><th scope="col">yours</th><th scope="col">the String’s</th></tr></thead>
        <tbody>${fields.map((f) => html`<tr><th scope="row">${f.field}</th><td><pre>${shown(f.mine)}</pre></td><td><pre>${shown(f.theirs)}</pre></td></tr>`)}</tbody>
      </table>` : ''}
      <button type="button" data-action="keep-mine">${!theirs && deleted ? 'let it go' : !theirs ? 'keep mine (send it again)' : deleted ? 'delete it anyway' : 'keep mine'}</button>
      ${!theirs && deleted ? '' : html`<button type="button" data-action="take-theirs">${armed ? 'press again: yours is replaced' : !theirs ? 'let it go' : 'take the String’s'}</button>`}
    </section>`;
}

/* state: { pending, connected, busy } */
export function topbarView({ pending = 0, connected = false, busy = false }) {
  return html`
    <a class="brand" href="#/">LOOM</a>
    <span class="status">${!connected ? html`<a href="#/settings">not connected</a>`
      : pending ? html`<a href="#/send">${plural(pending, 'change')} to send</a>` : 'in sync'}</span>
    ${connected ? html`<button type="button" class="primary" data-action="send" ${busy || !pending ? 'disabled' : ''}>${busy ? 'sending…' : 'send'}</button>` : ''}
    <a class="settings" href="#/settings">settings</a>`;
}

const RESULT = { sent: 'sent', held: 'held', conflict: 'conflict', invalid: 'refused', failed: 'failed' };
const OPS = { post: 'new', patch: 'edit', state: 'state', delete: 'delete' };

/* The Send page: what is waiting, the last results, and deletes that can still be undone.
 * state: { changes: [{ key, change, line }], results: [{ key, op, status, reason, problems }], deletes: [{ key, line }], lines: Map key -> words } */
export function sendView({ changes = [], results = [], deletes = [], lines = new Map(), busy = false, connected = false }) {
  const line = (key) => short(lines.get(key) || key);
  return html`
    <section class="send">
      <h2>Send</h2>
      ${connected ? '' : html`<p>Set the String’s address and token in <a href="#/settings">settings</a> first.</p>`}
      ${changes.length ? html`<ul class="changes">${changes.map((c) => html`<li><a href="#/edit/${c.key}">${c.change} — ${line(c.key)}</a></li>`)}</ul>`
        : html`<p class="empty">Nothing waiting to be sent.</p>`}
      ${deletes.length ? html`<h3>Deletes not yet sent</h3><ul>${deletes.map((d) => html`
        <li data-key="${d.key}">${line(d.key)} <button type="button" data-action="undo-delete">undo delete</button></li>`)}</ul>` : ''}
      <button type="button" class="primary" data-action="send" ${busy || !changes.length || !connected ? 'disabled' : ''}>${busy ? 'sending…' : 'send'}</button>
      ${results.length ? html`<h3>Last send</h3><ul class="results">${results.map((r) => html`
        <li class="${r.status}"><a href="#/edit/${r.key}">${RESULT[r.status] || r.status}${r.op ? ` (${OPS[r.op]})` : ''}: ${line(r.key)}</a>${
          r.reason ? ` — ${r.reason}` : ''}${r.problems?.length ? ` — ${r.problems.join('; ')}` : ''}</li>`)}</ul>` : ''}
    </section>`;
}

/* state: { stringUrl, stringToken, check, importResult, lastImportAt, lastBackupAt, busy, pendingRestore, persisted, pending } */
export function settingsView(s) {
  return html`
    <section class="panel">
      <h2>Settings</h2>
      <h3>String</h3>
      <label>URL <input name="stringUrl" value="${s.stringUrl || 'http://localhost:8100'}"></label>
      <label>token <input name="stringToken" type="password" value="${s.stringToken || ''}" autocomplete="off"></label>
      <div class="row"><button type="button" data-action="check">check</button>
        <span class="status">${s.check || ''}</span></div>

      <h3>Import</h3>
      <p>Copies the String's records and photos into this browser. Re-run any time;
        records changed on both sides are marked as conflicts for you to choose.</p>
      <button type="button" data-action="import" ${s.busy ? 'disabled' : ''}>import</button>
      <span class="status">last import: ${when(s.lastImportAt)}</span>
      ${s.importResult ? html`<p class="result">${s.importResult}</p>` : ''}

      <h3>Backup</h3>
      <p>Everything in this browser in one file (not the token). Last backup: ${when(s.lastBackupAt)}.
        ${s.pending ? html`${plural(s.pending, 'change')} not yet sent to the String live only here.` : ''}</p>
      <button type="button" data-action="backup">download backup</button>
      <label class="file">restore from a backup <input type="file" accept="application/json" data-action="restore"></label>
      ${s.pendingRestore ? html`<div class="confirm" role="alertdialog" aria-label="confirm restore">
        <p>Restoring ${s.pendingRestore.fileName || 'this file'} replaces ${plural(s.pendingRestore.records, 'record')} in this browser (${s.pendingRestore.unsent} not yet sent to the String) with the file's ${s.pendingRestore.incoming}.
          Anything not in the file is gone for good.</p>
        <button type="button" data-action="backup">download a backup first</button>
        <button type="button" data-action="restore-confirm" ${s.busy ? 'disabled' : ''}>replace with the file</button>
        <button type="button" data-action="restore-cancel">cancel</button>
      </div>` : ''}

      <h3>This browser</h3>
      <p>${s.persisted ? 'Storage is persistent.' : 'Storage is not marked persistent: the browser may clear it under pressure. Back up.'}</p>
    </section>`;
}
