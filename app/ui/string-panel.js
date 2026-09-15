/* String panel controller: settings, check, import, send, backup, restore. */
import { contentHash } from '../vendor/strip.js';
import { checkBackup, exportBackup, restoreBackup } from '../lib/backup.js';
import { isLoomOnly, isUnsent } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { planSend, runSend } from '../lib/sender.js';
import { stringClient } from '../lib/string-client.js';
import { errorLine, surfaceErrors } from './html.js';
import { panelView } from './view-panel.js';

/* Records on the String whose body or state differ from what was last imported
 * or sent — the same test import uses, so sent, linked and released records
 * count exactly when import would call them changed in Loom. */
export async function localChangeCount(records) {
  let n = 0;
  for (const r of records) {
    if (!r.stringId) continue;
    if ((await contentHash(r.body)) !== r.importedHash || r.state !== r.importedState) n += 1;
  }
  return n;
}

export async function mountPanel(root, ctx) {
  const s = { check: '', importResult: '', sendResults: [], busy: false, error: '' };

  async function render() {
    const records = await ctx.store.allRecords();
    Object.assign(s, {
      stringUrl: await ctx.store.getMeta('stringUrl'),
      stringToken: await ctx.store.getMeta('stringToken'),
      lastImportAt: await ctx.store.getMeta('lastImportAt'),
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'),
      posture: await ctx.store.getMeta('posture'),
      unsent: records.filter(isUnsent).length,
      drafts: records.filter((r) => isLoomOnly(r) && r.state === 'draft').length,
      sendable: planSend(records).ready.length,
      localChanges: await localChangeCount(records),
      persisted: await ctx.persisted(),
    });
    root.innerHTML = String(errorLine(s.error)) + String(panelView(s));
  }

  const client = () => stringClient(s.stringUrl || 'http://localhost:8100', s.stringToken, ctx.fetch);

  async function busy(fn) {
    s.busy = true;
    await render();
    try { await fn(); } finally { s.busy = false; await render(); }
  }

  async function onClick(e) {
    const action = e.target.closest?.('button[data-action]')?.dataset.action;
    if (action) s.error = '';
    if (action === 'check') {
      try { s.check = `a String, holding ${(await client().health()).length} record types`; }
      catch (err) { s.check = err.message; }
      await render();
    } else if (action === 'import') {
      await busy(async () => {
        try {
          const { counts, conflicts } = await runImport({ store: ctx.store, registry: ctx.registry, client: client(), now: ctx.now });
          s.importResult = `added ${counts.add}, updated ${counts.update}, unchanged ${counts.unchanged}, photos ${counts.photos}`
            + (counts.link ? `, ${counts.link} already sent from here re-linked` : '')
            + (counts.invalid ? `, ${counts.invalid} flagged invalid` : '')
            + (counts.missing ? `, ${counts.missing} photos missing` : '')
            + (conflicts.length ? ` — changed on both sides, left alone: ${conflicts.join(', ')}` : '');
        } catch (err) { s.importResult = err.message; }
        ctx.broadcast();
      });
    } else if (action === 'send') {
      await busy(async () => {
        try { s.sendResults = await runSend({ store: ctx.store, client: client(), now: ctx.now }); }
        catch (err) { s.sendResults = [{ key: '', status: 'failed', reason: err.message }]; }
        ctx.broadcast();
      });
    } else if (action === 'restore-confirm' && s.pendingRestore && !s.busy) {   // an import or send still writing would land in the restored store
      const { doc } = s.pendingRestore;
      s.pendingRestore = null;
      try {
        await restoreBackup(ctx.store, doc);
      } catch (err) {
        // Checked before anything was cleared, so this is a write failing part way (e.g. a full disk):
        // this browser may now hold only part of the file. The file itself is untouched.
        s.importResult = `restore failed part way: ${err.message} — this browser may hold only part of the backup; free some space and restore the same file again`;
        await render();
        return;
      }
      ctx.broadcast('restored');
      ctx.reload();   // every tab reloads onto the restored store
    } else if (action === 'restore-cancel') {
      s.pendingRestore = null;
      await render();
    } else if (action === 'backup') {
      const doc = await exportBackup(ctx.store, ctx.now);
      ctx.download(`loom-backup-${doc.exportedAt.slice(0, 10)}.json`, JSON.stringify(doc));
      await ctx.store.setMeta('lastBackupAt', doc.exportedAt);
      await render();
    }
  }

  async function onChange(e) {
    const el = e.target;
    if (el.name === 'stringUrl' || el.name === 'stringToken' || el.name === 'posture') {
      await ctx.store.setMeta(el.name, el.value.trim());
      s[el.name] = el.value.trim();
      if (el.name === 'posture') ctx.applyPosture();
    } else if (el.dataset?.action === 'restore' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      try {
        const doc = JSON.parse(await file.text());
        checkBackup(doc);
        const here = await ctx.store.allRecords();
        s.pendingRestore = { doc, fileName: file.name, records: here.length, incoming: doc.records.length,
          unsent: here.filter(isLoomOnly).length };
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
