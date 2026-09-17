/* The Feeds surface: one row, the totem. Pure.
 *
 * Deliberately not a review list. Studio needs one because it has nowhere to
 * put the beads; here they land as proposals in the String column, on their
 * own days, beside everything else from that day — which is the review.
 *
 * `clear` appears only when a pull completed with no problems. Erasing a bead
 * nobody ever saw is the worst outcome available, so the button is withheld
 * rather than warned about. */
import { html } from './html.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function resultLine(r) {
  // "new" never takes an s, so it is interpolated rather than pluralised.
  const bits = [`${r.added.length} new`];
  if (r.duplicate) bits.push(`${r.duplicate} already here`);
  if (r.skipped) bits.push(`${r.skipped} struck on the device`);
  return `${plural(r.count, 'bead')} on the totem — ${bits.join(', ')}.`;
}

/* state: { serial, connected, busy, result, needsDay, day, deviceId, deviceLabel,
 *          masks, wardrobeArmed, paste, error } */
export function feedsView(state = {}) {
  const { serial = true, connected = false, busy = false, result = null, needsDay = false,
    day = '', deviceId = '', deviceLabel = '', masks = [], wardrobeArmed = false,
    error = '' } = state;
  const clash = Boolean(deviceId && deviceLabel && deviceLabel !== deviceId);
  const canClear = Boolean(result && !result.problems.length && result.count > 0);
  const off = busy ? 'disabled' : '';

  return html`
    <section class="feeds">
      <h2>Feeds</h2>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}

      <article class="feed" data-feed="totem">
        <h3>Totem</h3>
        ${serial
    ? html`<p class="hint">Plug the totem in over USB. If it has been asleep, press a
             button to wake it first.</p>`
    : html`<p class="hint">This browser cannot talk to a device — Web Serial needs Chrome
             or Edge. You can still paste a dump below: send <code>D</code> in a serial
             monitor and copy the whole block.</p>`}

        <div class="row">
          ${serial && !connected ? html`<button type="button" class="primary" data-action="connect" ${off}>connect</button>` : ''}
          ${serial && connected ? html`<button type="button" class="primary" data-action="pull" ${off}>${busy ? 'pulling…' : 'pull'}</button>` : ''}
          ${canClear ? html`<button type="button" class="danger" data-action="clear" ${off}>clear the totem</button>` : ''}
        </div>

        ${result ? html`<p class="result">${resultLine(result)}</p>` : ''}
        ${result && result.problems.length
    ? html`<ul class="problems">${result.problems.map((p) => html`<li>${p}</li>`)}</ul>
             <p class="hint">The totem has not been cleared, so nothing is lost. Pull again.</p>`
    : ''}

        ${deviceId ? html`<p class="hint">the totem calls itself <code>${deviceId}</code></p>` : ''}
        <label>device label <input name="deviceLabel" value="${deviceLabel}"></label>
        ${clash ? html`<p class="warn">This disagrees with the totem, and the label is part of
          each bead’s identity — beads pulled under it will not match ones already
          sent as <code>${deviceId}</code>, so you may get duplicates.</p>` : ''}

        ${needsDay ? html`
          <label>the day these beads belong to <input type="date" name="day" value="${day}"></label>
          <p class="hint">Some of these were minted before the totem last lost power, so their
            time of day is genuinely unknowable. Their order is kept; the date is yours to give.</p>` : ''}

        ${wardrobeArmed ? html`
          <fieldset class="wardrobe"><legend>masks on the device</legend>
            ${masks.length ? html`<ul>${masks.map((m, i) => html`<li data-mask="${i}">
              <input name="maskName" value="${m.name}">
              <input type="color" name="maskColour" value="${rgbHex(m)}">
              <button type="button" data-action="mask-remove" ${off}>remove</button></li>`)}</ul>`
    : html`<p class="empty">The device holds no masks.</p>`}
            <div class="row">
              <button type="button" data-action="mask-add" ${off}>add a mask</button>
              <button type="button" data-action="wardrobe-save" ${off}>write to the totem</button>
            </div>
          </fieldset>` : ''}

        <details class="paste">
          <summary>paste a dump instead</summary>
          <p class="hint">Send <code>D</code> in a serial monitor and copy the block,
            <code>---BEADS-BEGIN---</code> to <code>---BEADS-END---</code>.</p>
          <textarea name="paste" rows="4"></textarea>
          <button type="button" data-action="paste" ${off}>read the pasted dump</button>
        </details>
      </article>
    </section>`;
}

const hex2 = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
export const rgbHex = (m) => `#${hex2(m.r)}${hex2(m.g)}${hex2(m.b)}`;
