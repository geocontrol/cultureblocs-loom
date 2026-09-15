/* Manual send to the String (Phase 1; replaced by sync in Phase 2).
 *
 * Only Loom-made records that the String has not yet accepted are sent, and
 * only once finished: a draft strand stays home. Beads and annotations go
 * first; a strand waits until every item it points at is on the String, then
 * its loom:// items are rewritten to spine://records/<id>. Photos upload
 * before the record that uses them. Each record posts under
 * dedupeKey "loom:<rkey>", so a retry after a timeout cannot duplicate it.
 * Edits to records already on the String are not sent until Phase 2.
 *
 * What is recorded after a post is written onto a fresh read of the record:
 * an edit saved while the post was in flight keeps its body and reads as a
 * local change. On "duplicate" the String already held a body (perhaps an
 * older one, from a send whose response was lost), so the hashes come from
 * what the String holds, fetched, not from what was just posted. */
import { contentHash } from '../vendor/strip.js';
import { isLoomOnly } from './day.js';
import { keyFromItemUri, spineUri, toLoomItems } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const STRAND = 'com.cultureblocs.strand';

/* { ready: [envelope], held: [{ key, reason }] } — pure. */
export function planSend(records) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const unsent = records.filter(isLoomOnly).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const ready = [], held = [];
  const going = new Set();
  for (const r of unsent.filter((r) => r.type !== STRAND)) {
    if (r.state === 'draft') held.push({ key: r.key, reason: 'still a draft' });
    else { ready.push(r); going.add(r.key); }
  }
  for (const s of unsent.filter((r) => r.type === STRAND)) {
    if (s.state === 'draft') { held.push({ key: s.key, reason: 'still a draft' }); continue; }
    const waiting = (s.body.items || []).map((it) => keyFromItemUri(it.uri)).filter(Boolean)
      .filter((k) => !byKey.get(k)?.stringId && !going.has(k));
    if (waiting.length) held.push({ key: s.key, reason: `waiting for ${waiting.join(', ')}` });
    else ready.push(s);
  }
  return { ready, held };
}

export async function runSend({ store, client, now = () => Date.now(), onProgress = () => {} }) {
  const { ready, held } = planSend(await store.allRecords());
  const results = held.map((h) => ({ key: h.key, status: 'held', reason: h.reason }));
  for (const planned of ready) {
    const env = await store.getRecord(planned.key);   // fresh: an earlier send may have set a member's stringId
    const result = { key: env.key };
    try {
      for (const name of mediaNames(env.body)) {
        const row = await store.getBlob(hashFromName(name));
        if (!row) throw new Error(`photo ${name} is not in this browser`);
        const sent = await client.postMedia(row.blob);
        if (sent.uri.split('/').pop() !== name) throw new Error(`the String named photo ${name} ${sent.uri}`);
      }
      let body = env.body;
      if (env.type === STRAND) {
        const items = [];
        for (const it of body.items || []) {
          const key = keyFromItemUri(it.uri);
          if (!key) { items.push(it); continue; }
          const member = await store.getRecord(key);
          if (!member?.stringId) throw new Error(`item ${key} is not on the String`);
          items.push({ ...it, uri: spineUri(member.stringId) });
        }
        body = { ...body, items };
      }
      const [res] = await client.postRecords([{ dedupeKey: `loom:${env.rkey}`, type: env.type, sourceApp: 'loom',
        createdAt: env.createdAt, body }]);
      if (res.status === 'created' || res.status === 'duplicate') {
        // Record what the String now holds, as an import would, so the next
        // import sees this record as unchanged rather than changed on both sides.
        let linked = { stringHash: await contentHash(body), importedHash: await contentHash(env.body), importedState: env.state };
        if (res.status === 'duplicate') {
          const held = await client.getRecord(res.id);
          const keyByStringId = new Map((await store.allRecords()).filter((r) => r.stringId).map((r) => [r.stringId, r.key]));
          linked = { stringHash: await contentHash(held.body),
            importedHash: await contentHash(toLoomItems(held.body, keyByStringId)), importedState: held.state || 'kept' };
        }
        const fresh = await store.getRecord(env.key);   // an edit may have landed during the post
        if (fresh) await store.putRecord({ ...fresh, stringId: res.id, sentAt: new Date(now()).toISOString(), ...linked });
        Object.assign(result, { status: 'sent', stringId: res.id });
      } else {
        Object.assign(result, { status: 'invalid', problems: res.problems || [] });
      }
    } catch (e) {
      Object.assign(result, { status: 'failed', reason: e.message });
    }
    results.push(result);
    onProgress(result);
  }
  return results;
}
