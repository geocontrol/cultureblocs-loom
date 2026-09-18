/* Publishing, as the desk asks for it.
 *
 * This is the seam. Today publishing runs through the String: it holds the
 * identity's app password, does the canonical strip, and talks to the PDS
 * itself, so Loom sends a record id and an identity *name* and never handles
 * a credential. LOOM.md §8 wants the other shape eventually — Loom publishing
 * client-side over its own OAuth session, so a person with no String still
 * has the full loop. When that arrives it replaces this module, not the desk:
 * the UI only ever sees `identities`, `destinations`, `publish` and `unpublish`.
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

/* Where a strand has been posted, after a publish answered with `results`.
 * `posted` and `already` both mean it is out there; `failed` means it is
 * not, and stays available. One entry per destination. */
export function mergeSyndications(had = [], results = []) {
  const by = new Map((had || []).map((s) => [s.destination, s]));
  for (const r of results || []) {
    if (r.status !== 'posted' && r.status !== 'already') continue;
    by.set(r.destination, { destination: r.destination, remoteUrl: r.remoteUrl ?? null, postedAt: r.postedAt ?? null });
  }
  return [...by.values()];
}

export function stringPublisher({ store, client }) {
  /* Write what the String now holds onto a fresh read, so a save made while
   * the (slow) publish was in flight is not overwritten by a stale copy.
   * `results` is the publish's `syndications`, when destinations were sent. */
  async function record(key, publishedUri, results = null) {
    const fresh = await store.getRecord(key);
    if (!fresh) return;
    const posted = results ? { syndications: mergeSyndications(fresh.syndications, results) } : {};
    await store.putRecord({ ...fresh, publishedUri, ...posted });
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

    /* [{ name, limits }] — where a published strand can also be posted.
     * Empty from a String that predates syndication. */
    destinations: () => client.listDestinations(),

    /* Publish a strand and the beads it lists, then post it to any
     * `destinations` with `postText`. Slow: the String uploads every photo
     * and writes every record to the PDS inside this one request. It is not
     * atomic either — a failure part way leaves earlier beads public. A
     * second publish repairs that rather than duplicating it, because the
     * rkeys are reused, and it never posts to a destination twice. */
    async publish(key, identity, { destinations = [], postText } = {}) {
      const rec = await ready(key);
      const result = await client.publish(rec.stringId, identity, { destinations, postText });
      await record(key, result.strandUri || result.uri || null, destinations.length ? (result.syndications || []) : null);
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
