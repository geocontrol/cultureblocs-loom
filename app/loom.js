/* The shell: open the store (bringing Phase 1 data to the desk's model), keep
 * the top bar and the String column mounted, route the editor column, keep
 * tabs in step, and take service-worker updates only when no edit is pending.
 *
 *   #/                    today, at a glance
 *   #/day/<YYYY-MM-DD>    a day, at a glance
 *   #/new/bead?day=…      reserve a key, then #/edit/<key>?new=1&day=…
 *   #/new/strand?day=…    the same, for a strand
 *   #/edit/<key>?day=…    the form for a record, or for a new one not yet saved
 *                         (a key with neither record nor draft opens a form only with new=1)
 *   #/send                what is waiting, and the last Send's results
 *   #/settings            String address and token, import, auto-sync, pull, backup, restore
 *
 * Phase 1 addresses (#/thread, #/mint, #/compose, #/string) redirect here (lib/routing.js).
 *
 * On a narrow screen the page shows one column at a time: the String for #/
 * and #/day, the editor for everything else (body[data-view], loom.css). */
import { createAutoSync, readSyncSettings } from './lib/autosync.js';
import { BEAD, STRAND, openLoom } from './lib/envelope.js';
import { importChanges } from './lib/importer.js';
import { loadRegistry } from './lib/lexicons.js';
import { hashFromName } from './lib/media.js';
import { migrateStore } from './lib/migrate.js';
import { stringPublisher } from './lib/publisher.js';
import { phase1Redirect, routeSerializer } from './lib/routing.js';
import { runSend } from './lib/sender.js';
import { openStore } from './lib/store.js';
import { stringClient } from './lib/string-client.js';
import { hasSerial, openPort } from './lib/totem-port.js';
import { mountEditor } from './ui/editor.js';
import { mountFeeds } from './ui/feeds.js';
import { mountDay, mountSend, mountTopbar } from './ui/pages.js';
import { mountSettings } from './ui/settings.js';
import { mountString } from './ui/string.js';

const $ = (sel) => document.querySelector(sel);
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('loom') : null;
const urls = new Map();
const begin = routeSerializer();
const NEW = { bead: BEAD, strand: STRAND };
const SYNC_LOCK = 'loom-sync';
let mounted = [];
let dirty = false;

/* Why this page cannot run Loom, or null. Loom hashes every record to tell
 * an edit here from an edit on the String, and browsers give a page that
 * hashing (crypto.subtle) only in a secure context: HTTPS, or localhost. An
 * http:// address on another machine — a Tailscale IP, a LAN name — is
 * neither, and the first import would fail with a bare TypeError. */
function insecure() {
  if (globalThis.crypto?.subtle) return null;
  const here = `${location.protocol}//${location.host}`;
  return `Loom needs a secure page, and ${here} is not one: browsers allow the hashing Loom uses `
    + 'only over HTTPS or on localhost. Open Loom on localhost (an SSH tunnel to this machine works: '
    + 'ssh -N -L 8108:localhost:8108 -L 8100:localhost:8100 you@host), or serve it over HTTPS '
    + '(tailscale serve, with the String served over HTTPS too). Each address keeps its own copy of '
    + 'Loom’s data, so pick the one you will keep using.';
}

