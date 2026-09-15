/* Send: every change Loom holds for the String (replaced by sync in Phase 2).
 *
 * What a record needs comes from day.js `pendingChange`: new -> POST, edit ->
 * PATCH, state -> POST state, delete -> DELETE. One Send runs them in this
 * order: new beads, bead edits, new strands and strand edits (a strand waits
 * until every bead it points at is on the String, then its loom:// items go as
 * spine://records/<id>), state changes, then deletes — strands before beads.
 * Photos upload before the record that uses them, unless the String already
 * has them (`stringMedia`).
 *
 * A bead's DELETE waits while a strand may still list that bead. Locally:
 * any strand not deleted whose items still name it (a "take the String's" on
 * a strand can bring the item back). On the String: envelope.js's `remove`
 * rewrites a using strand's body locally before Send ever runs, so Loom's own
 * copy no longer says which bead an unresolved strand change concerned.
 * Rather than hold every bead delete on any unrelated strand trouble, Send
 * asks the String directly: for each strand (with a stringId) that is in
 * conflict, or whose edit or delete is pending and has not succeeded in this
 * run, it fetches that strand's String copy and holds the bead delete only if
 * those `items` still name the bead — a 404 (the strand is already gone) is
 * not a reason to hold, but any other fetch failure is, safely, and the
 * reason says the strand could not be checked.
 *
 * Every request is safe to repeat. A POST carries dedupeKey "loom:<rkey>". A
 * PATCH or DELETE carries If-Match with the version Loom last saw
 * (`stringHlc`): a 412 means the String moved on, so the record is marked
 * `conflict` with the String's version — unless the String already holds
 * exactly what was being sent (the body, and the state the PATCH leaves),
 * which is a success (a lost response). A DELETE answered 404 is done. A
 * state change carries no If-Match, so Send fetches the String's copy first
 * and changes the state only if it is still the version Loom last saw; if the
 * answer's body is not the one Loom last imported, the String changed in
 * between and the record is a conflict. A record migrated from Phase 1
 * without `stringHlc` fetches the String's copy first, and uses its version
 * only if the body is the one Loom last imported and its state has not moved
 * either — a state change alone (kept/published elsewhere) is also treated as
 * stale. (Between that GET and the write nothing protects it.)
 *
 * After each success the String's answer is recorded onto a fresh read of the
 * record, as an import would record it: an edit saved while the request was
 * in flight keeps its body and reads as a new change. */
import { contentHash } from '../vendor/strip.js';
import { pendingChange, pendingChanges } from './day.js';
import { stringFields } from './importer.js';
import { itemUri, keyFromItemUri, spineUri, toLoomItems } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const BEAD = 'com.cultureblocs.bead';
const STRAND = 'com.cultureblocs.strand';
const list = (v) => (Array.isArray(v) ? v : []);
const OP = { new: 'post', edit: 'patch', state: 'state', delete: 'delete' };

