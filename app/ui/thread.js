/* Thread controller: month and day, keep and release. */
import { dayString, isUnsent, monthDays } from '../lib/day.js';
import { mediaNames } from '../lib/media.js';
import { backupReminder, dayView, monthView } from './view-thread.js';

export async function mountThread(root, ctx, { period }) {
  const today = new Date(ctx.now()).toISOString().slice(0, 10);
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(period || '');
  const armed = new Set();

  async function render() {
    const records = await ctx.store.allRecords();
    if (!isDay) {
      const days = monthDays(records);
      const month = period || days[0]?.day.slice(0, 7) || today.slice(0, 7);
      root.innerHTML = String(monthView(days, { month, today }));
      return;
    }
    const dayRecords = records.filter((r) => r.day === period);
    const entries = dayString(dayRecords, records);
    const names = [...dayRecords, ...entries.flatMap((e) => e.members || [])].flatMap((r) => mediaNames(r.body));
    const reminder = backupReminder({ unsent: records.filter(isUnsent).length,
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'), now: ctx.now() });
    root.innerHTML = String(dayView(entries, { day: period, urls: await ctx.photoUrls(names), reminder }));
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const key = button.closest('[data-key]')?.dataset.key;
    if (button.dataset.action === 'keep') {
      await ctx.loom.keep(key);
    } else if (button.dataset.action === 'release') {
      if (!armed.has(key)) {           // two presses: a released proposal is gone
        armed.add(key);
        button.textContent = 'release?';
        setTimeout(() => { armed.delete(key); button.textContent = 'release'; }, 4000);
        return;
      }
      await ctx.loom.release(key);
    } else return;
    ctx.broadcast();
    await render();
  }

  root.addEventListener('click', onClick);
  await render();
  return { render, unmount: () => root.removeEventListener('click', onClick) };
}
