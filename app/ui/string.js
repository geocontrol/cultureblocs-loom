/* The String column controller: always mounted beside the editor. It follows
 * the route (`show({ day, key })`), keeps its month and filter, keeps and
 * releases proposals in place, and — while a strand is open in the editor —
 * turns its tick boxes into that strand's items through `ctx.desk.tick`.
 * Typing in the filter re-renders only the calendar and the list, so the
 * filter keeps its focus. */
import { dayCounts, entryList, monthGrid, pendingChanges, shiftMonth, sourceApps } from '../lib/day.js';
import { errorLine, html, surfaceErrors } from './html.js';
import { stringColumnView } from './view-string.js';

export async function mountString(root, ctx, { day = '', key = '' } = {}) {
  const today = () => new Date(ctx.now()).toISOString().slice(0, 10);
  const state = { day, key, month: (day || today()).slice(0, 7), filter: { text: '', kind: '', app: '' }, error: '' };
  const armed = new Set();
  let scrolledTo = null;

  async function view() {
    const records = await ctx.store.allRecords();
    const drafts = await ctx.loom.newDrafts();
    const edits = new Set(Object.keys(await ctx.store.allMeta()).filter((k) => k.startsWith('draft:')).map((k) => k.slice('draft:'.length)));
    const tick = ctx.desk?.tick;
    const days = entryList(records, { filter: state.filter, drafts, today: today() });
    return html`<div class="status-slot">${errorLine(state.error)}</div>${stringColumnView({
      month: state.month, selectedDay: state.day, today: today(), weeks: monthGrid(state.month, dayCounts(records)),
      days, pending: await pendingChanges(records), filter: state.filter, apps: sourceApps(records), selectedKey: state.key,
      ticked: tick ? new Set(days.flatMap((d) => d.rows).filter((r) => tick.has(r.key)).map((r) => r.key)) : null,
      drafts: edits,
    })}`;
  }

  async function render({ keepFilter = false } = {}) {
    const out = String(await view());
    const entries = keepFilter ? root.querySelector('.entries') : null;
    if (entries && root.ownerDocument) {
      const next = root.ownerDocument.createElement('div');
      next.innerHTML = out;
      for (const sel of ['.status-slot', '.calendar', '.ticking', '.entries']) {
        const now = root.querySelector(sel), then = next.querySelector(sel);
        if (now && then) now.replaceWith(then);
        else if (now) now.remove();
        else if (then) root.querySelector('.entries')?.before(then);
      }
    } else {
      root.innerHTML = out;
    }
    if (state.day && scrolledTo !== state.day) {
      const heading = root.querySelector?.(`#day-${state.day}`);
      // Scroll the column itself: scrollIntoView would scroll the page too.
      if (heading) { scrolledTo = state.day; root.scrollTop = heading.offsetTop - 8; }   // the column is the heading's offsetParent (sticky)
    }
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    state.error = '';
    if (action === 'month') {
      state.month = shiftMonth(state.month, Number(button.dataset.by));
      return render();
    }
    const rowKey = button.closest('[data-key]')?.dataset.key;
    if (action === 'keep') {
      await ctx.loom.keep(rowKey);
    } else if (action === 'release') {
      if (!armed.has(rowKey)) {                  // two presses: releasing deletes it
        armed.add(rowKey);
        button.textContent = 'release?';
        setTimeout(() => { armed.delete(rowKey); button.textContent = 'release'; }, 4000);
        return;
      }
      armed.delete(rowKey);
      await ctx.loom.remove(rowKey);
    } else return;
    ctx.broadcast();
    await render();
  }

  async function onChange(e) {
    const el = e.target;
    if (el.dataset?.action === 'tick') {
      const rowKey = el.closest('[data-key]')?.dataset.key;
      if (ctx.desk?.tick && rowKey) await ctx.desk.tick.toggle(rowKey, el.checked);
      return render({ keepFilter: true });
    }
    if (el.closest?.('form.filter') && ['kind', 'app'].includes(el.name)) {
      state.filter[el.name] = el.value;
      return render({ keepFilter: true });
    }
  }

  function onInput(e) {
    if (e.target.name !== 'text' || !e.target.closest?.('form.filter')) return;
    state.filter.text = e.target.value;
    render({ keepFilter: true }).catch((err) => show(err.message));
  }

  const show = async (message) => { state.error = message; await render({ keepFilter: true }); };
  const click = surfaceErrors(onClick, show), change = surfaceErrors(onChange, show);
  const submit = (e) => e.preventDefault();
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', submit);
  await render();

  return {
    render: () => render({ keepFilter: true }),
    /* The route moved: select its day (showing its month) and entry. */
    async show({ day: nextDay = '', key: nextKey = '' } = {}) {
      if (nextDay && nextDay !== state.day) state.month = nextDay.slice(0, 7);
      Object.assign(state, { day: nextDay || state.day, key: nextKey });
      await render({ keepFilter: true });
    },
    unmount() {
      root.removeEventListener('click', click);
      root.removeEventListener('change', change);
      root.removeEventListener('input', onInput);
      root.removeEventListener('submit', submit);
    },
  };
}