/* { ready: [{ op, key }], held: [{ key, reason }] }, in send order. */
export async function planSend(records) {
  const pending = await pendingChanges(records);
  const byKey = new Map(records.map((r) => [r.key, r]));
  const held = [];
  for (const r of records) {
    if (r.conflict) held.push({ key: r.key, reason: 'changed on both sides: choose a version first' });
    else if (!r.stringId && !r.deleted && r.state === 'draft') held.push({ key: r.key, reason: 'still a draft' });
  }
  const byTime = (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
  const pick = (change, strands) => records
    .filter((r) => pending.get(r.key) === change && (r.type === STRAND) === strands).sort(byTime);

  const ready = [];
  const going = new Set();
  for (const change of ['new', 'edit']) {
    for (const r of pick(change, false)) { ready.push({ op: OP[change], key: r.key }); going.add(r.key); }
  }
  for (const s of [...pick('new', true), ...pick('edit', true)].sort(byTime)) {
    const waiting = list(s.body?.items).map((it) => keyFromItemUri(it?.uri)).filter(Boolean)
      .filter((k) => !byKey.get(k)?.stringId && !going.has(k));
    if (waiting.length) held.push({ key: s.key, reason: `waiting for ${waiting.join(', ')}` });
    else ready.push({ op: OP[pending.get(s.key)], key: s.key });
  }
  for (const r of [...pick('state', false), ...pick('state', true)]) ready.push({ op: 'state', key: r.key });
  for (const r of [...pick('delete', true), ...pick('delete', false)]) ready.push({ op: 'delete', key: r.key });
  return { ready, held };
}

const problemsOf = (detail) => (Array.isArray(detail) ? detail.map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
  : [typeof detail === 'string' ? detail : JSON.stringify(detail)]);

export async function runSend({ store, client, now = () => Date.now(), onProgress = () => {} }) {
  const iso = () => new Date(now()).toISOString();
  const records = await store.allRecords();
  const { ready, held } = await planSend(records);
  const results = held.map((h) => ({ key: h.key, status: 'held', reason: h.reason }));

  // A bead's DELETE is held while a strand may still list it (see the header
  // comment). Strands sent successfully in this run need no check; a strand's
  // fetched String copy is cached for the run.
  const sentStrands = new Set();
  const strandItemsCache = new Map();

  async function stringItemsOf(strandKey, stringId) {
    if (strandItemsCache.has(strandKey)) return strandItemsCache.get(strandKey);
    let items;
    try {
      items = list((await client.getRecord(stringId)).body?.items);
    } catch (e) {
      items = e.status === 404 ? null : 'unreachable';   // gone: fine; anything else: hold, safely
    }
    strandItemsCache.set(strandKey, items);
    return items;
  }

  /* Why a bead's DELETE must wait, or null. */
  async function beadDeleteHold(bead) {
    const strands = (await store.allRecords()).filter((r) => r.type === STRAND);
    // A strand here still uses it — "take the String's" on a strand can bring the item back.
    const using = strands.find((s) => !s.deleted && list(s.body?.items).some((it) => it?.uri === itemUri(bead.key)));
    if (using) return `still in ${using.key}`;
    for (const s of strands) {
      if (!s.stringId || sentStrands.has(s.key)) continue;
      if (!s.conflict && !['edit', 'delete'].includes(await pendingChange(s))) continue;
      const items = await stringItemsOf(s.key, s.stringId);
      if (items === 'unreachable') return `could not check ${s.key} on the String`;
      if (items && items.some((it) => it?.uri === spineUri(bead.stringId))) return `${s.key} still lists it on the String`;
    }
    return null;
  }

  const keyByStringId = async () => new Map((await store.allRecords()).filter((r) => r.stringId).map((r) => [r.stringId, r.key]));

  /* Record what the String now holds (`rec`) onto a fresh read. */
  async function link(key, rec) {
    const fresh = await store.getRecord(key);
    if (!fresh) return;
    const { conflict: _c, problems: _p, ...rest } = fresh;
    await store.putRecord({ ...rest, stringId: rec.id, sentAt: fresh.sentAt ?? iso(),
      stringHash: await contentHash(rec.body), importedHash: await contentHash(toLoomItems(rec.body, await keyByStringId())),
      importedState: rec.state || 'kept', ...stringFields(rec) });
  }

  async function markConflict(key, theirs) {
    const fresh = await store.getRecord(key);
    if (fresh) await store.putRecord({ ...fresh, conflict: { theirs, at: iso(), reason: 'send' } });
    return { status: 'conflict', reason: theirs ? 'changed on the String since Loom last saw it' : 'deleted on the String' };
  }

  async function markInvalid(key, detail) {
    const problems = problemsOf(detail);
    const fresh = await store.getRecord(key);
    if (fresh) await store.putRecord({ ...fresh, problems });
    return { status: 'invalid', problems };
  }

  /* The body as the String holds it: strand items as spine:// uris. */
  async function stringBody(env) {
    if (env.type !== STRAND) return env.body;
    const items = [];
    for (const it of list(env.body.items)) {
      const key = keyFromItemUri(it?.uri);
      if (!key) { items.push(it); continue; }
      const member = await store.getRecord(key);
      if (!member?.stringId) throw new Error(`item ${key} is not on the String`);
      items.push({ ...it, uri: spineUri(member.stringId) });
    }
    return { ...env.body, items };
  }

  async function uploadPhotos(env) {
    const there = new Set(list(env.stringMedia));
    for (const name of mediaNames(env.body)) {
      if (there.has(name)) continue;
      const row = await store.getBlob(hashFromName(name));
      if (!row) throw new Error(`photo ${name} is not in this browser`);
      const sent = await client.postMedia(row.blob);
      if (sent.uri.split('/').pop() !== name) throw new Error(`the String named photo ${name} ${sent.uri}`);
    }
  }

  /* The version to send If-Match against: Loom's, or for a record without one,
   * the String's — if its body is still the one Loom last imported and its
   * state has not moved either (a state change alone, e.g. kept or published
   * elsewhere, is a version Loom never saw). */
  async function base(env) {
    if (env.stringHlc && Array.isArray(env.stringKeys)) return { hlc: env.stringHlc, keys: env.stringKeys };
    const current = await client.getRecord(env.stringId);
    if ((await contentHash(current.body)) !== env.stringHash || (current.state || 'kept') !== env.importedState) {
      return { stale: current };
    }
    return { hlc: current.hlc, keys: Object.keys(current.body), current };
  }

  /* The state a PATCH leaves: editing a proposal keeps it, as the String does. */
  const stateAfterPatch = (env) => (env.importedState === 'proposal' ? 'kept' : env.importedState);

  const ops = {
    async post(env) {
      await uploadPhotos(env);
      const body = await stringBody(env);
      const [res] = await client.postRecords([{ dedupeKey: `loom:${env.rkey}`, type: env.type,
        sourceApp: env.sourceApp || 'loom', createdAt: env.createdAt, body }]);
      if (res.status !== 'created' && res.status !== 'duplicate') return markInvalid(env.key, res.problems || []);
      await link(env.key, await client.getRecord(res.id));   // the String's version, for later edits
      return { status: 'sent', stringId: res.id };
    },
    async patch(env) {
      const known = await base(env);
      if (known.stale) return markConflict(env.key, known.stale);
      await uploadPhotos(env);
      const body = await stringBody(env);
      const fields = { ...body };
      for (const k of known.keys) if (!(k in body)) fields[k] = null;
      try {
        await link(env.key, await client.patchRecord(env.stringId, fields, known.hlc));
      } catch (e) {
        if (e.status !== 412) throw e;
        const current = e.detail?.current;
        // A lost response only if the String holds exactly what this PATCH would have
        // left: the body sent, and the state it produces (not one moved elsewhere since).
        if (!current || (await contentHash(current.body)) !== (await contentHash(body))
          || (current.state || 'kept') !== stateAfterPatch(env)) return markConflict(env.key, current ?? null);
        await link(env.key, current);                         // the String already holds this edit
      }
      return { status: 'sent', stringId: env.stringId };
    },
    async state(env) {
      // POST state carries no If-Match: check first that the String still holds the
      // version Loom last saw (a revision or a publish elsewhere restamps it).
      const known = await base(env);
      if (known.stale) return markConflict(env.key, known.stale);
      if (env.stringHlc) {
        const current = known.current ?? await client.getRecord(env.stringId);
        if (current.hlc !== env.stringHlc) return markConflict(env.key, current);
      }
      const rec = await client.setState(env.stringId, env.state);
      // Changed in the gap between that check and the write: Loom's body was never
      // sent, so recording the String's body as imported would read as a false edit.
      if ((await contentHash(rec.body)) !== env.stringHash) return markConflict(env.key, rec);
      await link(env.key, rec);
      return { status: 'sent', stringId: env.stringId };
    },
    async delete(env) {
      const known = await base(env).catch((e) => { if (e.status === 404) return { gone: true }; throw e; });
      if (known.stale) return markConflict(env.key, known.stale);
      if (!known.gone) {
        try {
          await client.deleteRecord(env.stringId, known.hlc);
        } catch (e) {
          if (e.status === 412) return markConflict(env.key, e.detail?.current ?? null);
          if (e.status !== 404) throw e;
        }
      }
      const fresh = await store.getRecord(env.key);
      if (fresh?.deleted) {
        await store.deleteRecord(env.key);
        await store.deleteMeta(`draft:${env.key}`);
      } else if (fresh) {
        return markConflict(env.key, null);                   // the delete was taken back while it was on its way
      }
      return { status: 'sent', stringId: env.stringId };
    },
  };

  for (const { op, key } of ready) {
    const env = await store.getRecord(key);                   // fresh: an earlier op may have set a member's stringId
    if (!env) continue;
    if (op === 'delete' && env.type === BEAD) {
      const reason = await beadDeleteHold(env);
      if (reason) {
        const result = { key, op, status: 'held', reason };
        results.push(result);
        onProgress(result);
        continue;
      }
    }
    let result;
    try {
      result = { key, op, ...(await ops[op](env)) };
    } catch (e) {
      if (e.status === 404 && (op === 'patch' || op === 'state')) {
        result = { key, op, ...(await markConflict(key, null)) };
      } else if (e.status === 422) {
        result = { key, op, ...(await markInvalid(key, e.detail)) };
      } else if (e.status === 401 || e.status === 403) {
        results.push({ key, op, status: 'failed', reason: 'the String refused the token: check it in settings' });
        onProgress(results.at(-1));
        break;
      } else {
        result = { key, op, status: 'failed', reason: e.message };
      }
    }
    if (env.type === STRAND && (op === 'patch' || op === 'delete') && result.status === 'sent') sentStrands.add(key);
    results.push(result);
    onProgress(result);
  }
  return results;
}