async function boot() {
  const unsafe = insecure();
  if (unsafe) {
    $('#editor').textContent = unsafe;
    return;
  }
  const store = await openStore();
  await migrateStore(store);
  const registry = await loadRegistry(async (p) => (await fetch(p)).json(), './vendor/lexicons/');
  const loom = await openLoom({ store, registry });
  let topbar = null, column = null;

  const refreshAll = () => {
    if (dirty) return;
    for (const surface of [topbar, column, ...mounted]) surface?.render?.()?.catch?.((err) => console.error(err));
  };

  const ctx = {
    store, registry, loom,
    now: () => Date.now(),
    fetch: (...a) => fetch(...a),
    /* Something changed: other tabs hear it, and this tab's surfaces show it. */
    broadcast(kind = 'changed') {
      channel?.postMessage(kind);
      if (kind !== 'restored') refreshAll();
    },
    reload: reloadWhenClean,
    /* The publisher, or null when no String is configured. Built per call so
     * it always uses the address settings hold now. Swapping this for a
     * client-side OAuth publisher (LOOM.md §8) is the whole change. */
    async publisher() {
      const url = await store.getMeta('stringUrl');
      if (!url) return null;
      return stringPublisher({ store, client: stringClient(url, await store.getMeta('stringToken'), ctx.fetch) });
    },
    navigate: (hash) => { location.hash = hash; },
    /* A connected totem port, or null when this browser has no Web Serial.
     * The desk asks for a port and does not know what it is. */
    openPort: hasSerial() ? (opts) => openPort(opts) : null,
    setDirty: (d) => { dirty = d; },
    /* Run `fn` holding the lock every writer to the String or the store takes
     * — Send, import, pull, restore, auto-sync — so another tab's auto-sync
     * never writes underneath it. Waits for the lock; auto-sync never does. */
    withLock: (fn) => (navigator.locks ? navigator.locks.request(SYNC_LOCK, () => fn()) : fn()),
    /* A record was saved, kept or deleted here: auto-sync may want to send. */
    saved: () => ctx.sync?.saved(),
    /* Bring what changed on the String into this browser (the change feed). */
    importChanges: async () => importChanges({ store, registry, loom, client: await ctx.client(), now: ctx.now }),
    /* The String's client, or null when none is configured. */
    async client() {
      const url = await store.getMeta('stringUrl');
      return url ? stringClient(url, await store.getMeta('stringToken'), ctx.fetch) : null;
    },
    async syncSettingsChanged() {
      channel?.postMessage('sync-settings');
      await ctx.sync?.schedule();
      ctx.desk.refresh();
    },
    async persisted() { return (await navigator.storage?.persisted?.()) ?? false; },
    async photoUrls(names) {
      for (const name of names) {
        if (urls.has(name)) continue;
        const row = await store.getBlob(hashFromName(name));
        if (row) urls.set(name, URL.createObjectURL(row.blob));
      }
      return urls;
    },
    download(filename, text) {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    },
    desk: {
      results: [], busy: false, tick: null,
      refreshColumn: () => column?.render().catch((err) => console.error(err)),
      refresh: () => { topbar?.render().catch((err) => console.error(err)); mounted.forEach((m) => m.render?.()?.catch?.((err) => console.error(err))); },
    },
  };

  async function route() {
    try {
      await routeNow();
    } catch (err) {
      $('#editor').textContent = `Could not open this page: ${err.message}`;
      console.error(err);
    }
  }

  async function routeNow() {
    const current = begin();
    await Promise.all(mounted.map((m) => m.unmount?.()));
    mounted = [];
    if (!current.current) return;
    const old = phase1Redirect(location.hash);
    if (old) {
      location.replace(old);                          // a Phase 1 bookmark: the desk's nearest surface
      return;
    }
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [surface = '', ...rest] = path.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    const params = new URLSearchParams(query);
    const today = new Date(ctx.now()).toISOString().slice(0, 10);

    if (surface === 'new' && NEW[arg]) {
      const day = params.get('day');
      location.replace(`#/edit/${loom.newKey(NEW[arg])}?new=1${day ? `&day=${day}` : ''}`);
      return;
    }
    // Each route renders into its own container: a route overtaken mid-mount
    // keeps writing only into a container that is no longer on the page.
    const pane = document.createElement('div');
    $('#editor').replaceChildren(pane);
    document.body.dataset.view = !surface || surface === 'day' ? 'column' : 'editor';

    if (!surface || surface === 'day') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : today;
      await column.show({ day, key: '' });
      current.keep(await mountDay(pane, ctx, { day }), mounted);
    } else if (surface === 'edit') {
      const record = await store.getRecord(arg);
      if (!current.current) return;
      await column.show({ day: record?.day || params.get('day') || '', key: arg });
      current.keep(await mountEditor(pane, ctx, { key: arg, day: params.get('day') || '', isNew: params.get('new') === '1' }), mounted);
    } else if (surface === 'send') {
      current.keep(await mountSend(pane, ctx), mounted);
    } else if (surface === 'feeds') {
      current.keep(await mountFeeds(pane, ctx), mounted);
    } else if (surface === 'settings') {
      current.keep(await mountSettings(pane, ctx), mounted);
    } else {
      pane.textContent = 'Nothing here.';
    }
  }

  ctx.sync = createAutoSync({
    store,
    now: ctx.now,
    async blocked() {
      if (!(await store.getMeta('stringUrl'))) return 'no String is set';
      if (navigator.onLine === false) return 'this browser is offline';
      if (ctx.desk.busy) return 'something else is writing';
      if (dirty) return 'an edit is not saved yet';
      return null;
    },
    // One tab syncs at a time; a tab that cannot take the lock skips this turn.
    lock: navigator.locks
      ? (fn) => navigator.locks.request(SYNC_LOCK, { ifAvailable: true }, (held) => (held ? fn() : null))
      : (fn) => fn(),
    async run({ withImport }) {
      // Checked again here, with no await before the flag is set: the lock may
      // have taken a moment, and a Send or an import may have begun meanwhile.
      if (ctx.desk.busy) return { skipped: 'something else is writing' };
      ctx.desk.busy = true;
      ctx.desk.refresh();
      try {
        const client = await ctx.client();
        const imported = withImport ? await importChanges({ store, registry, client, now: ctx.now }) : null;
        const sent = await runSend({ store, client, now: ctx.now, skip: ['delete'] });
        // The Send page shows a run's results only when one needs a person.
        if (sent.some((r) => ['conflict', 'invalid', 'failed'].includes(r.status))) ctx.desk.results = sent;
        return { imported, sent };
      } finally {
        ctx.desk.busy = false;
        ctx.broadcast();
      }
    },
    onRun: () => ctx.desk.refresh(),
  });
  ctx.autoState = async () => ({ on: (await readSyncSettings(store)).autoSync, last: await store.getMeta('lastAutoSync') });

  topbar = await mountTopbar($('#bar'), ctx);
  column = await mountString($('#column'), ctx, {});
  window.addEventListener('hashchange', route);
  channel?.addEventListener('message', (e) => {
    if (e.data === 'restored') reloadWhenClean();   // another tab replaced the store
    else if (e.data === 'sync-settings') ctx.sync.schedule().then(() => ctx.desk.refresh());
    else refreshAll();
  });
  window.addEventListener('online', () => ctx.sync.schedule({ soon: true }));

  await route();
  ctx.sync.schedule({ soon: true });   // a first run shortly after opening, then on the interval
  requestPersistence();   // not awaited: a permission prompt must not hold the first page back
  registerServiceWorker();
  window.loom = ctx;   // for scripted checks and the console
}

