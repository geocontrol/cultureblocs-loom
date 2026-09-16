/* The publish block on a strand form: whether it is public, and the one or
 * two actions available. Pure.
 *
 * Deliberately not shown: whether a published strand has drifted since. Drift
 * is `drift_hash` against the String's `publishedHash`, and there is no
 * `driftHash` in JS yet — it can only be reproduced for records with no
 * photos, so claiming "edited since published" would be wrong more often than
 * it is useful. Republish is offered unconditionally instead. */
import { whyNotPublishable } from '../lib/publisher.js';
import { STRAND } from '../lib/envelope.js';
import { html } from './html.js';

/* state: { record, identities, busy, error } */
export function publishView({ record = null, identities = [], busy = false, error = '' } = {}) {
  if (record?.type !== STRAND) return html`${''}`;   // a bead goes public with its strand
  const why = whyNotPublishable(record);
  const published = Boolean(record.publishedUri);
  const one = identities.length === 1 ? identities[0] : null;

  if (why) {
    return html`<section class="publish">
      <h3>Publishing</h3>
      <p class="hint">${why.replace(/^it /, 'This strand ')}.</p>
    </section>`;
  }
  // An unreachable String is not a String holding nothing: say which it was.
  if (error) {
    return html`<section class="publish">
      <h3>Publishing</h3>
      <p class="hint">Could not ask the String who it can publish as: ${error}</p>
    </section>`;
  }
  if (!identities.length) {
    return html`<section class="publish">
      <h3>Publishing</h3>
      <p class="hint">The String holds no identities, so there is no account to publish as.
        Add one on the String, then reopen this strand.</p>
    </section>`;
  }
  return html`<section class="publish">
    <h3>Publishing</h3>
    ${published
    ? html`<p class="chip-line"><span class="chip published">published</span>
        <code class="uri">${record.publishedUri}</code></p>`
    : html`<p class="hint">Not published. Publishing sends this strand and every bead in it
        to the account below, and the beads become public too.</p>`}
    ${one
    ? html`<p class="hint">as <strong>${one.handle || one.name}</strong></p>`
    : html`<label>publish as <select name="identity">
        ${identities.map((i) => html`<option value="${i.name}">${i.handle || i.name}</option>`)}
      </select></label>`}
    <div class="row">
      <button type="button" class="primary" data-action="publish" ${busy ? 'disabled' : ''}>
        ${busy ? 'publishing…' : published ? 'republish' : 'publish'}</button>
      ${published ? html`<button type="button" class="danger" data-action="unpublish" ${busy ? 'disabled' : ''}>
        ${busy ? 'working…' : 'unpublish'}</button>` : ''}
    </div>
    ${busy
    ? html`<p class="hint">The String is uploading every photo and writing each record to the
        network inside this one request, so this can take a while. Leaving the page does not stop it.</p>`
    : html`<p class="hint">This runs in one slow request and is not all-or-nothing: if it fails part
        way, some beads may already be public. Publishing again repairs it rather than duplicating it.</p>`}
  </section>`;
}
