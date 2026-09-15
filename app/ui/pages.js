/* The top bar, the Send page and the day page. One Send runs at a time for the
 * whole tab: its state and last results live on `ctx.desk`, so the top bar and
 * the Send page show the same thing. */
import { pendingChanges, summary } from '../lib/day.js';
import { runSend } from '../lib/sender.js';
import { stringClient } from '../lib/string-client.js';
import { errorLine, html, surfaceErrors } from './html.js';
import { dayView, sendView, topbarView } from './view-panels.js';

const WORDS = { new: 'new', edit: 'edit', state: 'keep', delete: 'delete' };

/* Send everything waiting, once; the results land on ctx.desk.results. */
export async function sendAll(ctx) {
  if (ctx.desk.busy) return ctx.desk.results;
  ctx.desk.busy = true;
  ctx.desk.refresh?.();
  try {
    const client = stringClient(await ctx.store.getMeta('stringUrl'), await ctx.store.getMeta('stringToken'), ctx.fetch);
    ctx.desk.results = await runSend({ store: ctx.store, client, now: ctx.now });
  } catch (err) {
    ctx.desk.results = [{ key: '', status: 'failed', reason: err.message }];
  } finally {
    ctx.desk.busy = false;
    ctx.broadcast();
    ctx.desk.refresh?.();
  }
  return ctx.desk.results;
}

const connected = async (ctx) => Boolean(await ctx.store.getMeta('stringUrl'));

export async function mountTopbar(root, ctx) {
  async function render() {
    const pending = (await pendingChanges(await ctx.store.allRecords())).size;
    root.innerHTML = String(topbarView({ pending, connected: await connected(ctx), busy: ctx.desk.busy }));
  }
  const click = surfaceErrors(async (e) => {
    if (e.target.closest?.('button[data-action="send"]')) {
      ctx.navigate('#/send');
      await sendAll(ctx);
    }
  }, async (message) => { root.innerHTML = String(errorLine(message)); });
  root.addEventListener('click', click);
  await render();
  return { render, unmount: () => root.removeEventListener('click', click) };
}

export async function mountSend(root, ctx) {
  let error = '';
  async function render() {
    const records = await ctx.store.allRecords();
    const lines = new Map(records.map((r) => [r.key, summary(r.type, r.body) || r.key]));
    const pending = await pendingChanges(records);
    root.innerHTML = String(errorLine(error)) + String(sendView({
      changes: [...pending].map(([key, change]) => ({ key, change: WORDS[change] })),
      deletes: records.filter((r) => r.deleted && pending.get(r.key) === 'delete').map((r) => ({ key: r.key })),
      results: ctx.desk.results || [], lines, busy: ctx.desk.busy, connected: await connected(ctx),
    }));
  }
  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    error = '';
    if (button.dataset.action === 'send') await sendAll(ctx);
    else if (button.dataset.action === 'undo-delete') {
      await ctx.loom.undoRemove(button.closest('[data-key]').dataset.key);
      ctx.broadcast();
    }
    await render();
  }
  const click = surfaceErrors(onClick, async (message) => { error = message; await render(); });
  root.addEventListener('click', click);
  await render();
  return { render, unmount: () => root.removeEventListener('click', click) };
}

export async function mountDay(root, ctx, { day }) {
  async function render() {
    const records = (await ctx.store.recordsByDay(day)).filter((r) => !r.deleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    root.innerHTML = String(html`${dayView({ day, records })}`);
  }
  await render();
  return { render, unmount() {} };
}
