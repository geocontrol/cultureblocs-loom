/* Mint controller: pick a mask, maybe a line, press. The bead is written
 * before the bloom plays; nothing here touches the network. */
import { DEFAULT_MASKS, mintView } from './view-mint.js';

export async function mountMint(root, ctx) {
  const masks = (await ctx.store.getMeta('masks')) || DEFAULT_MASKS;
  const state = { masks, mask: (await ctx.store.getMeta('mask')) || masks[0].n, kind: 'bloc', last: null };
  const render = () => { root.innerHTML = String(mintView(state)); };

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'mask') {
      state.mask = button.dataset.mask;
      await ctx.store.setMeta('mask', state.mask);
      render();
    } else if (button.dataset.action === 'press') {
      const note = root.querySelector('input[name="note"]')?.value || '';
      const kind = root.querySelector('select[name="kind"]')?.value || state.kind;
      state.kind = kind;
      state.last = await ctx.loom.mint({ mask: state.mask, note, kind });
      ctx.broadcast();
      render();
      root.querySelector('.press')?.classList.add('bloom');
    }
  }

  root.addEventListener('click', onClick);
  render();
  return { render, unmount: () => root.removeEventListener('click', onClick) };
}
