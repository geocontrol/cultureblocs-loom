/* Auto-sync: Send and import on their own, until Phase 2 sync replaces both.
 *
 * Two triggers, each switched on in settings and off by default:
 *
 *   every N minutes   import what changed on the String (importer.js
 *                     `importChanges`, which reads the change feed rather than
 *                     every day), then Send
 *   after a save      Send only, once saves have been quiet for a few seconds,
 *                     so a burst of edits is one Send
 *
 * Neither ever sends a delete: a delete is the one change that cannot be
 * taken back, so it waits for a person to press Send. Drafts and proposals
 * stay home exactly as they do for a manual Send. Conflicts are marked, never
 * resolved.
 *
 * A run is skipped, and tried again shortly, while anything else is writing
 * (a manual Send or import, a restore), while an edit is unsaved, or while the
 * browser says it is offline. Only one tab syncs at a time (a Web Lock where
 * the browser has them), so three open tabs do not sync three times.
 *
 * This runs only while a Loom tab is open: it is a mail client checking for
 * mail while it is open, not a server pushing to you. It is the scheduling and
 * nothing else; what a run does is the shell's `run`. */

export const DEFAULTS = Object.freeze({ autoSync: false, syncMinutes: 15, sendOnSave: false });
export const INTERVALS = [5, 15, 30, 60];
export const SAVE_QUIET_MS = 5_000;
export const RETRY_MS = 30_000;
export const FIRST_RUN_MS = 10_000;

export async function readSyncSettings(store) {
  const get = async (k) => store.getMeta(k);
  const minutes = Number(await get('syncMinutes'));
  return {
    autoSync: (await get('autoSync')) === true,
    syncMinutes: INTERVALS.includes(minutes) ? minutes : DEFAULTS.syncMinutes,
    sendOnSave: (await get('sendOnSave')) === true,
  };
}

/* One line for what a run did, for the top bar and settings. */
export function describeRun({ imported = null, sent = [] } = {}) {
  const parts = [];
  const c = imported?.counts;
  if (c) {
    const came = (c.add || 0) + (c.update || 0);
    if (came) parts.push(`${came} from the String`);
    if (c.conflict) parts.push(`${c.conflict} conflict${c.conflict === 1 ? '' : 's'}`);
  }
  const n = (s) => sent.filter((r) => r.status === s).length;
  if (n('sent')) parts.push(`${n('sent')} sent`);
  if (n('conflict')) parts.push(`${n('conflict')} changed on both sides`);
  if (n('invalid')) parts.push(`${n('invalid')} refused`);
  if (n('failed')) parts.push(`${n('failed')} failed`);
  return parts.length ? parts.join(', ') : 'nothing to do';
}

/* deps: {
 *   store,                 for settings and the last run
 *   run({ withImport }),   does the work; resolves to { imported, sent }
 *   blocked(),             a reason not to run now, or null
 *   now(), timers: { set, clear }, lock(fn) — fn runs with the lock, or not at all
 *   onRun(last)            after every run, to refresh what shows it
 * } */
export function createAutoSync({ store, run, blocked, now = () => Date.now(),
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) },
  lock = (fn) => fn(), onRun = () => {} }) {
  let tickTimer = null, saveTimer = null, running = false, stopped = false;

  async function attempt(withImport) {
    if (running) return 'running';
    const reason = await blocked();
    if (reason) return reason;
    running = true;
    let last;
    try {
      const did = await lock(() => run({ withImport }));
      if (did === undefined || did === null) return 'another tab is syncing';
      last = { at: new Date(now()).toISOString(), ok: true, withImport, summary: describeRun(did) };
    } catch (err) {
      last = { at: new Date(now()).toISOString(), ok: false, withImport, summary: err.message };
    } finally {
      running = false;
    }
    await store.setMeta('lastAutoSync', last);
    onRun(last);
    return null;
  }

  async function tick() {
    tickTimer = null;
    if (stopped) return;
    const s = await readSyncSettings(store);
    if (!s.autoSync) return;
    const skipped = await attempt(true);
    if (stopped) return;
    // Skipped for something passing (a Send, an open edit): try again soon, not in N minutes.
    tickTimer = timers.set(tick, skipped && skipped !== 'another tab is syncing' ? RETRY_MS : s.syncMinutes * 60_000);
  }

  async function savedTick() {
    saveTimer = null;
    if (stopped || !(await readSyncSettings(store)).sendOnSave) return;
    const skipped = await attempt(false);
    if (skipped && skipped !== 'another tab is syncing' && !stopped) saveTimer = timers.set(savedTick, RETRY_MS);
  }

  return {
    /* (Re)read the settings and set the timer: at boot, and whenever they change. */
    async schedule({ soon = false } = {}) {
      if (tickTimer) timers.clear(tickTimer);
      tickTimer = null;
      const s = await readSyncSettings(store);
      if (s.autoSync && !stopped) tickTimer = timers.set(tick, soon ? FIRST_RUN_MS : s.syncMinutes * 60_000);
      return s;
    },
    /* A record was saved, kept or deleted in this tab. */
    saved() {
      if (stopped) return;
      if (saveTimer) timers.clear(saveTimer);
      saveTimer = timers.set(savedTick, SAVE_QUIET_MS);
    },
    /* Run now, as the timer would (a "sync now" press). */
    now: () => attempt(true),
    stop() {
      stopped = true;
      if (tickTimer) timers.clear(tickTimer);
      if (saveTimer) timers.clear(saveTimer);
    },
    get running() { return running; },
  };
}
