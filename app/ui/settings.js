/* Settings: the String's address and token, check, import, backup and restore. */
import { checkBackup, exportBackup, restoreBackup } from '../lib/backup.js';
import { pendingChanges } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { stringClient } from '../lib/string-client.js';
import { errorLine, surfaceErrors } from './html.js';
import { settingsView } from './view-panels.js';

export async function mountSettings(root, ctx) {
  const s = { check: '', importResult: '', busy: false, error: '' };

  async function render() {
    const records = await ctx.store.allRecords();
    Object.assign(s, {
      stringUrl: await ctx.store.getMeta('stringUrl'),
      stringToken: await ctx.store.getMeta('stringToken'),
      lastImportAt: await ctx.store.getMeta('lastImportAt'),
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'),
      pending: (await pendingChanges(records)).size,
      persisted: await ctx.persisted(),
    });
    root.innerHTML = String(errorLine(s.error)) + String(settingsView({ ...s, busy: s.busy || ctx.desk.busy }));
  }

  const client = () => stringClient(s.stringUrl || 'http://localhost:8100', s.stringToken, ctx.fetch);

  async function onClick(e) {
    const action = e.target.closest?.('button[data-action]')?.dataset.action;
    if (!action) return;
    s.error = '';
    if (action === 'check') {
      try { s.check = `a String, holding ${(await client().health()).length} record types`; }
      catch (err) { s.check = err.message; }
    } else if (action === 'import') {
      s.busy = true;
      await render();
      try {
        const { counts, conflicts } = await runImport({ store: ctx.store, registry: ctx.registry, client: client(), now: ctx.now });
        s.importResult = `added ${counts.add}, updated ${counts.update}, unchanged ${counts.unchanged}, photos ${counts.photos}`
          + (counts.link ? `, ${counts.link} already sent from here re-linked` : '')
          + (counts.invalid ? `, ${counts.invalid} flagged invalid` : '')
          + (counts.missing ? `, ${counts.missing} photos missing` : '')
          + (conflicts.length ? ` — ${conflicts.length} changed on both sides: open them to choose` : '');
      } catch (err) { s.importResult = err.message; }
      finally { s.busy = false; }
      ctx.broadcast();
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
      await ctx.store.setMeta(el.name, el.value.trim());
      s[el.name] = el.value.trim();
      ctx.broadcast();
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
  return { render, unmount() { root.removeEventListener('click', click); root.removeEventListener('change', change); } };
}
