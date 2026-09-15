/* HTML by template literal, escaped by default. Views return strings built
 * with `html`; nested `html` results and raw() pass through unescaped. */

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Safe(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v === false || v == null ? '' : esc(v));

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Safe(out);
}

/* The one error surface: a status line each controller renders at its top. */
export const errorLine = (message) => html`${message ? html`<p class="error" role="alert">${message}</p>` : ''}`;

/* An async event handler whose failure is shown through `show(message)`
 * rather than lost as an unhandled rejection. */
export const surfaceErrors = (handler, show) => async (e) => {
  try { await handler(e); } catch (err) { await show(err?.message || String(err)); }
};
