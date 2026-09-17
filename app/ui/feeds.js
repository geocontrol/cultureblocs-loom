/* The Feeds controller: the totem sync ritual and its states.
 *
 * `ctx.openPort` is the seam — the desk asks for a port and does not know it
 * is Web Serial, so the tests drive a fake. The port is held open between
 * actions because connecting is a user gesture the browser will not let us
 * repeat silently. */
import { hasSerial } from '../lib/totem-port.js';
import { parseDump } from '../lib/totem-protocol.js';
import { absorbDump, readWardrobe, runClear, runPull, writeWardrobe } from '../lib/totem-sync.js';
import { html, surfaceErrors } from './html.js';
import { feedsView, hexRgb } from './view-feeds.js';

const today = (now) => new Date(now()).toISOString().slice(0, 10);

export async function mountFeeds(root, ctx) {
  const state = {
    serial: Boolean(ctx.openPort) && (ctx.serial?.present ?? hasSerial()),
    connected: false, busy: false, result: null, needsDay: false,
    day: today(ctx.now), deviceId: '', deviceLabel: '', masks: [], wardrobeArmed: false,
    paste: '', error: '', confirmClear: false,
  };
  let port = null;

  async function render() {
    root.innerHTML = String(html`${feedsView(state)}`);
  }

  /* Read the form fields the view owns, before an action uses them. */
  function readFields() {
    const masks = state.masks.map((m) => ({ ...m }));
    for (const el of root.querySelectorAll?.('.feeds [name]') || []) {
      if (el.name === 'day') state.day = el.value || state.day;
      if (el.name === 'deviceLabel') state.deviceLabel = el.value.trim();
      if (el.name === 'paste') state.paste = el.value;
      const mask = /^mask(Name|Colour):(\d+)$/.exec(el.name);
      if (mask && masks[Number(mask[2])]) {
        if (mask[1] === 'Name') masks[Number(mask[2])].name = el.value.trim();
        else Object.assign(masks[Number(mask[2])], hexRgb(el.value));
      }
    }
    state.masks = masks;
  }

  async function busy(fn) {
    state.busy = true;
    state.error = '';
    await render();
    try {
      await fn();
    } catch (err) {
      state.error = err?.message || String(err);
    } finally {
      state.busy = false;
    }
    await render();
  }

  /* Fold a pull or paste result into the view's state. */
  function absorbed(r) {
    state.result = r;
    state.deviceId = r.deviceId || state.deviceId;
    if (!state.deviceLabel && r.deviceId) state.deviceLabel = r.deviceId;
    state.needsDay = r.needsDay;
    state.confirmClear = false;
    if (r.added.length) ctx.broadcast();
  }

  async function onClick(e) {
    const btn = e.target.closest?.('button[data-action]');
    if (!btn) return;
    readFields();
    const action = btn.dataset.action;

    if (action === 'connect') {
      return busy(async () => {
        try {
          port = await ctx.openPort();
          state.connected = true;
        } catch (err) {
          // A cancelled port picker is a silent no-op (spec §8), not a fault.
          if (err?.name === 'NotFoundError' || err?.name === 'AbortError') return;
          throw err;
        }
      });
    }
    if (action === 'pull') {
      return busy(async () => {
        absorbed(await runPull({ store: ctx.store, loom: ctx.loom, port, now: ctx.now,
          day: state.day, deviceLabel: state.deviceLabel }));
        state.masks = await readWardrobe({ port }).catch(() => state.masks);
        state.wardrobeArmed = true;     // armed only after a successful pull
      });
    }
    if (action === 'clear-arm') { state.confirmClear = true; return render(); }
    if (action === 'clear-cancel') { state.confirmClear = false; return render(); }
    if (action === 'clear') {
      return busy(async () => {
        if (!port || state.result?.problems?.length) return;   // the view withholds this, but the gate belongs here too
        const r = await runClear({ port, count: state.result.count });
        if (r.ok) { state.result = null; state.wardrobeArmed = false; state.confirmClear = false; }
        else state.error = `the totem refused: it holds ${r.have} beads, not ${r.want}. Pull again.`;
      });
    }
    if (action === 'paste') {
      return busy(async () => {
        absorbed(await absorbDump({ store: ctx.store, loom: ctx.loom,
          dump: parseDump(state.paste || ''), syncWallClock: ctx.now(),
          day: state.day, deviceLabel: state.deviceLabel }));
      });
    }
    if (action === 'mask-add') {
      state.masks = [...state.masks, { name: 'new mask', r: 128, g: 128, b: 128 }];
      return render();
    }
    if (action === 'mask-remove') {
      const i = Number(btn.closest('[data-mask]')?.dataset.mask);
      state.masks = state.masks.filter((_, n) => n !== i);
      return render();
    }
    if (action === 'wardrobe-save') {
      return busy(() => writeWardrobe({ port, masks: state.masks }));
    }
  }

  const show = async (message) => { state.error = message; await render(); };
  const click = surfaceErrors(onClick, show);
  root.addEventListener('click', click);
  await render();
  return {
    render,
    async unmount() {
      root.removeEventListener('click', click);
      await port?.close?.().catch?.(() => {});
    },
  };
}
