/* Settings: the String's address and token, check, import, auto-sync, pull
 * from the network, backup and restore. */
import { readSyncSettings } from '../lib/autosync.js';
import { checkBackup, exportBackup, restoreBackup } from '../lib/backup.js';
import { pendingChanges } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { stringClient } from '../lib/string-client.js';
import { errorLine, surfaceErrors } from './html.js';
import { pullSummary, settingsView } from './view-panels.js';

export async function mountSettings(root, ctx) {
  const s = { check: '', importResult: '', busy: false, error: '', pullResult: '', identities: null, identitiesError: '', pullIdentity: '' };

  async function render() {
    const records = await ctx.store.allRecords();
    Object.assign(s, {
      stringUrl: await ctx.store.getMeta('stringUrl'),
      stringToken: await ctx.store.getMeta('stringToken'),
      lastImportAt: await ctx.store.getMeta('lastImportAt'),
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'),
      pending: (await pendingChanges(records)).size,
      persisted: await ctx.persisted(),
      sync: await readSyncSettings(ctx.store),
      lastAutoSync: await ctx.store.getMeta('lastAutoSync'),
    });
    root.innerHTML = String(errorLine(s.error)) + String(settingsView({ ...s, busy: s.busy || ctx.desk.busy }));
  }

  const client = () => stringClient(s.stringUrl || 'http://localhost:8100', s.stringToken, ctx.fetch);

  /* Who the String can pull for. Asked once on opening and after a check, not on every render. */
  async function loadIdentities() {
    if (!(await ctx.store.getMeta('stringUrl'))) { s.identities = null; s.identitiesError = 'Connect a String first.'; return; }
    try {
      s.identities = await client().listIdentities();
      s.identitiesError = '';
      if (!s.identities.some((i) => i.name === s.pullIdentity)) s.pullIdentity = s.identities[0]?.name || '';
    } catch (err) { s.identities = null; s.identitiesError = `Could not ask the String who it holds: ${err.message}`; }
  }

  /* Hold the desk while this writes, so a Send or an auto-sync does not run underneath it. */
  async function holding(fn) {
    if (s.busy || ctx.desk.busy) return false;
    s.busy = true;
    ctx.desk.busy = true;
    await render();
    try { await fn(); } finally { s.busy = false; ctx.desk.busy = false; ctx.desk.refresh?.(); }
    return true;
  }

  async function onClick(e) {
    const action = e.target.closest?.('button[data-action]')?.dataset.action;
    if (!action) return;
    s.error = '';
    if (action === 'check') {
      try { s.check = `a String, holding ${(await client().health()).length} record types`; }
      catch (err) { s.check = err.message; }
      await loadIdentities();
    } else if (action === 'import') {
      // A Send (or an import) still writing: the button shows disabled.
      await holding(async () => {
        try {
          const { counts, conflicts } = await runImport({ store: ctx.store, registry: ctx.registry, client: client(), now: ctx.now });
          s.importResult = `added ${counts.add}, updated ${counts.update}, unchanged ${counts.unchanged}, photos ${counts.photos}`
            + (counts.link ? `, ${counts.link} already sent from here re-linked` : '')
            + (counts.invalid ? `, ${counts.invalid} flagged invalid` : '')
            + (counts.missing ? `, ${counts.missing} photos missing` : '')
            + (conflicts.length ? ` — ${conflicts.length} changed on both sides: open them to choose` : '');
        } catch (err) { s.importResult = err.message; }
      });
      ctx.broadcast();
    } else if (action === 'pull') {
      const identity = s.pullIdentity || s.identities?.[0]?.name;
      if (!identity) return render();
      await holding(async () => {
        try {
          const out = await client().importPds(identity);
          // What the String just took in, brought here: through the change feed, so only those records are read.
          const imported = await ctx.importChanges();
          s.pullResult = pullSummary(out, imported);
        } catch (err) { s.pullResult = err.message; }
      });
      ctx.broadcast();
    } else if (action === 'sync-now') {
      const skipped = await ctx.sync?.now();
      if (skipped) s.error = `Not synced: ${skipped}.`;
    } else if (action === 'restore-confirm' && s.pendingRestore && !s.busy && !ctx.desk.busy) {
      const { doc } = s.pendingRestore;   // an import or send still writing would land in the restored store: refused while busy
      s.pendingRestore = null;
      try {
        await restoreBackup(ctx.store, doc);
      } catch (err) {
        // Checked before anything was cleared, so this is a write failing part way (e.g. a full disk).
        s.importResult = `restore failed part way: ${err.message} — this browser may hold only part of the backup; free some space and restore the same file again`;
        return render();
      }
      ctx.broadcast('restored');
      ctx.reload();
      return;
    } else if (action === 'restore-cancel') {
      s.pendingRestore = null;
    } else if (action === 'backup') {
      const doc = await exportBackup(ctx.store, ctx.now);
      ctx.download(`loom-backup-${doc.exportedAt.slice(0, 10)}.json`, JSON.stringify(doc));
      await ctx.store.setMeta('lastBackupAt', doc.exportedAt);
    }
    await render();
  }

  async function onChange(e) {
    const el = e.target;
    if (el.name === 'stringUrl' || el.name === 'stringToken') {
      if (el.name === 'stringUrl' && el.value.trim() !== s.stringUrl) await ctx.store.deleteMeta('changesCursor');   // a cursor belongs to one String
      await ctx.store.setMeta(el.name, el.value.trim());
      s[el.name] = el.value.trim();
      ctx.broadcast();
      if (el.name === 'stringUrl') await loadIdentities();
    } else if (el.name === 'autoSync' || el.name === 'sendOnSave') {
      await ctx.store.setMeta(el.name, el.checked);
      await ctx.syncSettingsChanged();
    } else if (el.name === 'syncMinutes') {
      await ctx.store.setMeta('syncMinutes', Number(el.value));
      await ctx.syncSettingsChanged();
    } else if (el.name === 'pullIdentity') {
      s.pullIdentity = el.value;
    } else if (el.dataset?.action === 'restore' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      try {
        const doc = JSON.parse(await file.text());
        checkBackup(doc);
        const here = await ctx.store.allRecords();
        s.pendingRestore = { doc, fileName: file.name, records: here.length, incoming: doc.records.length,
          unsent: (await pendingChanges(here)).size };
      } catch (err) { s.importResult = `not restored: ${err.message}`; }
      await render();
    }
  }

  const show = async (message) => { s.error = message; s.busy = false; await render(); };
  const click = surfaceErrors(onClick, show), change = surfaceErrors(onChange, show);
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  await render();
  await loadIdentities();
  await render();
  return { render, unmount() { root.removeEventListener('click', click); root.removeEventListener('change', change); } };
}
