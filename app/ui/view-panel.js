/* The String panel: settings, import, send, backup. Pure; returns html. */
import { html } from './html.js';

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : 'never');

export function panelView(s) {
  return html`
    <section class="panel">
      <h2>String</h2>
      <label>URL <input name="stringUrl" value="${s.stringUrl || 'http://localhost:8100'}"></label>
      <label>token <input name="stringToken" type="password" value="${s.stringToken || ''}" autocomplete="off"></label>
      <div class="row"><button type="button" data-action="check">check</button>
        <span class="status">${s.check || ''}</span></div>

      <h3>Import</h3>
      <p>Copies the String's records and photos into this browser. Re-run any time;
        records changed on both sides are left alone and listed.</p>
      <button type="button" data-action="import" ${s.busy ? 'disabled' : ''}>import</button>
      <span class="status">last import: ${when(s.lastImportAt)}</span>
      ${s.importResult ? html`<p class="result">${s.importResult}</p>` : ''}

      <h3>Send</h3>
      <p>${s.unsent} Loom-made record${s.unsent === 1 ? '' : 's'} not yet on the String.
        ${s.drafts ? html`${s.drafts} draft${s.drafts === 1 ? '' : 's'} not sent (drafts stay here until saved as told).` : ''}
        ${s.localChanges ? html`${s.localChanges} local change${s.localChanges === 1 ? '' : 's'} to records already there wait for sync (Phase 2).` : ''}</p>
      <button type="button" data-action="send" ${s.busy || !s.sendable ? 'disabled' : ''}>send</button>
      ${s.sendResults?.length ? html`<ul class="result">${s.sendResults.map((r) => html`<li>${r.status}: ${r.key}${r.reason ? ` — ${r.reason}` : ''}${r.problems ? ` — ${r.problems.join('; ')}` : ''}</li>`)}</ul>` : ''}

      <h3>Backup</h3>
      <p>Everything in this browser in one file (not the token). Last backup: ${when(s.lastBackupAt)}.</p>
      <button type="button" data-action="backup">download backup</button>
      <label class="file">restore from a backup <input type="file" accept="application/json" data-action="restore"></label>
      ${s.pendingRestore ? html`<div class="confirm" role="alertdialog" aria-label="confirm restore">
        <p>Restoring ${s.pendingRestore.fileName || 'this file'} replaces ${s.pendingRestore.records} record${s.pendingRestore.records === 1 ? '' : 's'} in this browser (${s.pendingRestore.unsent} not yet sent to the String) with the file's ${s.pendingRestore.incoming}.
          Anything not in the file is gone for good.</p>
        <button type="button" data-action="backup">download a backup first</button>
        <button type="button" data-action="restore-confirm">replace with the file</button>
        <button type="button" data-action="restore-cancel">cancel</button>
      </div>` : ''}

      <h3>This browser</h3>
      <p>${s.persisted ? 'Storage is persistent.' : 'Storage is not marked persistent: the browser may clear it under pressure. Back up.'}</p>
      <label>posture <select name="posture">${['auto', 'desk', 'totem'].map((p) => html`<option ${p === (s.posture || 'auto') ? 'selected' : ''}>${p}</option>`)}</select></label>
    </section>`;
}
