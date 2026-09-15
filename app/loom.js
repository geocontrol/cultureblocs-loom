/* The shell: open the store, route between surfaces, choose a posture,
 * keep tabs in step, and take service-worker updates only when no edit is
 * pending. */
import { openLoom } from './lib/envelope.js';
import { hashFromName } from './lib/media.js';
import { loadRegistry } from './lib/lexicons.js';
import { postureFor, routeSerializer } from './lib/routing.js';
import { openStore } from './lib/store.js';
import { mountCompose, newStrand } from './ui/compose.js';
import { mountMint } from './ui/mint.js';
import { mountPanel } from './ui/string-panel.js';
import { mountThread } from './ui/thread.js';

const $ = (sel) => document.querySelector(sel);
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('loom') : null;
const urls = new Map();
const wide = matchMedia('(min-width: 900px)');
const begin = routeSerializer();
let mounted = [];
let dirty = false;

async function boot() {
  const store = await openStore();
  const registry = await loadRegistry(async (p) => (await fetch(p)).json(), './vendor/lexicons/');
  const loom = await openLoom({ store, registry });

  const ctx = {
    store, registry, loom,
    now: () => Date.now(),
    fetch: (...a) => fetch(...a),
    broadcast: (kind = 'changed') => channel?.postMessage(kind),
    reload: reloadWhenClean,
    navigate: (hash) => { location.hash = hash; },
    setDirty: (d) => { dirty = d; },
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
    applyPosture,
  };

  async function applyPosture() {
    const posture = postureFor(await store.getMeta('posture'), wide.matches);
    document.body.dataset.posture = posture;
    return posture;
  }

  async function route() {
    try {
      await routeNow();
    } catch (err) {
      $('#main').textContent = `Could not open this page: ${err.message}`;
      console.error(err);
    }
  }

  async function routeNow() {
    const current = begin();
    for (const m of mounted) m.unmount?.();
    mounted = [];
    const posture = await applyPosture();
    if (!current.current) return;
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [surface = '', ...rest] = path.split('/');
    const params = new URLSearchParams(query);
    // Each route renders into its own containers: a route overtaken mid-mount
    // keeps writing only into containers that are no longer on the page.
    const main = document.createElement('div'), side = document.createElement('div');
    $('#main').replaceChildren(main);
    $('#side').replaceChildren();
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (surface || 'home')));
    document.body.dataset.surface = surface || 'home';
    const arg = decodeURIComponent(rest.join('/'));

    if (!surface) {
      location.replace(posture === 'totem' ? '#/mint' : '#/thread');
      return;
    }
    if (surface === 'compose' && arg === 'new') {
      const strand = await newStrand(ctx, { day: params.get('day'), wrap: params.get('wrap') });
      ctx.broadcast();
      if (current.current) location.replace(`#/compose/${strand.key}`);
      return;
    }
    if (surface === 'thread') current.keep(await mountThread(main, ctx, { period: arg }), mounted);
    else if (surface === 'mint') current.keep(await mountMint(main, ctx), mounted);
    else if (surface === 'string') current.keep(await mountPanel(main, ctx), mounted);
    else if (surface === 'compose') {
      const record = await store.getRecord(arg);
      if (!current.current) return;
      if (posture === 'desk' && record?.day) {
        if (!current.keep(await mountThread(main, ctx, { period: record.day }), mounted)) return;
      }
      if (posture === 'desk') $('#side').replaceChildren(side);
      current.keep(await mountCompose(posture === 'desk' ? side : main, ctx, { key: arg }), mounted);
    } else main.textContent = 'Nothing here.';
  }

  window.addEventListener('hashchange', route);
  // Crossing the width breakpoint re-routes only if it changes the posture.
  wide.addEventListener('change', async () => {
    if (postureFor(await store.getMeta('posture'), wide.matches) !== document.body.dataset.posture) route();
  });
  channel?.addEventListener('message', (e) => {
    if (e.data === 'restored') reloadWhenClean();   // another tab replaced the store
    else if (!dirty) mounted.forEach((m) => m.render?.());
  });

  await route();
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
      banner.textContent = 'This browser may clear Loom’s storage — back up from the string panel.';
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
  document.getElementById('main').textContent = `Loom could not start: ${err.message}`;
  console.error(err);
});
