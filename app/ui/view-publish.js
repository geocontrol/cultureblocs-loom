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
import { html, raw } from './html.js';
import { codePointLength } from '../vendor/lexicon.js';

export const destinationLabel = (name) => String(name).charAt(0).toUpperCase() + String(name).slice(1);

/* The most characters the post may have: the smallest limit among the ticked
 * destinations, or null when none is ticked (and there is no post). */
export function postLimit(destinations = [], ticked = []) {
  const limits = destinations.filter((d) => ticked.includes(d.name)).map((d) => d.limits?.text).filter(Number.isInteger);
  return limits.length ? Math.min(...limits) : null;
}

/* Whether the post may go: counted in code points, as the String counts it. */
export const postReady = (text, limit) => limit === null
  || (String(text ?? '').trim() !== '' && codePointLength(String(text ?? '')) <= limit);

export function counterView(text, limit) {
  const n = codePointLength(String(text ?? ''));
  return html`<span class="counter${n > limit ? ' over' : ''}">${n} / ${limit}</span>`;
}

/* One sentence per destination the last publish named. */
export function syndicationNotice(results = []) {
  return (results || []).map((r) => {
    const name = destinationLabel(r.destination);
    if (r.status === 'posted') {
      const n = r.droppedImages || 0;
      const dropped = n ? ` (${n} image${n === 1 ? '' : 's'} left out)` : '';
      const warning = r.warning ? `, but ${r.warning}` : '';
      return `Posted to ${name}${dropped}${warning}.`;
    }
    if (r.status === 'already') return `Already posted to ${name}, so not posted again.`;
    return `Published, but ${name} failed: ${r.reason}. It can be tried again.`;
  }).join(' ');
}

const HTTP_URL = /^https?:\/\//;

/* The "also post to" part: a link for each destination already used, a
 * checkbox for each one not yet, and — once one is ticked — the post text. */
function destinationsView(record, destinations, ticked, postText, limit) {
  if (!destinations.length) return '';
  const used = new Map((record.syndications || []).map((s) => [s.destination, s]));
  return html`<fieldset class="destinations">
    <legend>Also post to</legend>
    ${destinations.map((d) => (used.has(d.name)
    ? html`<p class="chip-line">${HTTP_URL.test(used.get(d.name).remoteUrl || '')
      ? html`<a class="posted" href="${used.get(d.name).remoteUrl}" target="_blank" rel="noopener">posted to ${destinationLabel(d.name)}</a>`
      : html`<span class="chip published">posted to ${destinationLabel(d.name)}</span>`}</p>`
    : html`<label><input type="checkbox" name="destination" value="${d.name}"${ticked.includes(d.name) ? raw(' checked') : ''}>
        ${destinationLabel(d.name)}</label>`))}
    ${ticked.length ? html`<label>what the post says
        <textarea name="postText" rows="3">${postText}</textarea></label>
      <p class="hint post-counter">${counterView(postText, limit)}</p>
      <p class="hint">Posted once, after the strand is published. A post cannot be edited afterwards,
        and unpublishing the strand does not delete it.</p>` : ''}
  </fieldset>`;
}

/* state: { record, identities, identity, busy, error, destinations, ticked, postText, notice } */
export function publishView({ record = null, identities = [], identity = null, busy = false, error = '',
  destinations = [], ticked = [], postText = '', notice = '' } = {}) {
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
  const limit = postLimit(destinations, ticked);
  const blocked = busy || !postReady(postText, limit);
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
        ${identities.map((i) => html`<option value="${i.name}"${i.name === identity ? raw(' selected') : ''}>${i.handle || i.name}</option>`)}
      </select></label>`}
    ${destinationsView(record, destinations, ticked, postText, limit)}
    <div class="row">
      <button type="button" class="primary" data-action="publish"${blocked ? raw(' disabled') : ''}>
        ${busy ? 'publishing…' : published ? 'republish' : 'publish'}</button>
      ${published ? html`<button type="button" class="danger" data-action="unpublish" ${busy ? 'disabled' : ''}>
        ${busy ? 'working…' : 'unpublish'}</button>` : ''}
    </div>
    ${notice ? html`<p class="hint notice" role="status">${notice}</p>` : ''}
    ${busy
    ? html`<p class="hint">The String is uploading every photo and writing each record to the
        network inside this one request, so this can take a while. Leaving the page does not stop it.</p>`
    : html`<p class="hint">This runs in one slow request and is not all-or-nothing: if it fails part
        way, some beads may already be public. Publishing again repairs it rather than duplicating it.</p>`}
  </section>`;
}
