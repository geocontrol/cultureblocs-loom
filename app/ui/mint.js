/* Mint controller: pick a mask, maybe a line, press. The bead is written
 * before the bloom plays; nothing here touches the network. */
import { errorLine, surfaceErrors } from './html.js';
import { DEFAULT_MASKS, mintView, safeColor } from './view-mint.js';

export async function mountMint(root, ctx) {
  const masks = (await ctx.store.getMeta('masks')) || DEFAULT_MASKS;
  const state = { masks, mask: (await ctx.store.getMeta('mask')) || masks[0].n, kind: 'bloc', last: null, error: '' };
  let minting = false;
  const render = () => {
    root.innerHTML = String(errorLine(state.error)) + String(mintView(state));
    root.querySelectorAll('button[data-mask]').forEach((b) => {
      const colour = safeColor(state.masks.find((m) => m.n === b.dataset.mask)?.c);
      if (colour) b.style.setProperty('--mask', colour);
    });
  };

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    state.error = '';
    if (button.dataset.action === 'mask') {
      state.mask = button.dataset.mask;
      await ctx.store.setMeta('mask', state.mask);
      render();
    } else if (button.dataset.action === 'press') {
      if (minting) return;                 // one press, one bead
      minting = true;
      try {
        const note = root.querySelector('input[name="note"]')?.value || '';
        const kind = root.querySelector('select[name="kind"]')?.value || state.kind;
        state.kind = kind;
        state.last = await ctx.loom.mint({ mask: state.mask, note, kind });
      } finally { minting = false; }
      ctx.broadcast();
      render();
      root.querySelector('.press')?.classList.add('bloom');
    }
  }

  const handler = surfaceErrors(onClick, (message) => { state.error = message; render(); });
  root.addEventListener('click', handler);
  render();
  return { render, unmount: () => root.removeEventListener('click', handler) };
}
