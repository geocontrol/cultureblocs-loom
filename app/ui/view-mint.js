/* Mint: the button. Pure; returns html. */
import { html } from './html.js';
import { KINDS } from './view-thread.js';

/* A mask colour is applied by the controller through CSSOM (inline style
 * attributes are forbidden by the CSP), and only if it is a plain hex colour. */
export const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null);

export const DEFAULT_MASKS = [{ n: 'OUT', c: '#EDEDED' }, { n: 'ART', c: '#D71921' }, { n: 'HOME', c: '#5A5A5A' }];

export function mintView({ masks = DEFAULT_MASKS, mask = masks[0]?.n, kind = 'bloc', last = null }) {
  return html`
    <div class="mint">
      <div class="masks" role="radiogroup" aria-label="mask">
        ${masks.map((m) => html`<button type="button" role="radio" aria-checked="${m.n === mask}" data-action="mask" data-mask="${m.n}"
            class="${m.n === mask ? 'on' : ''}">${m.n}</button>`)}
      </div>
      <label class="line">a line, if you want one <input name="note" maxlength="300" autocomplete="off"></label>
      <label class="kindpick">kind <select name="kind">${KINDS.map((k) => html`<option ${k === kind ? 'selected' : ''}>${k}</option>`)}</select></label>
      <button type="button" class="press" data-action="press" aria-label="mint a bead"><span></span></button>
      <p class="minted" aria-live="polite">${last ? html`minted ${last.body.kind} at ${last.createdAt.slice(11, 16)} · <a href="#/compose/${last.key}">add to it</a>` : ''}</p>
      <p class="posture-link"><a href="#/thread">thread</a></p>
    </div>`;
}
