/* The shell: open the store, route between surfaces, choose a posture,
 * keep tabs in step, and take service-worker updates only when no edit is
 * pending. */
import { openLoom } from './lib/envelope.js';
import { hashFromName } from './lib/media.js';
import { loadRegistry } from './lib/lexicons.js';
import { openStore } from './lib/store.js';
import { mountCompose, newStrand } from './ui/compose.js';
import { mountMint } from './ui/mint.js';
import { mountPanel } from './ui/string-panel.js';
import { mountThread } from './ui/thread.js';

const $ = (sel) => document.querySelector(sel);
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('loom') : null;
const urls = new Map();
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
    reload: () => location.reload(),
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
    const chosen = (await store.getMeta('posture')) || 'auto';
    const posture = chosen === 'auto' ? (matchMedia('(min-width: 900px)').matches ? 'desk' : 'totem') : chosen;
    document.body.dataset.posture = posture;
    return posture;
  }

  async function route() {
    for (const m of mounted) m.unmount?.();
    mounted = [];
    const posture = await applyPosture();
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [surface = '', ...rest] = path.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    const params = new URLSearchParams(query);
    const main = $('#main'), side = $('#side');
    main.innerHTML = side.innerHTML = '';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (surface || 'home')));
    document.body.dataset.surface = surface || 'home';

    if (!surface) {
      location.replace(posture === 'totem' ? '#/mint' : '#/thread');
      return;
    }
    if (surface === 'compose' && arg === 'new') {
      const strand = await newStrand(ctx, { day: params.get('day'), wrap: params.get('wrap') });
      ctx.broadcast();
      location.replace(`#/compose/${strand.key}`);
      return;
    }
    if (surface === 'thread') mounted.push(await mountThread(main, ctx, { period: arg }));
    else if (surface === 'mint') mounted.push(await mountMint(main, ctx));
    else if (surface === 'string') mounted.push(await mountPanel(main, ctx));
    else if (surface === 'compose') {
      const record = await store.getRecord(arg);
      if (posture === 'desk' && record?.day) mounted.push(await mountThread(main, ctx, { period: record.day }));
      mounted.push(await mountCompose(posture === 'desk' ? side : main, ctx, { key: arg }));
    } else main.textContent = 'Nothing here.';
  }

  window.addEventListener('hashchange', route);
  matchMedia('(min-width: 900px)').addEventListener('change', route);
  channel?.addEventListener('message', (e) => {
    if (e.data === 'restored') location.reload();   // another tab replaced the store
    else if (!dirty) mounted.forEach((m) => m.render?.());
  });

  if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
    if (!(await navigator.storage.persist())) {
      const banner = $('#banner');
      banner.textContent = 'This browser may clear Loom’s storage — back up from the string panel.';
      banner.hidden = false;
    }
  }

  await route();
  registerServiceWorker();
  window.loom = ctx;   // for scripted checks and the console
}

/* A new version is installed but waits; it takes over only when no edit is
 * pending, then the page reloads onto it. */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The first install claims this page too; only a replacement of an existing
  // worker is an update worth reloading for.
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reg = await navigator.serviceWorker.register('./sw.js');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
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