/* Write any pending draft, wait until nothing is dirty, then resolve. */
async function whenClean() {
  for (;;) {
    await Promise.all(mounted.map((m) => m.flush?.()));
    if (!dirty) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function reloadWhenClean() {
  await whenClean();
  location.reload();
}

function requestPersistence() {
  (async () => {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    if (!(await navigator.storage.persist())) {
      const banner = $('#banner');
      banner.textContent = 'This browser may clear Loom’s storage — back up from settings.';
      banner.hidden = false;
    }
  })().catch((err) => console.error(err));
}

/* A new version is installed but waits; it takes over only when no edit is
 * pending, then every tab reloads onto it — each only once its own edits are
 * written. */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The first install claims this page too; only a replacement of an existing
  // worker is an update worth reloading for.
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reg = await navigator.serviceWorker.register('./sw.js');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    reloadWhenClean();
  });
  const offer = () => {
    if (!reg.waiting) return;
    const tryNow = () => (dirty ? setTimeout(tryNow, 1000) : reg.waiting?.postMessage('skipWaiting'));
    tryNow();
  };
  offer();
  reg.addEventListener('updatefound', () => {
    reg.installing?.addEventListener('statechange', (e) => { if (e.target.state === 'installed' && navigator.serviceWorker.controller) offer(); });
  });
}

boot().catch((err) => {
  document.getElementById('editor').textContent = `Loom could not start: ${err.message}`;
  console.error(err);
});
