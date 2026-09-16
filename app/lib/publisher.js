/* Publishing, as the desk asks for it.
 *
 * This is the seam. Today publishing runs through the String: it holds the
 * identity's app password, does the canonical strip, and talks to the PDS
 * itself, so Loom sends a record id and an identity *name* and never handles
 * a credential. LOOM.md §8 wants the other shape eventually — Loom publishing
 * client-side over its own OAuth session, so a person with no String still
 * has the full loop. When that arrives it replaces this module, not the desk:
 * the UI only ever sees `identities`, `publish` and `unpublish`.
 *
 * `whyNotPublishable` is the part that is Loom's regardless of transport, so
 * it lives outside the client and is exported on its own.
 */
import { STRAND } from './envelope.js';

/* Why this record cannot be published from Loom, or null if it can.
 *
 * Only strands publish: the String refuses a lone bead ("beads and
 * annotations publish as part of a strand") because a bead goes public as
 * part of the strand that lists it. */
export function whyNotPublishable(r) {
  if (!r) return 'there is no such record';
  if (r.type !== STRAND) return 'only a strand publishes; a bead publishes as part of a strand';
  if (r.deleted) return 'it is waiting to be deleted';
  if (r.conflict) return 'it changed on both sides: choose a version first';
  if (!r.stringId) return 'it is not on the String yet: send it first';
  return null;
}

/* Whether the desk should show this record as public. */
export const isPublished = (r) => Boolean(r?.publishedUri);

export function stringPublisher({ store, client }) {
  /* Write what the String now holds onto a fresh read, so a save made while
   * the (slow) publish was in flight is not overwritten by a stale copy. */
  async function record(key, publishedUri) {
    const fresh = await store.getRecord(key);
    if (!fresh) return;
    await store.putRecord({ ...fresh, publishedUri });
  }

  async function ready(key) {
    const rec = await store.getRecord(key);
    const why = whyNotPublishable(rec);
    if (why) throw new Error(`cannot publish ${key}: ${why}`);
    return rec;
  }

  return {
    /* [{ name, handle, pds }] — who the String can speak as. */
    identities: () => client.listIdentities(),

    /* Publish a strand and the beads it lists. Slow: the String uploads every
     * photo and writes every record to the PDS inside this one request. It is
     * not atomic either — a failure part way leaves earlier beads public. A
     * second publish repairs that rather than duplicating it, because the
     * rkeys are reused, so a refusal here is safe to retry. */
    async publish(key, identity) {
      const rec = await ready(key);
      const result = await client.publish(rec.stringId, identity);
      await record(key, result.strandUri || result.uri || null);
      return result;
    },

    /* Withdraw a strand and its beads from the PDS. Returns how many went. */
    async unpublish(key, identity) {
      const rec = await store.getRecord(key);
      if (!rec) throw new Error(`no record ${key}`);
      if (!rec.stringId) throw new Error(`cannot unpublish ${key}: it is not on the String`);
      const removed = await client.unpublish(rec.stringId, identity);
      await record(key, null);
      return removed;
    },
  };
}
