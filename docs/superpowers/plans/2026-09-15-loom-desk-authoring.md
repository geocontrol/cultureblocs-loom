# Loom Desk Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Loom into one environment for writing and managing the String:
- the String always in view: a calendar over the entries, in a left column;
- a bead or a strand written whole, in one form, saved once;
- any bead or strand edited or deleted, proposals kept or released in place;
- Send carrying every change to the String — new, edited, kept, deleted — with conflicts shown for the person to choose.

**Architecture:** The Phase 1 data layer stays (store, envelope gate, TIDs/HLC, anchors, photos, backup, importer). Its surfaces are replaced:
- **`app/lib/`:** the envelope writes records whole and deletes with a marker; import and Send keep the String's version of each record (`stringHlc`, `stringKeys`, `stringMedia`); `conflicts.js` resolves a record changed on both sides; `migrate.js` brings Phase 1 data across.
- **`app/ui/`:** pure `view-*.js` functions return escaped HTML; thin controllers mount them — the String column, one editor for both forms, the top bar, Send, day and settings pages.
- **`loom.js`:** the shell keeps the top bar and the String column mounted and routes the editor column; the page stacks on a narrow screen.
- **cultureblocs-string:** two small, backward-compatible API changes land first (Task 1).

**Tech Stack:** Browser ES modules, IndexedDB, Service Worker, WebCrypto; Node 22 `node:test` with no dependencies; Python 3.12, FastAPI and pytest for the String; nginx `:8108`.

**Spec:** `/Users/marksimpkins/TPM/cultureblocs-loom/docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md`. Task 11 adds its §12, corrections found while prototyping; where §12 and the earlier sections differ, §12 is the design. Builds on `docs/superpowers/specs/2026-09-14-loom-phase1-design.md`.

**How this plan was made:** every code block is the tested prototype, byte for byte. Each task's code was run with its tests; the "Expected" output of every red step was measured by applying that task's tests alone to the previous task's tree.

## Global Constraints

- **Repositories and branches:** Loom work is in `/Users/marksimpkins/TPM/cultureblocs-loom` on `feature/desk-authoring`, created from `docs/desk-authoring-spec` (the spec and this plan ride along). Task 1 is in `/Users/marksimpkins/TPM/cultureblocs-string` on `feature/desk-writes`, created from `main`. **Never push or merge.**
- **Real data is off limits:** never write to the String's `data/` or call the String on `:8100` from a test. The end-to-end run uses a throwaway String on `:8199` started from a read-only copy of the database (Task 12).
- **No dependencies and no build step.** Nothing in `app/lib/`, `app/ui/` or `app/vendor/` imports `node:*`. Only `app/lib/store.js`, the `ui/*.js` controllers and `loom.js` touch the DOM or IndexedDB.
- **Copy the code blocks exactly.** Strings and tests contain typographic characters — `’ “ ” — … ‹ › ↑ ↓ ·` — and tests assert on them. Do not retype, reformat or normalise them.
- **CSP unchanged:** `default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src *; worker-src 'self'; manifest-src 'self'`. No inline `style=` or `on*=` attributes anywhere.
- **Stores unchanged:** IndexedDB database `loom`, version 1: `records` (keyPath `key`, indexes `day`, `stringId`), `blobs` (keyPath `hash`), `meta` (keyPath `k`).
- **Envelope additions:** `stringHlc`, `stringKeys`, `stringMedia`, `deleted: true`, `conflict: { theirs, at, reason: "import" | "send" }`, `problems`. The state `released` is gone (Phase 1 data is migrated to `deleted`).
- **Provenance is fixed** once a record exists; content stays editable on any bead or strand, whatever its `sourceApp`. Annotations are read-only.
- **Send:** POST with `dedupeKey: "loom:<rkey>"`; PATCH and DELETE with `If-Match: <stringHlc>`; a field removed locally is sent as `null`. Order: new beads, bead edits, strands, state changes, deletes (strands before beads).
- **Service worker:** `VERSION = 'loom-3'` from Task 10. `SHELL` must list exactly every module under `app/lib`, `app/ui` and `app/vendor` plus the root shell files — `app/test/sw.test.mjs` fails otherwise, so a task that adds or removes a module updates `SHELL` (the blocks below do).
- **Tests:** Loom `node --test app/test/*.test.mjs` (from the Loom repo root); String `python3 -m pytest -q tests/` (from the String repo root).
- **Commits:** Conventional Commits scoped `desk`, each ending with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
  ```

---

## File map

| File | Task | Responsibility |
|---|---|---|
| String `string/app/main.py`, `string/app/db.py`, `tests/test_api_desk_writes.py`, `README.md` | 1 | PATCH removes `null` fields; DELETE honours `If-Match` |
| `app/lib/string-client.js`, `app/test/fake-string.mjs` | 2 | `patchRecord`, `setState`, `deleteRecord`; errors keep `status` and `detail`; a fake String with versions and preconditions |
| `app/ui/{thread,mint,compose,string-panel,view-thread,view-mint,view-compose,view-panel}.js`, `app/loom.js`, `app/index.html` | 3 | Phase 1 surfaces retired; a placeholder shell until Task 10 |
| `app/lib/envelope.js`, `app/lib/importer.js`, `app/lib/migrate.js`, `app/lib/backup.js` | 4 | Whole-record create, fixed provenance, delete marker and cascade; import keeps the String's version and marks conflicts; Phase 1 data migrated |
| `app/lib/day.js` | 5 | Pending changes, month grid, entry list, filter |
| `app/lib/sender.js` | 6 | Send every change |
| `app/lib/conflicts.js` | 7 | Keep mine, take the String's, compare fields |
| `app/ui/view-{string,bead,strand,form,panels}.js` | 8 | Pure views |
| `app/ui/{string,editor,pages,settings}.js` | 9 | Controllers |
| `app/index.html`, `app/loom.js`, `app/loom.css`, `app/sw.js`, `app/lib/routing.js` | 10 | The desk shell |
| `LOOM.md`, `README.md`, spec §12 | 11 | Docs follow the desk |
| — | 12 | End-to-end run in Chrome against a throwaway String |

---

### Task 0: Branches

**Files:** none

- [ ] **Step 1: Check both repositories are clean and the spec branch exists**

Run: `git -C /Users/marksimpkins/TPM/cultureblocs-loom rev-parse --verify docs/desk-authoring-spec && git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short && git -C /Users/marksimpkins/TPM/cultureblocs-string status --short && git -C /Users/marksimpkins/TPM/cultureblocs-string branch --show-current`
Expected: a commit hash, no changes listed for either repository, and `main` for the String. If either repository has changes, stop: BLOCKED.

- [ ] **Step 2: Create the branches**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom switch -c feature/desk-authoring docs/desk-authoring-spec
git -C /Users/marksimpkins/TPM/cultureblocs-string switch -c feature/desk-writes main
```

- [ ] **Step 3: Check the starting suites**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 113 # fail 0`

Run: `python3 -m pytest -q tests/` from `/Users/marksimpkins/TPM/cultureblocs-string`
Expected: `233 passed`

---

### Task 1: The String: PATCH removes null fields, DELETE honours If-Match

Everything in this task happens in **cultureblocs-string**, on `feature/desk-writes`. Loom's Send needs two things the String's API cannot yet do: remove a field when a record is edited (PATCH only merges), and refuse to delete a version the client has not seen. Both changes are backward compatible: a client that sends no `null` and no `If-Match` sees today's behaviour.

**Files:**
- Modify: `README.md`
- Modify: `string/app/db.py`
- Modify: `string/app/main.py`
- Create: `tests/test_api_desk_writes.py`

**Interfaces:**
- Consumes: `Store.patch(rid, fields, expect_hlc=…)` and `Store.STALE` (existing, `string/app/db.py`).
- Produces: `PATCH /records/{id}` with `{"fields": {"tags": null}}` removes `tags`; the whole body is validated after removal (422 if invalid, nothing written). `DELETE /records/{id}` with `If-Match: <hlc>` answers 412 with `detail = {error, yourHlc, currentHlc, current}` (the PATCH shape) when stale; 404 when missing; `{"deleted": id}` on success. `Store.delete(rid, expect_hlc=None, device=…, actor=…)` returns `True`, `False` or `Store.STALE`; a refused delete writes no change row.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api_desk_writes.py` with:

```python
"""What Loom's desk needs from the String to manage records it did not just
create: a PATCH that can remove a field, and a DELETE that refuses to remove
a version the client has not seen."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))

BEAD = "com.cultureblocs.bead"


def ingest(client, key, **fields):
    body = {"$type": BEAD, "createdAt": "2026-08-15T21:04:00Z", "kind": "listen",
            "note": "a note", **fields}
    rec = {"dedupeKey": key, "type": BEAD, "sourceApp": "rounds",
           "createdAt": "2026-08-15T21:04:00Z", "body": body}
    return client.post("/records", json={"records": [rec]}).json()["results"][0]["id"]


# -- PATCH: null removes a field ---------------------------------------------

def test_a_null_field_is_removed_from_the_body(client):
    rid = ingest(client, "k1", tags=["jazz"])
    resp = client.patch(f"/records/{rid}", json={"fields": {"tags": None, "note": "kept"}})
    assert resp.status_code == 200
    body = client.get(f"/records/{rid}").json()["body"]
    assert "tags" not in body
    assert body["note"] == "kept"


def test_removing_a_field_that_is_not_there_is_harmless(client):
    rid = ingest(client, "k1")
    assert client.patch(f"/records/{rid}", json={"fields": {"tags": None}}).status_code == 200
    assert "tags" not in client.get(f"/records/{rid}").json()["body"]


def test_removing_a_required_field_is_refused_and_nothing_changes(client):
    rid = ingest(client, "k1")
    resp = client.patch(f"/records/{rid}", json={"fields": {"kind": None, "note": "changed"}})
    assert resp.status_code == 422
    body = client.get(f"/records/{rid}").json()["body"]
    assert body["kind"] == "listen" and body["note"] == "a note"


def test_null_removal_honours_if_match(client):
    rid = ingest(client, "k1", tags=["jazz"])
    stale = client.get(f"/records/{rid}").json()["hlc"]
    client.patch(f"/records/{rid}", json={"fields": {"note": "moved on"}})
    resp = client.patch(f"/records/{rid}", json={"fields": {"tags": None}}, headers={"If-Match": stale})
    assert resp.status_code == 412
    assert client.get(f"/records/{rid}").json()["body"]["tags"] == ["jazz"]


# -- DELETE: If-Match --------------------------------------------------------

def test_delete_with_the_current_stamp_deletes(client):
    rid = ingest(client, "k1")
    current = client.get(f"/records/{rid}").json()["hlc"]
    resp = client.delete(f"/records/{rid}", headers={"If-Match": f'"{current}"'})
    assert resp.status_code == 200 and resp.json() == {"deleted": rid}
    assert client.get(f"/records/{rid}").status_code == 404


def test_delete_with_a_stale_stamp_is_refused_with_the_current_record(client):
    rid = ingest(client, "k1")
    stale = client.get(f"/records/{rid}").json()["hlc"]
    client.patch(f"/records/{rid}", json={"fields": {"note": "edited elsewhere"}})
    resp = client.delete(f"/records/{rid}", headers={"If-Match": stale})
    assert resp.status_code == 412
    detail = resp.json()["detail"]
    assert detail["yourHlc"] == stale
    assert detail["current"]["body"]["note"] == "edited elsewhere"
    assert client.get(f"/records/{rid}").status_code == 200


def test_delete_without_if_match_behaves_as_it_always_did(client):
    rid = ingest(client, "k1")
    client.patch(f"/records/{rid}", json={"fields": {"note": "edited"}})
    assert client.delete(f"/records/{rid}").status_code == 200
    assert client.get(f"/records/{rid}").status_code == 404


def test_delete_of_a_missing_record_is_404_with_or_without_if_match(client):
    assert client.delete("/records/nope").status_code == 404
    assert client.delete("/records/nope", headers={"If-Match": "x"}).status_code == 404


def test_a_refused_delete_writes_nothing_to_the_change_feed(client):
    rid = ingest(client, "k1")
    before = len(client.get("/changes").json()["changes"])
    client.delete(f"/records/{rid}", headers={"If-Match": "0000000000000-00000-other"})
    assert len(client.get("/changes").json()["changes"]) == before
```

- [ ] **Step 2: Run them to see them fail**

Run: `python3 -m pytest -q tests/test_api_desk_writes.py`
Expected: `5 failed, 4 passed`, failing:

```text
FAILED tests/test_api_desk_writes.py::test_a_null_field_is_removed_from_the_body
FAILED tests/test_api_desk_writes.py::test_removing_a_field_that_is_not_there_is_harmless
FAILED tests/test_api_desk_writes.py::test_null_removal_honours_if_match
FAILED tests/test_api_desk_writes.py::test_delete_with_a_stale_stamp_is_refused_with_the_current_record
FAILED tests/test_api_desk_writes.py::test_a_refused_delete_writes_nothing_to_the_change_feed
```

- [ ] **Step 3: Implement**

Apply this patch from `/Users/marksimpkins/TPM/cultureblocs-string` (it changes `README.md`, `string/app/db.py`, `string/app/main.py`):

```bash
git apply <<'PATCH'
diff --git a/README.md b/README.md
index eaafaaf..cee3ca6 100644
--- a/README.md
+++ b/README.md
@@ -161,7 +161,8 @@ only path that publishes photos, until media blobs land in the promoter.
 |---|---|
 | `POST /records` | batch ingest, idempotent on `dedupeKey`, lexicon-validated |
 | `GET /records?day=&type=&sourceApp=` · `GET /days` | query |
-| `PATCH /records/{id}` | edit the envelope (note, tags, links…), re-validated. Send `If-Match: <hlc>` to be refused with 412 rather than silently overwrite a version you never saw |
+| `PATCH /records/{id}` | edit the envelope (note, tags, links…), re-validated. Send `If-Match: <hlc>` to be refused with 412 rather than silently overwrite a version you never saw; a field sent as `null` is removed |
+| `DELETE /records/{id}` | delete a record; `If-Match: <hlc>` refuses with 412 as PATCH does |
 | `POST /records/{id}/state` | proposal → kept, and the other states |
 | `GET /changes?since=` | append-only feed with cursor (workers hook here); rows carry `hlc`, `deviceId` and `actor` |
 | `POST /media` · `GET /media/{name}` | content-addressed photo store |
diff --git a/string/app/db.py b/string/app/db.py
index 102f3e3..ba93160 100644
--- a/string/app/db.py
+++ b/string/app/db.py
@@ -290,7 +290,11 @@ class Store:
             if row is None:
                 return None
             body = json.loads(row["body"])
-            body.update(fields)
+            for key, value in fields.items():   # null removes a field
+                if value is None:
+                    body.pop(key, None)
+                else:
+                    body[key] = value
             payload = json.dumps(body, separators=(",", ":"))
             stamp = self.hlc.now()
             sql = ("UPDATE records SET body=?, revision=revision+1, hlc=?,"
@@ -333,15 +337,23 @@ class Store:
                 self._log(rid, "state", row["body"], stamp, device, actor)
             return self.get(rid)
 
-    def delete(self, rid: str, *, device: str | None = None,
-               actor: str | None = None) -> bool:
+    def delete(self, rid: str, *, expect_hlc: str | None = None,
+               device: str | None = None, actor: str | None = None):
+        """Delete a record: True, False if there is none, or STALE when
+        `expect_hlc` no longer matches (enforced by the DELETE itself, as in
+        `patch`). A refused delete writes nothing to the change feed."""
         with self._lock:
             cur = self.conn.execute("SELECT body FROM records WHERE id=?", (rid,))
             row = cur.fetchone()
             if row is None:
                 return False
+            sql, args = "DELETE FROM records WHERE id=?", [rid]
+            if expect_hlc is not None:
+                sql += " AND IFNULL(hlc, '') = ?"
+                args.append(expect_hlc)
             with self.conn:
-                self.conn.execute("DELETE FROM records WHERE id=?", (rid,))
+                if self.conn.execute(sql, args).rowcount == 0:
+                    return self.STALE
                 self._log(rid, "delete", row["body"], self.hlc.now(), device, actor)
             return True
 
diff --git a/string/app/main.py b/string/app/main.py
index 8efd328..d78e8f2 100644
--- a/string/app/main.py
+++ b/string/app/main.py
@@ -147,11 +147,12 @@ def patch(rid: str, body: PatchIn, request: Request,
     """Edit an envelope. Send `If-Match: <hlc>` — the hlc of the version you
     were editing — and the write is refused with 412 if the record has moved
     on since. Without the header the old last-writer-wins applies, so
-    existing clients are unaffected."""
+    existing clients are unaffected. A field sent as `null` is removed from
+    the body; the result is validated as a whole."""
     current = store.get(rid)
     if current is None:
         raise HTTPException(status_code=404, detail="not found")
-    requested = {**current["body"], **body.fields}
+    requested = {k: v for k, v in {**current["body"], **body.fields}.items() if v is not None}
     merged = refs.mirror_annotation_work(current["type"], requested)
     problems = (registry.validate_record(current["type"], merged)
                 + refs.anchor_problems(current["type"], merged))
@@ -274,10 +275,19 @@ def clear_published(rid: str):
 
 
 @app.delete("/records/{rid}", dependencies=[Depends(auth)])
-def delete(rid: str, org: Origin = Depends(origin)):
-    """For curation records (strands). Beads are mint facts — the UI should
-    not offer deletion for them, but the API does not police intent."""
-    if not store.delete(rid, device=org.device, actor=org.actor):
+def delete(rid: str, request: Request, org: Origin = Depends(origin)):
+    """Delete a record. Send `If-Match: <hlc>` — the hlc of the version you
+    decided to delete — and it is refused with 412 if the record has moved on
+    since, exactly as PATCH. Without the header it deletes unconditionally,
+    as it always has."""
+    expect = (request.headers.get("if-match") or "").strip('"') or None
+    result = store.delete(rid, expect_hlc=expect, device=org.device, actor=org.actor)
+    if result is store.STALE:
+        raise HTTPException(status_code=412, detail={
+            "error": "record has changed since you loaded it",
+            "yourHlc": expect, "currentHlc": (store.get(rid) or {}).get("hlc"),
+            "current": store.get(rid)})
+    if not result:
         raise HTTPException(status_code=404, detail="not found")
     return {"deleted": rid}
 
PATCH
```

- [ ] **Step 4: Run the tests**

Run: `python3 -m pytest -q tests/`
Expected: `242 passed`, nothing failing.

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-string add README.md string/app/db.py string/app/main.py tests/test_api_desk_writes.py && \
git -C /Users/marksimpkins/TPM/cultureblocs-string commit -q -F - <<'MSG'
feat(desk): PATCH removes a field sent as null; DELETE honours If-Match

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-string status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 2: The String client: edit, state, delete; a fake String with versions

Send (Task 6) needs the String's PATCH, state and DELETE endpoints, and needs to tell a stale version (412, which carries the String's current record) from refused content (422, which carries the problems). The fake String used by the importer and sender tests gains version stamps (`hlc`) and the same preconditions.

**Files:**
- Modify: `app/lib/string-client.js`
- Modify: `app/test/fake-string.mjs`
- Modify: `app/test/string-client.test.mjs`

**Interfaces:**
- Consumes: `stringClient(baseUrl, token, fetchImpl)` (existing).
- Produces:
  - `class StringError extends Error { url; status /* number | null when unreachable */; detail /* the answer's detail, or null */ }` — constructor `(url, message, { status, detail })`.
  - `client.patchRecord(id, fields, hlc) → record`, sending `If-Match` when `hlc` is truthy.
  - `client.setState(id, state) → record`.
  - `client.deleteRecord(id, hlc) → undefined`.
  - `fakeString({ records, media, failMedia, reject })` → `{ client, records, media, posted, calls, editOnString(id, fields), state }`. Every record carries `hlc`; each write restamps. `reject` maps a dedupeKey or a record id to problems (422). `state.offline = true` makes every call unreachable. `calls` records `getRecord <id>`, `post <dedupeKey>`, `patch <id>`, `state <id> <state>`, `delete <id>`, `media <name>`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `app/test/fake-string.mjs` with:

```javascript
// A fake String client for importer and sender tests: records and media held
// in memory, with the String's dedupe, naming, version-stamp (hlc) and
// precondition behaviour. Errors are StringErrors shaped as the real client
// throws them: `status`, and `detail` from the answer.
import { mediaName, sha256Hex } from '../lib/media.js';
import { StringError } from '../lib/string-client.js';

export function fakeString({ records = [], media = {}, failMedia = new Set(), reject = {} } = {}) {
  let n = 0, clock = 0;
  const posted = [];
  const calls = [];
  const stamp = () => `${String(++clock).padStart(13, '0')}-00000-fake`;
  const dayOf = (r) => String(r.createdAt).slice(0, 10);
  const fail = (path, status, detail = null) => new StringError(`http://string.test${path}`, `HTTP ${status}`, { status, detail });
  const find = (id, path) => {
    const rec = records.find((r) => r.id === id);
    if (!rec) throw fail(path, 404, 'not found');
    return rec;
  };
  const stale = (rec, hlc, path) => {
    if (hlc && hlc !== rec.hlc) throw fail(path, 412, { error: 'record has changed since you loaded it', yourHlc: hlc, currentHlc: rec.hlc, current: structuredClone(rec) });
  };
  for (const r of records) r.hlc ??= stamp();

  const state = { offline: false };
  const reach = (path) => { if (state.offline) throw new StringError(`http://string.test${path}`, 'unreachable (offline)'); };

  const client = {
    base: 'http://string.test',
    async health() { reach('/health'); return ['com.cultureblocs.bead', 'com.cultureblocs.strand', 'com.cultureblocs.annotation']; },
    async listDays() {
      reach('/days');
      calls.push('listDays');
      const days = new Map();
      for (const r of records) days.set(dayOf(r), (days.get(dayOf(r)) || 0) + 1);
      return [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, count]) => ({ day, count }));
    },
    async listRecordsForDay(day) {
      reach('/records');
      calls.push(`listRecordsForDay ${day}`);
      return structuredClone(records.filter((r) => dayOf(r) === day));
    },
    async getRecord(id) {
      reach(`/records/${id}`);
      calls.push(`getRecord ${id}`);
      return structuredClone(find(id, `/records/${id}`));
    },
    async getMedia(name) {
      reach(`/media/${name}`);
      if (failMedia.has(name) || !media[name]) throw fail(`/media/${name}`, 404);
      return media[name];
    },
    async postRecords(batch) {
      reach('/records');
      return batch.map((r) => {
        posted.push(structuredClone(r));
        calls.push(`post ${r.dedupeKey}`);
        if (reject[r.dedupeKey]) return { dedupeKey: r.dedupeKey, status: 'invalid', problems: reject[r.dedupeKey] };
        const existing = records.find((x) => x.dedupeKey === r.dedupeKey);
        if (existing) return { dedupeKey: r.dedupeKey, status: 'duplicate', id: existing.id };
        const id = `sid-${++n}`;
        records.push({ ...structuredClone(r), id, state: r.state || 'kept', hlc: stamp() });
        return { dedupeKey: r.dedupeKey, status: 'created', id };
      });
    },
    async patchRecord(id, fields, hlc) {
      const path = `/records/${id}`;
      reach(path);
      calls.push(`patch ${id}`);
      const rec = find(id, path);
      stale(rec, hlc, path);
      if (reject[id]) throw fail(path, 422, reject[id]);
      for (const [k, v] of Object.entries(fields)) { if (v === null) delete rec.body[k]; else rec.body[k] = structuredClone(v); }
      if (rec.state === 'proposal') rec.state = 'kept';
      rec.hlc = stamp();
      return structuredClone(rec);
    },
    async setState(id, next) {
      const path = `/records/${id}/state`;
      reach(path);
      calls.push(`state ${id} ${next}`);
      const rec = find(id, path);
      if (rec.state !== next) { rec.state = next; rec.hlc = stamp(); }
      return structuredClone(rec);
    },
    async deleteRecord(id, hlc) {
      const path = `/records/${id}`;
      reach(path);
      calls.push(`delete ${id}`);
      const rec = find(id, path);
      stale(rec, hlc, path);
      records.splice(records.indexOf(rec), 1);
    },
    async postMedia(blob) {
      reach('/media');
      const name = mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
      calls.push(`media ${name}`);
      media[name] = blob;
      return { uri: `/media/${name}`, mime: blob.type, bytes: blob.size };
    },
  };

  /* Change a record as another app would: body fields merged, a new version stamp. */
  function editOnString(id, fields) {
    const rec = find(id, `/records/${id}`);
    Object.assign(rec.body, structuredClone(fields));
    rec.hlc = stamp();
    return structuredClone(rec);
  }

  return { client, records, media, posted, calls, editOnString, state };
}

export const photo = (text = 'jpeg-bytes', type = 'image/jpeg') => new Blob([text], { type });
```

Replace the whole of `app/test/string-client.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StringError, stringClient } from '../lib/string-client.js';

/* A fetch that answers each path with a body (an object is sent as JSON, a string as text). */
function fakeFetch(routes) {
  const seen = [];
  const impl = async (url) => {
    seen.push(url);
    const path = url.replace('http://string.test', '');
    if (!(path in routes)) return new Response('not found', { status: 404 });
    const body = routes[path];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  };
  return { impl, seen };
}

test('the String is listed day by day', async () => {
  const f = fakeFetch({ '/days': { days: [{ day: '2026-09-14', count: 1 }] },
    '/records?day=2026-09-14&limit=2000': { records: [{ id: 'u1', type: 'com.cultureblocs.bead', body: {} }] } });
  const c = stringClient('http://string.test/', 't', f.impl);
  assert.deepEqual(await c.listDays(), [{ day: '2026-09-14', count: 1 }]);
  assert.equal((await c.listRecordsForDay('2026-09-14'))[0].id, 'u1');
  assert.equal('listRecords' in c, false, 'per-type listing is gone');
});

test('a day answering exactly the 2000-record limit fails loudly, naming the URL', async () => {
  const records = Array.from({ length: 2000 }, (_, i) => ({ id: `u${i}`, type: 'com.cultureblocs.bead', body: {} }));
  const c = stringClient('http://string.test', '', fakeFetch({ '/records?day=2026-09-14&limit=2000': { records } }).impl);
  await assert.rejects(c.listRecordsForDay('2026-09-14'), (e) => e instanceof StringError
    && e.message.startsWith('http://string.test/records?day=2026-09-14&limit=2000: ') && /2000/.test(e.message));
});

test('a 200 that is not JSON, or not the expected shape, is a StringError naming the URL and the problem', async () => {
  const c = stringClient('http://string.test', '', fakeFetch({
    '/days': '<html>a different server</html>',
    '/records?day=2026-09-14&limit=2000': { items: [] },
    '/records/u1': { id: 'u1' },
  }).impl);
  await assert.rejects(c.listDays(), (e) => e instanceof StringError && /^http:\/\/string\.test\/days: .*not JSON/.test(e.message));
  await assert.rejects(c.listRecordsForDay('2026-09-14'), (e) => e instanceof StringError && /records\?day=2026-09-14&limit=2000: .*records/.test(e.message));
  await assert.rejects(c.getRecord('u1'), (e) => e instanceof StringError && /records\/u1: .*body/.test(e.message));
});

/* A fetch that records each request and answers from `answer(method, path, init)` -> [status, body]. */
function scriptedFetch(answer) {
  const seen = [];
  const impl = async (url, init = {}) => {
    const path = url.replace('http://string.test', '');
    seen.push({ method: init.method || 'GET', path, headers: init.headers || {}, body: init.body });
    const [status, body] = answer(init.method || 'GET', path, init);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { impl, seen };
}

const REC = { id: 'u1', type: 'com.cultureblocs.bead', state: 'kept', hlc: 'h2', body: { note: 'b' } };

test('patchRecord sends the fields with If-Match and returns the String record', async () => {
  const f = scriptedFetch(() => [200, REC]);
  const c = stringClient('http://string.test', 't', f.impl);
  assert.deepEqual(await c.patchRecord('u1', { note: 'b', tags: null }, 'h1'), REC);
  const [req] = f.seen;
  assert.equal(req.method, 'PATCH');
  assert.equal(req.path, '/records/u1');
  assert.equal(req.headers['If-Match'], 'h1');
  assert.equal(req.headers.Authorization, 'Bearer t');
  assert.deepEqual(JSON.parse(req.body), { fields: { note: 'b', tags: null } });
});

test('a 412 is a StringError carrying the status and the String’s current record', async () => {
  const f = scriptedFetch(() => [412, { detail: { error: 'record has changed since you loaded it', current: REC } }]);
  const c = stringClient('http://string.test', '', f.impl);
  await assert.rejects(c.patchRecord('u1', { note: 'mine' }, 'h1'), (e) => e instanceof StringError
    && e.status === 412 && e.detail.current.hlc === 'h2' && /records\/u1: HTTP 412/.test(e.message));
});

test('a 422 keeps the problems, and an unreachable String has no status', async () => {
  const c = stringClient('http://string.test', '', scriptedFetch(() => [422, { detail: ['kind: required'] }]).impl);
  await assert.rejects(c.setState('u1', 'kept'), (e) => e.status === 422 && e.detail[0] === 'kind: required');
  const down = stringClient('http://string.test', '', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(down.deleteRecord('u1', 'h1'), (e) => e instanceof StringError && e.status === null && /unreachable/.test(e.message));
});

test('setState posts the state; deleteRecord sends If-Match only when given a version', async () => {
  const f = scriptedFetch((method) => (method === 'DELETE' ? [200, { deleted: 'u1' }] : [200, REC]));
  const c = stringClient('http://string.test', '', f.impl);
  await c.setState('u1', 'kept');
  await c.deleteRecord('u1', 'h2');
  await c.deleteRecord('u1');
  assert.deepEqual(f.seen.map((r) => [r.method, r.path, r.headers['If-Match'] ?? null]),
    [['POST', '/records/u1/state', null], ['DELETE', '/records/u1', 'h2'], ['DELETE', '/records/u1', null]]);
  assert.deepEqual(JSON.parse(f.seen[0].body), { state: 'kept' });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 111 # fail 4`, with:

```text
not ok 91 - patchRecord sends the fields with If-Match and returns the String record
not ok 92 - a 412 is a StringError carrying the status and the String’s current record
not ok 93 - a 422 keeps the problems, and an unreachable String has no status
not ok 94 - setState posts the state; deleteRecord sends If-Match only when given a version
```

- [ ] **Step 3: Implement**

Replace the whole of `app/lib/string-client.js` with:

```javascript
/* The String's HTTP API, as Loom uses it (import and send).
 * Every error names the URL and the status, because "404" alone once meant a
 * different server was answering on the String's port. An error answer keeps
 * its status and its parsed body (`detail`), so send can tell a stale version
 * (412, with the String's current record) from invalid content (422). */

export const LIST_LIMIT = 2000;   // the most one GET /records returns (the String caps limit here)

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRecord = (b) => (isObject(b) && typeof b.id === 'string' && isObject(b.body)
  ? null : 'expected a record with an id and an object body');
const ifMatch = (hlc) => (hlc ? { 'If-Match': hlc } : {});

export class StringError extends Error {
  constructor(url, message, { status = null, detail = null } = {}) {
    super(`${url}: ${message}`);
    this.url = url;
    this.status = status;    // the HTTP status, or null when the String could not be reached
    this.detail = detail;    // the answer's `detail`, when it sent one
  }
}

export function stringClient(baseUrl, token, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const auth = token ? { Authorization: `Bearer ${token}` } : {};

  async function call(path, init = {}) {
    const url = base + path;
    let res;
    try {
      res = await fetchImpl(url, { ...init, headers: { ...auth, ...(init.headers || {}) } });
    } catch (e) {
      throw new StringError(url, `unreachable (${e.message})`);
    }
    if (!res.ok) {
      const detail = await res.json().then((b) => b?.detail ?? null, () => null);
      throw new StringError(url, `HTTP ${res.status}`, { status: res.status, detail });
    }
    return res;
  }

  /* The JSON body of a 200, checked: `check` returns a problem in words, or nothing. */
  async function json(path, check, init) {
    const res = await call(path, init);
    let body;
    try { body = await res.json(); } catch { throw new StringError(base + path, 'the answer is not JSON (is this the String?)'); }
    const problem = check(body);
    if (problem) throw new StringError(base + path, problem);
    return body;
  }

  return {
    base,
    /* Confirms the thing answering is a String: it must list cultureblocs lexicons. */
    async health() {
      const body = await (await call('/health')).json().catch(() => null);
      const types = Array.isArray(body?.lexicons) ? body.lexicons : [];
      if (!body?.ok || !types.some((t) => t.startsWith('com.cultureblocs.'))) {
        throw new StringError(`${base}/health`, 'this does not look like a String (no cultureblocs lexicons)');
      }
      return types;
    },
    /* [{ day, count }] — the days the String holds records for. */
    async listDays() {
      const body = await json('/days', (b) => (Array.isArray(b?.days) && b.days.every((d) => typeof d?.day === 'string')
        ? null : 'expected { days: [{ day, count }] }'));
      return body.days;
    },
    /* Every record created on one day. A full page means some were cut off, so it fails. */
    async listRecordsForDay(day) {
      const path = `/records?day=${encodeURIComponent(day)}&limit=${LIST_LIMIT}`;
      const body = await json(path, (b) => (Array.isArray(b?.records) && b.records.every(isObject)
        ? null : 'expected { records: [...] }'));
      if (body.records.length >= LIST_LIMIT) {
        throw new StringError(base + path, `returned ${body.records.length} records, the most one request returns; `
          + 'some would be missed, so nothing was imported');
      }
      return body.records;
    },
    async getRecord(id) {
      return json(`/records/${encodeURIComponent(id)}`, isRecord);
    },
    async getMedia(name) {
      return (await call(`/media/${encodeURIComponent(name)}`)).blob();
    },
    async postRecords(records) {
      const body = await json('/records', (b) => (Array.isArray(b?.results) && b.results.length === records.length
        ? null : `expected { results: [...] } with ${records.length} entries`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) });
      return body.results;
    },
    /* Edit a record: `fields` merge into its body, a null removes a field.
     * `hlc` is the version being edited; the String answers 412 if it moved on. */
    async patchRecord(id, fields, hlc) {
      return json(`/records/${encodeURIComponent(id)}`, isRecord, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...ifMatch(hlc) }, body: JSON.stringify({ fields }) });
    },
    async setState(id, state) {
      return json(`/records/${encodeURIComponent(id)}/state`, isRecord,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
    },
    /* Delete a record, refused with 412 if `hlc` is no longer its version. */
    async deleteRecord(id, hlc) {
      await call(`/records/${encodeURIComponent(id)}`, { method: 'DELETE', headers: ifMatch(hlc) });
    },
    async postMedia(blob) {
      return json('/media', (b) => (typeof b?.uri === 'string' ? null : 'expected { uri, mime, bytes }'),
        { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });   // { uri, mime, bytes }
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 115 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/lib/string-client.js app/test/fake-string.mjs app/test/string-client.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): the String client edits, changes state and deletes, and keeps the String's error detail

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 3: Retire Phase 1's Thread, Mint and Compose

The desk replaces Phase 1's surfaces, and Task 4 removes the envelope methods they call (`mint`, `release`, `finish`, `abandon`). They go first, with their tests, so every later task starts green. Until Task 10 the app opens a placeholder shell that keeps the store untouched; that is expected, and nobody uses the branch in between.

`app/ui/html.js` and `app/ui/view-refs.js` stay: the new forms use them. `app/test/views.test.mjs` keeps only their tests and the CSP check.

**Files:**
- Modify: `app/index.html`
- Modify: `app/loom.js`
- Modify: `app/sw.js`
- Delete: `app/test/controllers.test.mjs`
- Modify: `app/test/envelope.test.mjs`
- Modify: `app/test/views.test.mjs`
- Delete: `app/ui/compose.js`
- Delete: `app/ui/mint.js`
- Delete: `app/ui/string-panel.js`
- Delete: `app/ui/thread.js`
- Delete: `app/ui/view-compose.js`
- Delete: `app/ui/view-mint.js`
- Delete: `app/ui/view-panel.js`
- Delete: `app/ui/view-thread.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `app/ui/` holds only `html.js` and `view-refs.js`; `app/loom.js` is a placeholder; `app/index.html` has `#main`; `SHELL` in `app/sw.js` matches.

- [ ] **Step 1: Make the change**

Replace the whole of `app/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src *; worker-src 'self'; manifest-src 'self'">
  <title>Loom</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon-192.png">
  <meta name="theme-color" content="#1B1D22">
  <link rel="stylesheet" href="loom.css">
</head>
<body>
  <header class="bar">
    <span class="brand">LOOM</span>
  </header>
  <main id="panes">
    <section id="main" class="pane"></section>
  </main>
  <noscript>Loom needs JavaScript: it is the whole app.</noscript>
  <script type="module" src="loom.js"></script>
</body>
</html>
```

Replace the whole of `app/loom.js` with:

```javascript
/* The shell, while the desk is built (docs/superpowers/plans/2026-09-15-loom-desk-authoring.md):
 * Phase 1's Thread, Mint and Compose are retired and the desk's surfaces are
 * not mounted yet. It opens the store — so this browser's records are kept
 * as they are — and says so. The desk shell replaces this file. */
import { openStore } from './lib/store.js';

openStore().then(
  () => { document.getElementById('main').textContent = 'Loom is being rebuilt as a desk. Your records are safe in this browser.'; },
  (err) => { document.getElementById('main').textContent = `Loom could not start: ${err.message}`; },
);
```

Replace the whole of `app/sw.js` with:

```javascript
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-2';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/html.js', './ui/view-refs.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

Replace the whole of `app/test/envelope.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, Conflict, InvalidRecord, STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { isTid } from '../lib/tid.js';
import { createMemStore } from '../lib/memstore.js';
import { registry, steppingNow } from './helpers.mjs';

async function loom(store = createMemStore()) {
  return { store, loom: await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' }) };
}

test('mint writes a valid kept bead with Loom provenance and a TID key', async () => {
  const { store, loom: l } = await loom();
  const env = await l.mint({ mask: 'ART', note: '  Rothko room, empty.  ', kind: 'visit' });
  assert.ok(isTid(env.rkey));
  assert.equal(env.key, `${BEAD}/${env.rkey}`);
  assert.equal(env.state, 'kept');
  assert.equal(env.origin, 'mint');
  assert.equal(env.sourceApp, 'loom');
  assert.equal(env.day, env.createdAt.slice(0, 10));
  assert.deepEqual(env.body.tags, ['art']);
  assert.equal(env.body.note, 'Rothko room, empty.');
  assert.equal(env.body.provenance.app, 'loom');
  assert.equal(env.body.provenance.mintedAt, env.createdAt);
  assert.match(env.hlc, /^\d{13}-\d{5}-desk-1$/);
  assert.deepEqual(await store.getRecord(env.key), env);
});

test('an invalid record is refused and nothing is stored', async () => {
  const { store, loom: l } = await loom();
  await assert.rejects(
    l.create(STRAND, { $type: STRAND, createdAt: '2026-09-15T09:00:00Z' }, { origin: 'compose', state: 'draft' }),
    (e) => e instanceof InvalidRecord && e.problems.includes('$.items: required field missing'));
  assert.deepEqual(await store.allRecords(), []);
});

test('an anchor outside the text is refused', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'Saw Severance' });
  const body = { ...bead.body, refs: [{ type: 'work', role: 'subject', descriptor: { label: 'Severance' },
    index: { byteStart: 4, byteEnd: 99 } }] };
  await assert.rejects(l.save(bead.key, body), (e) => e instanceof InvalidRecord
    && e.problems[0] === '$.refs[0].index: 4..99 is outside note (13 bytes)');
});

test('a strand wraps a bead by local item uri and indexes by its day', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  const strand = await l.create(STRAND, { $type: STRAND, createdAt: '2026-09-15T20:00:00Z', day: '2026-09-14T00:00:00Z',
    title: 'Sunday', items: [{ uri: itemUri(bead.key) }] }, { origin: 'compose', state: 'draft' });
  assert.equal(strand.day, '2026-09-14');
  assert.equal(strand.body.items[0].uri, `loom://${bead.key}`);
});

test('save refuses when another tab wrote first, and writes when it did not', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'one' });
  const other = await l.save(bead.key, { ...bead.body, note: 'other tab' }, { expectUpdatedAt: bead.updatedAt });
  await assert.rejects(l.save(bead.key, { ...bead.body, note: 'mine' }, { expectUpdatedAt: bead.updatedAt }),
    (e) => e instanceof Conflict && e.current.body.note === 'other tab');
  const mine = await l.save(bead.key, { ...bead.body, note: 'mine' }, { expectUpdatedAt: other.updatedAt });
  assert.equal(mine.body.note, 'mine');
  assert.ok(mine.hlc > other.hlc);
});

test('editing a proposal keeps it; keep and release only apply to proposals', async () => {
  const { store, loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await store.putRecord({ ...bead, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal', origin: 'import' });
  const edited = await l.save(`${BEAD}/p1`, { ...bead.body, note: 'kept by editing' });
  assert.equal(edited.state, 'kept');
  await assert.rejects(l.release(bead.key), /only a proposal/);
  await assert.rejects(l.keep(bead.key), /a kept record cannot become kept/);
  await store.putRecord({ ...bead, key: `${BEAD}/p2`, rkey: 'p2', state: 'proposal' });
  assert.equal((await l.keep(`${BEAD}/p2`)).state, 'kept');
  await store.putRecord({ ...bead, key: `${BEAD}/p3`, rkey: 'p3', state: 'proposal' });
  await l.release(`${BEAD}/p3`);
  assert.equal(await store.getRecord(`${BEAD}/p3`), undefined);
});

test('releasing a proposal the String holds leaves a released tombstone; a Loom-only one is deleted; drafts go too', async () => {
  const { store, loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await store.putRecord({ ...bead, key: `${BEAD}/s1`, rkey: 's1', state: 'proposal', origin: 'import', stringId: 's1' });
  await store.putRecord({ ...bead, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal' });
  await l.saveDraft(`${BEAD}/s1`, { ...bead.body, note: 'half' });
  await l.saveDraft(`${BEAD}/p1`, { ...bead.body, note: 'half' });
  await l.release(`${BEAD}/s1`);
  await l.release(`${BEAD}/p1`);
  const tomb = await store.getRecord(`${BEAD}/s1`);
  assert.equal(tomb.state, 'released');
  assert.equal(tomb.stringId, 's1');
  assert.equal(await store.getRecord(`${BEAD}/p1`), undefined);
  assert.equal(await l.getDraft(`${BEAD}/s1`), undefined);
  assert.equal(await l.getDraft(`${BEAD}/p1`), undefined);
  await assert.rejects(l.keep(`${BEAD}/s1`), /a released record cannot become kept/);
});

test('the device id and clock survive reopening the store', async () => {
  const { store, loom: first } = await loom();
  const a = await first.mint({ note: 'a' });
  const second = await openLoom({ store, registry: await registry(), now: () => 1, newDeviceId: () => 'never-used' });
  assert.equal(second.deviceId, 'desk-1');
  const b = await second.mint({ note: 'b' });
  assert.ok(b.hlc > a.hlc, 'a reopened clock must not go backwards even if the wall clock did');
});

test('drafts persist until saved or discarded', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await l.saveDraft(bead.key, { ...bead.body, note: 'half-typed' });
  assert.equal((await l.getDraft(bead.key)).body.note, 'half-typed');
  await l.save(bead.key, { ...bead.body, note: 'done' });
  assert.equal(await l.getDraft(bead.key), undefined);
});

test('saving recomputes the flags an import set: invalid goes, and missing keeps only photos still used', async () => {
  const { store, loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  const kept = `/media/${'a'.repeat(64)}.jpg`, dropped = `/media/${'b'.repeat(64)}.jpg`;
  await store.putRecord({ ...bead, body: { ...bead.body, media: [{ uri: kept }, { uri: dropped }] },
    invalid: ['$.kind: required field missing'], missing: [kept.slice(7), dropped.slice(7)] });
  const saved = await l.save(bead.key, { ...bead.body, media: [{ uri: kept }] });
  assert.equal('invalid' in saved, false);
  assert.deepEqual(saved.missing, [kept.slice(7)]);
  const none = await l.save(bead.key, { ...bead.body });
  assert.equal('missing' in none, false);
});
```

Replace the whole of `app/test/views.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw } from '../ui/html.js';
import { publishHint, refFromFields, refsView } from '../ui/view-refs.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './helpers.mjs';

test('html escapes values but not nested html or raw()', () => {
  assert.equal(String(html`<p>${'<script>'}</p>`), '<p>&lt;script&gt;</p>');
  assert.equal(String(html`<p>${html`<b>${'&'}</b>`}${raw('<i>')}</p>`), '<p><b>&amp;</b><i></p>');
  assert.equal(esc(`"'`), '&quot;&#39;');
});

test('publishHint explains what the strip would withhold', () => {
  assert.match(publishHint({ type: 'person', role: 'mention', descriptor: { label: 'J' } }), /stays local/);
  assert.match(publishHint({ type: 'work', role: 'subject', descriptor: { label: 'Dog Days', creator: 'Jane' } }), /creator stays local/);
  assert.match(publishHint({ type: 'person', role: 'mention', descriptor: { label: 'Ballard' },
    externalIds: [{ scheme: 'wikidata', id: 'Q190379' }, { scheme: 'email', id: 'x@y' }] }), /1 id stays local/);
  assert.equal(publishHint({ type: 'work', role: 'subject', descriptor: { label: 'Crash' }, externalIds: [{ scheme: 'isbn', id: '1' }] }), 'publishes as shown');
});

test('refFromFields reads a row, parses ids, keeps the anchor', () => {
  const ref = refFromFields({ type: ' person ', role: 'mention', label: 'Ursula K. Le Guin', creator: '', date: '',
    did: '', externalIds: 'viaf: 96999624\nnot-an-id\nwikidata:Q181659' }, { index: { byteStart: 0, byteEnd: 6 } });
  assert.deepEqual(ref, { type: 'person', role: 'mention', descriptor: { label: 'Ursula K. Le Guin' },
    externalIds: [{ scheme: 'viaf', id: '96999624' }, { scheme: 'wikidata', id: 'Q181659' }], index: { byteStart: 0, byteEnd: 6 } });
  assert.match(String(refsView([ref], 'Ursula wrote')), /anchored to “Ursula”/);
});

test('refs render when an imported ref carries externalIds that are not a list', () => {
  assert.doesNotThrow(() => String(refsView([{ type: 'work', role: 'subject', descriptor: { label: 'X' }, externalIds: 'wikidata:Q1' }], 'X')));
  assert.doesNotThrow(() => String(refsView([{ type: 'work', role: 'subject', descriptor: { label: 'X' }, externalIds: [null, 7] }], 'X')));
  assert.doesNotThrow(() => String(refsView('not a list', 'X')));
});

test('the refs editor carries no inline styles or inline event handlers (the CSP forbids both)', () => {
  const out = String(refsView([{ type: 'work', role: 'subject', descriptor: { label: 'X' }, index: { byteStart: 0, byteEnd: 1 } }], 'X'));
  assert.doesNotMatch(out, /\sstyle=|\son[a-z]+=/);
});

test('index.html declares the content security policy', () => {
  const page = readFileSync(join(APP, 'index.html'), 'utf8');
  assert.match(page, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src \*; worker-src 'self'; manifest-src 'self'">/);
});
```

Delete:

```bash
git rm -q app/test/controllers.test.mjs \
  app/ui/compose.js \
  app/ui/mint.js \
  app/ui/string-panel.js \
  app/ui/thread.js \
  app/ui/view-compose.js \
  app/ui/view-mint.js \
  app/ui/view-panel.js \
  app/ui/view-thread.js
```

- [ ] **Step 2: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 86 # fail 0`

- [ ] **Step 3: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/index.html app/loom.js app/sw.js app/test/envelope.test.mjs app/test/views.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
refactor(desk): retire Phase 1's Thread, Mint and Compose surfaces

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 4: The record lifecycle: whole records, fixed provenance, deletes, conflicts on import, migration

The envelope stops minting and starts writing records whole: a new record exists only as a draft (under a key reserved when its form opens) until Save. Provenance is fixed once written. Deleting marks a record the String holds (`deleted: true`) until Send deletes it there, and takes a deleted bead out of any strand that uses it. Releasing a proposal is deleting it.

Import changes with it: every record keeps the String's version (`stringHlc`), body keys (`stringKeys`) and photos (`stringMedia`); a record deleted in Loom is left alone; a record changed on both sides is marked `conflict` with the String's copy instead of only being listed; the Phase 1 rule that String edits to minted beads are always conflicts is dropped (a provenance change still is). `migrate.js` turns Phase 1's `released` into `deleted` and drops the retired settings, and restore runs it.

The sender does not change until Task 6; its tests only switch to the new way of making records.

**Files:**
- Modify: `app/lib/backup.js`
- Modify: `app/lib/envelope.js`
- Modify: `app/lib/importer.js`
- Create: `app/lib/migrate.js`
- Modify: `app/sw.js`
- Modify: `app/test/backup.test.mjs`
- Modify: `app/test/envelope.test.mjs`
- Modify: `app/test/helpers.mjs`
- Modify: `app/test/importer.test.mjs`
- Create: `app/test/migrate.test.mjs`
- Modify: `app/test/sender.test.mjs`

**Interfaces:**
- Consumes: `fakeString` (Task 2); `LexiconRegistry`, `anchorProblems`, `createClock`, `tidGenerator`, `recordKey`, `dayOf`, `itemUri`, `mediaNames` (existing).
- Produces (`app/lib/envelope.js`):
  - `BEAD`, `STRAND`, `EDITABLE = [BEAD, STRAND]`, `InvalidRecord`, `Conflict`, `whyNotDeletable(record) → string | null`.
  - `openLoom(...)` returns `{ deviceId, validate(type, body), get(key), newKey(type), createBead(key, body, { timeAnchored = true }), createStrand(key, body), save(key, body, { expectUpdatedAt }), keep(key), strandsUsing(key) → [record], remove(key) → [strandKey], undoRemove(key), saveDraft(key, body, baseUpdatedAt = null, type = null), getDraft(key), discardDraft(key), newDrafts() → [{ key, type, body, at }] }`.
  - `createBead` sets `$type`, `createdAt` (the body's, or now) and `provenance = { app: 'loom', device, mintedAt: <save>, timeAnchored }`; state `kept`, origin `loom`. `createStrand` sets `createdAt` to the save.
- Produces (`app/lib/importer.js`): `stringFields(rec) → { stringHlc, stringKeys, stringMedia }`; `runImport` returns `{ counts, conflicts }` as before, and writes `conflict: { theirs: <String record>, at, reason: 'import' }`.
- Produces (`app/lib/migrate.js`): `migrateRecord(record) → record | null`, `migrateStore(store) → number`.
- Produces (`app/test/helpers.mjs`): `makeBead(loom, body, opts)`, `makeStrand(loom, body)`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `app/test/backup.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TYPE, base64ToBytes, bytesToBase64, exportBackup, restoreBackup } from '../lib/backup.js';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { photo } from './fake-string.mjs';
import { makeBead, registry, steppingNow } from './helpers.mjs';

test('base64 round-trips bytes larger than one chunk', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('backup then restore into an empty store gives back records, photos and settings — never the token', async () => {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  const uri = await putPhoto(store, photo('pixels'));
  const bead = await makeBead(loom, { note: 'keep me' });
  await loom.save(bead.key, { ...bead.body, media: [{ uri }] });
  await store.setMeta('stringUrl', 'http://localhost:8100');
  await store.setMeta('stringToken', 'secret');

  const doc = JSON.parse(JSON.stringify(await exportBackup(store, () => 9)));
  assert.equal(doc.$type, BACKUP_TYPE);
  assert.equal('stringToken' in doc.meta, false);

  const fresh = createMemStore();
  await fresh.setMeta('stringToken', 'this-browser');
  await fresh.setMeta('deviceId', 'other-desk');
  assert.deepEqual(await restoreBackup(fresh, doc), { records: 1, photos: 1 });
  assert.deepEqual(await fresh.allRecords(), await store.allRecords());
  const hash = uri.split('/').pop().slice(0, 64);
  assert.equal(await (await fresh.getBlob(hash)).blob.text(), 'pixels');
  assert.equal(await fresh.getMeta('stringUrl'), 'http://localhost:8100');
  assert.equal(await fresh.getMeta('deviceId'), 'other-desk', "this browser keeps its own device id");
  assert.equal(await fresh.getMeta('stringToken'), 'this-browser');
});

test('restore refuses anything that is not a Loom backup, and leaves the store alone', async () => {
  const store = createMemStore();
  await store.setMeta('deviceId', 'keep');
  await assert.rejects(restoreBackup(store, { $type: 'com.cultureblocs.easel.export', version: 1 }), /not a Loom backup/);
  await assert.rejects(restoreBackup(store, { $type: BACKUP_TYPE, version: 2, records: [] }), /unsupported backup version/);
  assert.equal(await store.getMeta('deviceId'), 'keep');
});

async function filled() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  await makeBead(loom, { note: 'the only copy' });
  await store.setMeta('stringToken', 'secret');
  return store;
}

const snapshot = async (store) => ({ records: await store.allRecords(), meta: await store.allMeta(), blobs: await store.blobHashes() });

test('a backup that is malformed anywhere is refused before anything in the store is touched', async () => {
  const store = await filled();
  const before = await snapshot(store);
  const good = { $type: BACKUP_TYPE, version: 1, records: [], meta: {}, blobs: {} };
  const bad = [
    { ...good, records: [{ key: 'com.cultureblocs.bead/x', type: 'com.cultureblocs.bead' }] },          // no body
    { ...good, records: [{ key: 7, type: 'com.cultureblocs.bead', body: {} }] },
    { ...good, records: [null] },
    { ...good, blobs: [] },
    { ...good, blobs: { h1: { mime: 'image/jpeg', data: '%%% not base64 %%%' } } },
    { ...good, blobs: { h1: 'x' } },
    { ...good, meta: [] },
    { ...good, meta: { hlc: 'not a stamp' } },
  ];
  for (const doc of bad) {
    await assert.rejects(restoreBackup(store, doc), undefined, JSON.stringify(doc));
    assert.deepEqual(await snapshot(store), before, JSON.stringify(doc));
  }
});

test("restore keeps this browser's device id and merges the clock forward", async () => {
  const store = await filled();
  const mine = await store.getMeta('hlc');
  const later = `${String(Number(mine.slice(0, 13)) + 60_000).padStart(13, '0')}-00000-desk-9`;
  const doc = { $type: BACKUP_TYPE, version: 1, records: [], blobs: {}, meta: { deviceId: 'desk-9', hlc: later } };
  await restoreBackup(store, doc);
  assert.equal(await store.getMeta('deviceId'), 'desk-1');
  assert.equal(await store.getMeta('hlc'), later, "the file's later stamp wins");
  await restoreBackup(store, { ...doc, meta: { hlc: '0000000000001-00000-desk-9' } });
  assert.equal(await store.getMeta('hlc'), later, "an earlier stamp never moves this browser's clock back");
});

test('a restore that fails part way through still puts back the token, device id and clock', async () => {
  const store = await filled();
  const hlc = await store.getMeta('hlc');
  let puts = 0;
  const failing = { ...store, async putRecord(env) { if (++puts === 2) throw new Error('QuotaExceededError'); return store.putRecord(env); } };
  const rec = (await store.allRecords())[0];
  const doc = { $type: BACKUP_TYPE, version: 1, meta: {}, blobs: {},
    records: [{ ...rec, key: `${rec.key}1` }, { ...rec, key: `${rec.key}2` }] };
  await assert.rejects(restoreBackup(failing, doc), /QuotaExceededError/);
  assert.equal(await store.getMeta('stringToken'), 'secret');
  assert.equal(await store.getMeta('deviceId'), 'desk-1');
  assert.equal(await store.getMeta('hlc'), hlc);
});

test('a Phase 1 backup restores into the desk: released proposals become deletes waiting for Send, retired settings go', async () => {
  const store = createMemStore();
  const B = 'com.cultureblocs.bead';
  const released = { key: `${B}/u1`, type: B, rkey: 'u1', state: 'released', stringId: 'u1', sourceApp: 'scrobbler',
    createdAt: '2026-09-13T10:00:00Z', day: '2026-09-13', body: { $type: B, createdAt: '2026-09-13T10:00:00Z', kind: 'listen' } };
  const kept = { ...released, key: `${B}/u2`, rkey: 'u2', stringId: 'u2', state: 'kept' };
  const doc = { $type: BACKUP_TYPE, version: 1, exportedAt: '2026-09-15T00:00:00Z', records: [released, kept],
    meta: { posture: 'desk', masks: ['ART'], mask: 'ART', stringUrl: 'http://localhost:8100' }, blobs: {} };
  await restoreBackup(store, doc);
  const r = await store.getRecord(`${B}/u1`);
  assert.deepEqual([r.state, r.deleted], ['proposal', true]);
  assert.deepEqual(await store.getRecord(`${B}/u2`), kept);
  const meta = await store.allMeta();
  assert.deepEqual(['posture', 'masks', 'mask'].filter((k) => k in meta), []);
  assert.equal(meta.stringUrl, 'http://localhost:8100');
});
```

Replace the whole of `app/test/envelope.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, Conflict, InvalidRecord, STRAND, openLoom, whyNotDeletable } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { isTid } from '../lib/tid.js';
import { createMemStore } from '../lib/memstore.js';
import { registry, steppingNow } from './helpers.mjs';

async function loom(store = createMemStore()) {
  return { store, loom: await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' }) };
}

const bead = (l, body = {}, opts) => l.createBead(l.newKey(BEAD), { kind: 'visit', note: 'x', ...body }, opts);
const strand = (l, keys, body = {}) => l.createStrand(l.newKey(STRAND),
  { day: '2026-09-14T00:00:00Z', title: 'Sunday', items: keys.map((k) => ({ uri: itemUri(k) })), ...body });

test('createBead writes the whole bead once: kept, made in Loom, provenance at the save', async () => {
  const { store, loom: l } = await loom();
  const key = l.newKey(BEAD);
  const env = await l.createBead(key, { kind: 'visit', createdAt: '2026-09-14T18:30:00Z', note: 'Rothko room, empty.',
    tags: ['art'], media: [{ uri: `/media/${'a'.repeat(64)}.jpg`, alt: 'red' }] }, { timeAnchored: false });
  assert.equal(env.key, key);
  assert.ok(isTid(env.rkey));
  assert.equal(env.key, `${BEAD}/${env.rkey}`);
  assert.equal(env.state, 'kept');
  assert.equal(env.origin, 'loom');
  assert.equal(env.sourceApp, 'loom');
  assert.equal(env.createdAt, '2026-09-14T18:30:00Z', 'when it happened, from the form');
  assert.equal(env.day, '2026-09-14');
  assert.deepEqual(env.body.tags, ['art']);
  assert.deepEqual(env.body.provenance, { app: 'loom', device: 'desk-1', mintedAt: env.updatedAt, timeAnchored: false });
  assert.match(env.hlc, /^\d{13}-\d{5}-desk-1$/);
  assert.deepEqual(await store.getRecord(key), env);
});

test('a bead with no time is made now, and anchored to that time', async () => {
  const { loom: l } = await loom();
  const env = await bead(l, {});
  assert.equal(env.createdAt, env.body.provenance.mintedAt);
  assert.equal(env.body.provenance.timeAnchored, true);
});

test('saving a new record clears its draft; a key cannot be created twice', async () => {
  const { loom: l } = await loom();
  const key = l.newKey(BEAD);
  await l.saveDraft(key, { kind: 'read', note: 'half' }, null, BEAD);
  assert.deepEqual((await l.newDrafts()).map((d) => [d.key, d.type, d.body.note]), [[key, BEAD, 'half']]);
  await l.createBead(key, { kind: 'read', note: 'whole' });
  assert.equal(await l.getDraft(key), undefined);
  assert.deepEqual(await l.newDrafts(), []);
  await assert.rejects(l.createBead(key, { kind: 'read' }), /already exists/);
});

test('an invalid record is refused and nothing is stored', async () => {
  const { store, loom: l } = await loom();
  await assert.rejects(l.createBead(l.newKey(BEAD), { kind: 'not-a-kind', note: 'x'.repeat(3001) }),
    (e) => e instanceof InvalidRecord && e.problems.some((p) => p.startsWith('$.note')));
  assert.deepEqual(await store.allRecords(), []);
});

test('an anchor outside the text is refused', async () => {
  const { loom: l } = await loom();
  const b = await bead(l, { note: 'Saw Severance' });
  const body = { ...b.body, refs: [{ type: 'work', role: 'subject', descriptor: { label: 'Severance' },
    index: { byteStart: 4, byteEnd: 99 } }] };
  await assert.rejects(l.save(b.key, body), (e) => e instanceof InvalidRecord
    && e.problems[0] === '$.refs[0].index: 4..99 is outside note (13 bytes)');
});

test('createStrand is made now for its day and points at beads by local item uri', async () => {
  const { loom: l } = await loom();
  const b = await bead(l);
  const s = await strand(l, [b.key]);
  assert.equal(s.day, '2026-09-14');
  assert.equal(s.state, 'kept');
  assert.equal(s.createdAt, s.updatedAt);
  assert.deepEqual(s.body.items, [{ uri: `loom://${b.key}` }]);
});

test('save refuses when another tab wrote first, and writes when it did not', async () => {
  const { loom: l } = await loom();
  const b = await bead(l, { note: 'one' });
  const other = await l.save(b.key, { ...b.body, note: 'other tab' }, { expectUpdatedAt: b.updatedAt });
  await assert.rejects(l.save(b.key, { ...b.body, note: 'mine' }, { expectUpdatedAt: b.updatedAt }),
    (e) => e instanceof Conflict && e.current.body.note === 'other tab');
  const mine = await l.save(b.key, { ...b.body, note: 'mine' }, { expectUpdatedAt: other.updatedAt });
  assert.equal(mine.body.note, 'mine');
  assert.ok(mine.hlc > other.hlc);
});

test('provenance is fixed: content can change, provenance cannot, on any app’s record', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  await assert.rejects(l.save(b.key, { ...b.body, provenance: { ...b.body.provenance, mintedAt: '2020-01-01T00:00:00Z' } }),
    (e) => e instanceof InvalidRecord && /provenance/.test(e.problems[0]));
  const rounds = { ...b, key: `${BEAD}/r1`, rkey: 'r1', sourceApp: 'rounds', origin: 'import', stringId: 'r1',
    body: { $type: BEAD, createdAt: '2026-09-10T10:00:00Z', kind: 'listen', provenance: { app: 'rounds', mintedAt: '2026-09-10T10:00:00Z' } } };
  await store.putRecord(rounds);
  const edited = await l.save(rounds.key, { ...rounds.body, note: 'corrected in Loom' });
  assert.equal(edited.sourceApp, 'rounds');
  assert.equal(edited.body.provenance.app, 'rounds');
});

test('editing a proposal keeps it; keep applies only to proposals', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  await store.putRecord({ ...b, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal', origin: 'import' });
  assert.equal((await l.save(`${BEAD}/p1`, { ...b.body, note: 'kept by editing' })).state, 'kept');
  await assert.rejects(l.keep(b.key), /a kept record cannot be kept/);
  await store.putRecord({ ...b, key: `${BEAD}/p2`, rkey: 'p2', state: 'proposal' });
  assert.equal((await l.keep(`${BEAD}/p2`)).state, 'kept');
});

test('saving a Phase 1 draft strand keeps it; a String draft keeps its state', async () => {
  const { store, loom: l } = await loom();
  const s = await strand(l, []);
  await store.putRecord({ ...s, state: 'draft' });
  assert.equal((await l.save(s.key, { ...s.body, title: 'told' })).state, 'kept');
  await store.putRecord({ ...s, key: `${STRAND}/e1`, rkey: 'e1', state: 'draft', stringId: 'e1' });
  assert.equal((await l.save(`${STRAND}/e1`, { ...s.body, title: 'still a draft on the String' })).state, 'draft');
});

test('remove: a record never sent is gone, with its draft; one on the String is marked deleted until Send', async () => {
  const { store, loom: l } = await loom();
  const local = await bead(l);
  await l.saveDraft(local.key, { ...local.body, note: 'half' }, local.updatedAt);
  assert.deepEqual(await l.remove(local.key), []);
  assert.equal(await store.getRecord(local.key), undefined);
  assert.equal(await l.getDraft(local.key), undefined);

  const b = await bead(l);
  await store.putRecord({ ...b, stringId: 's1' });
  await l.remove(b.key);
  const marked = await store.getRecord(b.key);
  assert.equal(marked.deleted, true);
  await assert.rejects(l.save(b.key, { ...b.body, note: 'x' }), /is deleted/);
  const back = await l.undoRemove(b.key);
  assert.equal('deleted' in back, false);
  await assert.rejects(l.undoRemove(b.key), /not waiting to be deleted/);
});

test('releasing a proposal is removing it', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  await store.putRecord({ ...b, key: `${BEAD}/s1`, rkey: 's1', state: 'proposal', origin: 'import', stringId: 's1' });
  await l.remove(`${BEAD}/s1`);
  const marked = await store.getRecord(`${BEAD}/s1`);
  assert.equal(marked.state, 'proposal', 'the state is what the String holds; the delete is the change');
  assert.equal(marked.deleted, true);
});

test('deleting a bead takes it out of every strand that uses it, keeping each strand’s state', async () => {
  const { store, loom: l } = await loom();
  const a = await bead(l, { note: 'a' }), b = await bead(l, { note: 'b' });
  const s1 = await strand(l, [a.key, b.key]);
  const s2 = await strand(l, [b.key]);
  await store.putRecord({ ...s2, state: 'draft' });
  const other = await strand(l, [a.key]);
  assert.deepEqual((await l.strandsUsing(b.key)).map((s) => s.key).sort(), [s1.key, s2.key].sort());
  const changed = await l.remove(b.key);
  assert.deepEqual(changed.sort(), [s1.key, s2.key].sort());
  assert.deepEqual((await store.getRecord(s1.key)).body.items, [{ uri: itemUri(a.key) }]);
  assert.deepEqual((await store.getRecord(s2.key)).body.items, []);
  assert.equal((await store.getRecord(s2.key)).state, 'draft');
  assert.deepEqual((await store.getRecord(other.key)).body.items, [{ uri: itemUri(a.key) }]);
});

test('published strands and annotations cannot be deleted', async () => {
  const { store, loom: l } = await loom();
  const s = await strand(l, []);
  await store.putRecord({ ...s, state: 'published', stringId: 'p1' });
  await assert.rejects(l.remove(s.key), /unpublish it first/);
  await store.putRecord({ key: 'com.cultureblocs.annotation/a1', type: 'com.cultureblocs.annotation', body: {}, state: 'kept' });
  await assert.rejects(l.remove('com.cultureblocs.annotation/a1'), /read-only/);
  assert.equal(whyNotDeletable({ type: BEAD, state: 'proposal' }), null);
  assert.match(whyNotDeletable(undefined), /no such record/);
});

test('the device id and clock survive reopening the store', async () => {
  const { store, loom: first } = await loom();
  const a = await bead(first);
  const second = await openLoom({ store, registry: await registry(), now: () => 1, newDeviceId: () => 'never-used' });
  assert.equal(second.deviceId, 'desk-1');
  const b = await bead(second);
  assert.ok(b.hlc > a.hlc, 'a reopened clock must not go backwards even if the wall clock did');
});

test('drafts of existing records persist until saved or discarded, and are not new drafts', async () => {
  const { loom: l } = await loom();
  const b = await bead(l);
  await l.saveDraft(b.key, { ...b.body, note: 'half-typed' }, b.updatedAt);
  assert.equal((await l.getDraft(b.key)).body.note, 'half-typed');
  assert.deepEqual(await l.newDrafts(), []);
  await l.save(b.key, { ...b.body, note: 'done' });
  assert.equal(await l.getDraft(b.key), undefined);
});

test('saving recomputes the flags import and send set: invalid and problems go, missing keeps only photos still used', async () => {
  const { store, loom: l } = await loom();
  const b = await bead(l);
  const kept = `/media/${'a'.repeat(64)}.jpg`, dropped = `/media/${'b'.repeat(64)}.jpg`;
  await store.putRecord({ ...b, body: { ...b.body, media: [{ uri: kept }, { uri: dropped }] },
    invalid: ['$.kind: required field missing'], problems: ['refused'], missing: [kept.slice(7), dropped.slice(7)] });
  const saved = await l.save(b.key, { ...b.body, media: [{ uri: kept }] });
  assert.equal('invalid' in saved, false);
  assert.equal('problems' in saved, false);
  assert.deepEqual(saved.missing, [kept.slice(7)]);
  assert.equal('missing' in await l.save(b.key, { ...b.body }), false);
});
```

Replace the whole of `app/test/helpers.mjs` with:

```javascript
// Shared test fixtures: a registry from the vendored lexicons, a memory store,
// and deterministic clocks.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAD, STRAND } from '../lib/envelope.js';
import { loadRegistry } from '../lib/lexicons.js';

export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readJson = async (path) => JSON.parse(readFileSync(join(APP, path), 'utf8'));

export const registry = () => loadRegistry(readJson, 'vendor/lexicons/');

/* A clock that advances 1 ms per call, starting at `start`. */
export function steppingNow(start = Date.parse('2026-09-15T09:00:00Z')) {
  let t = start;
  return () => (t += 1);
}

/* A bead and a strand made the way the desk makes them: whole, in one save. */
export const makeBead = (loom, body = {}, opts) => loom.createBead(loom.newKey(BEAD), { kind: 'bloc', ...body }, opts);
export const makeStrand = (loom, body = {}) => loom.createStrand(loom.newKey(STRAND), { day: '2026-09-15T00:00:00Z', items: [], ...body });
```

Replace the whole of `app/test/importer.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, runImport } from '../lib/importer.js';
import { createMemStore } from '../lib/memstore.js';
import { mediaName, sha256Hex } from '../lib/media.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { openLoom } from '../lib/envelope.js';
import { runSend } from '../lib/sender.js';
import { makeBead, registry, steppingNow } from './helpers.mjs';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const T = '2026-09-13T10:00:00Z';
const bead = (id, note, extra = {}) => ({ id, type: B, sourceApp: 'pocket', createdAt: T, state: 'kept', hlc: null,
  body: { $type: B, createdAt: T, kind: 'bloc', note }, ...extra });

async function nameOf(blob) {
  return mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
}

test('first import adds records, rewrites strand items to local keys, fetches photos', async () => {
  const pic = photo();
  const name = await nameOf(pic);
  const s = fakeString({
    records: [
      bead('u1', 'with a photo', { body: { $type: B, createdAt: T, kind: 'bloc', note: 'p', media: [{ uri: `/media/${name}` }] } }),
      bead('u2', 'plain'),
      { id: 'u3', type: S, sourceApp: 'timeline', createdAt: T, state: 'draft',
        body: { $type: S, createdAt: T, title: 'Saturday', items: [{ uri: 'spine://records/u1' }, { uri: 'spine://records/elsewhere' }] } },
    ],
    media: { [name]: pic },
  });
  const store = createMemStore();
  const { counts, conflicts } = await runImport({ store, registry: await registry(), client: s.client, now: () => 1 });
  assert.equal(counts.add, 3);
  assert.equal(counts.photos, 1);
  assert.deepEqual(conflicts, []);
  const strand = await store.getRecord(`${S}/u3`);
  assert.deepEqual(strand.body.items, [{ uri: `loom://${B}/u1` }, { uri: 'spine://records/elsewhere' }]);
  assert.equal(strand.state, 'draft');
  assert.equal(strand.stringId, 'u3');
  assert.equal(strand.origin, 'import');
  assert.ok(await store.getBlob(name.slice(0, 64)));
  assert.equal(await store.getMeta('lastImportAt'), new Date(1).toISOString());
});

test('re-import: unchanged, updated from the String, and a conflict marked with the String’s version', async () => {
  const s = fakeString({ records: [bead('u1', 'one'), bead('u2', 'two'), bead('u3', 'three')] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });

  s.records[1].body.note = 'two, edited on the String';                 // u2: String changed
  s.records[2].body.note = 'three, edited on the String';               // u3: both changed
  const u3 = await store.getRecord(`${B}/u3`);
  await store.putRecord({ ...u3, body: { ...u3.body, note: 'three, edited in Loom' } });

  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.add, counts.update, counts.unchanged, counts.conflict], [0, 1, 1, 1]);
  assert.deepEqual(conflicts, [`${B}/u3`]);
  assert.equal((await store.getRecord(`${B}/u2`)).body.note, 'two, edited on the String');
  const u3After = await store.getRecord(`${B}/u3`);
  assert.equal(u3After.body.note, 'three, edited in Loom');
  assert.equal(u3After.conflict.reason, 'import');
  assert.equal(u3After.conflict.theirs.body.note, 'three, edited on the String');
  assert.equal('conflict' in (await store.getRecord(`${B}/u2`)), false);
});

test('every imported record keeps the String’s version, body keys and photos, for Send', async () => {
  const name = `${'c'.repeat(64)}.jpg`;
  const s = fakeString({ records: [bead('u1', 'one', { body: { $type: B, createdAt: T, kind: 'bloc', note: 'one', media: [{ uri: `/media/${name}` }] } })],
    media: { [name]: photo('c') } });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const local = await store.getRecord(`${B}/u1`);
  assert.equal(local.stringHlc, s.records[0].hlc);
  assert.deepEqual(local.stringKeys, ['$type', 'createdAt', 'kind', 'note', 'media']);
  assert.deepEqual(local.stringMedia, [name]);

  s.records[0].hlc = '0000000000099-00000-fake';                    // restamped on the String, body unchanged (a publish)
  const again = await runImport({ store, registry: reg, client: s.client });
  assert.equal(again.counts.unchanged, 1);
  assert.equal((await store.getRecord(`${B}/u1`)).stringHlc, '0000000000099-00000-fake');
});

test('keeping an imported proposal in Loom is a local change the String does not overwrite', async () => {
  const s = fakeString({ records: [bead('u1', '5 tracks', { state: 'proposal', sourceApp: 'scrobbler' })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const local = await store.getRecord(`${B}/u1`);
  await store.putRecord({ ...local, state: 'kept' });
  s.records[0].body.note = '6 tracks';
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [`${B}/u1`]);
  assert.equal((await store.getRecord(`${B}/u1`)).state, 'kept');
});

test('a record deleted in Loom is never re-added or updated by import', async () => {
  const s = fakeString({ records: [bead('u1', '5 tracks', { state: 'proposal', sourceApp: 'scrobbler' })] });
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  await runImport({ store, registry: reg, client: s.client });
  await loom.remove(`${B}/u1`);                                        // released: deleted on the next Send
  const again = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([again.counts.add, again.counts.update, again.counts.unchanged], [0, 0, 1]);
  s.records[0].body.note = '6 tracks';
  const changed = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([changed.counts.update, changed.conflicts.length], [0, 0]);
  const local = await store.getRecord(`${B}/u1`);
  assert.deepEqual([local.deleted, local.body.note, 'conflict' in local], [true, '5 tracks', false]);
  assert.equal((await store.allRecords()).length, 1);
});

test('a String edit to a record Loom made updates it like any other; a provenance change is a conflict', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const made = await makeBead(loom, { note: 'as written' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  s.records[0].body.note = 'corrected on the String';
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([first.counts.update, first.counts.conflict], [1, 0]);
  assert.equal((await store.getRecord(made.key)).body.note, 'corrected on the String');

  s.records[0].body.provenance = { ...s.records[0].body.provenance, mintedAt: '2020-01-01T00:00:00Z' };
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(second.conflicts, [made.key]);
  const local = await store.getRecord(made.key);
  assert.equal(local.body.provenance.mintedAt, made.body.provenance.mintedAt);
  assert.equal(local.conflict.theirs.body.provenance.mintedAt, '2020-01-01T00:00:00Z');
});

test('an invalid String record is imported and flagged, not dropped', async () => {
  const s = fakeString({ records: [{ ...bead('u1', 'x'), body: { $type: B, createdAt: T } }] });
  const store = createMemStore();
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.equal(counts.invalid, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).invalid, ['$.kind: required field missing']);
});

test('a photo that cannot be fetched is recorded as missing and retried on the next import', async () => {
  const pic = photo('later');
  const name = await nameOf(pic);
  const failMedia = new Set([name]);
  const s = fakeString({ records: [bead('u1', 'p', { body: { $type: B, createdAt: T, kind: 'bloc', media: [{ uri: `/media/${name}` }] } })],
    media: { [name]: pic }, failMedia });
  const store = createMemStore();
  const reg = await registry();
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.equal(first.counts.missing, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).missing, [name]);
  failMedia.clear();
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.equal(second.counts.photos, 1);
  assert.equal('missing' in (await store.getRecord(`${B}/u1`)), false);
});

test('an edit saved while an import fetches a photo is a conflict, and the edit survives', async () => {
  const pic = photo('arrives later');
  const name = await nameOf(pic);
  const s = fakeString({ records: [bead('u1', 'one')], media: { [name]: pic } });
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  await runImport({ store, registry: reg, client: s.client });
  s.records[0].body = { ...s.records[0].body, note: 'one, with a photo', media: [{ uri: `/media/${name}` }] };

  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  const client = { ...s.client, async getMedia(n) { reached(); await opened; return s.client.getMedia(n); } };
  const importing = runImport({ store, registry: reg, client });
  await arrived;
  const local = await store.getRecord(`${B}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited in Loom meanwhile' });
  open();
  const { counts, conflicts } = await importing;
  assert.deepEqual([counts.update, counts.conflict], [0, 1]);
  assert.deepEqual(conflicts, [`${B}/u1`]);
  assert.equal((await store.getRecord(`${B}/u1`)).body.note, 'edited in Loom meanwhile');
});

test('import lists the String day by day and keeps only record types Loom knows', async () => {
  const s = fakeString({ records: [
    bead('u1', 'Saturday'),
    bead('u2', 'Sunday', { createdAt: '2026-09-14T10:00:00Z', body: { $type: B, createdAt: '2026-09-14T10:00:00Z', kind: 'bloc', note: 'Sunday' } }),
    { id: 'x1', type: 'com.example.unknown', sourceApp: 'elsewhere', createdAt: T, state: 'kept', body: { anything: true } },
  ] });
  const store = createMemStore();
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual(s.calls, ['listDays', 'listRecordsForDay 2026-09-14', 'listRecordsForDay 2026-09-13']);
  assert.equal(counts.add, 2);
  assert.deepEqual((await store.allRecords()).map((r) => r.key).sort(), [`${B}/u1`, `${B}/u2`]);
});

const strand = (id, items, extra = {}) => ({ id, type: S, sourceApp: 'timeline', createdAt: T, state: 'kept',
  body: { $type: S, createdAt: T, title: 'Saturday', items: items.map((i) => ({ uri: `spine://records/${i}` })) }, ...extra });

test('a strand re-imported unchanged stays unchanged', async () => {
  const s = fakeString({ records: [bead('u1', 'one'), strand('s1', ['u1'])] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const before = await store.getRecord(`${S}/s1`);
  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.unchanged, counts.update, conflicts.length], [2, 0, 0]);
  assert.deepEqual(await store.getRecord(`${S}/s1`), before);
});

test('a strand member that arrives after its strand is linked in on the next import, with no conflict', async () => {
  const s = fakeString({ records: [strand('s1', ['u9']), strand('s2', ['u9'], { body: { $type: S, createdAt: T, title: 'edited here', items: [{ uri: 'spine://records/u9' }] } })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const s2 = await store.getRecord(`${S}/s2`);
  await store.putRecord({ ...s2, body: { ...s2.body, title: 'retitled in Loom' } });   // s2 changed locally
  s.records.push(bead('u9', 'late'));
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([second.counts.add, second.counts.conflict], [1, 0]);
  const s1 = await store.getRecord(`${S}/s1`);
  assert.deepEqual(s1.body.items, [{ uri: `loom://${B}/u9` }]);
  assert.equal(await contentHash(s1.body), s1.importedHash, 'the rewrite is not a local change');
  assert.deepEqual((await store.getRecord(`${S}/s2`)).body.items, [{ uri: 'spine://records/u9' }], 'a locally changed strand is left alone');
  const third = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([third.counts.unchanged, third.counts.conflict], [3, 0]);
});

test('a photo that still cannot be fetched on retry is counted as missing', async () => {
  const pic = photo('never');
  const name = await nameOf(pic);
  const s = fakeString({ records: [bead('u1', 'p', { body: { $type: B, createdAt: T, kind: 'bloc', media: [{ uri: `/media/${name}` }] } })],
    failMedia: new Set([name]) });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.equal(second.counts.missing, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).missing, [name]);
});

test('planImport is decided by hashes and states alone', async () => {
  const rec = bead('u1', 'x');
  const h = await contentHash(rec.body);
  const local = { key: `${B}/u1`, body: rec.body, state: 'kept', stringHash: h, importedHash: h, importedState: 'kept' };
  assert.equal((await planImport([rec], new Map([['u1', local]])))[0].action, 'unchanged');
  assert.equal((await planImport([{ ...rec, state: 'proposal' }], new Map([['u1', local]])))[0].action, 'update');
});

test('a server that is not a String is refused before anything is read', async () => {
  const store = createMemStore();
  const client = { async health() { throw new Error('http://localhost:8100/health: this does not look like a String'); } };
  await assert.rejects(runImport({ store, registry: await registry(), client }), /does not look like a String/);
  assert.deepEqual(await store.allRecords(), []);
});
```

Create `app/test/migrate.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemStore } from '../lib/memstore.js';
import { migrateRecord, migrateStore } from '../lib/migrate.js';

const B = 'com.cultureblocs.bead';
const rec = (key, state, extra = {}) => ({ key, type: B, state, body: { $type: B, kind: 'bloc' }, ...extra });

test('migrateRecord turns a released proposal into a delete waiting for Send, and leaves the rest alone', () => {
  assert.deepEqual(migrateRecord(rec(`${B}/a`, 'released', { stringId: 'a' })), rec(`${B}/a`, 'proposal', { stringId: 'a', deleted: true }));
  for (const state of ['proposal', 'kept', 'draft', 'published', 'edited']) assert.equal(migrateRecord(rec(`${B}/b`, state)), null);
});

test('migrateStore is idempotent and removes the retired settings', async () => {
  const store = createMemStore();
  await store.putRecord(rec(`${B}/a`, 'released', { stringId: 'a' }));
  await store.putRecord(rec(`${B}/b`, 'kept'));
  await store.setMeta('posture', 'totem');
  await store.setMeta('mask', 'ART');
  await store.setMeta('deviceId', 'desk-1');
  assert.equal(await migrateStore(store), 1);
  assert.equal(await migrateStore(store), 0);
  assert.equal((await store.getRecord(`${B}/a`)).deleted, true);
  assert.deepEqual(await store.allMeta(), { deviceId: 'desk-1' });
});
```

Replace the whole of `app/test/sender.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { planSend, runSend } from '../lib/sender.js';
import { runImport } from '../lib/importer.js';
import { exportBackup, restoreBackup } from '../lib/backup.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

async function setup() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  return { store, loom };
}

const strandBody = (keys, title = 'Sunday') => ({ $type: STRAND, createdAt: '2026-09-15T20:00:00Z',
  day: '2026-09-15T00:00:00Z', title, items: keys.map((k) => ({ uri: itemUri(k) })) });

test('planSend: beads first, finished strands after, drafts and waiting strands held', async () => {
  const { loom, store } = await setup();
  const bead = await makeBead(loom, { note: 'a' });
  const told = await makeStrand(loom, strandBody([bead.key]));
  const draft = await makeStrand(loom, strandBody([bead.key], 'draft'));
  await store.putRecord({ ...draft, state: 'draft' });              // a Phase 1 draft
  const orphan = await makeStrand(loom, strandBody(['com.cultureblocs.bead/elsewhere']));
  const { ready, held } = planSend(await store.allRecords());
  assert.deepEqual(ready.map((r) => r.key), [bead.key, told.key]);
  assert.deepEqual(held, [
    { key: draft.key, reason: 'still a draft' },
    { key: orphan.key, reason: 'waiting for com.cultureblocs.bead/elsewhere' },
  ]);
});

test('runSend uploads photos, posts beads then strands with spine:// items, and records String ids', async () => {
  const { loom, store } = await setup();
  const uri = await putPhoto(store, photo());
  const bead = await makeBead(loom, { note: 'with photo' });
  await loom.save(bead.key, { ...bead.body, media: [{ uri, mime: 'image/jpeg' }] });
  const strand = await makeStrand(loom, strandBody([bead.key]));
  const s = fakeString();

  const results = await runSend({ store, client: s.client, now: () => 5 });
  assert.deepEqual(results.map((r) => r.status), ['sent', 'sent']);
  assert.ok(s.media[uri.split('/').pop()], 'the photo reached the String under the same name');
  assert.deepEqual(s.posted.map((p) => [p.dedupeKey, p.sourceApp]), [[`loom:${bead.rkey}`, 'loom'], [`loom:${strand.rkey}`, 'loom']]);
  assert.deepEqual(s.posted[1].body.items, [{ uri: `spine://records/${results[0].stringId}` }]);
  const sentBead = await store.getRecord(bead.key);
  assert.equal(sentBead.stringId, results[0].stringId);
  assert.equal(sentBead.sentAt, new Date(5).toISOString());
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(bead.key) }], 'Loom keeps its local item uris');
});

test('sending again is harmless: nothing unsent, and a lost response is recovered by dedupe', async () => {
  const { loom, store } = await setup();
  const bead = await makeBead(loom, { note: 'a' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  assert.deepEqual(await runSend({ store, client: s.client }), []);

  const env = await store.getRecord(bead.key);
  const { stringId: _, sentAt: __, ...unsentAgain } = env;          // as if the response never arrived
  await store.putRecord(unsentAgain);
  const [again] = await runSend({ store, client: s.client });
  assert.equal(again.status, 'sent');
  assert.equal(again.stringId, env.stringId);
  assert.equal(s.records.length, 1);
});

test('a record the String rejects stays unsent with its problems; a photo missing locally fails that record only', async () => {
  const { loom, store } = await setup();
  const rejected = await makeBead(loom, { note: 'String says no' });
  const fine = await makeBead(loom, { note: 'fine' });
  const nophoto = await makeBead(loom, { note: 'lost photo' });
  await store.putRecord({ ...nophoto, body: { ...nophoto.body, media: [{ uri: `/media/${'a'.repeat(64)}.jpg` }] } });
  const s = fakeString({ reject: { [`loom:${rejected.rkey}`]: ['$.kind: unknown on this String'] } });
  const results = Object.fromEntries((await runSend({ store, client: s.client })).map((r) => [r.key, r]));
  assert.deepEqual(results[rejected.key], { key: rejected.key, status: 'invalid', problems: ['$.kind: unknown on this String'] });
  assert.equal(results[fine.key].status, 'sent');
  assert.equal(results[nophoto.key].status, 'failed');
  assert.match(results[nophoto.key].reason, /not in this browser/);
  assert.equal((await store.getRecord(rejected.key)).stringId, undefined);
});

const gate = () => {
  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  return { open, arrived, async pass() { reached(); await opened; } };
};

test('an edit saved while its record is being posted survives, and reads as a local change', async () => {
  const { loom, store } = await setup();
  const bead = await makeBead(loom, { note: 'as posted' });
  const s = fakeString();
  const g = gate();
  const client = { ...s.client, async postRecords(batch) { await g.pass(); return s.client.postRecords(batch); } };
  const sending = runSend({ store, client, now: () => 5 });
  await g.arrived;
  await loom.save(bead.key, { ...bead.body, note: 'edited during send' });
  g.open();
  const [result] = await sending;
  assert.equal(result.status, 'sent');
  const after = await store.getRecord(bead.key);
  assert.equal(after.body.note, 'edited during send');
  assert.equal(after.stringId, result.stringId);
  assert.notEqual(await contentHash(after.body), after.importedHash, 'the newer edit is a local change');
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual([counts.update, counts.unchanged], [0, 1]);
  assert.equal((await store.getRecord(bead.key)).body.note, 'edited during send');
});

test('a lost response, a local edit, then a resend answered "duplicate": the edit stays a local change', async () => {
  const { loom, store } = await setup();
  const bead = await makeBead(loom, { note: 'first' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  const { stringId, sentAt: _s, stringHash: _h, importedHash: _i, importedState: _t, ...lost } = await store.getRecord(bead.key);
  await store.putRecord(lost);                                          // the response never arrived
  await loom.save(bead.key, { ...bead.body, note: 'edited after the lost response' });
  const [again] = await runSend({ store, client: s.client });
  assert.deepEqual([again.status, again.stringId, s.records.length], ['sent', stringId, 1]);
  const reg = await registry();
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.equal(first.counts.update, 0);
  assert.equal((await store.getRecord(bead.key)).body.note, 'edited after the lost response');
  s.records[0].body.note = 'changed on the String';
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(second.conflicts, [bead.key]);
  assert.equal((await store.getRecord(bead.key)).body.note, 'edited after the lost response');
});

test('restoring a backup taken before a send, then importing, links the sent records instead of copying them', async () => {
  const { loom, store } = await setup();
  const bead = await makeBead(loom, { note: 'a' });
  await makeStrand(loom, strandBody([bead.key]));
  const doc = JSON.parse(JSON.stringify(await exportBackup(store)));
  const s = fakeString();
  await runSend({ store, client: s.client });
  await restoreBackup(store, doc);
  const reg = await registry();
  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.add, counts.link, conflicts.length], [0, 2, 0]);
  const all = await store.allRecords();
  assert.equal(all.length, 2);
  assert.ok(all.every((r) => r.stringId && r.sentAt));
  assert.deepEqual(await runSend({ store, client: s.client }), []);
  assert.equal(s.posted.length, 2, 'nothing was posted again');
  const again = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([again.counts.unchanged, again.counts.conflict], [2, 0]);
});

test('a sent record comes back from the next import as unchanged, not as a conflict', async () => {
  const { loom, store } = await setup();
  const bead = await makeBead(loom, { note: 'a' });
  await makeStrand(loom, strandBody([bead.key]));
  const s = fakeString();
  await runSend({ store, client: s.client });
  const { runImport } = await import('../lib/importer.js');
  const { counts, conflicts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual(conflicts, []);
  assert.equal(counts.unchanged, 2);
  assert.equal(counts.add, 0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 61 # fail 19`, with:

```text
not ok 6 - backup then restore into an empty store gives back records, photos and settings — never the token
not ok 8 - a backup that is malformed anywhere is refused before anything in the store is touched
not ok 9 - restore keeps this browser's device id and merges the clock forward
not ok 10 - a restore that fails part way through still puts back the token, device id and clock
not ok 11 - a Phase 1 backup restores into the desk: released proposals become deletes waiting for Send, retired settings go
not ok 4 - app/test/envelope.test.mjs
not ok 28 - re-import: unchanged, updated from the String, and a conflict marked with the String’s version
not ok 29 - every imported record keeps the String’s version, body keys and photos, for Send
not ok 31 - a record deleted in Loom is never re-added or updated by import
not ok 32 - a String edit to a record Loom made updates it like any other; a provenance change is a conflict
not ok 9 - app/test/migrate.test.mjs
not ok 48 - planSend: beads first, finished strands after, drafts and waiting strands held
not ok 49 - runSend uploads photos, posts beads then strands with spine:// items, and records String ids
not ok 50 - sending again is harmless: nothing unsent, and a lost response is recovered by dedupe
not ok 51 - a record the String rejects stays unsent with its problems; a photo missing locally fails that record only
not ok 52 - an edit saved while its record is being posted survives, and reads as a local change
not ok 53 - a lost response, a local edit, then a resend answered "duplicate": the edit stays a local change
not ok 54 - restoring a backup taken before a send, then importing, links the sent records instead of copying them
not ok 55 - a sent record comes back from the next import as unchanged, not as a conflict
```

- [ ] **Step 3: Implement**

Replace the whole of `app/lib/backup.js` with:

```javascript
/* One-file backup of everything Loom holds: records, photos (base64) and
 * settings — except the String token, which does not belong in a file you
 * might copy anywhere. Restore replaces the store's contents.
 *
 * Restore checks the whole file and decodes every photo before it clears
 * anything, so a bad file never costs the data already here. This browser
 * keeps its own identity through a restore: its String token, its device id
 * (two browsers must never stamp as one device) and a clock that only moves
 * forward. Those three are put back even if the restore fails part way; the
 * file being restored is still in the user's hands to retry. A backup made by
 * Phase 1 restores into the desk's model (migrate.js). */
import { parseStamp } from './hlc.js';
import { migrateStore } from './migrate.js';

export const BACKUP_TYPE = 'com.cultureblocs.loom.backup';
export const BACKUP_VERSION = 1;
const NOT_BACKED_UP = ['stringToken'];
const THIS_BROWSER = ['stringToken', 'deviceId', 'hlc'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* btoa needs a binary string; String.fromCharCode(...bytes) overflows the
 * argument stack on large arrays, so chunk it (as easel/lib/backup.js). */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function exportBackup(store, now = () => Date.now()) {
  const meta = await store.allMeta();
  for (const k of NOT_BACKED_UP) delete meta[k];
  const blobs = {};
  for (const hash of await store.blobHashes()) {
    const row = await store.getBlob(hash);
    blobs[hash] = { mime: row.mime, data: bytesToBase64(new Uint8Array(await row.blob.arrayBuffer())) };
  }
  return { $type: BACKUP_TYPE, version: BACKUP_VERSION, exportedAt: new Date(now()).toISOString(),
    records: await store.allRecords(), meta, blobs };
}

/* Throws, naming the first problem, unless the whole document can be restored.
 * Returns the decoded blob rows. */
export function checkBackup(doc) {
  if (doc?.$type !== BACKUP_TYPE) throw new Error('not a Loom backup file');
  if (doc.version !== BACKUP_VERSION) throw new Error(`unsupported backup version: ${doc.version}`);
  if (!Array.isArray(doc.records)) throw new Error('backup has no records');
  doc.records.forEach((r, i) => {
    if (!isObject(r) || typeof r.key !== 'string' || typeof r.type !== 'string' || !isObject(r.body)) {
      throw new Error(`backup record ${i} needs a string key, a string type and an object body`);
    }
  });
  if (doc.blobs !== undefined && !isObject(doc.blobs)) throw new Error('backup photos are not an object');
  if (doc.meta !== undefined && !isObject(doc.meta)) throw new Error('backup settings are not an object');
  if (doc.meta?.hlc !== undefined) parseStamp(doc.meta.hlc);
  return Object.entries(doc.blobs || {}).map(([hash, b]) => {
    if (!isObject(b) || typeof b.data !== 'string') throw new Error(`backup photo ${hash} has no data`);
    let bytes;
    try { bytes = base64ToBytes(b.data); } catch { throw new Error(`backup photo ${hash} is not valid base64`); }
    const mime = typeof b.mime === 'string' ? b.mime : 'application/octet-stream';
    return { hash, mime, blob: new Blob([bytes], { type: mime }) };
  });
}

const later = (a, b) => {
  const ok = (s) => { try { parseStamp(s); return true; } catch { return false; } };
  if (!ok(a)) return ok(b) ? b : undefined;
  return ok(b) && b > a ? b : a;
};

export async function restoreBackup(store, doc) {
  const rows = checkBackup(doc);
  const kept = { stringToken: await store.getMeta('stringToken'), deviceId: await store.getMeta('deviceId'),
    hlc: later(await store.getMeta('hlc'), doc.meta?.hlc) };
  try {
    await store.clear();
    for (const r of doc.records) await store.putRecord(r);
    for (const row of rows) await store.putBlob(row);
    for (const [k, v] of Object.entries(doc.meta || {})) if (!THIS_BROWSER.includes(k)) await store.setMeta(k, v);
    await migrateStore(store);
  } finally {
    for (const [k, v] of Object.entries(kept)) if (v !== undefined) await store.setMeta(k, v);
  }
  return { records: doc.records.length, photos: rows.length };
}
```

Replace the whole of `app/lib/envelope.js` with:

```javascript
/* The one write path for records made or edited in Loom.
 *
 * Every write validates against the vendored lexicons and the refs anchor
 * checks before it touches the store; a record with problems is never stored.
 * Every write is stamped with this device's HLC. Imported records arrive
 * through importer.js instead and are the one exception to validation (they
 * are already on the String, so hiding them would be worse).
 *
 * A new record is written whole, once: until Save it exists only as a draft
 * (`draft:<key>` in meta, under a key reserved when its form opened). */
import { anchorProblems } from '../vendor/refs.js';
import { createClock } from './hlc.js';
import { dayOf, itemUri, recordKey } from './keys.js';
import { mediaNames } from './media.js';
import { tidGenerator } from './tid.js';

export const BEAD = 'com.cultureblocs.bead';
export const STRAND = 'com.cultureblocs.strand';
export const EDITABLE = [BEAD, STRAND];
const PUBLISHED = ['published', 'edited'];

export class InvalidRecord extends Error {
  constructor(problems) {
    super(`record is not valid: ${problems.join('; ')}`);
    this.problems = problems;
  }
}

/* Another tab (or an import) wrote the record after this editor loaded it. */
export class Conflict extends Error {
  constructor(current) {
    super('record changed since it was loaded');
    this.current = current;
  }
}

/* Why a record cannot be deleted in Loom, or null if it can. */
export function whyNotDeletable(r) {
  if (!r) return 'there is no such record';
  if (!EDITABLE.includes(r.type)) return 'records of this type are read-only in Loom';
  if (PUBLISHED.includes(r.state)) return 'it is published: unpublish it first';
  return null;
}

const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const randomDeviceId = () => `loom-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

export async function openLoom({ store, registry, now = () => Date.now(), newDeviceId = randomDeviceId, nowMicros }) {
  let deviceId = await store.getMeta('deviceId');
  if (!deviceId) {
    deviceId = newDeviceId();
    await store.setMeta('deviceId', deviceId);
  }
  const clock = createClock(deviceId, { now, last: await store.getMeta('hlc') });
  const tid = tidGenerator({ nowMicros: nowMicros ?? (() => BigInt(now()) * 1000n) });
  const iso = () => new Date(now()).toISOString();

  async function stamp() {
    const s = clock.tick();
    await store.setMeta('hlc', s);
    return s;
  }

  function validate(type, body) {
    return [...registry.validateRecord(type, body), ...anchorProblems(type, body)];
  }

  function check(type, body) {
    const problems = validate(type, body);
    if (problems.length) throw new InvalidRecord(problems);
  }

  /* `at` is the moment of the save: the record's updatedAt, and the time its body records. */
  async function create(key, type, body, at) {
    check(type, body);
    if (await store.getRecord(key)) throw new Error(`${key} already exists`);
    const env = {
      key, type, rkey: key.slice(type.length + 1), body, state: 'kept', origin: 'loom', sourceApp: 'loom',
      createdAt: body.createdAt, updatedAt: at, hlc: await stamp(), deviceId,
      day: dayOf(type, body, body.createdAt),
    };
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }

  /* Replace a record's body. `expectUpdatedAt` is the updatedAt the editor
   * loaded; if the stored record has moved on, nothing is written. Provenance
   * is fixed: a body that changes it is refused. Editing a proposal keeps it;
   * saving a Phase 1 draft that never reached the String keeps it too. */
  async function save(key, body, { expectUpdatedAt } = {}) {
    const current = await store.getRecord(key);
    if (!current) throw new Error(`no record ${key}`);
    if (current.deleted) throw new Error(`${key} is deleted: undo the delete to edit it`);
    if (expectUpdatedAt !== undefined && current.updatedAt !== expectUpdatedAt) throw new Conflict(current);
    if (!same(body?.provenance, current.body?.provenance)) throw new InvalidRecord(['$.provenance: fixed when the record was made']);
    check(current.type, body);
    // The body just passed the gate, so an import's `invalid` flag and the
    // String's last refusal no longer apply; `missing` keeps only photos the new body still uses.
    const { invalid: _i, problems: _p, missing = [], ...rest } = current;
    const keeps = current.state === 'proposal' || (current.state === 'draft' && !current.stringId);
    const env = {
      ...rest, body, updatedAt: iso(), hlc: await stamp(), deviceId,
      state: keeps ? 'kept' : current.state,
      day: dayOf(current.type, body, current.createdAt),
    };
    const used = new Set(mediaNames(body));
    const still = (Array.isArray(missing) ? missing : []).filter((n) => used.has(n));
    if (still.length) env.missing = still;
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }

  async function rewrite(current, changes) {
    const env = { ...current, ...changes, updatedAt: iso(), hlc: await stamp(), deviceId };
    await store.putRecord(env);
    return env;
  }

  /* Strands (not deleted) whose items point at `key`. */
  async function strandsUsing(key) {
    const uri = itemUri(key);
    return (await store.allRecords()).filter((r) => r.type === STRAND && !r.deleted
      && list(r.body?.items).some((it) => it?.uri === uri));
  }

  return {
    deviceId,
    validate,
    get: (key) => store.getRecord(key),
    /* A key for a record not yet written: its draft lives under this key until Save. */
    newKey: (type) => recordKey(type, tid()),

    /* A bead, whole. `createdAt` is when it happened (defaults to now);
     * provenance records the save, and whether the time was left at now. */
    createBead(key, body, { timeAnchored = true } = {}) {
      const at = iso();
      const full = { ...body, $type: BEAD, createdAt: body.createdAt || at,
        provenance: { app: 'loom', device: deviceId, mintedAt: at, timeAnchored } };
      return create(key, BEAD, full, at);
    },
    /* A strand, whole: made now, for the day in its body. */
    createStrand(key, body) {
      const at = iso();
      return create(key, STRAND, { ...body, $type: STRAND, createdAt: at, items: list(body.items) }, at);
    },
    save,

    async keep(key) {
      const current = await store.getRecord(key);
      if (current?.state !== 'proposal') throw new Error(`a ${current?.state ?? 'missing'} record cannot be kept`);
      return rewrite(current, { state: 'kept' });
    },

    strandsUsing,

    /* Delete a record (releasing a proposal is the same act). One never on the
     * String goes now; one on the String is marked `deleted` until Send deletes
     * it there. Strands that use a deleted bead lose that item (validated and
     * stamped, their state untouched). Returns the keys of the strands changed. */
    async remove(key) {
      const current = await store.getRecord(key);
      const why = whyNotDeletable(current);
      if (why) throw new Error(`cannot delete ${key}: ${why}`);
      const changed = [];
      for (const s of await strandsUsing(key)) {
        const body = { ...s.body, items: list(s.body.items).filter((it) => it?.uri !== itemUri(key)) };
        check(STRAND, body);
        await rewrite(s, { body });
        changed.push(s.key);
      }
      await store.deleteMeta(`draft:${key}`);
      if (current.stringId) await rewrite(current, { deleted: true });
      else await store.deleteRecord(key);
      return changed;
    },

    /* Take back a delete Send has not made yet. Strands keep the items they lost. */
    async undoRemove(key) {
      const current = await store.getRecord(key);
      if (!current?.deleted) throw new Error(`${key} is not waiting to be deleted`);
      const { deleted: _, ...rest } = current;
      return rewrite(rest, {});
    },

    /* Unsaved work survives reloads here until saved or discarded. For an
     * existing record `baseUpdatedAt` is the updatedAt the edits were typed
     * against (saving over a newer record is a Conflict); a new record's draft
     * has none and names its type. */
    saveDraft: (key, body, baseUpdatedAt = null, type = null) =>
      store.setMeta(`draft:${key}`, { body, at: iso(), baseUpdatedAt, ...(type ? { type } : {}) }),
    getDraft: (key) => store.getMeta(`draft:${key}`),
    discardDraft: (key) => store.deleteMeta(`draft:${key}`),
    /* Drafts of records not yet written: [{ key, type, body, at }]. */
    async newDrafts() {
      const meta = await store.allMeta();
      const out = [];
      for (const [k, v] of Object.entries(meta)) {
        if (!k.startsWith('draft:') || !v?.type) continue;
        const key = k.slice('draft:'.length);
        if (!(await store.getRecord(key))) out.push({ key, type: v.type, body: v.body, at: v.at });
      }
      return out;
    },
  };
}
```

Replace the whole of `app/lib/importer.js` with:

```javascript
/* Import from the String (replaced by sync in Phase 2).
 *
 * Re-runnable. Each String record is planned against its local copy:
 *   add        not held locally
 *   link       a record Loom sent (dedupeKey "loom:<rkey>") whose local copy
 *              lost its stringId, e.g. after restoring an older backup
 *   update     unchanged in Loom since the last import, changed on the String
 *   unchanged  the same on both sides — or deleted in Loom, waiting for Send
 *   conflict   changed on both sides, or its provenance changed on the String:
 *              the local record is kept and marked `conflict` with the String's
 *              version (`theirs`) for the person to choose (conflicts.js)
 * "Changed in Loom" compares the local body with `importedHash` (its hash as
 * stored at import) and the state with `importedState`; "changed on the String"
 * compares the String's body with `stringHash` and its state with `importedState`.
 * Two hashes, because import rewrites a strand's items from spine:// to loom://.
 * Every record also keeps what Send needs to edit it on the String: its version
 * (`stringHlc`), the top-level keys of its body (`stringKeys`) and the photos it
 * uses there (`stringMedia`).
 *
 * Every write re-reads the local record first: the network awaits in between
 * give another tab time to save, and a stale snapshot must never undo that. */
import { contentHash } from '../vendor/strip.js';
import { dayOf, idFromSpineUri, recordKey, toLoomItems } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const STRAND = 'com.cultureblocs.strand';
const LOOM_DEDUPE = 'loom:';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* What Send needs to know about the String's copy of a record. */
export const stringFields = (rec) => ({ stringHlc: rec.hlc ?? null,
  stringKeys: Object.keys(rec.body || {}), stringMedia: mediaNames(rec.body) });

/* The action for one String record against one local record (held under its stringId). */
async function decide(rec, local) {
  if (local.deleted) return 'unchanged';      // Send deletes it, or finds the String moved on
  const stringState = rec.state || 'kept';
  const bodyChanged = (await contentHash(rec.body)) !== local.stringHash;
  const stringChanged = bodyChanged || stringState !== local.importedState;
  if (!stringChanged) return 'unchanged';
  if (bodyChanged && !same(rec.body?.provenance, local.body?.provenance)) return 'conflict';   // provenance is fixed
  const loomChanged = (await contentHash(local.body)) !== local.importedHash || local.state !== local.importedState;
  return loomChanged ? 'conflict' : 'update';
}

/* The local record a String record was sent from, if it has not been linked yet. */
function sentFrom(rec, localByKey) {
  if (typeof rec.dedupeKey !== 'string' || !rec.dedupeKey.startsWith(LOOM_DEDUPE)) return null;
  const local = localByKey.get(recordKey(rec.type, rec.dedupeKey.slice(LOOM_DEDUPE.length)));
  return local && local.sourceApp === 'loom' && !local.stringId ? local : null;
}

export async function planImport(stringRecords, localByStringId, localByKey = new Map()) {
  const plan = [];
  for (const rec of stringRecords) {
    const local = localByStringId.get(rec.id);
    if (local) { plan.push({ action: await decide(rec, local), rec, local }); continue; }
    const origin = sentFrom(rec, localByKey);
    plan.push(origin ? { action: 'link', rec, local: origin } : { action: 'add', rec });
  }
  return plan;
}

export async function runImport({ store, registry, client, now = () => Date.now(), onProgress = () => {} }) {
  const iso = () => new Date(now()).toISOString();
  const types = new Set((await client.health()).filter((t) => registry.recordTypes().includes(t)));
  // Day by day: each day is far under the String's per-request limit (the client fails loudly if one is not).
  const stringRecords = [];
  for (const { day } of await client.listDays()) {
    stringRecords.push(...(await client.listRecordsForDay(day)).filter((r) => types.has(r.type)));
  }

  const all = await store.allRecords();
  const locals = new Map(all.filter((r) => r.stringId).map((r) => [r.stringId, r]));
  const plan = await planImport(stringRecords, locals, new Map(all.map((r) => [r.key, r])));
  const counts = { add: 0, link: 0, update: 0, unchanged: 0, conflict: 0, invalid: 0, photos: 0, missing: 0 };
  const conflicts = [];

  const keyByStringId = new Map([...locals.values()].map((r) => [r.stringId, r.key]));
  for (const { action, rec, local } of plan) {
    if (action === 'add') keyByStringId.set(rec.id, recordKey(rec.type, rec.id));
    if (action === 'link') keyByStringId.set(rec.id, local.key);
  }

  const conflict = (key) => { counts.conflict += 1; conflicts.push(key); };

  // Strands last, so every item they point at is already held.
  const ordered = [...plan].sort((a, b) => (a.rec.type === STRAND) - (b.rec.type === STRAND));
  for (const { action, rec, local } of ordered) {
    if (action === 'unchanged') {
      counts.unchanged += 1;
      // The String can restamp a record without changing it (a publish): keep the version Send will edit against.
      if (local.stringHlc !== (rec.hlc ?? null) || !local.stringKeys) {
        const cur = await store.getRecord(local.key);
        if (cur?.stringId === rec.id && (await decide(rec, cur)) === 'unchanged') await store.putRecord({ ...cur, ...stringFields(rec) });
      }
      continue;
    }
    if (action === 'conflict') {
      const cur = await store.getRecord(local.key);
      if (cur?.stringId === rec.id) await store.putRecord({ ...cur, conflict: { theirs: rec, at: iso(), reason: 'import' } });
      conflict(local.key);
      continue;
    }
    const body = rec.type === STRAND ? toLoomItems(rec.body, keyByStringId) : rec.body;
    const key = local?.key ?? recordKey(rec.type, rec.id);

    if (action === 'link') {
      const cur = await store.getRecord(key);
      if (!cur || cur.stringId) { counts.unchanged += 1; continue; }   // linked meanwhile (another tab)
      await store.putRecord({ ...cur, stringId: rec.id, sentAt: cur.sentAt ?? iso(),
        stringHash: await contentHash(rec.body), importedHash: await contentHash(body),
        importedState: rec.state || 'kept', ...stringFields(rec) });
      counts.link += 1;
      onProgress(counts);
      continue;
    }

    const problems = registry.validateRecord(rec.type, rec.body);
    const env = {
      key, type: rec.type, rkey: local?.rkey ?? rec.id,
      body, state: rec.state || 'kept', origin: local?.origin ?? 'import', sourceApp: rec.sourceApp,
      createdAt: rec.createdAt, updatedAt: iso(), hlc: rec.hlc ?? null, deviceId: 'string',
      day: dayOf(rec.type, body, rec.createdAt), stringId: rec.id,
      stringHash: await contentHash(rec.body), importedHash: await contentHash(body),
      importedState: rec.state || 'kept', ...stringFields(rec),
    };
    if (local?.sentAt) env.sentAt = local.sentAt;
    if (problems.length) env.invalid = problems;
    const missing = [];
    for (const name of mediaNames(body)) {
      const hash = hashFromName(name);
      if (await store.getBlob(hash)) continue;
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash, mime: blob.type, blob });
        counts.photos += 1;
      } catch {
        missing.push(name);
      }
    }
    if (missing.length) env.missing = missing;

    // Re-read immediately before writing: plan it again against what is stored now.
    const cur = await store.getRecord(key);
    const again = cur ? (cur.stringId === rec.id ? await decide(rec, cur) : 'conflict') : 'add';
    if (again === 'unchanged') { counts.unchanged += 1; continue; }
    if (again === 'conflict' || (again === 'add') !== (action === 'add')) {
      if (cur) await store.putRecord({ ...cur, conflict: { theirs: rec, at: iso(), reason: 'import' } });
      conflict(key);
      continue;
    }

    counts[action] += 1;
    if (problems.length) counts.invalid += 1;
    counts.missing += missing.length;
    await store.putRecord(env);   // one record per write: an interrupted import leaves a consistent store
    onProgress(counts);
  }

  // Records added or updated before their photos could be fetched retry next time.
  for (const r of await store.allRecords()) {
    if (!r.missing?.length || plan.some((p) => p.rec.id === r.stringId && (p.action === 'add' || p.action === 'update'))) continue;
    const still = [];
    for (const name of r.missing) {
      const hash = hashFromName(name);
      if (await store.getBlob(hash)) continue;          // another record fetched it this run
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash, mime: blob.type, blob });
        counts.photos += 1;
      } catch { still.push(name); }
    }
    const cur = await store.getRecord(r.key);
    if (!cur) continue;
    const referenced = new Set(mediaNames(cur.body));
    const left = still.filter((n) => referenced.has(n));
    counts.missing += left.length;
    const { missing: _, ...rest } = cur;
    await store.putRecord(left.length ? { ...rest, missing: left } : rest);   // only `missing` changes
  }
  // A strand imported before one of its members keeps that item as spine://.
  // Now the member may be held: rewrite strands nobody has changed in Loom.
  const held = await store.allRecords();
  const heldByStringId = new Map(held.filter((r) => r.stringId).map((r) => [r.stringId, r.key]));
  for (const r of held) {
    if (r.type !== STRAND || !r.stringId || !Array.isArray(r.body?.items)) continue;
    if (!r.body.items.some((it) => heldByStringId.has(idFromSpineUri(it?.uri)))) continue;
    const cur = await store.getRecord(r.key);
    if (!cur || (await contentHash(cur.body)) !== cur.importedHash) continue;   // changed locally: leave it
    const body = toLoomItems(cur.body, heldByStringId);
    await store.putRecord({ ...cur, body, updatedAt: iso(), importedHash: await contentHash(body) });
  }
  await store.setMeta('lastImportAt', iso());
  return { counts, conflicts };
}
```

Create `app/lib/migrate.js` with:

```javascript
/* Phase 1 records and settings, brought to the desk's model. Idempotent: run
 * when Loom opens and after every restore, so a Phase 1 backup restores too.
 *
 *   state "released"   a proposal released in Loom that the String still held:
 *                      now a proposal marked `deleted`, which Send deletes there
 *   posture, masks, mask   settings of the retired Mint and posture: removed */

const RETIRED_META = ['posture', 'masks', 'mask'];

/* The record in the desk's model, or null if it needs no change. Pure. */
export function migrateRecord(r) {
  if (r?.state === 'released') return { ...r, state: 'proposal', deleted: true };
  return null;
}

/* Returns how many records changed. */
export async function migrateStore(store) {
  let changed = 0;
  for (const r of await store.allRecords()) {
    const next = migrateRecord(r);
    if (next) { await store.putRecord(next); changed += 1; }
  }
  for (const k of RETIRED_META) await store.deleteMeta(k);
  return changed;
}
```

Replace the whole of `app/sw.js` with:

```javascript
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-2';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js', './lib/migrate.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/html.js', './ui/view-refs.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 97 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/lib/backup.js app/lib/envelope.js app/lib/importer.js app/lib/migrate.js app/sw.js app/test/backup.test.mjs app/test/envelope.test.mjs app/test/helpers.mjs app/test/importer.test.mjs app/test/migrate.test.mjs app/test/sender.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): records written whole, fixed provenance, deletes with a marker; import keeps the String's version and marks conflicts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 5: The String column's model

`day.js` becomes the String column's model: what each record has waiting for Send, the days that hold records, a month as a grid, the entry list with drafts of new records, and the filter. Deleted records disappear from every view here. `isLoomOnly` stays for the Phase 1 sender until Task 6 removes it.

**Files:**
- Modify: `app/lib/day.js`
- Modify: `app/test/day.test.mjs`

**Interfaces:**
- Consumes: `contentHash` (vendored strip).
- Produces (`app/lib/day.js`):
  - `pendingChange(record) → 'new' | 'edit' | 'state' | 'delete' | null` (async); `pendingChanges(records) → Map<key, change>` (async).
  - `dayCounts(records) → Map<day, count>`; `shiftMonth('YYYY-MM', by) → 'YYYY-MM'`; `monthGrid(month, counts) → [[{ day, date, count } | null ×7]]` Monday first.
  - `summary(type, body) → string`; `matches(record, { text, kind, app }) → boolean`; `sourceApps(records) → [app]`.
  - `entryList(records, { filter, drafts, today }) → [{ day, rows }]`, a row `{ key, type, kind, line, at, record }` or `{ key, type, kind, line, at, draft: true }`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `app/test/day.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCounts, entryList, matches, monthGrid, pendingChange, pendingChanges, shiftMonth, sourceApps, summary } from '../lib/day.js';
import { contentHash } from '../vendor/strip.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const rec = (key, type, createdAt, extra = {}) => ({ key, type, createdAt, day: createdAt.slice(0, 10),
  sourceApp: 'loom', state: 'kept', body: { kind: 'visit' }, ...extra });

/* A record as import or send leaves it: in step with the String. */
async function synced(key, body, extra = {}) {
  const h = await contentHash(body);
  return { ...rec(key, B, '2026-09-14T09:00:00Z'), body, stringId: key, stringHash: h, importedHash: h, importedState: 'kept', ...extra };
}

test('pendingChange: new, edit, state and delete — and nothing for a record in step, in conflict, or a Phase 1 draft', async () => {
  const body = { $type: B, kind: 'visit', note: 'a' };
  assert.equal(await pendingChange(rec(`${B}/n`, B, '2026-09-14T09:00:00Z')), 'new');
  assert.equal(await pendingChange(rec(`${B}/d`, B, '2026-09-14T09:00:00Z', { state: 'draft' })), null);
  assert.equal(await pendingChange(await synced('s1', body)), null);
  assert.equal(await pendingChange({ ...(await synced('s1', body)), body: { ...body, note: 'b' } }), 'edit');
  assert.equal(await pendingChange(await synced('s1', body, { state: 'kept', importedState: 'proposal' })), 'state');
  assert.equal(await pendingChange(await synced('s1', body, { deleted: true })), 'delete');
  assert.equal(await pendingChange({ ...(await synced('s1', body)), body: { ...body, note: 'b' }, conflict: { theirs: null } }), null);
  assert.equal(await pendingChange(rec(`${B}/x`, B, '2026-09-14T09:00:00Z', { deleted: true })), null);
});

test('an edit that also kept a proposal is one edit (the String keeps a proposal it is sent an edit for)', async () => {
  const body = { $type: B, kind: 'visit', note: 'a' };
  const r = { ...(await synced('s1', body, { importedState: 'proposal' })), body: { ...body, note: 'b' } };
  assert.equal(await pendingChange(r), 'edit');
  const all = await pendingChanges([r, await synced('s2', body), rec(`${B}/n`, B, '2026-09-14T09:00:00Z')]);
  assert.deepEqual([...all], [['s1', 'edit'], [`${B}/n`, 'new']]);
});

test('dayCounts leave deleted records out', () => {
  const counts = dayCounts([rec('a', B, '2026-09-14T09:00:00Z'), rec('b', B, '2026-09-14T10:00:00Z'),
    rec('c', B, '2026-09-13T10:00:00Z', { deleted: true })]);
  assert.deepEqual([...counts], [['2026-09-14', 2]]);
});

test('monthGrid lays a month out in Monday-first weeks with counts', () => {
  const weeks = monthGrid('2026-09', new Map([['2026-09-14', 3]]));
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0].slice(0, 2), [null, { day: '2026-09-01', date: 1, count: 0 }], '1 September 2026 is a Tuesday');
  assert.deepEqual(weeks[2][0], { day: '2026-09-14', date: 14, count: 3 });
  assert.equal(weeks.flat().filter(Boolean).length, 30);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(monthGrid('2026-02').flat().filter(Boolean).length, 28);
});

test('shiftMonth crosses years both ways', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-09', 0), '2026-09');
});

test('summary: a strand’s title or first narrative line, a bead’s first note line or place', () => {
  assert.equal(summary(S, { title: 'Sunday', narrative: 'x' }), 'Sunday');
  assert.equal(summary(S, { narrative: '\n  The Rothko room\nmore' }), 'The Rothko room');
  assert.equal(summary(S, {}), 'Untitled strand');
  assert.equal(summary(B, { note: 'one\ntwo' }), 'one');
  assert.equal(summary(B, { subject: { name: 'Tate Modern' } }), 'Tate Modern');
  assert.equal(summary(B, { note: 7 }), '');
});

test('matches filters by text across note, title, narrative, place, tags and ref labels; by kind; by app', () => {
  const b = rec('a', B, '2026-09-14T09:00:00Z', { sourceApp: 'rounds',
    body: { kind: 'listen', note: 'Alice Coltrane', tags: ['jazz'], refs: [{ descriptor: { label: 'Journey in Satchidananda' } }] } });
  const s = rec('s', S, '2026-09-14T22:00:00Z', { body: { title: 'Sunday', narrative: 'At the Tate', items: [] } });
  assert.equal(matches(b, { text: 'coltrane' }), true);
  assert.equal(matches(b, { text: 'JAZZ' }), true);
  assert.equal(matches(b, { text: 'satchidananda' }), true);
  assert.equal(matches(s, { text: 'tate' }), true);
  assert.equal(matches(b, { text: 'tate' }), false);
  assert.equal(matches(b, { kind: 'listen' }), true);
  assert.equal(matches(s, { kind: 'strand' }), true);
  assert.equal(matches(s, { kind: 'listen' }), false);
  assert.equal(matches(b, { app: 'rounds' }), true);
  assert.equal(matches(s, { app: 'rounds' }), false);
  assert.equal(matches({ ...b, body: { tags: 'not a list', refs: {} } }, { text: 'x' }), false);
});

test('entryList: newest day first, drafts of new records first in their day, deleted left out, filter applied', () => {
  const rows = entryList([
    rec(`${B}/a`, B, '2026-09-14T08:00:00Z', { body: { kind: 'visit', note: 'morning' } }),
    rec(`${B}/b`, B, '2026-09-14T12:00:00Z', { body: { kind: 'listen', note: 'noon' } }),
    rec(`${B}/c`, B, '2026-09-13T12:00:00Z', { body: { kind: 'read', note: 'yesterday' } }),
    rec(`${B}/gone`, B, '2026-09-14T13:00:00Z', { deleted: true }),
    rec(`${S}/s`, S, '2026-09-15T20:00:00Z', { day: '2026-09-14', body: { title: 'Sunday', items: [] } }),
  ], { drafts: [{ key: `${B}/new`, type: B, body: { kind: 'note', note: 'half', createdAt: '2026-09-14T07:00:00Z' }, at: '2026-09-15T09:00:00Z' },
    { key: `${S}/new`, type: S, body: { day: '' }, at: '2026-09-15T09:00:00Z' }], today: '2026-09-15' });
  assert.deepEqual(rows.map((d) => [d.day, d.rows.map((r) => r.key)]), [
    ['2026-09-15', [`${S}/new`]],
    ['2026-09-14', [`${B}/new`, `${S}/s`, `${B}/b`, `${B}/a`]],
    ['2026-09-13', [`${B}/c`]],
  ]);
  const sunday = rows[1].rows[1];
  assert.deepEqual([sunday.kind, sunday.line, sunday.record.key], ['strand', 'Sunday', `${S}/s`]);
  assert.deepEqual([rows[1].rows[0].draft, rows[1].rows[0].line], [true, 'half']);
  const filtered = entryList([rec(`${B}/a`, B, '2026-09-14T08:00:00Z', { body: { kind: 'visit', note: 'morning' } }),
    rec(`${B}/b`, B, '2026-09-14T12:00:00Z', { body: { kind: 'listen', note: 'noon' } })], { filter: { kind: 'listen' } });
  assert.deepEqual(filtered.map((d) => d.rows.map((r) => r.key)), [[`${B}/b`]]);
});

test('entryList and sourceApps survive records whose shapes are wrong', () => {
  const odd = rec(`${B}/o`, B, '2026-09-14T08:00:00Z', { sourceApp: undefined, body: { kind: 5, note: ['x'], tags: 'y' } });
  assert.deepEqual(entryList([odd]).map((d) => d.rows[0].kind), ['bead']);
  assert.deepEqual(sourceApps([odd, rec('b', B, '2026-09-14T08:00:00Z', { sourceApp: 'rounds' }),
    rec('c', B, '2026-09-14T08:00:00Z', { sourceApp: 'pocket', deleted: true })]), ['rounds']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 90 # fail 1`, with:

```text
not ok 3 - app/test/day.test.mjs
```

- [ ] **Step 3: Implement**

Replace the whole of `app/lib/day.js` with:

```javascript
/* The String column's model: which days hold records, a month as a grid, the
 * entry list and its filter, and what each record has waiting for Send.
 * Pure, except that telling an edit needs a content hash. Records marked
 * `deleted` are gone from every view here; Send still sees them. */
import { contentHash } from '../vendor/strip.js';

const STRAND = 'com.cultureblocs.strand';
const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const str = (v) => (typeof v === 'string' ? v : '');

/* Made in Loom and not on the String: lives only in this browser. */
export const isLoomOnly = (r) => r.sourceApp === 'loom' && !r.stringId;

/* What Send has to do for a record: 'new' | 'edit' | 'state' | 'delete', or null.
 * A record in conflict waits for the person; a Phase 1 draft never sent stays home. */
export async function pendingChange(r) {
  if (r.conflict) return null;
  if (!r.stringId) return r.deleted || r.state === 'draft' ? null : 'new';
  if (r.deleted) return 'delete';
  if ((await contentHash(r.body)) !== r.importedHash) return 'edit';
  if (r.state !== r.importedState) return 'state';
  return null;
}

/* Map key -> change, for the records that have one. */
export async function pendingChanges(records) {
  const out = new Map();
  for (const r of records) {
    const change = await pendingChange(r);
    if (change) out.set(r.key, change);
  }
  return out;
}

/* Map day -> how many records (not deleted) the day holds. */
export function dayCounts(records) {
  const counts = new Map();
  for (const r of records) if (r.day && !r.deleted) counts.set(r.day, (counts.get(r.day) || 0) + 1);
  return counts;
}

/* 'YYYY-MM' moved by `by` months. */
export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/* A month as weeks, Monday first: [[{ day, date, count } | null, ×7], …]. */
export function monthGrid(month, counts = new Map()) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(lead).fill(null);
  for (let date = 1; date <= length; date++) {
    const day = `${month}-${String(date).padStart(2, '0')}`;
    cells.push({ day, date, count: counts.get(day) || 0 });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const firstLine = (s) => str(s).split('\n').find((l) => l.trim())?.trim() ?? '';

/* The words a row shows for a record body. */
export function summary(type, body) {
  const b = body || {};
  if (type === STRAND) return firstLine(b.title) || firstLine(b.narrative) || 'Untitled strand';
  return firstLine(b.note) || str(b.subject?.name) || str(b.work?.title) || '';
}

const kindOf = (type, body) => (type === STRAND ? 'strand' : str(body?.kind) || type.split('.').pop());

/* Does a record match { text, kind, app }? Empty parts match everything. */
export function matches(r, { text = '', kind = '', app = '' } = {}) {
  if (kind && kindOf(r.type, r.body) !== kind) return false;
  if (app && r.sourceApp !== app) return false;
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const b = r.body || {};
  const hay = [b.note, b.title, b.narrative, b.subject?.name, b.place?.name, ...list(b.tags),
    ...list(b.refs).map((ref) => ref?.descriptor?.label)].filter((v) => typeof v === 'string').join('\n').toLowerCase();
  return hay.includes(needle);
}

/* The day a new record's draft belongs to. */
const draftDay = (d, today) => str(d.type === STRAND ? d.body?.day : d.body?.createdAt).slice(0, 10) || today;

/* The entry list: [{ day, rows }] newest day first. Within a day, drafts of new
 * records first, then records newest first. A row is
 * { key, type, kind, line, at, record } for a record, or
 * { key, type, kind, line, at, draft: true } for a draft of a record not yet saved. */
export function entryList(records, { filter = {}, drafts = [], today = '' } = {}) {
  const days = new Map();
  const add = (day, row) => {
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  };
  for (const r of records) {
    if (r.deleted || !r.day || !matches(r, filter)) continue;
    add(r.day, { key: r.key, type: r.type, kind: kindOf(r.type, r.body), line: summary(r.type, r.body), at: str(r.createdAt), record: r });
  }
  for (const d of drafts) {
    const row = { key: d.key, type: d.type, body: d.body, sourceApp: 'loom' };
    if (!matches(row, filter)) continue;
    add(draftDay(d, today), { key: d.key, type: d.type, kind: kindOf(d.type, d.body), line: summary(d.type, d.body), at: str(d.at), draft: true });
  }
  const order = (a, b) => (a.draft !== b.draft ? (a.draft ? -1 : 1) : a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  return [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, rows]) => ({ day, rows: rows.sort(order) }));
}

/* The source apps present, for the filter. */
export const sourceApps = (records) => [...new Set(records.filter((r) => !r.deleted).map((r) => r.sourceApp).filter(Boolean))].sort();
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 99 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/lib/day.js app/test/day.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): the String column's model — pending changes, month grid, entry list, filter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 6: Send every change

The sender plans every pending change and runs it against the String with safe retries: POST for new records (then a GET for the String's version), PATCH with `If-Match` and `null` for removed fields, POST state, DELETE with `If-Match`. A 412 marks the record `conflict` unless the String already holds exactly what was being sent. A 404 on DELETE is done; on PATCH or state it is a conflict with nothing on the String's side. A refused token stops the Send.

**Files:**
- Modify: `app/lib/day.js`
- Modify: `app/lib/sender.js`
- Modify: `app/test/sender.test.mjs`

**Interfaces:**
- Consumes: `pendingChanges` (Task 5), `stringFields` (Task 4), `client.patchRecord`/`setState`/`deleteRecord`/`getRecord` and `StringError.status`/`detail` (Task 2), `toLoomItems`, `spineUri`, `keyFromItemUri`, `mediaNames`, `hashFromName`.
- Produces (`app/lib/sender.js`):
  - `planSend(records) → { ready: [{ op: 'post' | 'patch' | 'state' | 'delete', key }], held: [{ key, reason }] }` (async).
  - `runSend({ store, client, now, onProgress }) → [{ key, op, status: 'sent' | 'held' | 'conflict' | 'invalid' | 'failed', stringId?, reason?, problems? }]`.
  - A 422 sets `problems` on the record. `isLoomOnly` is removed from `day.js`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `app/test/sender.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { planSend, runSend } from '../lib/sender.js';
import { runImport } from '../lib/importer.js';
import { exportBackup, restoreBackup } from '../lib/backup.js';
import { pendingChanges } from '../lib/day.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

async function setup(records = []) {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records });
  return { store, loom, s, reg, importAll: () => runImport({ store, registry: reg, client: s.client }) };
}

const T = '2026-09-13T10:00:00Z';
const onString = (id, extra = {}) => ({ id, type: BEAD, sourceApp: 'rounds', createdAt: T, state: 'kept', dedupeKey: `rounds:${id}`,
  body: { $type: BEAD, createdAt: T, kind: 'listen', note: `note ${id}`, tags: ['jazz'] }, ...extra });
const strandBody = (keys, title = 'Sunday') => ({ day: '2026-09-15T00:00:00Z', title, items: keys.map((k) => ({ uri: itemUri(k) })) });
const statuses = (results) => results.map((r) => [r.op ?? null, r.status]);
const pending = async (store) => [...(await pendingChanges(await store.allRecords()))];

test('planSend orders new beads, bead edits, strands, state changes, then deletes strands before beads — and holds what must wait', async () => {
  const { store, loom, s, importAll } = await setup([onString('e1'), onString('p1', { state: 'proposal' }), onString('d1'),
    { id: 'ds', type: STRAND, sourceApp: 'loom', createdAt: T, state: 'kept', body: { $type: STRAND, createdAt: T, items: [] } }]);
  await importAll();
  const fresh = await makeBead(loom, { note: 'new' });
  const e1 = await store.getRecord(`${BEAD}/e1`);
  await loom.save(e1.key, { ...e1.body, note: 'edited' });
  await loom.keep(`${BEAD}/p1`);
  await loom.remove(`${BEAD}/d1`);
  await loom.remove(`${STRAND}/ds`);
  const told = await makeStrand(loom, strandBody([fresh.key]));
  const orphan = await makeStrand(loom, strandBody([`${BEAD}/elsewhere`]));
  const draft = await makeStrand(loom, strandBody([]));
  await store.putRecord({ ...draft, state: 'draft' });                           // a Phase 1 draft
  const conflicted = await makeBead(loom, { note: 'x' });
  await store.putRecord({ ...conflicted, conflict: { theirs: null, reason: 'send' } });

  const { ready, held } = await planSend(await store.allRecords());
  assert.deepEqual(ready, [
    { op: 'post', key: fresh.key }, { op: 'patch', key: `${BEAD}/e1` }, { op: 'post', key: told.key },
    { op: 'state', key: `${BEAD}/p1` }, { op: 'delete', key: `${STRAND}/ds` }, { op: 'delete', key: `${BEAD}/d1` },
  ]);
  assert.deepEqual(held.map((h) => h.key).sort(), [orphan.key, draft.key, conflicted.key].sort());
  assert.match(held.find((h) => h.key === orphan.key).reason, /waiting for com.cultureblocs.bead\/elsewhere/);
  assert.match(held.find((h) => h.key === conflicted.key).reason, /choose a version/);
  assert.equal(s.calls.filter((c) => !c.startsWith('list')).length, 0, 'planning sends nothing');
});

test('new records: photos first, beads then strands with spine:// items, each linked to the String’s version', async () => {
  const { store, loom, s, importAll } = await setup();
  const uri = await putPhoto(store, photo());
  const bead = await makeBead(loom, { note: 'with photo', media: [{ uri, mime: 'image/jpeg', alt: 'red' }] });
  const strand = await makeStrand(loom, strandBody([bead.key]));

  const results = await runSend({ store, client: s.client, now: () => 5 });
  assert.deepEqual(statuses(results), [['post', 'sent'], ['post', 'sent']]);
  assert.ok(s.media[uri.split('/').pop()], 'the photo reached the String under the same name');
  assert.deepEqual(s.posted.map((p) => [p.dedupeKey, p.sourceApp]), [[`loom:${bead.rkey}`, 'loom'], [`loom:${strand.rkey}`, 'loom']]);
  assert.deepEqual(s.posted[1].body.items, [{ uri: `spine://records/${results[0].stringId}` }]);
  const sent = await store.getRecord(bead.key);
  assert.deepEqual([sent.stringId, sent.sentAt, sent.stringHlc], [results[0].stringId, new Date(5).toISOString(), s.records[0].hlc]);
  assert.deepEqual(sent.stringMedia, [uri.split('/').pop()]);
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(bead.key) }], 'Loom keeps its local item uris');
  assert.deepEqual(await pending(store), []);
  assert.deepEqual(statuses(await runSend({ store, client: s.client })), []);
  const again = await importAll();
  assert.deepEqual([again.counts.unchanged, again.conflicts.length], [2, 0]);
});

test('an edit is a PATCH against the version Loom saw: removed fields sent as null, photos the String has not uploaded again', async () => {
  const name = `${'d'.repeat(64)}.jpg`;
  const { store, loom, s, importAll } = await setup([onString('u1', { body: { $type: BEAD, createdAt: T, kind: 'listen', note: 'a',
    tags: ['jazz'], media: [{ uri: `/media/${name}` }] } })]);
  s.media[name] = photo('d');
  await importAll();
  const local = await store.getRecord(`${BEAD}/u1`);
  const { tags: _, ...withoutTags } = local.body;
  const added = await putPhoto(store, photo('new'));
  await loom.save(local.key, { ...withoutTags, note: 'corrected', media: [...local.body.media, { uri: added }] });
  const seenHlc = local.stringHlc;
  const client = { ...s.client, async patchRecord(id, fields, hlc) {
    assert.equal(hlc, seenHlc);
    assert.equal(fields.tags, null);
    assert.equal(fields.note, 'corrected');
    return s.client.patchRecord(id, fields, hlc);
  } };
  const results = await runSend({ store, client });
  assert.deepEqual(statuses(results), [['patch', 'sent']]);
  assert.deepEqual(s.calls.filter((c) => c.startsWith('media')), [`media ${added.split('/').pop()}`]);
  assert.equal('tags' in s.records[0].body, false);
  assert.equal(s.records[0].body.note, 'corrected');
  assert.equal(s.records[0].sourceApp, 'rounds');
  const after = await store.getRecord(local.key);
  assert.equal(after.stringHlc, s.records[0].hlc);
  assert.deepEqual(await pending(store), []);
  assert.deepEqual((await importAll()).counts.unchanged, 1);
});

test('keeping a proposal is a state change; releasing it is a delete; both reach the String', async () => {
  const { store, loom, s } = await setup([onString('p1', { state: 'proposal' }), onString('p2', { state: 'proposal' })]);
  await runImport({ store, registry: await registry(), client: s.client });
  await loom.keep(`${BEAD}/p1`);
  await loom.remove(`${BEAD}/p2`);
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(statuses(results), [['state', 'sent'], ['delete', 'sent']]);
  assert.deepEqual(s.records.map((r) => [r.id, r.state]), [['p1', 'kept']]);
  assert.equal((await store.getRecord(`${BEAD}/p1`)).importedState, 'kept');
  assert.equal(await store.getRecord(`${BEAD}/p2`), undefined);
  assert.deepEqual(await pending(store), []);
});

test('deleting a bead a sent strand uses: the strand is patched first, then the bead deleted', async () => {
  const { store, loom, s } = await setup();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  const strand = await makeStrand(loom, strandBody([a.key, b.key]));
  await runSend({ store, client: s.client });
  await loom.remove(b.key);
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.op, r.key, r.status]), [['patch', strand.key, 'sent'], ['delete', b.key, 'sent']]);
  const onStrand = s.records.find((r) => r.type === STRAND);
  assert.deepEqual(onStrand.body.items, [{ uri: `spine://records/${(await store.getRecord(a.key)).stringId}` }]);
  assert.equal(s.records.length, 2);
});

test('a PATCH answered 412 marks a conflict with the String’s version and leaves the local edit', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  s.editOnString('u1', { note: 'edited in Rounds' });
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited in Loom' });
  const [result] = await runSend({ store, client: s.client });
  assert.deepEqual([result.op, result.status], ['patch', 'conflict']);
  const after = await store.getRecord(local.key);
  assert.equal(after.body.note, 'edited in Loom');
  assert.deepEqual([after.conflict.reason, after.conflict.theirs.body.note], ['send', 'edited in Rounds']);
  assert.equal(s.records[0].body.note, 'edited in Rounds');
  assert.deepEqual(await pending(store), [], 'a conflict waits for the person');
});

test('a 412 whose String copy already equals the edit is a success: the response was lost', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'sent once' });
  await runSend({ store, client: { ...s.client, async patchRecord(...a) { await s.client.patchRecord(...a); throw new Error('timeout'); } } });
  assert.deepEqual(await pending(store), [[local.key, 'edit']], 'the response never arrived');
  const [again] = await runSend({ store, client: s.client });
  assert.deepEqual([again.op, again.status], ['patch', 'sent']);
  assert.deepEqual(await pending(store), []);
  assert.equal('conflict' in (await store.getRecord(local.key)), false);
});

test('a DELETE answered 412 is a conflict; one answered 404 is done', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1'), onString('u2')]);
  await importAll();
  await loom.remove(`${BEAD}/u1`);
  await loom.remove(`${BEAD}/u2`);
  s.editOnString('u1', { note: 'still wanted in Rounds' });
  s.records.splice(1, 1);                                                   // u2 already gone from the String
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.key, r.status]), [[`${BEAD}/u1`, 'conflict'], [`${BEAD}/u2`, 'sent']]);
  const u1 = await store.getRecord(`${BEAD}/u1`);
  assert.deepEqual([u1.deleted, u1.conflict.theirs.body.note], [true, 'still wanted in Rounds']);
  assert.equal(await store.getRecord(`${BEAD}/u2`), undefined);
  assert.equal(s.records.length, 1);
});

test('an edit or state change to a record deleted on the String is a conflict with nothing on their side', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1'), onString('p1', { state: 'proposal' })]);
  await importAll();
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'edited' });
  await loom.keep(`${BEAD}/p1`);
  s.records.length = 0;
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(statuses(results), [['patch', 'conflict'], ['state', 'conflict']]);
  assert.equal((await store.getRecord(local.key)).conflict.theirs, null);
  assert.match(results[0].reason, /deleted on the String/);
});

test('a record from Phase 1 with no String version fetches it first, and conflicts if the String moved on', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1'), onString('u2')]);
  await importAll();
  for (const key of [`${BEAD}/u1`, `${BEAD}/u2`]) {
    const { stringHlc: _h, stringKeys: _k, stringMedia: _m, ...phase1 } = await store.getRecord(key);
    await store.putRecord(phase1);
    await loom.save(key, { ...phase1.body, note: `edited ${key}` });
  }
  s.editOnString('u2', { note: 'moved on' });
  const results = await runSend({ store, client: s.client });
  assert.deepEqual(results.map((r) => [r.key, r.status]), [[`${BEAD}/u1`, 'sent'], [`${BEAD}/u2`, 'conflict']]);
  assert.ok(s.calls.includes('getRecord u1'));
  assert.equal(s.records[0].body.note, `edited ${BEAD}/u1`);
  assert.equal(s.records[1].body.note, 'moved on');
});

test('content the String refuses stays pending with its problems; a photo missing locally fails that record only', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  const rejected = await makeBead(loom, { note: 'String says no' });
  const fine = await makeBead(loom, { note: 'fine' });
  const nophoto = await makeBead(loom, { note: 'lost photo', media: [{ uri: `/media/${'a'.repeat(64)}.jpg` }] });
  const local = await store.getRecord(`${BEAD}/u1`);
  await loom.save(local.key, { ...local.body, note: 'refused edit' });
  const reject = { [`loom:${rejected.rkey}`]: ['$.kind: unknown on this String'], u1: ['$.note: refused'] };
  const strict = fakeString({ records: s.records, reject });
  const results = Object.fromEntries((await runSend({ store, client: strict.client })).map((r) => [r.key, r]));
  assert.deepEqual([results[rejected.key].status, results[rejected.key].problems], ['invalid', ['$.kind: unknown on this String']]);
  assert.equal(results[fine.key].status, 'sent');
  assert.deepEqual([results[nophoto.key].status, /not in this browser/.test(results[nophoto.key].reason)], ['failed', true]);
  assert.deepEqual([results[local.key].status, results[local.key].problems], ['invalid', ['$.note: refused']]);
  assert.deepEqual((await store.getRecord(local.key)).problems, ['$.note: refused']);
  assert.equal((await store.getRecord(rejected.key)).stringId, undefined);
  assert.deepEqual((await pending(store)).map(([k]) => k).sort(), [rejected.key, nophoto.key, local.key].sort());
});

test('an unreachable String fails each change and keeps it pending; a refused token stops the Send', async () => {
  const { store, loom, s } = await setup();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  s.state.offline = true;
  assert.deepEqual(statuses(await runSend({ store, client: s.client })), [['post', 'failed'], ['post', 'failed']]);
  assert.equal((await pending(store)).length, 2);
  s.state.offline = false;
  const denied = { ...s.client, async postMedia() { throw Object.assign(new Error('HTTP 401'), { status: 401 }); },
    async postRecords() { throw Object.assign(new Error('HTTP 401'), { status: 401 }); } };
  const results = await runSend({ store, client: denied });
  assert.equal(results.length, 1);
  assert.match(results[0].reason, /check it in settings/);
  assert.ok([a.key, b.key].includes(results[0].key));
});

const gate = () => {
  let open, reached;
  const opened = new Promise((r) => { open = r; });
  const arrived = new Promise((r) => { reached = r; });
  return { open, arrived, async pass() { reached(); await opened; } };
};

test('an edit saved while its record is on its way survives, and reads as a new change', async () => {
  const { store, loom, s, importAll } = await setup();
  const bead = await makeBead(loom, { note: 'as posted' });
  const g = gate();
  const client = { ...s.client, async postRecords(batch) { await g.pass(); return s.client.postRecords(batch); } };
  const sending = runSend({ store, client });
  await g.arrived;
  await loom.save(bead.key, { ...bead.body, note: 'edited during send' });
  g.open();
  const [result] = await sending;
  assert.equal(result.status, 'sent');
  const after = await store.getRecord(bead.key);
  assert.equal(after.body.note, 'edited during send');
  assert.notEqual(await contentHash(after.body), after.importedHash);
  assert.deepEqual(await pending(store), [[bead.key, 'edit']]);
  assert.deepEqual((await importAll()).counts.update, 0);
  assert.deepEqual(statuses(await runSend({ store, client: s.client })), [['patch', 'sent']]);
  assert.equal(s.records[0].body.note, 'edited during send');
});

test('a delete taken back while it was on its way leaves a conflict rather than a record the String no longer has', async () => {
  const { store, loom, s, importAll } = await setup([onString('u1')]);
  await importAll();
  await loom.remove(`${BEAD}/u1`);
  const g = gate();
  const client = { ...s.client, async deleteRecord(...a) { await g.pass(); return s.client.deleteRecord(...a); } };
  const sending = runSend({ store, client });
  await g.arrived;
  await loom.undoRemove(`${BEAD}/u1`);
  g.open();
  const [result] = await sending;
  assert.equal(result.status, 'conflict');
  assert.equal((await store.getRecord(`${BEAD}/u1`)).conflict.theirs, null);
});

test('a lost POST response: the resend is answered duplicate and linked to the one record on the String', async () => {
  const { store, loom, s } = await setup();
  const bead = await makeBead(loom, { note: 'first' });
  await runSend({ store, client: s.client });
  const { stringId, sentAt: _s, stringHash: _h, importedHash: _i, importedState: _t, stringHlc: _v, stringKeys: _k, stringMedia: _m, ...lost } = await store.getRecord(bead.key);
  await store.putRecord(lost);
  const [again] = await runSend({ store, client: s.client });
  assert.deepEqual([again.status, again.stringId, s.records.length], ['sent', stringId, 1]);
  assert.deepEqual(await pending(store), []);
});

test('restoring a backup taken before a send, then importing, links the sent records instead of copying them', async () => {
  const { store, loom, s, importAll } = await setup();
  const bead = await makeBead(loom, { note: 'a' });
  await makeStrand(loom, strandBody([bead.key]));
  const doc = JSON.parse(JSON.stringify(await exportBackup(store)));
  await runSend({ store, client: s.client });
  await restoreBackup(store, doc);
  const { counts, conflicts } = await importAll();
  assert.deepEqual([counts.add, counts.link, conflicts.length], [0, 2, 0]);
  assert.ok((await store.allRecords()).every((r) => r.stringId && r.stringHlc));
  assert.deepEqual(await runSend({ store, client: s.client }), []);
  assert.equal(s.posted.length, 2, 'nothing was posted again');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 91 # fail 13`, with:

```text
not ok 67 - planSend orders new beads, bead edits, strands, state changes, then deletes strands before beads — and holds what must wait
not ok 68 - new records: photos first, beads then strands with spine:// items, each linked to the String’s version
not ok 69 - an edit is a PATCH against the version Loom saw: removed fields sent as null, photos the String has not uploaded again
not ok 70 - keeping a proposal is a state change; releasing it is a delete; both reach the String
not ok 71 - deleting a bead a sent strand uses: the strand is patched first, then the bead deleted
not ok 72 - a PATCH answered 412 marks a conflict with the String’s version and leaves the local edit
not ok 73 - a 412 whose String copy already equals the edit is a success: the response was lost
not ok 74 - a DELETE answered 412 is a conflict; one answered 404 is done
not ok 75 - an edit or state change to a record deleted on the String is a conflict with nothing on their side
not ok 76 - a record from Phase 1 with no String version fetches it first, and conflicts if the String moved on
not ok 77 - content the String refuses stays pending with its problems; a photo missing locally fails that record only
not ok 78 - an unreachable String fails each change and keeps it pending; a refused token stops the Send
not ok 79 - an edit saved while its record is on its way survives, and reads as a new change
not ok 80 - a delete taken back while it was on its way leaves a conflict rather than a record the String no longer has
not ok 81 - a lost POST response: the resend is answered duplicate and linked to the one record on the String
not ok 82 - restoring a backup taken before a send, then importing, links the sent records instead of copying them
```

- [ ] **Step 3: Implement**

Replace the whole of `app/lib/day.js` with:

```javascript
/* The String column's model: which days hold records, a month as a grid, the
 * entry list and its filter, and what each record has waiting for Send.
 * Pure, except that telling an edit needs a content hash. Records marked
 * `deleted` are gone from every view here; Send still sees them. */
import { contentHash } from '../vendor/strip.js';

const STRAND = 'com.cultureblocs.strand';
const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const str = (v) => (typeof v === 'string' ? v : '');

/* What Send has to do for a record: 'new' | 'edit' | 'state' | 'delete', or null.
 * A record in conflict waits for the person; a Phase 1 draft never sent stays home. */
export async function pendingChange(r) {
  if (r.conflict) return null;
  if (!r.stringId) return r.deleted || r.state === 'draft' ? null : 'new';
  if (r.deleted) return 'delete';
  if ((await contentHash(r.body)) !== r.importedHash) return 'edit';
  if (r.state !== r.importedState) return 'state';
  return null;
}

/* Map key -> change, for the records that have one. */
export async function pendingChanges(records) {
  const out = new Map();
  for (const r of records) {
    const change = await pendingChange(r);
    if (change) out.set(r.key, change);
  }
  return out;
}

/* Map day -> how many records (not deleted) the day holds. */
export function dayCounts(records) {
  const counts = new Map();
  for (const r of records) if (r.day && !r.deleted) counts.set(r.day, (counts.get(r.day) || 0) + 1);
  return counts;
}

/* 'YYYY-MM' moved by `by` months. */
export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/* A month as weeks, Monday first: [[{ day, date, count } | null, ×7], …]. */
export function monthGrid(month, counts = new Map()) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(lead).fill(null);
  for (let date = 1; date <= length; date++) {
    const day = `${month}-${String(date).padStart(2, '0')}`;
    cells.push({ day, date, count: counts.get(day) || 0 });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const firstLine = (s) => str(s).split('\n').find((l) => l.trim())?.trim() ?? '';

/* The words a row shows for a record body. */
export function summary(type, body) {
  const b = body || {};
  if (type === STRAND) return firstLine(b.title) || firstLine(b.narrative) || 'Untitled strand';
  return firstLine(b.note) || str(b.subject?.name) || str(b.work?.title) || '';
}

const kindOf = (type, body) => (type === STRAND ? 'strand' : str(body?.kind) || type.split('.').pop());

/* Does a record match { text, kind, app }? Empty parts match everything. */
export function matches(r, { text = '', kind = '', app = '' } = {}) {
  if (kind && kindOf(r.type, r.body) !== kind) return false;
  if (app && r.sourceApp !== app) return false;
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const b = r.body || {};
  const hay = [b.note, b.title, b.narrative, b.subject?.name, b.place?.name, ...list(b.tags),
    ...list(b.refs).map((ref) => ref?.descriptor?.label)].filter((v) => typeof v === 'string').join('\n').toLowerCase();
  return hay.includes(needle);
}

/* The day a new record's draft belongs to. */
const draftDay = (d, today) => str(d.type === STRAND ? d.body?.day : d.body?.createdAt).slice(0, 10) || today;

/* The entry list: [{ day, rows }] newest day first. Within a day, drafts of new
 * records first, then records newest first. A row is
 * { key, type, kind, line, at, record } for a record, or
 * { key, type, kind, line, at, draft: true } for a draft of a record not yet saved. */
export function entryList(records, { filter = {}, drafts = [], today = '' } = {}) {
  const days = new Map();
  const add = (day, row) => {
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  };
  for (const r of records) {
    if (r.deleted || !r.day || !matches(r, filter)) continue;
    add(r.day, { key: r.key, type: r.type, kind: kindOf(r.type, r.body), line: summary(r.type, r.body), at: str(r.createdAt), record: r });
  }
  for (const d of drafts) {
    const row = { key: d.key, type: d.type, body: d.body, sourceApp: 'loom' };
    if (!matches(row, filter)) continue;
    add(draftDay(d, today), { key: d.key, type: d.type, kind: kindOf(d.type, d.body), line: summary(d.type, d.body), at: str(d.at), draft: true });
  }
  const order = (a, b) => (a.draft !== b.draft ? (a.draft ? -1 : 1) : a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  return [...days].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, rows]) => ({ day, rows: rows.sort(order) }));
}

/* The source apps present, for the filter. */
export const sourceApps = (records) => [...new Set(records.filter((r) => !r.deleted).map((r) => r.sourceApp).filter(Boolean))].sort();
```

Replace the whole of `app/lib/sender.js` with:

```javascript
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
 * Every request is safe to repeat. A POST carries dedupeKey "loom:<rkey>". A
 * PATCH or DELETE carries If-Match with the version Loom last saw
 * (`stringHlc`): a 412 means the String moved on, so the record is marked
 * `conflict` with the String's version — unless the String already holds
 * exactly what was being sent, which is a success (a lost response). A DELETE
 * answered 404 is done. A record migrated from Phase 1 without `stringHlc`
 * fetches the String's copy first, and uses its version only if the body is
 * the one Loom last imported.
 *
 * After each success the String's answer is recorded onto a fresh read of the
 * record, as an import would record it: an edit saved while the request was
 * in flight keeps its body and reads as a new change. */
import { contentHash } from '../vendor/strip.js';
import { pendingChanges } from './day.js';
import { stringFields } from './importer.js';
import { keyFromItemUri, spineUri, toLoomItems } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

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
  const { ready, held } = await planSend(await store.allRecords());
  const results = held.map((h) => ({ key: h.key, status: 'held', reason: h.reason }));

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
   * the String's — if its body is still the one Loom last imported. */
  async function base(env) {
    if (env.stringHlc && Array.isArray(env.stringKeys)) return { hlc: env.stringHlc, keys: env.stringKeys };
    const current = await client.getRecord(env.stringId);
    if ((await contentHash(current.body)) !== env.stringHash) return { stale: current };
    return { hlc: current.hlc, keys: Object.keys(current.body) };
  }

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
        if (!current || (await contentHash(current.body)) !== (await contentHash(body))) return markConflict(env.key, current ?? null);
        await link(env.key, current);                         // the String already holds this edit
      }
      return { status: 'sent', stringId: env.stringId };
    },
    async state(env) {
      await link(env.key, await client.setState(env.stringId, env.state));
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
    results.push(result);
    onProgress(result);
  }
  return results;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 107 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/lib/day.js app/lib/sender.js app/test/sender.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): Send carries every change — POST, PATCH, state, DELETE — with safe retries and conflicts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 7: Choosing a side of a conflict

A record marked `conflict` holds the String's copy (`theirs`, or `null` when the String no longer has it). Keeping Loom's side makes the String's version the one Send edits against, so the next Send carries Loom's body or delete; if the String deleted the record, Loom's copy is posted again. Taking the String's side replaces Loom's copy as an import would, leaving any unsaved draft in place.

**Files:**
- Create: `app/lib/conflicts.js`
- Modify: `app/sw.js`
- Create: `app/test/conflicts.test.mjs`

**Interfaces:**
- Consumes: `stringFields` (Task 4), `toLoomItems`, `dayOf`, `contentHash`.
- Produces (`app/lib/conflicts.js`): `changedFields(mine, theirs) → [{ field, mine, theirs }]`; `theirBody(store, record) → body | null` (async, strand items as `loom://`); `keepMine(store, key) → record | null`; `takeTheirs(store, key, { registry, now }) → record | null`.

- [ ] **Step 1: Write the failing tests**

Create `app/test/conflicts.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, STRAND, openLoom } from '../lib/envelope.js';
import { changedFields, keepMine, takeTheirs, theirBody } from '../lib/conflicts.js';
import { pendingChanges } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { runSend } from '../lib/sender.js';
import { fakeString } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

const T = '2026-09-13T10:00:00Z';
const onString = (id, extra = {}) => ({ id, type: BEAD, sourceApp: 'rounds', createdAt: T, state: 'kept', dedupeKey: `rounds:${id}`,
  body: { $type: BEAD, createdAt: T, kind: 'listen', note: `note ${id}` }, ...extra });

/* A record edited in Loom and on the String, then sent: marked conflict by the 412. */
async function inConflict({ remove = false } = {}) {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records: [onString('u1')] });
  const send = () => runSend({ store, client: s.client });
  await runImport({ store, registry: reg, client: s.client });
  s.editOnString('u1', { note: 'edited in Rounds', tags: ['live'] });
  const key = `${BEAD}/u1`;
  const local = await store.getRecord(key);
  if (remove) await loom.remove(key);
  else await loom.save(key, { ...local.body, note: 'edited in Loom' });
  const [result] = await send();
  assert.equal(result.status, 'conflict');
  return { store, loom, s, key, send, reg };
}

const pending = async (store) => [...(await pendingChanges(await store.allRecords()))];

test('changedFields lists the differing top-level fields, Loom’s order first', () => {
  assert.deepEqual(changedFields({ kind: 'listen', note: 'mine', tags: ['a'] }, { kind: 'listen', note: 'theirs', place: { name: 'x' } }), [
    { field: 'note', mine: 'mine', theirs: 'theirs' },
    { field: 'tags', mine: ['a'], theirs: undefined },
    { field: 'place', mine: undefined, theirs: { name: 'x' } },
  ]);
  assert.deepEqual(changedFields({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(changedFields(undefined, null), []);
});

test('keep mine: the next Send carries Loom’s edit over the String’s version', async () => {
  const { store, s, key, send } = await inConflict();
  await keepMine(store, key);
  const r = await store.getRecord(key);
  assert.equal('conflict' in r, false);
  assert.equal(r.stringHlc, s.records[0].hlc);
  assert.deepEqual(await pending(store), [[key, 'edit']]);
  const [result] = await send();
  assert.deepEqual([result.op, result.status], ['patch', 'sent']);
  assert.equal(s.records[0].body.note, 'edited in Loom');
  assert.equal('tags' in s.records[0].body, false, 'the String’s added field is removed: Loom’s version stands whole');
});

test('take theirs: the String’s version replaces Loom’s, nothing to send, and a draft is left alone', async () => {
  const { store, loom, key } = await inConflict();
  await loom.saveDraft(key, { note: 'typed but not saved' }, 'x');
  const before = await store.getRecord(key);
  const next = await takeTheirs(store, key, { now: () => Date.parse('2026-09-15T12:00:00Z') });
  assert.equal(next.body.note, 'edited in Rounds');
  assert.deepEqual(next.body.tags, ['live']);
  assert.equal(next.updatedAt, '2026-09-15T12:00:00.000Z');
  assert.notEqual(next.updatedAt, before.updatedAt, 'an open editor sees the record moved on');
  assert.equal('conflict' in next, false);
  assert.deepEqual(await pending(store), []);
  assert.equal((await loom.getDraft(key)).body.note, 'typed but not saved');
});

test('a delete refused because the String moved on: keep mine deletes it next Send; take theirs brings it back', async () => {
  const first = await inConflict({ remove: true });
  await keepMine(first.store, first.key);
  assert.deepEqual(await pending(first.store), [[first.key, 'delete']]);
  const [result] = await first.send();
  assert.deepEqual([result.op, result.status], ['delete', 'sent']);
  assert.equal(first.s.records.length, 0);

  const second = await inConflict({ remove: true });
  const back = await takeTheirs(second.store, second.key);
  assert.equal('deleted' in back, false);
  assert.equal(back.body.note, 'edited in Rounds');
  assert.deepEqual(await pending(second.store), []);
});

test('deleted on the String: keep mine posts Loom’s copy again as new; take theirs lets it go', async () => {
  const setup = async () => {
    const store = createMemStore();
    const reg = await registry();
    const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
    const s = fakeString({ records: [onString('u1')] });
    await runImport({ store, registry: reg, client: s.client });
    const local = await store.getRecord(`${BEAD}/u1`);
    await loom.save(local.key, { ...local.body, note: 'still mine' });
    s.records.length = 0;
    await runSend({ store, client: s.client });
    return { store, s, key: local.key };
  };
  const a = await setup();
  const mine = await keepMine(a.store, a.key);
  assert.equal(mine.stringId, undefined);
  assert.deepEqual(await pending(a.store), [[a.key, 'new']]);
  const [result] = await runSend({ store: a.store, client: a.s.client });
  assert.deepEqual([result.op, result.status], ['post', 'sent']);
  assert.equal(a.s.records[0].body.note, 'still mine');

  const b = await setup();
  assert.equal(await takeTheirs(b.store, b.key), null);
  assert.equal(await b.store.getRecord(b.key), undefined);
});

test('a record deleted on both sides simply goes when Loom’s side is kept', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString({ records: [onString('u1')] });
  await runImport({ store, registry: reg, client: s.client });
  await loom.remove(`${BEAD}/u1`);
  await store.putRecord({ ...(await store.getRecord(`${BEAD}/u1`)), conflict: { theirs: null, reason: 'send' } });
  assert.equal(await keepMine(store, `${BEAD}/u1`), null);
  assert.equal(await store.getRecord(`${BEAD}/u1`), undefined);
});

test('an import conflict on a strand: their body comes back in Loom’s form; taking it is not a local change', async () => {
  const store = createMemStore();
  const reg = await registry();
  const loom = await openLoom({ store, registry: reg, now: steppingNow(), newDeviceId: () => 'desk-1' });
  const s = fakeString();
  const a = await makeBead(loom, { note: 'a' }), b = await makeBead(loom, { note: 'b' });
  const strand = await makeStrand(loom, { title: 'Sunday', items: [{ uri: itemUri(a.key) }] });
  await runSend({ store, client: s.client });
  const onStrand = s.records.find((r) => r.type === STRAND);
  const bId = (await store.getRecord(b.key)).stringId;
  s.editOnString(onStrand.id, { title: 'Sunday, retitled', items: [...onStrand.body.items, { uri: `spine://records/${bId}` }] });
  await loom.save(strand.key, { ...strand.body, title: 'Sunday, in Loom' });
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [strand.key]);
  const record = await store.getRecord(strand.key);
  assert.deepEqual((await theirBody(store, record)).items, [{ uri: itemUri(a.key) }, { uri: itemUri(b.key) }]);
  await takeTheirs(store, strand.key, { registry: reg });
  assert.deepEqual(await pending(store), []);
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(a.key) }, { uri: itemUri(b.key) }]);
});

test('only a record in conflict can be resolved', async () => {
  const store = createMemStore();
  await assert.rejects(keepMine(store, `${BEAD}/none`), /not in conflict/);
  await store.putRecord({ key: `${BEAD}/k`, type: BEAD, body: {} });
  await assert.rejects(takeTheirs(store, `${BEAD}/k`), /not in conflict/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 107 # fail 1`, with:

```text
not ok 3 - app/test/conflicts.test.mjs
```

- [ ] **Step 3: Implement**

Create `app/lib/conflicts.js` with:

```javascript
/* Choosing a side for a record marked `conflict` — changed in Loom and on the
 * String (by import), or refused by the String with 412 or 404 (by Send).
 * `conflict.theirs` is the String's record as fetched, or null when the String
 * no longer has it. Field-by-field merging waits for Phase 2 sync.
 *
 *   keepMine     Loom's version stands. The String's version becomes the one
 *                Send edits against, so the next Send carries Loom's body (or
 *                its delete); if the String deleted the record, Loom's copy is
 *                posted again as new — or, if Loom was deleting it too, it goes.
 *   takeTheirs   The String's version replaces Loom's, as an import would; if
 *                the String deleted the record, Loom's copy goes. An unsaved
 *                draft of an existing record is left in place, so nothing typed
 *                is lost. */
import { contentHash } from '../vendor/strip.js';
import { stringFields } from './importer.js';
import { dayOf, toLoomItems } from './keys.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const keyByStringId = async (store) =>
  new Map((await store.allRecords()).filter((r) => r.stringId).map((r) => [r.stringId, r.key]));

async function conflicted(store, key) {
  const r = await store.getRecord(key);
  if (!r?.conflict) throw new Error(`${key} is not in conflict`);
  return r;
}

/* The top-level fields that differ: [{ field, mine, theirs }], Loom's field order first. */
export function changedFields(mine = {}, theirs = {}) {
  const fields = [...new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {})])];
  return fields.filter((f) => !same(mine?.[f], theirs?.[f])).map((field) => ({ field, mine: mine?.[field], theirs: theirs?.[field] }));
}

/* The String's side of a conflict in Loom's form (strand items as loom:// keys), or null. */
export async function theirBody(store, record) {
  const theirs = record?.conflict?.theirs;
  return theirs ? toLoomItems(theirs.body, await keyByStringId(store)) : null;
}

export async function keepMine(store, key) {
  const { conflict, ...rest } = await conflicted(store, key);
  const { theirs } = conflict;
  if (!theirs) {
    if (rest.deleted) {                                        // gone on both sides
      await store.deleteRecord(key);
      await store.deleteMeta(`draft:${key}`);
      return null;
    }
    const { stringId: _i, stringHash: _h, importedHash: _m, importedState: _s, stringHlc: _v, stringKeys: _k,
      stringMedia: _p, sentAt: _t, ...local } = rest;
    await store.putRecord(local);                              // posted again as new
    return local;
  }
  const next = { ...rest, stringHash: await contentHash(theirs.body),
    importedHash: await contentHash(toLoomItems(theirs.body, await keyByStringId(store))),
    importedState: theirs.state || 'kept', ...stringFields(theirs) };
  await store.putRecord(next);
  return next;
}

export async function takeTheirs(store, key, { registry = null, now = () => Date.now() } = {}) {
  const { conflict, deleted: _d, problems: _p, invalid: _v, ...rest } = await conflicted(store, key);
  const { theirs } = conflict;
  if (!theirs) {
    await store.deleteRecord(key);
    await store.deleteMeta(`draft:${key}`);
    return null;
  }
  const body = toLoomItems(theirs.body, await keyByStringId(store));
  const next = { ...rest, body, state: theirs.state || 'kept', updatedAt: new Date(now()).toISOString(),
    day: dayOf(rest.type, body, rest.createdAt), stringHash: await contentHash(theirs.body),
    importedHash: await contentHash(body), importedState: theirs.state || 'kept', ...stringFields(theirs) };
  const problems = registry ? registry.validateRecord(rest.type, theirs.body) : [];
  if (problems.length) next.invalid = problems;
  await store.putRecord(next);
  return next;
}
```

Replace the whole of `app/sw.js` with:

```javascript
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-2';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/conflicts.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js', './lib/migrate.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/html.js', './ui/view-refs.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 115 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/lib/conflicts.js app/sw.js app/test/conflicts.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): choose a side of a conflict — keep mine or take the String's

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 8: Views for the desk

Pure functions from state to escaped HTML: the String column, the bead form, the strand form, what the two forms share, and the smaller panels (day, delete confirmation, deleted record, conflict, top bar, Send page, settings). Kinds reach the page only as `data-kind` values from a fixed list; colours come from `loom.css` (Task 10).

**Files:**
- Modify: `app/sw.js`
- Create: `app/test/desk-views.test.mjs`
- Create: `app/ui/view-bead.js`
- Create: `app/ui/view-form.js`
- Create: `app/ui/view-panels.js`
- Create: `app/ui/view-strand.js`
- Create: `app/ui/view-string.js`

**Interfaces:**
- Consumes: `summary`, `entryList`, `monthGrid` (Task 5); `refsView` (existing); `html`, `nameFromUri`, `keyFromItemUri`.
- Produces:
  - `app/ui/view-form.js`: `KINDS`, `list`, `localInput(iso)`, `fromLocalInput(value)`, `linksText`, `parseLinks`, `parseTags`, `photosView(media, urls)`, `provenanceView(record)`, `problemsView(problems)`, `footerView({ record, problems, dirtyDraft })`, `readOnlyView(record)`, `restoredView(at)`, `bodyFromFields(type, prev, fields)`, `placeName(type, body)`.
  - `app/ui/view-bead.js`: `beadFormView({ record, body, problems, urls, restoredDraftAt, dirtyDraft })`.
  - `app/ui/view-strand.js`: `strandFormView({ record, body, problems, members, restoredDraftAt, dirtyDraft })`.
  - `app/ui/view-string.js`: `stringColumnView({ month, selectedDay, weeks, days, pending, filter, apps, selectedKey, ticked, today, drafts })`, `monthLabel`, `dayLabel`.
  - `app/ui/view-panels.js`: `dayView({ day, records })`, `deleteView({ record, strands, onString })`, `deletedView(record)`, `conflictView({ fields, theirs, deleted })`, `topbarView({ pending, connected, busy })`, `sendView({ changes, results, deletes, lines, busy, connected })`, `settingsView(state)`.
  - Form field names: `kind`, `when`, `text` (note or narrative), `tags`, `place`, `links`, `title`, `day`, `alt-<i>`; actions `save`, `discard`, `delete`, `delete-confirm`, `delete-cancel`, `undo-delete`, `keep-mine`, `take-theirs`, `item-up`, `item-down`, `item-remove`, `photo-add`, `photo-remove`, `month`, `tick`, `keep`, `release`, `send`, `check`, `import`, `backup`, `restore`, `restore-confirm`, `restore-cancel`.

- [ ] **Step 1: Write the failing tests**

Create `app/test/desk-views.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryList, monthGrid } from '../lib/day.js';
import { beadFormView } from '../ui/view-bead.js';
import { bodyFromFields, footerView, fromLocalInput, localInput, parseLinks, parseTags, provenanceView, readOnlyView } from '../ui/view-form.js';
import { conflictView, dayView, deleteView, deletedView, sendView, settingsView, topbarView } from '../ui/view-panels.js';
import { strandFormView } from '../ui/view-strand.js';
import { dayLabel, monthLabel, stringColumnView } from '../ui/view-string.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const bead = (key, extra = {}) => ({ key, type: B, rkey: key, sourceApp: 'loom', state: 'kept', createdAt: '2026-09-14T21:04:00Z',
  day: '2026-09-14', body: { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'a <b>note</b>' }, ...extra });
const strand = (key, extra = {}) => ({ key, type: S, rkey: key, sourceApp: 'loom', state: 'kept', createdAt: '2026-09-15T08:00:00Z',
  day: '2026-09-14', body: { $type: S, createdAt: '2026-09-15T08:00:00Z', day: '2026-09-14T00:00:00Z', title: 'Sunday', items: [] }, ...extra });
const column = (records, extra = {}) => String(stringColumnView({ month: '2026-09', selectedDay: '2026-09-14', today: '2026-09-15',
  weeks: monthGrid('2026-09', new Map([['2026-09-14', records.length]])), days: entryList(records), apps: ['loom', 'rounds'], ...extra }));

test('localInput and fromLocalInput round-trip a time through this browser’s zone, and refuse nonsense', () => {
  const iso = '2026-09-14T18:30:00.000Z';
  assert.equal(fromLocalInput(localInput(iso)), iso);
  assert.match(localInput(iso), /^2026-09-1[45]T\d\d:30$/);
  assert.equal(localInput('not a date'), '');
  assert.equal(fromLocalInput(''), null);
});

test('parseLinks and parseTags read their text fields', () => {
  assert.deepEqual(parseLinks(' https://a.test | A | b \n\nhttps://b.test'), [{ uri: 'https://a.test', title: 'A | b' }, { uri: 'https://b.test' }]);
  assert.deepEqual(parseTags(' jazz, live ,, ,emf '), ['jazz', 'live', 'emf']);
});

test('bodyFromFields writes a bead: kind, when, note, tags, place, alt text; empty fields are removed', () => {
  const prev = { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'old', tags: ['a'], subject: { name: 'Old place', geo: { lat: 1, lng: 2, precision: 'city' } },
    media: [{ uri: '/media/x.jpg', alt: 'old alt' }], links: [{ uri: 'https://x.test' }], provenance: { app: 'loom', mintedAt: '2026-09-14T21:04:00Z' } };
  const when = localInput('2026-09-13T10:00:00Z');
  const body = bodyFromFields(B, prev, { kind: 'listen', when, text: 'new note', tags: 'jazz, live', place: 'Café OTO', links: '', 'alt-0': ' red ' });
  assert.deepEqual(body, { $type: B, createdAt: '2026-09-13T10:00:00.000Z', kind: 'listen', note: 'new note', tags: ['jazz', 'live'],
    subject: { name: 'Café OTO', geo: { lat: 1, lng: 2, precision: 'city' } }, media: [{ uri: '/media/x.jpg', alt: 'red' }],
    provenance: { app: 'loom', mintedAt: '2026-09-14T21:04:00Z' } });
  const cleared = bodyFromFields(B, body, { kind: 'listen', when, text: '', tags: '', place: '', links: '', 'alt-0': '' });
  assert.deepEqual(Object.keys(cleared).sort(), ['$type', 'createdAt', 'kind', 'media', 'provenance', 'subject']);
  assert.deepEqual(cleared.subject, { geo: { lat: 1, lng: 2, precision: 'city' } }, 'a place without its name keeps its coordinates');
  const ref = { uri: 'at://did:plc:x/com.cultureblocs.event/1', cid: 'c' };
  assert.deepEqual(bodyFromFields(B, { ...prev, subject: ref }, { place: 'ignored' }).subject, ref, 'a record subject is not a place');
});

test('bodyFromFields writes a strand: title, day, narrative, place, links', () => {
  const prev = { $type: S, createdAt: '2026-09-15T08:00:00Z', items: [{ uri: 'loom://b/1' }] };
  assert.deepEqual(bodyFromFields(S, prev, { title: ' Sunday ', day: '2026-09-14', text: 'We went', place: 'Tate', links: 'https://tate.test | Tate' }), {
    $type: S, createdAt: '2026-09-15T08:00:00Z', items: [{ uri: 'loom://b/1' }], title: 'Sunday', day: '2026-09-14T00:00:00Z',
    narrative: 'We went', place: { name: 'Tate' }, links: [{ uri: 'https://tate.test', title: 'Tate' }] });
});

test('the bead form shows every field, escapes content, and knows new from existing', () => {
  const r = bead(`${B}/a`, { stringId: 's1', body: { ...bead('x').body, tags: ['jazz'], subject: { name: 'Tate <Modern>' },
    geo: { lat: 51.5, lng: -0.1, precision: 'city' }, provenance: { app: 'rounds', mintedAt: '2026-09-14T21:04:00Z' } } });
  const out = String(beadFormView({ record: r, body: r.body, problems: [], dirtyDraft: true }));
  assert.match(out, /<h2>Bead<\/h2>/);
  assert.match(out, /<option selected>visit<\/option>/);
  assert.match(out, /name="when" value="2026-09-1\dT\d\d:04"/);
  assert.match(out, /a &lt;b&gt;note&lt;\/b&gt;/);
  assert.match(out, /value="jazz"/);
  assert.match(out, /Tate &lt;Modern&gt;/);
  assert.match(out, /coordinates 51.5, -0.1 \(city\)/);
  assert.match(out, /made in rounds · 2026-09-14 21:04 · on the String/);
  assert.match(out, /data-action="delete"/);
  assert.match(out, /discard changes/);
  const fresh = String(beadFormView({ record: null, body: { kind: 'bloc' }, problems: ['$.note: too long'] }));
  assert.match(fresh, /<h2>New bead<\/h2>/);
  assert.match(fresh, /made in Loom when you save it/);
  assert.doesNotMatch(fresh, /data-action="delete"/);
  assert.match(fresh, /data-action="save" disabled/);
  assert.match(fresh, /\$\.note: too long/);
  const odd = String(beadFormView({ record: null, body: { kind: 'x"><script>', tags: 'nope', media: {}, links: 'l', refs: 7 } }));
  assert.match(odd, /<option value="" selected>x&quot;&gt;&lt;script&gt;<\/option>/);
});

test('a proposal says saving keeps it', () => {
  const r = bead(`${B}/p`, { state: 'proposal' });
  assert.match(String(beadFormView({ record: r, body: r.body })), /proposal — saving keeps it/);
});

test('the strand form lists its beads in order with move and remove, and names items it cannot find', () => {
  const a = bead(`${B}/a`, { body: { ...bead('x').body, note: 'first bead' } });
  const s = strand(`${S}/s`, { body: { ...strand('x').body, narrative: 'We went', items: [{ uri: `loom://${B}/a` }, { uri: `loom://${B}/gone` }, { uri: 'spine://records/zz' }] } });
  const out = String(strandFormView({ record: s, body: s.body, members: new Map([[a.key, a]]) }));
  assert.match(out, /<h2>Strand<\/h2>/);
  assert.match(out, /value="Sunday"/);
  assert.match(out, /name="day" value="2026-09-14"/);
  assert.match(out, /2026-09-14 21:04 visit first bead/);
  assert.match(out, /com.cultureblocs.bead\/gone \(not in this browser\)/);
  assert.match(out, /spine:\/\/records\/zz/);
  assert.match(out, /data-item="0">[\s\S]*?data-action="item-up" aria-label="move up" disabled/);
  assert.match(out, /data-item="2">[\s\S]*?data-action="item-down" aria-label="move down" disabled/);
  assert.match(String(strandFormView({ record: null, body: { items: 'nope' } })), /No beads yet/);
});

test('provenance, footer and read-only views', () => {
  assert.match(String(provenanceView(bead('k', { body: {} }))), /made in loom · only in this browser/);
  assert.doesNotMatch(String(footerView({ record: null })), /discard/);
  assert.match(String(footerView({ record: null, dirtyDraft: true })), /discard this draft/);
  assert.match(String(readOnlyView({ type: 'com.cultureblocs.annotation', day: '2026-09-14', body: { note: '<x>' } })), /Annotations arrive from the AR app[\s\S]*&lt;x&gt;/);
});

test('the String column: buttons, filter, calendar and rows with their markers', () => {
  const photo = bead(`${B}/p`, { body: { ...bead('x').body, media: [{ uri: '/media/a.jpg' }] }, missing: ['a.jpg'] });
  const proposal = bead(`${B}/q`, { state: 'proposal', sourceApp: 'rounds', stringId: 'q', createdAt: '2026-09-14T09:00:00Z' });
  const conflicted = bead(`${B}/c`, { conflict: { theirs: null }, problems: ['no'], createdAt: '2026-09-14T08:00:00Z' });
  const out = column([photo, proposal, conflicted], { pending: new Map([[photo.key, 'new'], [conflicted.key, 'edit']]),
    selectedKey: photo.key, filter: { text: 'x"y', kind: 'visit', app: 'rounds' }, drafts: new Set([proposal.key]) });
  assert.match(out, /href="#\/new\/bead"/);
  assert.match(out, /href="#\/new\/strand"/);
  assert.match(out, /value="x&quot;y"/);
  assert.match(out, /<option selected>visit<\/option>/);
  assert.match(out, /<option selected>rounds<\/option>/);
  assert.match(out, /September 2026/);
  assert.match(out, /<a href="#\/day\/2026-09-14" class="has on"/);
  assert.match(out, /class="today"/);
  assert.match(out, /Mon 14 Sep 2026/);
  assert.match(out, /class="row on" data-key="com.cultureblocs.bead\/p"/);
  assert.match(out, /mark photo[\s\S]*?mark pending">not sent[\s\S]*?mark missing/);
  assert.match(out, /data-key="com.cultureblocs.bead\/q"[\s\S]*?mark proposal[\s\S]*?mark draft">unsaved[\s\S]*?data-action="keep"[\s\S]*?data-action="release"/);
  assert.match(out, /data-key="com.cultureblocs.bead\/c"[\s\S]*?mark pending">changed[\s\S]*?mark conflict[\s\S]*?mark invalid/);
  assert.doesNotMatch(out, /data-action="tick"/);
});

test('tick boxes appear on bead rows only while a strand is open, checked for its items', () => {
  const a = bead(`${B}/a`), b = bead(`${B}/b`), s = strand(`${S}/s`);
  const out = column([a, b, s], { ticked: new Set([a.key]),
    drafts: new Set(), days: entryList([a, b, s], { drafts: [{ key: `${B}/new`, type: B, body: { note: 'half' }, at: 'x' }], today: '2026-09-14' }) });
  assert.match(out, /Tick beads/);
  assert.match(out, /data-key="com.cultureblocs.bead\/a"[^>]*>\s*<input type="checkbox" data-action="tick" aria-label="in this strand" checked>/);
  assert.match(out, /data-key="com.cultureblocs.bead\/b"[^>]*>\s*<input type="checkbox" data-action="tick" aria-label="in this strand" >/);
  assert.doesNotMatch(out, /data-key="com.cultureblocs.strand\/s"[^>]*>\s*<input/);
  assert.doesNotMatch(out, /data-key="com.cultureblocs.bead\/new"[^>]*>\s*<input/);
  assert.match(out, /data-key="com.cultureblocs.bead\/new"[\s\S]*?mark draft">draft/);
});

test('an imported kind cannot inject CSS: an unknown kind is coloured as bloc', () => {
  const evil = bead(`${B}/e`, { body: { kind: 'x);background:url(//evil.test/p' } });
  const out = column([evil, strand(`${S}/s`)]);
  assert.match(out, /data-kind="bloc"/);
  assert.match(out, /data-kind="strand"/);
  assert.doesNotMatch(out, /data-kind="x\)/);
});

test('an empty column says why', () => {
  assert.match(column([]), /Nothing on your String yet/);
  assert.match(column([], { filter: { text: 'x' } }), /Nothing matches the filter/);
});

test('month and day labels', () => {
  assert.equal(monthLabel('2026-01'), 'January 2026');
  assert.equal(dayLabel('2026-09-14'), 'Mon 14 Sep 2026');
  assert.equal(dayLabel('nonsense'), 'nonsense');
});

test('day view, delete confirmation and conflict view say what will happen', () => {
  const a = bead(`${B}/a`);
  assert.match(String(dayView({ day: '2026-09-14', records: [a] })), /21:04 visit — a &lt;b&gt;note[\s\S]*#\/new\/bead\?day=2026-09-14/);
  assert.match(String(dayView({ day: '2026-09-14' })), /Nothing on your String for this day/);
  const del = String(deleteView({ record: a, onString: true, strands: [strand(`${S}/s`)] }));
  assert.match(del, /Delete this bead — “a &lt;b&gt;note&lt;\/b&gt;”\?/);
  assert.match(del, /deleted from the String on the next Send/);
  assert.match(del, /taken out of 1 strand:[\s\S]*Sunday/);
  assert.match(String(deleteView({ record: { ...a, state: 'proposal' } })), /Delete this proposal[\s\S]*gone at once/);
  const long = { ...a, body: { ...a.body, note: 'word '.repeat(40) } };
  assert.match(String(deleteView({ record: long })), /“(word ){15}word…”/, 'a long note is cut to one line');
  assert.match(String(deletedView({ ...a, deleted: true })), /“a &lt;b&gt;note&lt;\/b&gt;” is deleted here[\s\S]*data-action="undo-delete"/);

  const fields = [{ field: 'note', mine: 'mine', theirs: '<theirs>' }, { field: 'tags', mine: undefined, theirs: ['x'] }];
  const both = String(conflictView({ fields }));
  assert.match(both, /<th scope="row">note<\/th><td><pre>mine<\/pre><\/td><td><pre>&lt;theirs&gt;<\/pre>/);
  assert.match(both, /<pre>—<\/pre>/);
  assert.match(both, /data-action="keep-mine">keep mine<[\s\S]*data-action="take-theirs">take the String’s</);
  assert.match(String(conflictView({ theirs: false })), /no longer has this record[\s\S]*keep mine \(send it again\)[\s\S]*let it go/);
  const gone = String(conflictView({ theirs: false, deleted: true }));
  assert.match(gone, /deleted it here too[\s\S]*let it go/);
  assert.doesNotMatch(gone, /take-theirs/);
  assert.match(String(conflictView({ fields, deleted: true })), /You deleted this here[\s\S]*delete it anyway/);
  assert.match(String(conflictView({ fields, armed: true })), /data-action="take-theirs">press again: yours is replaced</);
});

test('top bar: not connected, changes to send, in sync, sending', () => {
  assert.match(String(topbarView({})), /href="#\/settings">not connected/);
  assert.doesNotMatch(String(topbarView({})), /data-action="send"/);
  assert.match(String(topbarView({ connected: true, pending: 3 })), /3 changes to send[\s\S]*data-action="send" >send/);
  assert.match(String(topbarView({ connected: true, pending: 1 })), /1 change to send/);
  assert.match(String(topbarView({ connected: true })), /in sync[\s\S]*data-action="send" disabled/);
  assert.match(String(topbarView({ connected: true, pending: 2, busy: true })), /disabled>sending…/);
});

test('the Send page lists changes, deletes to undo, and the last results with reasons', () => {
  const lines = new Map([['k1', 'first <b>'], ['k2', 'second']]);
  const out = String(sendView({ connected: true, lines, changes: [{ key: 'k1', change: 'edit' }], deletes: [{ key: 'k2' }],
    results: [{ key: 'k1', op: 'patch', status: 'conflict', reason: 'changed on the String' }, { key: 'k2', op: 'post', status: 'invalid', problems: ['a', 'b'] }] }));
  assert.match(out, /edit — first &lt;b&gt;/);
  assert.match(out, /data-key="k2">second <button type="button" data-action="undo-delete">/);
  assert.match(out, /conflict \(edit\): first &lt;b&gt;<\/a> — changed on the String/);
  assert.match(out, /refused \(new\): second<\/a> — a; b/);
  assert.match(String(sendView({})), /settings<\/a> first/);
  assert.match(String(sendView({ connected: true })), /data-action="send" disabled/);
});

test('settings: restore cannot be confirmed while an import or send is running', () => {
  const s = { pendingRestore: { fileName: 'b.json', records: 1, unsent: 0, incoming: 1 } };
  assert.doesNotMatch(String(settingsView({ ...s, busy: false })), /data-action="restore-confirm" disabled/);
  assert.match(String(settingsView({ ...s, busy: true })), /data-action="restore-confirm" disabled/);
  assert.match(String(settingsView({ pending: 2 })), /2 changes not yet sent/);
});

test('no desk view carries an inline style or an inline event handler (the CSP forbids both)', () => {
  const a = bead(`${B}/a`), s = strand(`${S}/s`);
  const outs = [
    beadFormView({ record: a, body: a.body }), strandFormView({ record: s, body: s.body }), column([a, s], { ticked: new Set() }),
    dayView({ day: '2026-09-14', records: [a] }), deleteView({ record: a }), deletedView(a), conflictView({ fields: [{ field: 'note', mine: 1, theirs: 2 }] }),
    topbarView({ connected: true, pending: 1 }), sendView({ changes: [{ key: 'k', change: 'new' }] }), settingsView({}), readOnlyView(a),
  ].map(String);
  for (const out of outs) assert.doesNotMatch(out, /\sstyle=|\son[a-z]+=/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 115 # fail 1`, with:

```text
not ok 5 - app/test/desk-views.test.mjs
```

- [ ] **Step 3: Implement**

Replace the whole of `app/sw.js` with:

```javascript
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-2';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/conflicts.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js', './lib/migrate.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/html.js', './ui/view-bead.js', './ui/view-form.js', './ui/view-panels.js', './ui/view-refs.js', './ui/view-strand.js',
  './ui/view-string.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

Create `app/ui/view-bead.js` with:

```javascript
/* The bead form: a whole bead in one place. Pure. */
import { html } from './html.js';
import { KINDS, footerView, linksText, list, localInput, photosView, placeName, problemsView, provenanceView, restoredView } from './view-form.js';
import { refsView } from './view-refs.js';

const BEAD = 'com.cultureblocs.bead';

/* state: { record, body, problems, urls, restoredDraftAt, dirtyDraft } — record is null for a new bead. */
export function beadFormView(state) {
  const { record = null, body, problems = [], urls = new Map(), restoredDraftAt = null, dirtyDraft = false } = state;
  const kind = KINDS.includes(body.kind) ? body.kind : null;
  const geo = body.geo && typeof body.geo === 'object' ? body.geo : null;
  return html`
    <form class="editor" data-type="${BEAD}">
      <header>
        <h2>${record ? 'Bead' : 'New bead'}</h2>
        ${record?.state === 'proposal' ? html`<span class="chip">proposal — saving keeps it</span>` : ''}
      </header>
      ${restoredView(restoredDraftAt)}
      <div class="row">
        <label>kind <select name="kind">
          ${kind ? '' : html`<option value="" selected>${body.kind ? String(body.kind) : 'choose a kind'}</option>`}
          ${KINDS.map((k) => html`<option ${k === kind ? 'selected' : ''}>${k}</option>`)}</select></label>
        <label>when <input type="datetime-local" name="when" value="${localInput(body.createdAt)}"></label>
      </div>
      <label>note <textarea name="text" rows="6" maxlength="3000">${body.note || ''}</textarea></label>
      <div class="row">
        <label>place <input name="place" value="${placeName(BEAD, body)}"></label>
        <label>tags, comma separated <input name="tags" value="${list(body.tags).filter((t) => typeof t === 'string').join(', ')}"></label>
      </div>
      ${geo ? html`<p class="geo">coordinates ${String(geo.lat)}, ${String(geo.lng)} (${String(geo.precision || '')}) are kept as they are</p>` : ''}
      ${photosView(body.media, urls)}
      <label>links, one per line: url | label <textarea name="links" rows="2">${linksText(body.links)}</textarea></label>
      <fieldset><legend>refs — what this is about</legend>${refsView(body.refs, body.note || '')}</fieldset>
      ${provenanceView(record)}
      <div class="problems-slot">${problemsView(problems)}</div>
      ${footerView({ record, problems, dirtyDraft })}
    </form>`;
}
```

Create `app/ui/view-form.js` with:

```javascript
/* What the bead and strand forms share: links, photos, provenance, problems,
 * the footer, the read-only view, date conversions, and the mapping from
 * form fields back to a record body. Pure. */
import { nameFromUri } from '../lib/media.js';
import { html } from './html.js';

const STRAND = 'com.cultureblocs.strand';
export const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const str = (v) => (typeof v === 'string' ? v : '');

export const KINDS = ['bloc', 'visit', 'dwell', 'encounter', 'read', 'listen', 'watch', 'screening', 'performance', 'note'];

/* A datetime as a datetime-local input shows it (this browser's time zone), and back. */
export function localInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  const d = new Date(String(value || ''));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const linksText = (links) => list(links).filter((l) => l && typeof l === 'object')
  .map((l) => (l.title ? `${l.uri} | ${l.title}` : l.uri)).join('\n');

export function parseLinks(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [uri, ...title] = l.split('|');
    const link = { uri: uri.trim() };
    if (title.join('|').trim()) link.title = title.join('|').trim();
    return link;
  });
}

export const parseTags = (text) => String(text ?? '').split(',').map((t) => t.trim()).filter(Boolean);

export function photosView(media, urls = new Map()) {
  return html`
    <fieldset class="photos"><legend>photos</legend>
      <div class="thumbs">${list(media).map((m, i) => html`
        <figure data-photo="${i}">${urls.get(nameFromUri(m?.uri)) ? html`<img src="${urls.get(nameFromUri(m?.uri))}" alt="">` : html`<span class="nophoto">not in this browser</span>`}
          <label>alt text <input name="alt-${i}" placeholder="what it shows" value="${m?.alt || ''}"></label>
          <button type="button" data-action="photo-remove">remove</button></figure>`)}</div>
      <input type="file" accept="image/*" multiple data-action="photo-add" aria-label="add photos">
    </fieldset>`;
}

const when = (iso) => (typeof iso === 'string' ? iso.replace('T', ' ').slice(0, 16) : '');

export function provenanceView(record) {
  if (!record) return html`<p class="provenance">made in Loom when you save it</p>`;
  const p = record.body?.provenance || {};
  return html`<p class="provenance">made in ${p.app || record.sourceApp || 'an unknown app'}${
    p.mintedAt ? html` · ${when(p.mintedAt)}` : ''}${record.stringId ? ' · on the String' : ' · only in this browser'}</p>`;
}

export const problemsView = (problems = []) =>
  html`${problems.length ? html`<ul class="problems">${problems.map((p) => html`<li>${p}</li>`)}</ul>` : ''}`;

/* state: { record, problems, dirtyDraft, confirmDelete } */
export function footerView({ record = null, problems = [], dirtyDraft = false }) {
  return html`
    <footer>
      <button type="button" class="primary" data-action="save" ${problems.length ? 'disabled' : ''}>save</button>
      ${dirtyDraft ? html`<button type="button" data-action="discard">${record ? 'discard changes' : 'discard this draft'}</button>` : ''}
      ${record ? html`<button type="button" class="danger" data-action="delete">delete</button>` : ''}
    </footer>`;
}

/* Records Loom does not edit: annotations (the AR app owns them) and types it does not know. */
export function readOnlyView(record) {
  const b = record.body || {};
  return html`
    <section class="readonly">
      <h2>${record.type.split('.').pop()} · ${record.day || ''}</h2>
      <p>${record.type.endsWith('annotation') ? 'Annotations arrive from the AR app' : 'Records of this type arrive from other apps'}; they are read-only in Loom.</p>
      ${typeof b.note === 'string' ? html`<p class="note">${b.note}</p>` : ''}
    </section>`;
}

export const restoredView = (at) =>
  html`${at ? html`<p class="restored">restored an unsaved draft from ${when(at)}</p>` : ''}`;

/* Form values -> a new body, from the previous body. Refs and photos are the
 * controller's (anchors, files); alt text is read here. */
export function bodyFromFields(type, prev, f) {
  const body = { ...prev };
  const set = (k, v) => { if (v) body[k] = v; else delete body[k]; };
  /* A place with the name typed; without one, whatever else it held (a DID, coordinates), or nothing. */
  const withName = (placeRef, name) => {
    const { name: _, ...rest } = placeRef && typeof placeRef === 'object' ? placeRef : {};
    return name ? { ...rest, name } : (Object.keys(rest).length ? rest : null);
  };
  const text = String(f.text ?? '');
  const place = String(f.place ?? '').trim();
  const links = parseLinks(f.links);
  set('links', links.length ? links : null);
  if (type === STRAND) {
    set('title', String(f.title ?? '').trim());
    if (f.day) body.day = `${f.day}T00:00:00Z`;
    set('narrative', text);
    set('place', withName(prev.place, place));
  } else {
    if (f.kind) body.kind = f.kind;
    if (f.when !== undefined) {
      const at = fromLocalInput(f.when);
      if (at) body.createdAt = at;
    }
    set('note', text);
    const tags = parseTags(f.tags);
    set('tags', tags.length ? tags : null);
    if (!prev.subject?.uri) set('subject', withName(prev.subject, place));   // a subject with a uri is a record, not a place
  }
  if (Array.isArray(prev.media)) {
    const media = prev.media.map((m, i) => {
      const alt = String(f[`alt-${i}`] ?? m?.alt ?? '').trim();
      const { alt: _, ...rest } = m || {};
      return alt ? { ...rest, alt } : rest;
    });
    set('media', media.length ? media : null);
  }
  return body;
}

export const placeName = (type, body) => str(type === STRAND ? body?.place?.name : body?.subject?.name);
```

Create `app/ui/view-panels.js` with:

```javascript
/* The smaller surfaces: the day summary, the delete confirmation, the
 * conflict view, the top bar with Send's results, and settings. Pure. */
import { summary } from '../lib/day.js';
import { html } from './html.js';
import { dayLabel } from './view-string.js';

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : 'never');
const hhmm = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/* A record's words, cut to fit one line. */
const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/* The editor column when no entry is open: the selected day at a glance. */
export function dayView({ day, records = [] }) {
  return html`
    <section class="dayview">
      <h2>${dayLabel(day)}</h2>
      ${records.length ? html`<ul>${records.map((r) => html`
        <li><a href="#/edit/${r.key}">${hhmm(r.createdAt)} ${r.type.endsWith('strand') ? 'strand' : r.body?.kind || ''} — ${summary(r.type, r.body) || '—'}</a></li>`)}</ul>`
        : html`<p class="empty">Nothing on your String for this day.</p>`}
      <p><a class="button" href="#/new/bead?day=${day}">+ New bead on this day</a>
        <a class="button" href="#/new/strand?day=${day}">+ New strand for this day</a></p>
    </section>`;
}

/* state: { record, strands: [record], onString: bool } */
export function deleteView({ record, strands = [], onString = false }) {
  const what = record.type.endsWith('strand') ? 'strand' : 'bead';
  return html`
    <div class="confirm" role="alertdialog" aria-label="confirm delete">
      <p>Delete this ${record.state === 'proposal' ? 'proposal' : what}${summary(record.type, record.body) ? html` — “${short(summary(record.type, record.body))}”` : ''}?
        ${onString ? 'It is deleted from the String on the next Send; until then you can undo it from Send.' : 'It is only in this browser, so it is gone at once.'}</p>
      ${strands.length ? html`<p>It is taken out of ${plural(strands.length, 'strand')}:</p>
        <ul>${strands.map((s) => html`<li>${short(summary(s.type, s.body))}</li>`)}</ul>` : ''}
      <button type="button" class="danger" data-action="delete-confirm">delete</button>
      <button type="button" data-action="delete-cancel">cancel</button>
    </div>`;
}

/* A record deleted here that Send has not deleted on the String yet. */
export function deletedView(record) {
  return html`
    <section class="deleted">
      <h2>Deleted</h2>
      <p>“${short(summary(record.type, record.body) || record.key)}” is deleted here, and from the String on the next Send.</p>
      <button type="button" data-action="undo-delete">undo delete</button>
    </section>`;
}

const shown = (v) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v, null, 1));

/* state: { fields: [{ field, mine, theirs }], theirs: bool, deleted: bool, armed: bool } — `armed` after a first press on take-theirs */
export function conflictView({ fields = [], theirs = true, deleted = false, armed = false }) {
  return html`
    <section class="conflict" role="alert">
      <h3>Changed here and on the String</h3>
      ${!theirs ? html`<p>The String no longer has this record.${deleted ? ' You deleted it here too.' : ''}</p>`
        : deleted ? html`<p>You deleted this here, but it changed on the String since you last saw it.</p>` : ''}
      ${theirs && fields.length ? html`<table>
        <thead><tr><th scope="col">field</th><th scope="col">yours</th><th scope="col">the String’s</th></tr></thead>
        <tbody>${fields.map((f) => html`<tr><th scope="row">${f.field}</th><td><pre>${shown(f.mine)}</pre></td><td><pre>${shown(f.theirs)}</pre></td></tr>`)}</tbody>
      </table>` : ''}
      <button type="button" data-action="keep-mine">${!theirs && deleted ? 'let it go' : !theirs ? 'keep mine (send it again)' : deleted ? 'delete it anyway' : 'keep mine'}</button>
      ${!theirs && deleted ? '' : html`<button type="button" data-action="take-theirs">${armed ? 'press again: yours is replaced' : !theirs ? 'let it go' : 'take the String’s'}</button>`}
    </section>`;
}

/* state: { pending, connected, busy } */
export function topbarView({ pending = 0, connected = false, busy = false }) {
  return html`
    <a class="brand" href="#/">LOOM</a>
    <span class="status">${!connected ? html`<a href="#/settings">not connected</a>`
      : pending ? html`<a href="#/send">${plural(pending, 'change')} to send</a>` : 'in sync'}</span>
    ${connected ? html`<button type="button" class="primary" data-action="send" ${busy || !pending ? 'disabled' : ''}>${busy ? 'sending…' : 'send'}</button>` : ''}
    <a class="settings" href="#/settings">settings</a>`;
}

const RESULT = { sent: 'sent', held: 'held', conflict: 'conflict', invalid: 'refused', failed: 'failed' };
const OPS = { post: 'new', patch: 'edit', state: 'state', delete: 'delete' };

/* The Send page: what is waiting, the last results, and deletes that can still be undone.
 * state: { changes: [{ key, change, line }], results: [{ key, op, status, reason, problems }], deletes: [{ key, line }], lines: Map key -> words } */
export function sendView({ changes = [], results = [], deletes = [], lines = new Map(), busy = false, connected = false }) {
  const line = (key) => short(lines.get(key) || key);
  return html`
    <section class="send">
      <h2>Send</h2>
      ${connected ? '' : html`<p>Set the String’s address and token in <a href="#/settings">settings</a> first.</p>`}
      ${changes.length ? html`<ul class="changes">${changes.map((c) => html`<li><a href="#/edit/${c.key}">${c.change} — ${line(c.key)}</a></li>`)}</ul>`
        : html`<p class="empty">Nothing waiting to be sent.</p>`}
      ${deletes.length ? html`<h3>Deletes not yet sent</h3><ul>${deletes.map((d) => html`
        <li data-key="${d.key}">${line(d.key)} <button type="button" data-action="undo-delete">undo delete</button></li>`)}</ul>` : ''}
      <button type="button" class="primary" data-action="send" ${busy || !changes.length || !connected ? 'disabled' : ''}>${busy ? 'sending…' : 'send'}</button>
      ${results.length ? html`<h3>Last send</h3><ul class="results">${results.map((r) => html`
        <li class="${r.status}"><a href="#/edit/${r.key}">${RESULT[r.status] || r.status}${r.op ? ` (${OPS[r.op]})` : ''}: ${line(r.key)}</a>${
          r.reason ? ` — ${r.reason}` : ''}${r.problems?.length ? ` — ${r.problems.join('; ')}` : ''}</li>`)}</ul>` : ''}
    </section>`;
}

/* state: { stringUrl, stringToken, check, importResult, lastImportAt, lastBackupAt, busy, pendingRestore, persisted, pending } */
export function settingsView(s) {
  return html`
    <section class="panel">
      <h2>Settings</h2>
      <h3>String</h3>
      <label>URL <input name="stringUrl" value="${s.stringUrl || 'http://localhost:8100'}"></label>
      <label>token <input name="stringToken" type="password" value="${s.stringToken || ''}" autocomplete="off"></label>
      <div class="row"><button type="button" data-action="check">check</button>
        <span class="status">${s.check || ''}</span></div>

      <h3>Import</h3>
      <p>Copies the String's records and photos into this browser. Re-run any time;
        records changed on both sides are marked as conflicts for you to choose.</p>
      <button type="button" data-action="import" ${s.busy ? 'disabled' : ''}>import</button>
      <span class="status">last import: ${when(s.lastImportAt)}</span>
      ${s.importResult ? html`<p class="result">${s.importResult}</p>` : ''}

      <h3>Backup</h3>
      <p>Everything in this browser in one file (not the token). Last backup: ${when(s.lastBackupAt)}.
        ${s.pending ? html`${plural(s.pending, 'change')} not yet sent to the String live only here.` : ''}</p>
      <button type="button" data-action="backup">download backup</button>
      <label class="file">restore from a backup <input type="file" accept="application/json" data-action="restore"></label>
      ${s.pendingRestore ? html`<div class="confirm" role="alertdialog" aria-label="confirm restore">
        <p>Restoring ${s.pendingRestore.fileName || 'this file'} replaces ${plural(s.pendingRestore.records, 'record')} in this browser (${s.pendingRestore.unsent} not yet sent to the String) with the file's ${s.pendingRestore.incoming}.
          Anything not in the file is gone for good.</p>
        <button type="button" data-action="backup">download a backup first</button>
        <button type="button" data-action="restore-confirm" ${s.busy ? 'disabled' : ''}>replace with the file</button>
        <button type="button" data-action="restore-cancel">cancel</button>
      </div>` : ''}

      <h3>This browser</h3>
      <p>${s.persisted ? 'Storage is persistent.' : 'Storage is not marked persistent: the browser may clear it under pressure. Back up.'}</p>
    </section>`;
}
```

Create `app/ui/view-strand.js` with:

```javascript
/* The strand form: title, day, narrative, place, links, refs, and the beads it
 * strings together, in order. Beads are added by ticking them in the String
 * column. Pure. */
import { summary } from '../lib/day.js';
import { keyFromItemUri } from '../lib/keys.js';
import { html } from './html.js';
import { footerView, linksText, list, placeName, problemsView, provenanceView, restoredView } from './view-form.js';
import { refsView } from './view-refs.js';

const STRAND = 'com.cultureblocs.strand';
const hhmm = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : '');

/* state: { record, body, problems, members: Map key -> record, restoredDraftAt, dirtyDraft } */
export function strandFormView(state) {
  const { record = null, body, problems = [], members = new Map(), restoredDraftAt = null, dirtyDraft = false } = state;
  const items = list(body.items);
  return html`
    <form class="editor" data-type="${STRAND}">
      <header><h2>${record ? 'Strand' : 'New strand'}</h2></header>
      ${restoredView(restoredDraftAt)}
      <div class="row">
        <label>title <input name="title" value="${body.title || ''}" maxlength="300"></label>
        <label>day <input type="date" name="day" value="${typeof body.day === 'string' ? body.day.slice(0, 10) : ''}"></label>
      </div>
      <label>narrative <textarea name="text" rows="14">${body.narrative || ''}</textarea></label>
      <label>place <input name="place" value="${placeName(STRAND, body)}"></label>
      <fieldset class="items"><legend>beads in this strand</legend>
        ${items.length ? html`<ol>${items.map((it, i) => {
          const key = keyFromItemUri(it?.uri);
          const bead = key ? members.get(key) : null;
          return html`<li data-item="${i}">
            <span class="line">${bead ? `${bead.day || ''} ${hhmm(bead.createdAt)} ${bead.body?.kind || ''} ${summary(bead.type, bead.body)}` : (key ? `${key} (not in this browser)` : String(it?.uri ?? ''))}</span>
            <button type="button" data-action="item-up" aria-label="move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-action="item-down" aria-label="move down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" data-action="item-remove">remove</button></li>`;
        })}</ol>` : html`<p class="empty">No beads yet.</p>`}
        <p class="hint">Tick beads in the String column to add them.</p>
      </fieldset>
      <label>links, one per line: url | label <textarea name="links" rows="2">${linksText(body.links)}</textarea></label>
      <fieldset><legend>refs — what this is about</legend>${refsView(body.refs, body.narrative || '')}</fieldset>
      ${provenanceView(record)}
      <div class="problems-slot">${problemsView(problems)}</div>
      ${footerView({ record, problems, dirtyDraft })}
    </form>`;
}
```

Create `app/ui/view-string.js` with:

```javascript
/* The String column: new-entry buttons, filter, calendar, and the entry list
 * with its markers, proposal buttons and (while a strand is open) tick boxes.
 * Pure. */
import { html } from './html.js';
import { KINDS, list } from './view-form.js';

const BEAD = 'com.cultureblocs.bead';
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Kinds with a colour in loom.css. Only these reach an attribute; the colour
 * itself comes from a stylesheet rule, never an inline style (see the CSP). */
const COLOURED = [...KINDS, 'strand', 'annotation'];

export const monthLabel = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export function dayLabel(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

const CHANGE = { new: 'not sent', edit: 'changed', state: 'changed', delete: 'deleting' };

function markers(row, change) {
  const r = row.record;
  if (row.draft) return html`<span class="mark draft">draft</span>`;
  return html`${r.state === 'proposal' ? html`<span class="mark proposal">proposal</span>` : ''}${
    list(r.body?.media).length ? html`<span class="mark photo">photo</span>` : ''}${
    change ? html`<span class="mark pending">${CHANGE[change]}</span>` : ''}${
    r.conflict ? html`<span class="mark conflict">conflict</span>` : ''}${
    r.invalid?.length || r.problems?.length ? html`<span class="mark invalid">invalid</span>` : ''}${
    r.missing?.length ? html`<span class="mark missing">photo missing</span>` : ''}`;
}

function rowView(row, { pending, selectedKey, ticking, ticked, drafts }) {
  const r = row.record;
  const tickable = ticking && row.type === BEAD && !row.draft;
  return html`
    <li class="row${row.key === selectedKey ? ' on' : ''}" data-key="${row.key}" data-kind="${COLOURED.includes(row.kind) ? row.kind : 'bloc'}">
      ${tickable ? html`<input type="checkbox" data-action="tick" aria-label="in this strand" ${ticked.has(row.key) ? 'checked' : ''}>` : ''}
      <a href="#/edit/${row.key}"><span class="kind">${row.kind}</span> <span class="line">${row.line || '—'}</span></a>
      <span class="marks">${markers(row, pending.get(row.key))}${!row.draft && drafts.has(row.key) ? html`<span class="mark draft">unsaved</span>` : ''}</span>
      ${r?.state === 'proposal' ? html`<span class="tools">
        <button type="button" data-action="keep">keep</button>
        <button type="button" data-action="release">release</button></span>` : ''}
    </li>`;
}

/* state: { month, selectedDay, weeks, days, pending: Map, filter, apps, selectedKey, ticked: Set | null, today, drafts: Set } */
export function stringColumnView(state) {
  const { month, selectedDay = '', weeks = [], days = [], pending = new Map(), filter = {}, apps = [],
    selectedKey = '', ticked = null, today = '', drafts = new Set() } = state;
  const ticking = ticked !== null;
  return html`
    <div class="column">
      <div class="new">
        <a class="button primary" href="#/new/bead">+ New bead</a>
        <a class="button" href="#/new/strand">+ New strand</a>
      </div>
      <form class="filter" role="search">
        <input type="search" name="text" placeholder="filter" aria-label="filter entries" value="${filter.text || ''}">
        <select name="kind" aria-label="kind"><option value="">all kinds</option>
          ${[...KINDS, 'strand'].map((k) => html`<option ${k === filter.kind ? 'selected' : ''}>${k}</option>`)}</select>
        <select name="app" aria-label="app"><option value="">all apps</option>
          ${apps.map((a) => html`<option ${a === filter.app ? 'selected' : ''}>${a}</option>`)}</select>
      </form>
      <section class="calendar" aria-label="calendar">
        <header>
          <button type="button" data-action="month" data-by="-1" aria-label="previous month">‹</button>
          <span class="month">${monthLabel(month)}</span>
          <button type="button" data-action="month" data-by="1" aria-label="next month">›</button>
        </header>
        <table>
          <thead><tr>${WEEKDAYS.map((d) => html`<th scope="col">${d}</th>`)}</tr></thead>
          <tbody>${weeks.map((week) => html`<tr>${week.map((cell) => (cell
            ? html`<td><a href="#/day/${cell.day}" class="${[cell.count ? 'has' : '', cell.day === selectedDay ? 'on' : '', cell.day === today ? 'today' : ''].filter(Boolean).join(' ')}"
                aria-label="${dayLabel(cell.day)}${cell.count ? `, ${cell.count}` : ''}">${cell.date}</a></td>`
            : html`<td></td>`))}</tr>`)}</tbody>
        </table>
      </section>
      ${ticking ? html`<p class="ticking">Tick beads to put them in the strand you are writing.</p>` : ''}
      <ol class="entries">
        ${days.length ? days.map((d) => html`
          <li class="day" id="day-${d.day}">
            <h3><a href="#/day/${d.day}">${dayLabel(d.day)}</a></h3>
            <ol>${d.rows.map((row) => rowView(row, { pending, selectedKey, ticking, ticked: ticked || new Set(), drafts }))}</ol>
          </li>`) : html`<li class="empty">${filter.text || filter.kind || filter.app ? 'Nothing matches the filter.' : 'Nothing on your String yet. Import it from settings, or write a new bead.'}</li>`}
      </ol>
    </div>`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 133 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/sw.js app/test/desk-views.test.mjs app/ui/view-bead.js app/ui/view-form.js app/ui/view-panels.js app/ui/view-strand.js app/ui/view-string.js && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): pure views for the String column, the bead and strand forms, and the desk's panels

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 9: Controllers for the desk

Thin controllers mount the views and handle their events:
- **`string.js`:** the String column, mounted once beside the editor. It follows the route, moves months, filters (re-rendering only the calendar and list so the filter keeps focus), keeps and releases proposals in place, and scrolls itself (not the page) to the selected day.
- **`editor.js`:** one controller for both forms, new or existing: drafts, save (create or save), discard, delete with confirmation, conflict choices, undo delete, photos, refs and strand items. While a strand is open it offers `ctx.desk.tick` to the column.
- **`pages.js`:** the top bar, the Send page, the day page and `sendAll`.
- **`settings.js`:** Phase 1's String panel, moved: address and token, check, import, backup, restore.

**Files:**
- Modify: `app/sw.js`
- Create: `app/test/desk-controllers.test.mjs`
- Create: `app/ui/editor.js`
- Create: `app/ui/pages.js`
- Create: `app/ui/settings.js`
- Create: `app/ui/string.js`

**Interfaces:**
- Consumes: everything from Tasks 4–8.
- The context every controller receives: `ctx = { store, registry, loom, now(), fetch, broadcast(kind = 'changed'), reload(), navigate(hash), setDirty(bool), persisted(), photoUrls(names) → Map, download(name, text), desk: { results: [], busy: false, tick: null | { has(key), toggle(key, on) }, refreshColumn(), refresh() } }`.
- Produces:
  - `mountString(root, ctx, { day, key }) → { render(), show({ day, key }), unmount() }`.
  - `mountEditor(root, ctx, { key, day }) → { key, render(), flush(), unmount() }`; `startingBody(type, { day, now })`.
  - `mountTopbar(root, ctx)`, `mountSend(root, ctx)`, `mountDay(root, ctx, { day })` → `{ render(), unmount() }`; `sendAll(ctx) → results`.
  - `mountSettings(root, ctx) → { render(), unmount() }`.

- [ ] **Step 1: Write the failing tests**

Create `app/test/desk-controllers.test.mjs` with:

```javascript
/* The desk's controllers, each mounted on a minimal fake root against a real
 * in-memory Loom: they render, and their actions reach the store. Fields are
 * fake inputs handed back for the selectors the controllers read; the DOM
 * itself is covered by the end-to-end browser run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TYPE } from '../lib/backup.js';
import { BEAD, STRAND, openLoom } from '../lib/envelope.js';
import { runImport } from '../lib/importer.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { mountEditor, startingBody } from '../ui/editor.js';
import { localInput } from '../ui/view-form.js';
import { mountDay, mountSend, mountTopbar, sendAll } from '../ui/pages.js';
import { mountSettings } from '../ui/settings.js';
import { mountString } from '../ui/string.js';
import { fakeString } from './fake-string.mjs';
import { makeBead, makeStrand, registry, steppingNow } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A root whose querySelectorAll('form.editor [name]') answers with `fields`. */
function fakeRoot(fields = []) {
  const listeners = {};
  return {
    innerHTML: '', textContent: '',
    fields,
    addEventListener: (t, f) => { listeners[t] = f; },
    removeEventListener: (t) => { delete listeners[t]; },
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === 'form.editor [name]' ? fields : []),
    fire: (t, target) => listeners[t]?.({ target, preventDefault() {} }),
  };
}

const field = (name, value) => ({ name, value, type: 'text', closest: (sel) => (sel === 'form.editor' ? {} : null) });

const button = (action, data = {}, parents = {}) => ({
  dataset: { action, ...data },
  closest: (sel) => (sel === 'button[data-action]' ? button(action, data, parents) : parents[sel] ?? null),
  set textContent(_) {},
});
const inRow = (action, key) => button(action, {}, { '[data-key]': { dataset: { key } } });

async function context({ records = [] } = {}) {
  const store = createMemStore();
  const reg = await registry();
  const now = steppingNow();
  const loom = await openLoom({ store, registry: reg, now, newDeviceId: () => 'desk-1' });
  const s = fakeString({ records });
  const events = [];
  const ctx = { store, registry: reg, loom, now, s, events,
    broadcast: (kind = 'changed') => events.push(`broadcast ${kind}`), setDirty() {}, persisted: async () => false,
    photoUrls: async () => new Map(), download: (name) => events.push(`download ${name}`), reload: () => events.push('reload'),
    navigate: (hash) => events.push(`navigate ${hash}`),
    fetch: async () => { throw new Error('offline'); },
    desk: { results: [], busy: false, tick: null, refreshColumn: () => events.push('refresh column'), refresh() {} } };
  return ctx;
}

test('startingBody: a bead now, or at noon on a chosen day; a strand for today or that day', () => {
  const now = Date.parse('2026-09-15T09:30:00Z');
  assert.deepEqual(startingBody(BEAD, { now }), { kind: 'bloc', createdAt: '2026-09-15T09:30:00.000Z' });
  assert.equal(localInput(startingBody(BEAD, { day: '2026-09-14', now }).createdAt), '2026-09-14T12:00');
  assert.deepEqual(startingBody(STRAND, { now }), { day: '2026-09-15T00:00:00Z', items: [] });
  assert.deepEqual(startingBody(STRAND, { day: '2026-09-01', now }), { day: '2026-09-01T00:00:00Z', items: [] });
});

test('a new bead is typed in full and written once, on save; nothing exists before', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('kind', 'visit'), field('text', 'Rothko room, almost empty.'), field('tags', 'art, tate'),
    field('place', 'Tate Modern'), field('links', 'https://tate.test | Tate')]);
  await mountEditor(root, ctx, { key });
  assert.match(root.innerHTML, /New bead/);
  await root.fire('input', root.fields[1]);
  await sleep(600);
  assert.equal(await ctx.store.getRecord(key), undefined, 'typing writes a draft, not a record');
  assert.deepEqual((await ctx.loom.newDrafts()).map((d) => d.body.note), ['Rothko room, almost empty.']);
  assert.ok(ctx.events.includes('refresh column'));
  await root.fire('click', button('save'));
  const saved = await ctx.store.getRecord(key);
  assert.deepEqual([saved.body.kind, saved.body.note, saved.body.tags, saved.body.subject, saved.body.links],
    ['visit', 'Rothko room, almost empty.', ['art', 'tate'], { name: 'Tate Modern' }, [{ uri: 'https://tate.test', title: 'Tate' }]]);
  assert.equal(saved.body.provenance.timeAnchored, true);
  assert.equal(await ctx.loom.getDraft(key), undefined);
  assert.match(root.innerHTML, /<h2>Bead<\/h2>/);
  assert.ok(ctx.events.includes('broadcast changed'));
});

test('a bead whose time was set, or that was opened for a day, is not anchored to the save', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const when = field('when', '2026-09-10T20:15');
  const root = fakeRoot([field('kind', 'watch'), when]);
  await mountEditor(root, ctx, { key });
  await root.fire('input', when);
  await root.fire('click', button('save'));
  const saved = await ctx.store.getRecord(key);
  assert.equal(saved.body.provenance.timeAnchored, false);
  assert.equal(localInput(saved.createdAt), '2026-09-10T20:15');

  const dayKey = ctx.loom.newKey(BEAD);
  const dayRoot = fakeRoot([field('kind', 'read')]);
  await mountEditor(dayRoot, ctx, { key: dayKey, day: '2026-09-01' });
  await dayRoot.fire('click', button('save'));
  assert.equal((await ctx.store.getRecord(dayKey)).body.provenance.timeAnchored, false);
});

test('a new form with problems cannot save, and says why', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('kind', 'bloc'), field('text', 'x'.repeat(3001))]);
  await mountEditor(root, ctx, { key });
  await root.fire('input', root.fields[1]);
  await root.fire('click', button('save'));
  assert.match(root.innerHTML, /record is not valid/);
  assert.equal(await ctx.store.getRecord(key), undefined);
});

test('discarding a new record’s draft leaves nothing behind and goes back to the day', async () => {
  const ctx = await context();
  const key = ctx.loom.newKey(BEAD);
  const root = fakeRoot([field('text', 'half')]);
  await mountEditor(root, ctx, { key, day: '2026-09-14' });
  await root.fire('input', root.fields[0]);
  await sleep(600);
  await root.fire('click', button('discard'));
  assert.deepEqual(await ctx.loom.newDrafts(), []);
  assert.ok(ctx.events.includes('navigate #/day/2026-09-14'));
});

test('a draft restored over a record saved since then asks, and saves mine over it only when told', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'original' });
  await ctx.loom.save(bead.key, { ...bead.body, note: 'saved in another tab' });
  await ctx.loom.saveDraft(bead.key, { ...bead.body, note: 'my old draft' }, bead.updatedAt);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /restored an unsaved draft from/);
  await root.fire('click', button('save'));
  assert.match(root.innerHTML, /changed in another tab, or by an import/);
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'saved in another tab');
  await root.fire('click', button('tab-mine'));
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'my old draft');
});

test('delete asks first, naming the strands it changes, then deletes and goes back to the day', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'b', createdAt: '2026-09-14T10:00:00Z' });
  await makeStrand(ctx.loom, { title: 'Sunday', items: [{ uri: itemUri(bead.key) }] });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  await root.fire('click', button('delete'));
  assert.match(root.innerHTML, /Delete this bead[\s\S]*gone at once[\s\S]*taken out of 1 strand:[\s\S]*Sunday/);
  assert.ok(await ctx.store.getRecord(bead.key), 'nothing is deleted before confirming');
  await root.fire('click', button('delete-confirm'));
  assert.equal(await ctx.store.getRecord(bead.key), undefined);
  assert.ok(ctx.events.includes('navigate #/day/2026-09-14'));
});

test('while a strand is open, ticking beads adds and removes its items; a ticked proposal is kept', async () => {
  const ctx = await context();
  const a = await makeBead(ctx.loom, { note: 'a' });
  const p = await makeBead(ctx.loom, { note: 'p' });
  await ctx.store.putRecord({ ...p, state: 'proposal' });
  const key = ctx.loom.newKey(STRAND);
  const root = fakeRoot([field('title', 'Sunday')]);
  const editor = await mountEditor(root, ctx, { key });
  assert.ok(ctx.desk.tick);
  await ctx.desk.tick.toggle(a.key, true);
  await ctx.desk.tick.toggle(p.key, true);
  assert.equal(ctx.desk.tick.has(p.key), true);
  assert.equal((await ctx.store.getRecord(p.key)).state, 'kept');
  await ctx.desk.tick.toggle(a.key, false);
  await root.fire('click', button('save'));
  assert.deepEqual((await ctx.store.getRecord(key)).body.items, [{ uri: itemUri(p.key) }]);
  await editor.unmount();
  assert.equal(ctx.desk.tick, null);
});

test('strand items move up and down and are removed from the form', async () => {
  const ctx = await context();
  const a = await makeBead(ctx.loom, { note: 'a' }), b = await makeBead(ctx.loom, { note: 'b' });
  const s = await makeStrand(ctx.loom, { title: 'Sunday', items: [{ uri: itemUri(a.key) }, { uri: itemUri(b.key) }] });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: s.key });
  await root.fire('click', button('item-down', {}, { '[data-item]': { dataset: { item: '0' } } }));
  await root.fire('click', button('save'));
  assert.deepEqual((await ctx.store.getRecord(s.key)).body.items, [{ uri: itemUri(b.key) }, { uri: itemUri(a.key) }]);
  await root.fire('click', button('item-remove', {}, { '[data-item]': { dataset: { item: '1' } } }));
  await root.fire('click', button('save'));
  assert.deepEqual((await ctx.store.getRecord(s.key)).body.items, [{ uri: itemUri(b.key) }]);
});

test('a record in conflict shows both versions; keeping mine clears the conflict', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'import' } });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /Changed here and on the String[\s\S]*<th scope="row">note<\/th><td><pre>mine<\/pre><\/td><td><pre>theirs<\/pre>/);
  await root.fire('click', button('keep-mine'));
  const after = await ctx.store.getRecord(bead.key);
  assert.equal('conflict' in after, false);
  assert.equal(after.stringHlc, 'h');
  assert.doesNotMatch(root.innerHTML, /Changed here and on the String/);
});

test('taking the String’s version asks with a second press, then replaces the form’s body', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { note: 'mine' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', conflict: { theirs: { id: 's1', hlc: 'h', state: 'kept', body: { ...bead.body, note: 'theirs' } }, reason: 'send' } });
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  await root.fire('click', button('take-theirs'));
  assert.match(root.innerHTML, /press again: yours is replaced/);
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'mine', 'the first press only asks');
  await root.fire('click', button('take-theirs'));
  assert.equal((await ctx.store.getRecord(bead.key)).body.note, 'theirs');
  assert.match(root.innerHTML, />theirs<\/textarea>/);
});

test('an annotation opens read-only; a record waiting to be deleted offers undo', async () => {
  const ctx = await context();
  await ctx.store.putRecord({ key: 'com.cultureblocs.annotation/a1', type: 'com.cultureblocs.annotation', day: '2026-09-14', body: { note: 'on the wall' } });
  const ro = fakeRoot();
  await mountEditor(ro, ctx, { key: 'com.cultureblocs.annotation/a1' });
  assert.match(ro.innerHTML, /read-only in Loom/);

  const bead = await makeBead(ctx.loom, { note: 'going' });
  await ctx.store.putRecord({ ...bead, stringId: 's1' });
  await ctx.loom.remove(bead.key);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key: bead.key });
  assert.match(root.innerHTML, /“going” is deleted here/);
  await root.fire('click', button('undo-delete'));
  assert.equal('deleted' in (await ctx.store.getRecord(bead.key)), false);
  assert.match(root.innerHTML, /<h2>Bead<\/h2>/);
});

test('typing updates problems in place without throwing', async () => {
  const ctx = await context();
  const s = await makeStrand(ctx.loom, { title: 'Sunday' });
  const root = fakeRoot([field('title', 'Tate')]);
  await mountEditor(root, ctx, { key: s.key });
  assert.doesNotThrow(() => root.fire('input', root.fields[0]));
});

test('the String column lists records, keeps a proposal, releases one on the second press, and moves months', async () => {
  const ctx = await context();
  const kept = await makeBead(ctx.loom, { note: 'kept one', createdAt: '2026-09-14T10:00:00Z' });
  const p1 = await makeBead(ctx.loom, { note: 'proposal one', createdAt: '2026-09-14T11:00:00Z' });
  const p2 = await makeBead(ctx.loom, { note: 'proposal two', createdAt: '2026-09-14T12:00:00Z' });
  await ctx.store.putRecord({ ...p1, state: 'proposal' });
  await ctx.store.putRecord({ ...p2, state: 'proposal' });
  const root = fakeRoot();
  const column = await mountString(root, ctx, { day: '2026-09-14', key: kept.key });
  assert.match(root.innerHTML, /September 2026[\s\S]*kept one/);
  assert.match(root.innerHTML, /class="row on" data-key="[^"]*"/);
  await root.fire('click', inRow('keep', p1.key));
  assert.equal((await ctx.store.getRecord(p1.key)).state, 'kept');
  await root.fire('click', inRow('release', p2.key));
  assert.ok(await ctx.store.getRecord(p2.key), 'the first press only asks');
  await root.fire('click', inRow('release', p2.key));
  assert.equal(await ctx.store.getRecord(p2.key), undefined);
  await root.fire('click', button('month', { by: '1' }));
  assert.match(root.innerHTML, /October 2026/);
  await column.show({ day: '2026-08-02' });
  assert.match(root.innerHTML, /August 2026/);
});

test('the column’s tick boxes and kind filter reach the open strand and the list', async () => {
  const ctx = await context();
  const bead = await makeBead(ctx.loom, { kind: 'listen', note: 'Coltrane', createdAt: '2026-09-14T10:00:00Z' });
  await makeBead(ctx.loom, { kind: 'visit', note: 'Tate', createdAt: '2026-09-14T11:00:00Z' });
  const toggled = [];
  ctx.desk.tick = { has: () => false, toggle: async (k, on) => toggled.push([k, on]) };
  const root = fakeRoot();
  await mountString(root, ctx, { day: '2026-09-14' });
  assert.match(root.innerHTML, /data-action="tick"/);
  await root.fire('change', { dataset: { action: 'tick' }, checked: true, closest: (sel) => (sel === '[data-key]' ? { dataset: { key: bead.key } } : null) });
  assert.deepEqual(toggled, [[bead.key, true]]);
  await root.fire('change', { name: 'kind', value: 'listen', dataset: {}, closest: (sel) => (sel === 'form.filter' ? {} : null) });
  assert.match(root.innerHTML, /Coltrane/);
  assert.doesNotMatch(root.innerHTML, /Tate/);
});

test('the top bar counts changes; Send goes to the Send page and sends them', async () => {
  const ctx = await context();
  const bar = fakeRoot();
  await mountTopbar(bar, ctx);
  assert.match(bar.innerHTML, /not connected/);
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  await makeBead(ctx.loom, { note: 'to send' });
  await mountTopbar(bar, ctx);
  assert.match(bar.innerHTML, /1 change to send/);
  ctx.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await bar.fire('click', { closest: (sel) => (sel === 'button[data-action="send"]' ? {} : null) });
  assert.ok(ctx.events.includes('navigate #/send'));
  assert.deepEqual(ctx.desk.results.map((r) => r.status), ['failed']);
  assert.equal(ctx.desk.busy, false);
});

test('sendAll sends through the String client and keeps the results for the Send page', async () => {
  const ctx = await context();
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  const bead = await makeBead(ctx.loom, { note: 'x' });
  const posted = [];
  ctx.fetch = async (url, init = {}) => {
    const path = url.replace('http://string.test', '');
    if (init.method === 'POST' && path === '/records') {
      posted.push(JSON.parse(init.body).records[0].dedupeKey);
      return new Response(JSON.stringify({ results: [{ status: 'created', id: 'sid-1' }] }));
    }
    if (path === '/records/sid-1') return new Response(JSON.stringify({ id: 'sid-1', state: 'kept', hlc: 'h1', body: bead.body }));
    return new Response('{}', { status: 404 });
  };
  const results = await sendAll(ctx);
  assert.deepEqual(results.map((r) => [r.op, r.status]), [['post', 'sent']]);
  assert.deepEqual(posted, [`loom:${bead.rkey}`]);
  const page = fakeRoot();
  await mountSend(page, ctx);
  assert.match(page.innerHTML, /sent \(new\): x/);
  assert.match(page.innerHTML, /Nothing waiting to be sent/);
});

test('the Send page undoes a delete not yet sent', async () => {
  const ctx = await context({ records: [] });
  const bead = await makeBead(ctx.loom, { note: 'undo me' });
  await ctx.store.putRecord({ ...bead, stringId: 's1', importedHash: 'x', importedState: 'kept' });
  await ctx.loom.remove(bead.key);
  const page = fakeRoot();
  await mountSend(page, ctx);
  assert.match(page.innerHTML, /delete — undo me[\s\S]*Deletes not yet sent[\s\S]*undo delete/);
  await page.fire('click', inRow('undo-delete', bead.key));
  assert.equal('deleted' in (await ctx.store.getRecord(bead.key)), false);
});

test('the day page lists the day’s records and offers new entries for it', async () => {
  const ctx = await context();
  await makeBead(ctx.loom, { kind: 'visit', note: 'Tate', createdAt: '2026-09-14T10:00:00Z' });
  const root = fakeRoot();
  await mountDay(root, ctx, { day: '2026-09-14' });
  assert.match(root.innerHTML, /Mon 14 Sep 2026[\s\S]*visit — Tate[\s\S]*#\/new\/bead\?day=2026-09-14/);
});

test('settings: check reports an unreachable String, import reports conflicts, and changes are counted for backup', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountSettings(root, ctx);
  await root.fire('click', button('check'));
  assert.match(root.innerHTML, /unreachable \(offline\)/);
  await makeBead(ctx.loom, { note: 'unsent' });
  await mountSettings(root, ctx);
  assert.match(root.innerHTML, /1 change not yet sent/);
});

test('restore asks first, naming what it replaces, then restores and reloads every tab — never while a Send runs', async () => {
  const ctx = await context();
  const mine = await makeBead(ctx.loom, { note: 'not sent yet' });
  const root = fakeRoot();
  await mountSettings(root, ctx);
  const doc = { $type: BACKUP_TYPE, version: 1, records: [], meta: {}, blobs: {} };
  const input = { dataset: { action: 'restore' }, files: [{ name: 'old.json', text: async () => JSON.stringify(doc) }], value: 'old.json' };
  await root.fire('change', input);
  assert.match(root.innerHTML, /replaces 1 record in this browser \(1 not yet sent to the String\)/);
  ctx.desk.busy = true;
  await root.fire('click', button('restore-confirm'));
  assert.ok(await ctx.store.getRecord(mine.key), 'refused while a Send is running');
  ctx.desk.busy = false;
  await root.fire('click', button('backup'));
  await root.fire('click', button('restore-confirm'));
  assert.equal(await ctx.store.getRecord(mine.key), undefined);
  assert.deepEqual(ctx.events.filter((e) => !e.startsWith('download')).slice(-2), ['broadcast restored', 'reload']);
  assert.ok(ctx.events.some((e) => e.startsWith('download loom-backup-')));
});

test('import from settings marks conflicts and says to open them', async () => {
  const T = '2026-09-13T10:00:00Z';
  const ctx = await context({ records: [{ id: 'u1', type: BEAD, sourceApp: 'rounds', createdAt: T, state: 'kept', body: { $type: BEAD, createdAt: T, kind: 'listen', note: 'one' } }] });
  await runImport({ store: ctx.store, registry: ctx.registry, client: ctx.s.client });
  const local = await ctx.store.getRecord(`${BEAD}/u1`);
  await ctx.loom.save(local.key, { ...local.body, note: 'here' });
  ctx.s.editOnString('u1', { note: 'there' });
  const withClient = { ...ctx, fetch: async (url) => {
    const path = url.replace(/^http:\/\/string\.test/, '');
    if (path === '/health') return new Response(JSON.stringify({ ok: true, lexicons: await ctx.s.client.health() }));
    if (path === '/days') return new Response(JSON.stringify({ days: await ctx.s.client.listDays() }));
    if (path.startsWith('/records?day=')) return new Response(JSON.stringify({ records: await ctx.s.client.listRecordsForDay(path.slice(13, 23)) }));
    return new Response('{}', { status: 404 });
  } };
  await ctx.store.setMeta('stringUrl', 'http://string.test');
  const root = fakeRoot();
  await mountSettings(root, withClient);
  await root.fire('click', button('import'));
  assert.match(root.innerHTML, /1 changed on both sides: open them to choose/);
  assert.ok((await ctx.store.getRecord(local.key)).conflict);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 133 # fail 1`, with:

```text
not ok 5 - app/test/desk-controllers.test.mjs
```

- [ ] **Step 3: Implement**

Replace the whole of `app/sw.js` with:

```javascript
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-2';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/conflicts.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js', './lib/migrate.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/editor.js', './ui/html.js', './ui/pages.js', './ui/settings.js', './ui/string.js',
  './ui/view-bead.js', './ui/view-form.js', './ui/view-panels.js', './ui/view-refs.js', './ui/view-strand.js', './ui/view-string.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

Create `app/ui/editor.js` with:

```javascript
/* The editor: one controller for the bead form and the strand form, for a
 * record that exists and for one not yet saved (a key with no record: its
 * type is the key's). Typing updates problems and publish hints in place (a
 * full re-render would steal focus); structural actions re-render. Every change
 * autosaves as a draft; Save writes the record whole through the envelope's
 * validation gate, after any draft write in flight, so no draft outlives it.
 *
 * While a strand is open, `ctx.desk.tick` lets the String column add and
 * remove beads; adding a proposal keeps it. A record in `conflict` shows both
 * versions and the two choices; one waiting to be deleted offers undo. */
import { reanchor, selectionToIndex } from '../lib/anchors.js';
import { changedFields, keepMine, takeTheirs, theirBody } from '../lib/conflicts.js';
import { BEAD, Conflict, EDITABLE, STRAND } from '../lib/envelope.js';
import { preparePhoto } from '../lib/images.js';
import { itemUri, keyFromItemUri, splitKey } from '../lib/keys.js';
import { mediaNames, putPhoto } from '../lib/media.js';
import { beadFormView } from './view-bead.js';
import { bodyFromFields, fromLocalInput, problemsView, readOnlyView } from './view-form.js';
import { conflictView, deleteView, deletedView } from './view-panels.js';
import { publishHint, refFromFields } from './view-refs.js';
import { strandFormView } from './view-strand.js';
import { errorLine, html, surfaceErrors } from './html.js';

const list = (v) => (Array.isArray(v) ? v : []);   // imported bodies are not validated: guard their shape
const textField = (type) => (type === STRAND ? 'narrative' : 'note');

/* The body a new record's form starts with. `day` puts a bead at noon on that day. */
export function startingBody(type, { day = '', now = Date.now() } = {}) {
  if (type === STRAND) return { day: `${day || new Date(now).toISOString().slice(0, 10)}T00:00:00Z`, items: [] };
  return { kind: 'bloc', createdAt: (day && fromLocalInput(`${day}T12:00`)) || new Date(now).toISOString() };
}

export async function mountEditor(root, ctx, { key, day = '' }) {
  const { type } = splitKey(key);
  const inert = { render() {}, async flush() {}, unmount() {} };
  let record = await ctx.store.getRecord(key);
  if (!record && !EDITABLE.includes(type)) { root.textContent = `No record ${key}.`; return inert; }
  if (record && !EDITABLE.includes(record.type)) { root.innerHTML = String(readOnlyView(record)); return inert; }

  const draft = await ctx.loom.getDraft(key);
  const state = {
    body: structuredClone(draft?.body ?? record?.body ?? startingBody(type, { day, now: ctx.now() })),
    restoredDraftAt: draft?.at ?? null, dirtyDraft: Boolean(draft), error: '', confirmDelete: null, tabConflict: null, armTheirs: false,
    members: new Map(), urls: new Map(),
  };
  // The updatedAt the body was typed against: a restored draft's own, so saving it
  // over a record changed since is a Conflict (a draft without one always asks).
  let base = record ? (draft ? (draft.baseUpdatedAt ?? null) : record.updatedAt) : null;
  let anchored = !draft && !day;       // a new bead's time is the moment it was written, unless someone set it
  let saveTimer = null;
  let draftWrite = Promise.resolve();
  let gone = false;

  const text = () => state.body[textField(type)] || '';

  /* What Save would write, for validation before there is a record. */
  function candidate() {
    if (record) return state.body;
    const at = new Date(ctx.now()).toISOString();
    if (type === STRAND) return { ...state.body, $type: STRAND, createdAt: at, items: list(state.body.items) };
    return { ...state.body, $type: BEAD, createdAt: state.body.createdAt || at, provenance: { app: 'loom', device: ctx.loom.deviceId, mintedAt: at, timeAnchored: anchored } };
  }
  const problems = () => ctx.loom.validate(type, candidate());

  async function loadContext() {
    if (type === STRAND) {
      const keys = list(state.body.items).map((it) => keyFromItemUri(it?.uri)).filter(Boolean);
      state.members = new Map((await Promise.all(keys.map((k) => ctx.store.getRecord(k)))).filter(Boolean).map((r) => [r.key, r]));
    }
    state.urls = await ctx.photoUrls(mediaNames(state.body));
  }

  async function render() {
    if (gone) return;
    await loadContext();
    const status = html`<div class="status-slot">${errorLine(state.error)}${state.tabConflict ? html`<p class="error" role="alert">
      This changed in another tab, or by an import, after you opened it.
      <button type="button" data-action="tab-theirs">use the newer version</button>
      <button type="button" data-action="tab-mine">save mine over it</button></p>` : ''}</div>`;
    if (record?.deleted && !record.conflict) {
      root.innerHTML = String(html`${status}${deletedView(record)}`);
      return;
    }
    let conflict = '';
    if (record?.conflict) {
      const theirs = await theirBody(ctx.store, record);
      conflict = conflictView({ fields: theirs ? changedFields(state.body, theirs) : [], theirs: Boolean(theirs), deleted: Boolean(record.deleted), armed: state.armTheirs });
    }
    const view = type === STRAND ? strandFormView : beadFormView;
    const form = view({ ...state, record, problems: problems() });
    const confirm = state.confirmDelete ? deleteView({ record, ...state.confirmDelete }) : '';
    root.innerHTML = String(html`${status}<p class="back"><a href="#/day/${record?.day || ''}">back</a></p>${conflict}${form}${confirm}`);
  }

  function refreshInPlace() {
    const found = problems();
    const slot = root.querySelector('.problems-slot');
    if (slot) slot.innerHTML = String(problemsView(found));
    root.querySelectorAll('button[data-action="save"]').forEach((b) => { b.disabled = found.length > 0; });
    list(state.body.refs).forEach((ref, i) => {
      const hint = root.querySelector(`[data-hint="${i}"]`);
      if (hint) hint.textContent = publishHint(ref);
    });
  }

  function showError(message) {
    state.error = message;
    const slot = root.querySelector('.status-slot');
    if (slot) slot.innerHTML = String(errorLine(message));
  }

  /* Draft writes run one after another; `draftWrite` is the last one. */
  function writeDraft() {
    saveTimer = null;
    const body = structuredClone(state.body), against = base;
    draftWrite = draftWrite.then(async () => {
      try {
        await ctx.loom.saveDraft(key, body, against, record ? null : type);
        state.dirtyDraft = true;
        if (!saveTimer) ctx.setDirty(false);
        if (!record) ctx.desk?.refreshColumn?.();                 // a new draft appears in the list
      } catch (err) {
        showError(`draft not saved: ${err.message} — your changes are still here; back up from settings`);
      }
    });
    return draftWrite;
  }

  function scheduleDraft() {
    ctx.setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, 500);
  }

  async function flush() {
    if (saveTimer) { clearTimeout(saveTimer); writeDraft(); }
    await draftWrite;
  }

  async function settleDrafts() {
    clearTimeout(saveTimer);
    saveTimer = null;
    await draftWrite;
  }

  function readFields() {
    const f = {};
    root.querySelectorAll('form.editor [name]').forEach((el) => { if (!el.closest('fieldset.ref')) f[el.name] = el.value; });
    return f;
  }

  function onInput(e) {
    if (e.target.type === 'file' || e.target.closest?.('form.editor') === null) return;
    if (e.target.name === 'when') anchored = false;
    const before = text();
    const next = bodyFromFields(type, state.body, readFields());
    const refs = [...root.querySelectorAll('fieldset.ref')].map((fs, i) => {
      const f = {};
      fs.querySelectorAll('[name]').forEach((el) => { f[el.name] = el.value; });
      return refFromFields(f, state.body.refs?.[i]);
    });
    const after = next[textField(type)] || '';
    const carried = after !== before ? reanchor(before, after, refs) : refs;
    if (carried.length) next.refs = carried; else delete next.refs;
    state.body = next;
    scheduleDraft();
    refreshInPlace();
  }

  function changed() {
    ctx.setDirty(false);
    ctx.broadcast();
  }

  async function save(expectUpdatedAt = base) {
    await settleDrafts();
    try {
      if (record) record = await ctx.loom.save(key, state.body, { expectUpdatedAt });
      else if (type === STRAND) record = await ctx.loom.createStrand(key, state.body);
      else record = await ctx.loom.createBead(key, state.body, { timeAnchored: anchored });
      base = record.updatedAt;
      state.body = structuredClone(record.body);
      Object.assign(state, { tabConflict: null, restoredDraftAt: null, dirtyDraft: false });
      changed();
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      state.tabConflict = e.current;
    }
    await render();
  }

  /* Back to what is stored: no draft, nothing pending. A new record's form empties and goes. */
  async function revert() {
    await settleDrafts();
    await ctx.loom.discardDraft(key);
    Object.assign(state, { tabConflict: null, restoredDraftAt: null, dirtyDraft: false });
    record = await ctx.store.getRecord(key);
    changed();
    if (!record) {
      gone = true;
      ctx.navigate(`#/day/${day || ''}`);
      return;
    }
    base = record.updatedAt;
    state.body = structuredClone(record.body);
    await render();
  }

  /* After a conflict choice or an undo: reload the record, or leave if it is gone. */
  async function reload() {
    changed();
    record = await ctx.store.getRecord(key);
    if (!record) {
      gone = true;
      await ctx.loom.discardDraft(key);
      ctx.navigate('#/');
      return;
    }
    if (!state.dirtyDraft) state.body = structuredClone(record.body);
    base = state.dirtyDraft ? base : record.updatedAt;
    await render();
  }

  const tick = {
    has: (beadKey) => list(state.body.items).some((it) => it?.uri === itemUri(beadKey)),
    async toggle(beadKey, on) {
      const items = list(state.body.items).filter((it) => it?.uri !== itemUri(beadKey));
      if (on) {
        const bead = await ctx.store.getRecord(beadKey);
        if (bead?.state === 'proposal') { await ctx.loom.keep(beadKey); ctx.broadcast(); }
        items.push({ uri: itemUri(beadKey) });
      }
      state.body.items = items;
      scheduleDraft();
      await render();
    },
  };
  if (type === STRAND && ctx.desk) ctx.desk.tick = tick;

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    state.error = '';
    if (action !== 'take-theirs') state.armTheirs = false;
    const refIndex = Number(button.closest('[data-ref]')?.dataset.ref);
    const itemIndex = Number(button.closest('[data-item]')?.dataset.item);
    const items = list(state.body.items);
    if (action === 'save') return save();
    if (action === 'tab-mine') return save(state.tabConflict.updatedAt);
    if (action === 'tab-theirs' || action === 'discard') return revert();
    if (action === 'delete') {
      state.confirmDelete = { strands: await ctx.loom.strandsUsing(key), onString: Boolean(record.stringId) };
      return render();
    }
    if (action === 'delete-cancel') { state.confirmDelete = null; return render(); }
    if (action === 'delete-confirm') {
      await settleDrafts();
      await ctx.loom.remove(key);
      gone = true;
      changed();
      ctx.navigate(`#/day/${record.day || ''}`);
      return;
    }
    if (action === 'undo-delete') { await ctx.loom.undoRemove(key); return reload(); }
    if (action === 'keep-mine') { await keepMine(ctx.store, key); return reload(); }
    if (action === 'take-theirs') {
      if (!state.armTheirs) { state.armTheirs = true; return render(); }   // two presses: Loom's version is replaced
      state.armTheirs = false;
      await takeTheirs(ctx.store, key, { registry: ctx.registry, now: ctx.now });
      state.dirtyDraft = false;                    // the String's version shows; a draft stays stored, and restores next time
      return reload();
    }
    if (action === 'add-ref') {
      state.body.refs = [...list(state.body.refs), { type: 'work', role: 'subject', descriptor: { label: '' } }];
    } else if (action === 'remove-ref') {
      state.body.refs.splice(refIndex, 1);
      if (!state.body.refs.length) delete state.body.refs;
    } else if (action === 'anchor') {
      const area = root.querySelector('textarea[name="text"]');
      const index = area ? selectionToIndex(area.value, area.selectionStart, area.selectionEnd) : null;
      if (!index) return;
      state.body.refs[refIndex] = { ...state.body.refs[refIndex], index };
    } else if (action === 'clear-anchor') {
      const { index: _, ...rest } = state.body.refs[refIndex];
      state.body.refs[refIndex] = rest;
    } else if (action === 'item-up' && itemIndex > 0) {
      [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
      state.body.items = items;
    } else if (action === 'item-down' && itemIndex < items.length - 1) {
      [items[itemIndex + 1], items[itemIndex]] = [items[itemIndex], items[itemIndex + 1]];
      state.body.items = items;
    } else if (action === 'item-remove') {
      items.splice(itemIndex, 1);
      state.body.items = items;
    } else if (action === 'photo-remove') {
      state.body.media.splice(Number(button.closest('[data-photo]').dataset.photo), 1);
      if (!state.body.media.length) delete state.body.media;
    } else return;
    scheduleDraft();
    await render();
    if (action === 'item-remove') ctx.desk?.refreshColumn?.();
  }

  async function onChange(e) {
    if (e.target.dataset?.action !== 'photo-add') return;
    for (const file of e.target.files) {
      const { blob, width, height } = await preparePhoto(file);
      const uri = await putPhoto(ctx.store, blob);
      state.body.media = [...list(state.body.media), { uri, mime: blob.type, aspectRatio: { width, height } }];
    }
    scheduleDraft();
    await render();
  }

  const show = async (message) => { state.error = message; await render(); };
  const click = surfaceErrors(onClick, show), change = surfaceErrors(onChange, show);
  const submit = (e) => e.preventDefault();       // no inline handler: the CSP forbids them
  root.addEventListener('input', onInput);
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('submit', submit);
  await render();
  ctx.desk?.refreshColumn?.();
  return {
    key,
    /* Another tab, an import or a Send changed the store: show the record as it
     * is now. Unsaved edits stay on screen, and still save against the version
     * they were typed on. Nothing happens while typing is in progress. */
    async render() {
      if (saveTimer || gone) return;
      const fresh = await ctx.store.getRecord(key);
      if (!fresh) {
        if (!record) return;
        gone = true;
        root.textContent = 'This record is no longer in this browser.';
        return;
      }
      record = fresh;
      if (!state.dirtyDraft) {
        base = fresh.updatedAt;
        state.body = structuredClone(fresh.body);
      }
      await render();
    },
    flush,
    unmount() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', click);
      root.removeEventListener('change', change);
      root.removeEventListener('submit', submit);
      if (ctx.desk?.tick === tick) { ctx.desk.tick = null; ctx.desk.refreshColumn?.(); }
      return flush();
    },
  };
}
```

Create `app/ui/pages.js` with:

```javascript
/* The top bar, the Send page and the day page. One Send runs at a time for the
 * whole tab: its state and last results live on `ctx.desk`, so the top bar and
 * the Send page show the same thing. */
import { pendingChanges, summary } from '../lib/day.js';
import { runSend } from '../lib/sender.js';
import { stringClient } from '../lib/string-client.js';
import { errorLine, html, surfaceErrors } from './html.js';
import { dayView, sendView, topbarView } from './view-panels.js';

const WORDS = { new: 'new', edit: 'edit', state: 'keep', delete: 'delete' };

/* Send everything waiting, once; the results land on ctx.desk.results. */
export async function sendAll(ctx) {
  if (ctx.desk.busy) return ctx.desk.results;
  ctx.desk.busy = true;
  ctx.desk.refresh?.();
  try {
    const client = stringClient(await ctx.store.getMeta('stringUrl'), await ctx.store.getMeta('stringToken'), ctx.fetch);
    ctx.desk.results = await runSend({ store: ctx.store, client, now: ctx.now });
  } catch (err) {
    ctx.desk.results = [{ key: '', status: 'failed', reason: err.message }];
  } finally {
    ctx.desk.busy = false;
    ctx.broadcast();
    ctx.desk.refresh?.();
  }
  return ctx.desk.results;
}

const connected = async (ctx) => Boolean(await ctx.store.getMeta('stringUrl'));

export async function mountTopbar(root, ctx) {
  async function render() {
    const pending = (await pendingChanges(await ctx.store.allRecords())).size;
    root.innerHTML = String(topbarView({ pending, connected: await connected(ctx), busy: ctx.desk.busy }));
  }
  const click = surfaceErrors(async (e) => {
    if (e.target.closest?.('button[data-action="send"]')) {
      ctx.navigate('#/send');
      await sendAll(ctx);
    }
  }, async (message) => { root.innerHTML = String(errorLine(message)); });
  root.addEventListener('click', click);
  await render();
  return { render, unmount: () => root.removeEventListener('click', click) };
}

export async function mountSend(root, ctx) {
  let error = '';
  async function render() {
    const records = await ctx.store.allRecords();
    const lines = new Map(records.map((r) => [r.key, summary(r.type, r.body) || r.key]));
    const pending = await pendingChanges(records);
    root.innerHTML = String(errorLine(error)) + String(sendView({
      changes: [...pending].map(([key, change]) => ({ key, change: WORDS[change] })),
      deletes: records.filter((r) => r.deleted && pending.get(r.key) === 'delete').map((r) => ({ key: r.key })),
      results: ctx.desk.results || [], lines, busy: ctx.desk.busy, connected: await connected(ctx),
    }));
  }
  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    error = '';
    if (button.dataset.action === 'send') await sendAll(ctx);
    else if (button.dataset.action === 'undo-delete') {
      await ctx.loom.undoRemove(button.closest('[data-key]').dataset.key);
      ctx.broadcast();
    }
    await render();
  }
  const click = surfaceErrors(onClick, async (message) => { error = message; await render(); });
  root.addEventListener('click', click);
  await render();
  return { render, unmount: () => root.removeEventListener('click', click) };
}

export async function mountDay(root, ctx, { day }) {
  async function render() {
    const records = (await ctx.store.recordsByDay(day)).filter((r) => !r.deleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    root.innerHTML = String(html`${dayView({ day, records })}`);
  }
  await render();
  return { render, unmount() {} };
}
```

Create `app/ui/settings.js` with:

```javascript
/* Settings: the String's address and token, check, import, backup and restore. */
import { checkBackup, exportBackup, restoreBackup } from '../lib/backup.js';
import { pendingChanges } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { stringClient } from '../lib/string-client.js';
import { errorLine, surfaceErrors } from './html.js';
import { settingsView } from './view-panels.js';

export async function mountSettings(root, ctx) {
  const s = { check: '', importResult: '', busy: false, error: '' };

  async function render() {
    const records = await ctx.store.allRecords();
    Object.assign(s, {
      stringUrl: await ctx.store.getMeta('stringUrl'),
      stringToken: await ctx.store.getMeta('stringToken'),
      lastImportAt: await ctx.store.getMeta('lastImportAt'),
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'),
      pending: (await pendingChanges(records)).size,
      persisted: await ctx.persisted(),
    });
    root.innerHTML = String(errorLine(s.error)) + String(settingsView({ ...s, busy: s.busy || ctx.desk.busy }));
  }

  const client = () => stringClient(s.stringUrl || 'http://localhost:8100', s.stringToken, ctx.fetch);

  async function onClick(e) {
    const action = e.target.closest?.('button[data-action]')?.dataset.action;
    if (!action) return;
    s.error = '';
    if (action === 'check') {
      try { s.check = `a String, holding ${(await client().health()).length} record types`; }
      catch (err) { s.check = err.message; }
    } else if (action === 'import') {
      s.busy = true;
      await render();
      try {
        const { counts, conflicts } = await runImport({ store: ctx.store, registry: ctx.registry, client: client(), now: ctx.now });
        s.importResult = `added ${counts.add}, updated ${counts.update}, unchanged ${counts.unchanged}, photos ${counts.photos}`
          + (counts.link ? `, ${counts.link} already sent from here re-linked` : '')
          + (counts.invalid ? `, ${counts.invalid} flagged invalid` : '')
          + (counts.missing ? `, ${counts.missing} photos missing` : '')
          + (conflicts.length ? ` — ${conflicts.length} changed on both sides: open them to choose` : '');
      } catch (err) { s.importResult = err.message; }
      finally { s.busy = false; }
      ctx.broadcast();
    } else if (action === 'restore-confirm' && s.pendingRestore && !s.busy && !ctx.desk.busy) {
      const { doc } = s.pendingRestore;   // an import or send still writing would land in the restored store: refused while busy
      s.pendingRestore = null;
      try {
        await restoreBackup(ctx.store, doc);
      } catch (err) {
        // Checked before anything was cleared, so this is a write failing part way (e.g. a full disk).
        s.importResult = `restore failed part way: ${err.message} — this browser may hold only part of the backup; free some space and restore the same file again`;
        return render();
      }
      ctx.broadcast('restored');
      ctx.reload();
      return;
    } else if (action === 'restore-cancel') {
      s.pendingRestore = null;
    } else if (action === 'backup') {
      const doc = await exportBackup(ctx.store, ctx.now);
      ctx.download(`loom-backup-${doc.exportedAt.slice(0, 10)}.json`, JSON.stringify(doc));
      await ctx.store.setMeta('lastBackupAt', doc.exportedAt);
    }
    await render();
  }

  async function onChange(e) {
    const el = e.target;
    if (el.name === 'stringUrl' || el.name === 'stringToken') {
      await ctx.store.setMeta(el.name, el.value.trim());
      s[el.name] = el.value.trim();
      ctx.broadcast();
    } else if (el.dataset?.action === 'restore' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      try {
        const doc = JSON.parse(await file.text());
        checkBackup(doc);
        const here = await ctx.store.allRecords();
        s.pendingRestore = { doc, fileName: file.name, records: here.length, incoming: doc.records.length,
          unsent: (await pendingChanges(here)).size };
      } catch (err) { s.importResult = `not restored: ${err.message}`; }
      await render();
    }
  }

  const show = async (message) => { s.error = message; s.busy = false; await render(); };
  const click = surfaceErrors(onClick, show), change = surfaceErrors(onChange, show);
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  await render();
  return { render, unmount() { root.removeEventListener('click', click); root.removeEventListener('change', change); } };
}
```

Create `app/ui/string.js` with:

```javascript
/* The String column controller: always mounted beside the editor. It follows
 * the route (`show({ day, key })`), keeps its month and filter, keeps and
 * releases proposals in place, and — while a strand is open in the editor —
 * turns its tick boxes into that strand's items through `ctx.desk.tick`.
 * Typing in the filter re-renders only the calendar and the list, so the
 * filter keeps its focus. */
import { dayCounts, entryList, monthGrid, pendingChanges, shiftMonth, sourceApps } from '../lib/day.js';
import { errorLine, html, surfaceErrors } from './html.js';
import { stringColumnView } from './view-string.js';

export async function mountString(root, ctx, { day = '', key = '' } = {}) {
  const today = () => new Date(ctx.now()).toISOString().slice(0, 10);
  const state = { day, key, month: (day || today()).slice(0, 7), filter: { text: '', kind: '', app: '' }, error: '' };
  const armed = new Set();
  let scrolledTo = null;

  async function view() {
    const records = await ctx.store.allRecords();
    const drafts = await ctx.loom.newDrafts();
    const edits = new Set(Object.keys(await ctx.store.allMeta()).filter((k) => k.startsWith('draft:')).map((k) => k.slice('draft:'.length)));
    const tick = ctx.desk?.tick;
    const days = entryList(records, { filter: state.filter, drafts, today: today() });
    return html`<div class="status-slot">${errorLine(state.error)}</div>${stringColumnView({
      month: state.month, selectedDay: state.day, today: today(), weeks: monthGrid(state.month, dayCounts(records)),
      days, pending: await pendingChanges(records), filter: state.filter, apps: sourceApps(records), selectedKey: state.key,
      ticked: tick ? new Set(days.flatMap((d) => d.rows).filter((r) => tick.has(r.key)).map((r) => r.key)) : null,
      drafts: edits,
    })}`;
  }

  async function render({ keepFilter = false } = {}) {
    const out = String(await view());
    const entries = keepFilter ? root.querySelector('.entries') : null;
    if (entries && root.ownerDocument) {
      const next = root.ownerDocument.createElement('div');
      next.innerHTML = out;
      for (const sel of ['.status-slot', '.calendar', '.ticking', '.entries']) {
        const now = root.querySelector(sel), then = next.querySelector(sel);
        if (now && then) now.replaceWith(then);
        else if (now) now.remove();
        else if (then) root.querySelector('.entries')?.before(then);
      }
    } else {
      root.innerHTML = out;
    }
    if (state.day && scrolledTo !== state.day) {
      const heading = root.querySelector?.(`#day-${state.day}`);
      // Scroll the column itself: scrollIntoView would scroll the page too.
      if (heading) { scrolledTo = state.day; root.scrollTop = heading.offsetTop - 8; }   // the column is the heading's offsetParent (sticky)
    }
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    state.error = '';
    if (action === 'month') {
      state.month = shiftMonth(state.month, Number(button.dataset.by));
      return render();
    }
    const rowKey = button.closest('[data-key]')?.dataset.key;
    if (action === 'keep') {
      await ctx.loom.keep(rowKey);
    } else if (action === 'release') {
      if (!armed.has(rowKey)) {                  // two presses: releasing deletes it
        armed.add(rowKey);
        button.textContent = 'release?';
        setTimeout(() => { armed.delete(rowKey); button.textContent = 'release'; }, 4000);
        return;
      }
      armed.delete(rowKey);
      await ctx.loom.remove(rowKey);
    } else return;
    ctx.broadcast();
    await render();
  }

  async function onChange(e) {
    const el = e.target;
    if (el.dataset?.action === 'tick') {
      const rowKey = el.closest('[data-key]')?.dataset.key;
      if (ctx.desk?.tick && rowKey) await ctx.desk.tick.toggle(rowKey, el.checked);
      return render({ keepFilter: true });
    }
    if (el.closest?.('form.filter') && ['kind', 'app'].includes(el.name)) {
      state.filter[el.name] = el.value;
      return render({ keepFilter: true });
    }
  }

  function onInput(e) {
    if (e.target.name !== 'text' || !e.target.closest?.('form.filter')) return;
    state.filter.text = e.target.value;
    render({ keepFilter: true }).catch((err) => show(err.message));
  }

  const show = async (message) => { state.error = message; await render({ keepFilter: true }); };
  const click = surfaceErrors(onClick, show), change = surfaceErrors(onChange, show);
  const submit = (e) => e.preventDefault();
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', submit);
  await render();

  return {
    render: () => render({ keepFilter: true }),
    /* The route moved: select its day (showing its month) and entry. */
    async show({ day: nextDay = '', key: nextKey = '' } = {}) {
      if (nextDay && nextDay !== state.day) state.month = nextDay.slice(0, 7);
      Object.assign(state, { day: nextDay || state.day, key: nextKey });
      await render({ keepFilter: true });
    },
    unmount() {
      root.removeEventListener('click', click);
      root.removeEventListener('change', change);
      root.removeEventListener('input', onInput);
      root.removeEventListener('submit', submit);
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 155 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/sw.js app/test/desk-controllers.test.mjs app/ui/editor.js app/ui/pages.js app/ui/settings.js app/ui/string.js && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): controllers for the String column, the editor, Send, the day page and settings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 10: The desk shell

The shell brings it together: the top bar and the String column stay mounted; the editor column follows the route (`#/`, `#/day/<d>`, `#/new/bead`, `#/new/strand`, `#/edit/<key>`, `#/send`, `#/settings`). Opening Loom runs the Phase 1 migration. A change in this tab re-renders this tab's surfaces and tells other tabs. Below 900px the page shows one column at a time (`body[data-view]`). Posture is gone from routing, and the service worker's cache becomes `loom-3`.

**Files:**
- Modify: `app/index.html`
- Modify: `app/lib/routing.js`
- Modify: `app/loom.css`
- Modify: `app/loom.js`
- Modify: `app/sw.js`
- Modify: `app/test/routing.test.mjs`
- Modify: `app/test/sw.test.mjs`

**Interfaces:**
- Consumes: every controller (Task 9), `migrateStore` (Task 4), `routeSerializer`, `openStore`, `loadRegistry`, `openLoom`.
- Produces: `app/index.html` with `#bar`, `#banner`, `#desk` > `#column` + `#editor`; `window.loom = ctx`; `app/lib/routing.js` exports only `routeSerializer`; `VERSION = 'loom-3'`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `app/test/routing.test.mjs` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeSerializer } from '../lib/routing.js';

const surface = (name, log) => ({ name, unmount: () => log.push(`unmount ${name}`) });

test('a route overtaken by a newer one unmounts what it goes on to mount, and stops', () => {
  const begin = routeSerializer();
  const log = [];
  const mounted = [];
  const first = begin();                               // #/edit/x: day mounted, editor still loading
  assert.equal(first.keep(surface('day', log), mounted), true);
  const second = begin();                              // a hashchange arrives mid-mount
  assert.equal(first.current, false);
  assert.equal(second.current, true);
  assert.equal(first.keep(surface('editor', log), mounted), false);
  assert.deepEqual(log, ['unmount editor']);
  assert.equal(second.keep(surface('send', log), mounted), true);
  assert.deepEqual(mounted.map((m) => m.name), ['day', 'send']);
});
```

Replace the whole of `app/test/sw.test.mjs` with:

```javascript
/* The service worker must cache every module the app can import, or Loom
 * breaks offline the first time a new module is added and not listed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './helpers.mjs';

const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
const shell = JSON.parse(`[${/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);
const ROOT = ['./', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const modules = (dir) => readdirSync(join(APP, dir)).filter((f) => f.endsWith('.js')).map((f) => `./${dir}/${f}`);

test('SHELL lists exactly the root shell files and every module under lib, ui and vendor', () => {
  const expected = [...ROOT, ...modules('lib'), ...modules('ui'), ...modules('vendor')].sort();
  assert.deepEqual([...shell].sort(), expected);
});

test('the cache version is bumped and install bypasses the HTTP cache', () => {
  assert.match(sw, /const VERSION = 'loom-3';/);
  assert.match(sw, /cache: 'reload'/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 153 # fail 1`, with:

```text
not ok 145 - the cache version is bumped and install bypasses the HTTP cache
```

- [ ] **Step 3: Implement**

Replace the whole of `app/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src *; worker-src 'self'; manifest-src 'self'">
  <title>Loom</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon-192.png">
  <meta name="theme-color" content="#1B1D22">
  <link rel="stylesheet" href="loom.css">
</head>
<body data-view="column">
  <header id="bar" class="bar"></header>
  <p id="banner" class="banner" hidden></p>
  <main id="desk">
    <nav id="column" aria-label="your String"></nav>
    <section id="editor"></section>
  </main>
  <noscript>Loom needs JavaScript: it is the whole app.</noscript>
  <script type="module" src="loom.js"></script>
</body>
</html>
```

Replace the whole of `app/lib/routing.js` with:

```javascript
/* The shell's routing decisions, pure (no DOM) so node can test them.
 *
 * Routes overlap: a hashchange can start a new route while the
 * last is still awaiting a mount. Each begin() supersedes every earlier route;
 * a superseded route unmounts whatever it goes on to mount, and stops. */
export function routeSerializer() {
  let latest = 0;
  return function begin() {
    const token = ++latest;
    return {
      get current() { return token === latest; },
      /* A surface this route just mounted: added to `mounted` if the route is
       * still current (true); otherwise unmounted at once (false). */
      keep(surface, mounted) {
        if (token === latest) { mounted.push(surface); return true; }
        surface?.unmount?.();
        return false;
      },
    };
  };
}
```

Replace the whole of `app/loom.css` with:

```css
:root{
  --ink:#1B1D22; --faint:#6F6A61; --line:#DDD6CA; --paper:#F7F4EE; --card:#FFFDF9; --card-edge:#E6DFD3; --wash:#EFEAE1;
  --visit:#2B4BC7; --dwell:#A36B08; --encounter:#B0326E; --screening:#6B3FA0; --performance:#A23B2A;
  --bloc:#4A4741; --read:#2E7A4F; --listen:#C74E2B; --watch:#0F6E6B; --note:#4A4741; --annotation:#1B1D22; --strand:#1B1D22;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --serif: Charter, "Iowan Old Style", Georgia, serif;
  --bar: 3rem;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 var(--serif)}
a{color:var(--visit)}
button,.button{font:13px var(--mono);background:var(--card);color:var(--ink);border:1px solid var(--card-edge);border-radius:4px;padding:.25rem .6rem;cursor:pointer;text-decoration:none;display:inline-block}
button.primary,.button.primary{background:var(--visit);border-color:var(--visit);color:#fff}
button.danger{color:var(--performance);border-color:var(--performance)}
button:disabled{opacity:.45;cursor:not-allowed}
input,select,textarea{font:inherit;border:1px solid var(--line);border-radius:4px;padding:.3rem .45rem;background:var(--card);width:100%;color:var(--ink)}
input[type="checkbox"]{width:auto}
label{display:block;margin:.5rem 0;font:12px var(--mono);color:var(--faint)}
label > input,label > select,label > textarea{margin-top:.2rem;font:15px/1.5 var(--serif)}
.row{display:flex;gap:.8rem;flex-wrap:wrap}
.row > label{flex:1 1 12rem}
.empty,.hint,.provenance,.geo{color:var(--faint);font-size:14px}
.error{color:var(--performance);border:1px solid var(--performance);padding:.4rem .6rem;border-radius:4px}
.problems{color:var(--encounter);font:13px var(--mono)}
pre{margin:0;white-space:pre-wrap;font:12px var(--mono)}

/* top bar */
.bar{display:flex;gap:1rem;align-items:center;height:var(--bar);padding:0 1.2rem;border-bottom:1px solid var(--line);background:var(--card)}
.brand{font:700 14px var(--mono);letter-spacing:.2em;color:var(--ink);text-decoration:none}
.bar .status{font:13px var(--mono);color:var(--faint);margin-left:auto}
.bar .settings{font:13px var(--mono)}
.banner{margin:0;padding:.3rem 1.2rem;font:12px var(--mono);color:var(--encounter)}

/* the desk: String column and editor */
#desk{display:grid;grid-template-columns:minmax(19rem,34%) minmax(0,1fr)}
#column{border-right:1px solid var(--line);height:calc(100vh - var(--bar));overflow-y:auto;position:sticky;top:0;padding:.8rem 1rem}
#editor{padding:1rem 1.6rem 3rem;min-width:0;max-width:52rem}
.back{display:none;margin:0 0 .5rem;font:13px var(--mono)}
@media (max-width: 899px){
  #desk{grid-template-columns:minmax(0,1fr)}
  #column{height:auto;position:static;border-right:0}
  body[data-view="editor"] #column{display:none}
  body[data-view="column"] #editor{display:none}
  .back{display:block}
}

/* String column */
.column .new{display:flex;gap:.5rem;margin-bottom:.6rem}
.filter{display:grid;grid-template-columns:1fr auto auto;gap:.4rem;margin-bottom:.6rem}
.filter input,.filter select{font:13px var(--mono);padding:.2rem .35rem}
.calendar header{display:flex;align-items:center;justify-content:space-between;font:13px var(--mono)}
.calendar table{width:100%;border-collapse:collapse;table-layout:fixed;font:12px var(--mono)}
.calendar th{color:var(--faint);font-weight:400;padding:.15rem 0}
.calendar td{text-align:center;padding:1px}
.calendar a{display:block;padding:.2rem 0;border-radius:3px;color:var(--faint);text-decoration:none}
.calendar a.has{background:var(--wash);color:var(--ink);font-weight:700}
.calendar a.today{box-shadow:inset 0 0 0 1px var(--faint)}
.calendar a.on{background:var(--ink);color:var(--paper)}
.ticking{font:12px var(--mono);color:var(--visit);margin:.6rem 0 0}
.entries{list-style:none;padding:0;margin:.8rem 0 0}
.entries .day h3{font:12px var(--mono);text-transform:uppercase;letter-spacing:.06em;margin:.9rem 0 .2rem;color:var(--faint)}
.entries .day h3 a{color:inherit;text-decoration:none}
.entries ol{list-style:none;padding:0;margin:0}
.entries .row{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .4rem;padding:.25rem .4rem;border-left:3px solid var(--k,var(--bloc));border-radius:2px;--k:var(--bloc)}
.entries .row.on{background:var(--card);box-shadow:0 0 0 1px var(--card-edge)}
.entries .row > a{flex:1 1 10rem;color:var(--ink);text-decoration:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entries .row .kind{font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--k)}
.row[data-kind="visit"]{--k:var(--visit)}.row[data-kind="dwell"]{--k:var(--dwell)}.row[data-kind="encounter"]{--k:var(--encounter)}
.row[data-kind="read"]{--k:var(--read)}.row[data-kind="listen"]{--k:var(--listen)}.row[data-kind="watch"]{--k:var(--watch)}
.row[data-kind="screening"]{--k:var(--screening)}.row[data-kind="performance"]{--k:var(--performance)}
.row[data-kind="note"]{--k:var(--note)}.row[data-kind="annotation"]{--k:var(--annotation)}.row[data-kind="strand"]{--k:var(--strand)}
.marks{display:flex;gap:.25rem}
.mark{font:10px var(--mono);border:1px solid var(--card-edge);border-radius:8px;padding:0 .35rem;color:var(--faint);background:var(--card)}
.mark.pending,.mark.draft{color:var(--dwell);border-color:var(--dwell)}
.mark.conflict,.mark.invalid,.mark.missing{color:var(--encounter);border-color:var(--encounter)}
.mark.proposal{border-style:dashed}
.row .tools{display:flex;gap:.3rem}
.row .tools button{font-size:11px;padding:0 .4rem}

/* editor */
.editor header{display:flex;gap:.6rem;align-items:baseline}
.editor h2,.dayview h2,.send h2,.panel h2,.deleted h2,.readonly h2{font-size:1.15rem;margin:.2rem 0 .6rem}
.editor fieldset{border:1px solid var(--line);border-radius:6px;margin:.8rem 0;padding:.5rem .8rem}
.editor legend{font:12px var(--mono);color:var(--faint)}
.editor footer{display:flex;gap:.6rem;align-items:center;margin:1rem 0}
.chip{font:11px var(--mono);border:1px solid var(--card-edge);border-radius:10px;padding:.05rem .5rem;color:var(--faint);background:var(--card)}
.restored{font:13px var(--mono);color:var(--dwell)}
.thumbs{display:flex;gap:.6rem;flex-wrap:wrap}
.thumbs figure{margin:0;width:10rem}
.thumbs img{width:100%;border-radius:3px}
.nophoto{display:block;font:12px var(--mono);color:var(--encounter)}
.items ol{padding-left:1.4rem;margin:.2rem 0}
.items li{display:flex;gap:.3rem;align-items:baseline;flex-wrap:wrap;padding:.15rem 0}
.items .line{flex:1 1 12rem}
.ref{background:var(--paper)}
.ref .row label{flex:1 1 9rem}
.ref .hint{font:12px var(--mono);color:var(--faint);margin:.2rem 0}
.conflict{border:1px solid var(--encounter);border-radius:6px;padding:.6rem .8rem;margin:.6rem 0}
.conflict h3{margin:0 0 .4rem;font-size:1rem}
.conflict table{width:100%;border-collapse:collapse;margin:.4rem 0}
.conflict th,.conflict td{border-top:1px solid var(--line);padding:.3rem;vertical-align:top;text-align:left;font-size:13px}
.confirm{border:1px solid var(--performance);border-radius:6px;padding:.6rem .8rem;margin:.6rem 0;background:var(--card)}

/* pages */
.dayview ul,.send ul{padding-left:1.2rem}
.send .results .conflict,.send .results .invalid,.send .results .failed{color:var(--encounter)}
.send .results li{border:0;padding:0;margin:0}
.panel{max-width:40rem}
.panel .row{align-items:center}
.status,.result{font:12px var(--mono);color:var(--faint)}
```

Replace the whole of `app/loom.js` with:

```javascript
/* The shell: open the store (bringing Phase 1 data to the desk's model), keep
 * the top bar and the String column mounted, route the editor column, keep
 * tabs in step, and take service-worker updates only when no edit is pending.
 *
 *   #/                    today, at a glance
 *   #/day/<YYYY-MM-DD>    a day, at a glance
 *   #/new/bead?day=…      reserve a key, then #/edit/<key>
 *   #/new/strand?day=…    the same, for a strand
 *   #/edit/<key>?day=…    the form for a record, or for a new one not yet saved
 *   #/send                what is waiting, and the last Send's results
 *   #/settings            String address and token, import, backup, restore
 *
 * On a narrow screen the page shows one column at a time: the String for #/
 * and #/day, the editor for everything else (body[data-view], loom.css). */
import { BEAD, STRAND, openLoom } from './lib/envelope.js';
import { loadRegistry } from './lib/lexicons.js';
import { hashFromName } from './lib/media.js';
import { migrateStore } from './lib/migrate.js';
import { routeSerializer } from './lib/routing.js';
import { openStore } from './lib/store.js';
import { mountEditor } from './ui/editor.js';
import { mountDay, mountSend, mountTopbar } from './ui/pages.js';
import { mountSettings } from './ui/settings.js';
import { mountString } from './ui/string.js';

const $ = (sel) => document.querySelector(sel);
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('loom') : null;
const urls = new Map();
const begin = routeSerializer();
const NEW = { bead: BEAD, strand: STRAND };
let mounted = [];
let dirty = false;

async function boot() {
  const store = await openStore();
  await migrateStore(store);
  const registry = await loadRegistry(async (p) => (await fetch(p)).json(), './vendor/lexicons/');
  const loom = await openLoom({ store, registry });
  let topbar = null, column = null;

  const refreshAll = () => {
    if (dirty) return;
    for (const surface of [topbar, column, ...mounted]) surface?.render?.()?.catch?.((err) => console.error(err));
  };

  const ctx = {
    store, registry, loom,
    now: () => Date.now(),
    fetch: (...a) => fetch(...a),
    /* Something changed: other tabs hear it, and this tab's surfaces show it. */
    broadcast(kind = 'changed') {
      channel?.postMessage(kind);
      if (kind !== 'restored') refreshAll();
    },
    reload: reloadWhenClean,
    navigate: (hash) => { location.hash = hash; },
    setDirty: (d) => { dirty = d; },
    async persisted() { return (await navigator.storage?.persisted?.()) ?? false; },
    async photoUrls(names) {
      for (const name of names) {
        if (urls.has(name)) continue;
        const row = await store.getBlob(hashFromName(name));
        if (row) urls.set(name, URL.createObjectURL(row.blob));
      }
      return urls;
    },
    download(filename, text) {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    },
    desk: {
      results: [], busy: false, tick: null,
      refreshColumn: () => column?.render().catch((err) => console.error(err)),
      refresh: () => { topbar?.render().catch((err) => console.error(err)); mounted.forEach((m) => m.render?.()); },
    },
  };

  async function route() {
    try {
      await routeNow();
    } catch (err) {
      $('#editor').textContent = `Could not open this page: ${err.message}`;
      console.error(err);
    }
  }

  async function routeNow() {
    const current = begin();
    await Promise.all(mounted.map((m) => m.unmount?.()));
    mounted = [];
    if (!current.current) return;
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [surface = '', ...rest] = path.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    const params = new URLSearchParams(query);
    const today = new Date(ctx.now()).toISOString().slice(0, 10);

    if (surface === 'new' && NEW[arg]) {
      const day = params.get('day');
      location.replace(`#/edit/${loom.newKey(NEW[arg])}${day ? `?day=${day}` : ''}`);
      return;
    }
    // Each route renders into its own container: a route overtaken mid-mount
    // keeps writing only into a container that is no longer on the page.
    const pane = document.createElement('div');
    $('#editor').replaceChildren(pane);
    document.body.dataset.view = !surface || surface === 'day' ? 'column' : 'editor';

    if (!surface || surface === 'day') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : today;
      await column.show({ day, key: '' });
      current.keep(await mountDay(pane, ctx, { day }), mounted);
    } else if (surface === 'edit') {
      const record = await store.getRecord(arg);
      if (!current.current) return;
      await column.show({ day: record?.day || params.get('day') || '', key: arg });
      current.keep(await mountEditor(pane, ctx, { key: arg, day: params.get('day') || '' }), mounted);
    } else if (surface === 'send') {
      current.keep(await mountSend(pane, ctx), mounted);
    } else if (surface === 'settings') {
      current.keep(await mountSettings(pane, ctx), mounted);
    } else {
      pane.textContent = 'Nothing here.';
    }
  }

  topbar = await mountTopbar($('#bar'), ctx);
  column = await mountString($('#column'), ctx, {});
  window.addEventListener('hashchange', route);
  channel?.addEventListener('message', (e) => {
    if (e.data === 'restored') reloadWhenClean();   // another tab replaced the store
    else refreshAll();
  });

  await route();
  requestPersistence();   // not awaited: a permission prompt must not hold the first page back
  registerServiceWorker();
  window.loom = ctx;   // for scripted checks and the console
}

/* Write any pending draft, wait until nothing is dirty, then resolve. */
async function whenClean() {
  for (;;) {
    await Promise.all(mounted.map((m) => m.flush?.()));
    if (!dirty) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function reloadWhenClean() {
  await whenClean();
  location.reload();
}

function requestPersistence() {
  (async () => {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    if (!(await navigator.storage.persist())) {
      const banner = $('#banner');
      banner.textContent = 'This browser may clear Loom’s storage — back up from settings.';
      banner.hidden = false;
    }
  })().catch((err) => console.error(err));
}

/* A new version is installed but waits; it takes over only when no edit is
 * pending, then every tab reloads onto it — each only once its own edits are
 * written. */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The first install claims this page too; only a replacement of an existing
  // worker is an update worth reloading for.
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reg = await navigator.serviceWorker.register('./sw.js');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    reloadWhenClean();
  });
  const offer = () => {
    if (!reg.waiting) return;
    const tryNow = () => (dirty ? setTimeout(tryNow, 1000) : reg.waiting?.postMessage('skipWaiting'));
    tryNow();
  };
  offer();
  reg.addEventListener('updatefound', () => {
    reg.installing?.addEventListener('statechange', (e) => { if (e.target.state === 'installed' && navigator.serviceWorker.controller) offer(); });
  });
}

boot().catch((err) => {
  document.getElementById('editor').textContent = `Loom could not start: ${err.message}`;
  console.error(err);
});
```

Replace the whole of `app/sw.js` with:

```javascript
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-3';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/conflicts.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js', './lib/migrate.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/editor.js', './ui/html.js', './ui/pages.js', './ui/settings.js', './ui/string.js',
  './ui/view-bead.js', './ui/view-form.js', './ui/view-panels.js', './ui/view-refs.js', './ui/view-strand.js', './ui/view-string.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 154 # fail 0`

- [ ] **Step 5: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add app/index.html app/lib/routing.js app/loom.css app/loom.js app/sw.js app/test/routing.test.mjs app/test/sw.test.mjs && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
feat(desk): the desk shell — two columns that stack on a phone, routes, loom-3 shell cache

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 11: Docs follow the desk

LOOM.md §3 becomes the desk and "one way in"; §9.7 and §4 lose posture and totem; §10 gains Phase 1b; §11 drops the phone-posture question. The README describes the desk and how to run it. The spec gains §12, the corrections found while prototyping.

**Files:**
- Modify: `LOOM.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Make the change**

Run the patch from `/Users/marksimpkins/TPM/cultureblocs-loom`.

Apply this patch (it changes `LOOM.md`, `README.md`, `docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md`):

```bash
git apply <<'PATCH'
diff --git a/LOOM.md b/LOOM.md
index 1c45bab..62e9942 100644
--- a/LOOM.md
+++ b/LOOM.md
@@ -114,58 +114,56 @@ has to assert nested shapes, not just top-level keys.
 
 ## 3 · The shape of Loom
 
-One responsive page, one codebase, six surfaces. Vanilla ES modules and
-IndexedDB, in the manner of Easel and Pocket — no framework, no build
-step, served as static files (`:8108` in compose; deployable to
-cultureblocs.com like Pocket, because the OAuth client id must be a
-stable URL).
-
-    ┌ Thread ────────── the day, the month; beads, strands, proposals
-    ├ Mint ──────────── the button: a bead in two taps
-    ├ Compose ───────── the full entry: narrative, place, items, photos
+One responsive page, one codebase. Vanilla ES modules and IndexedDB, in
+the manner of Easel and Pocket — no framework, no build step, served as
+static files (`:8108` in compose; deployable to cultureblocs.com like
+Pocket, because the OAuth client id must be a stable URL).
+
+    ┌ The desk ──────── your String always in view, and an editor beside it
+    │   String column   calendar, the entries newest first, filter, proposals
+    │   Editor          a whole bead or a whole strand, in one form
+    │   Send            every change for the String: new, edited, kept, deleted
     ├ Feeds ─────────── connectors, their last run, their proposals
     ├ Vault ─────────── identities, connector credentials, devices
     └ Publish ───────── what is public, what has drifted, what to send
 
-**Posture, not two apps.** The ROADMAP is explicit that the phone is
-"a button, not a feed" and that the telling stays a desk ritual. One
-interface and that principle are in tension, and the tension is real —
-so resolve it with a **posture** rather than a second codebase. On a
-narrow viewport Loom opens in *totem posture*: Mint is the whole
-screen, the mask strip and the dot-matrix bloom exactly as Pocket does
-it. Thread is reachable, but by a deliberate gesture, never as the
-landing surface. On a wide viewport Loom opens in *desk posture*:
-Thread centre, Feeds and Publish in rails. Posture is a setting, so the
-principle is a default and not a cage.
-
-This is a deliberate softening of "no timeline on the phone". Worth
-knowing that is what it is.
-
-### Two ways in, one mint fact
-
-**Quick bead.** Mask, optional line, press. Written to IndexedDB before
-anything else happens; no network on the critical path. `provenance.app
-= "loom"`, `provenance.mintedAt` = the press. This is a *mint fact* and
-is never rewritten by a machine.
-
-**Full entry.** A `com.cultureblocs.strand` composed as a diary page:
-title, `narrative` (10 000 graphemes — the field already exists and is
-unused by the timeline), place, links, photos, and the day's beads
-attached as `items`. Proposals for that day sit alongside, one press
-from being kept and included.
-
-**Growing one into the other.** A bead minted at 21:04 can be grown
-into an entry at breakfast. The bead does not change — the strand wraps
-it. The mint fact stays sacred; the telling accretes around it. This is
-the single most important interaction in the app and should be one
-button on a bead: *tell this*. The strand starts with any refs the bead
-already carries (§9), offered as mentions to be kept, not copied in
-silently — the bead's subject is not necessarily the telling's.
-
-**Refs.** Compose gains a refs rail (§9.7) listing what the entry is
-about and what it reaches for. It does not appear in totem posture:
-resolution is a desk ritual, and Mint on the phone does no resolution
-at all.
+**The desk, not surfaces to switch between.** Loom is where the String
+is written and managed, so the String is never out of sight: a column
+with a month calendar over the entries, newest first, where proposals
+are kept or released in place. Choosing an entry opens it in the editor
+beside the column; **+ New bead** and **+ New strand** open an empty form
+there. On a narrow screen the same page stacks: the String column is the
+home screen and a form opens over it, with a way back.
+
+This replaces the earlier plan of a *posture* — a phone that opened on a
+two-tap Mint button and a desk that opened on Thread. A bead is wanted
+written whole, not minted and then finished, from the same page everywhere.
+
+### One way in, one mint fact
+
+**A bead, whole.** Kind, when it happened, note, tags, place, photos,
+links and refs, in one form, saved once. Until Save there is only a
+draft, in this browser; Save validates the record and writes it.
+`provenance.app = "loom"` and `provenance.mintedAt` = the save. This is
+the *mint fact*, and it is fixed: provenance never changes after Save.
+The bead's content stays editable — a correction is an edit, recorded
+as one — on any bead on your String, whichever app made it.
+
+**A strand, whole.** A `com.cultureblocs.strand` composed as a diary
+page: title, day, `narrative` (10 000 graphemes), place, links, refs,
+and the beads it strings together. While a strand is open, the beads in
+the String column carry tick boxes: ticking one puts it in the strand,
+in order, and ticking a proposal keeps it. The beads do not change —
+the strand points at them.
+
+**Refs.** Both forms carry the refs editor (§9.7): what the entry is
+about and what it reaches for, anchored in its text.
+
+**Send.** Everything waiting goes to the String on Send — new records,
+edits, proposals kept, records deleted — each against the version Loom
+last saw, so nothing overwrites a change made on the String meanwhile:
+that record is marked as a conflict, both versions are shown, and the
+person chooses. Two-way sync (§5) replaces Send in Phase 2.
 
 ---
 
@@ -189,7 +187,8 @@ PSS will hold, so sync is a copy rather than a translation:
 - **`state`** ∈ `proposal | kept | draft | published | edited`. Explicit,
   stored, synced — which retires R7. The dotted rail renders `proposal`,
   not a hardcoded list of app names.
-- **`origin`** ∈ `mint | connector:<id> | import | totem`. Provenance for
+- **`origin`** ∈ `loom | connector:<id> | import` (`mint` and `compose` on
+  records made before the desk). Provenance for
   the UI; `body.provenance` remains the record's own, and still never
   publishes.
 - **Blobs** content-addressed by SHA-256 in a second store, exactly as
@@ -680,7 +679,8 @@ counts from the AppView where available.
   suggested matches.* A pleasant optional activity, not a tax on
   capture.
 
-**Posture.** No rail in totem posture (§3).
+**Narrow screens.** The refs editor sits inside the form; there is no
+separate rail on a phone (§3).
 
 **Reverse entry.** Compose is prose first, entities extracted
 backwards. Mint from a search box is the other direction: resolve
@@ -806,6 +806,16 @@ Loom-made records reach it by a deliberate send over the String's
 existing API; desk-first on localhost, phone once hosted over HTTPS.
 Design: [`docs/superpowers/specs/2026-09-14-loom-phase1-design.md`](docs/superpowers/specs/2026-09-14-loom-phase1-design.md).
 
+**Phase 1b — the desk.** Loom becomes the place the String is written
+and managed (§3): the String column always in view, a bead or a strand
+written whole in one form, any bead or strand edited or deleted, and
+Send carrying every change — POST, PATCH with If-Match, state, DELETE
+with If-Match — with conflicts shown for the person to choose, ahead of
+Phase 2 sync. Mint, Thread and posture are retired. Two small String
+changes land first: PATCH removes a field sent as `null`, and DELETE
+honours `If-Match`.
+Design: [`docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md`](docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md).
+
 **Phase 2 — sync.** `com.cultureblocs.sync.server` discovery record;
 service-auth verification; `POST /changes` and `GET /sync`; grants
 table; CORS narrowed (R3, R4). Sign in on a second device and the
@@ -843,10 +853,6 @@ with real use, and whether anyone ever touched the backfill queue.
   minting `com.cultureblocs.sync.server` is better if the shapes agree
   — the same reasoning that made us adopt the community calendar
   lexicons rather than keep `venue.listing`.
-- **Whether the phone posture holds.** The ROADMAP says no timeline on
-  the phone and means it. §3 softens that to a default. If the softened
-  version turns the phone into a feed, the principle was right and the
-  posture should become a hard split again.
 - **How `concept` refs resolve.** Movements and genres — the SF New
   Wave, liminal horror — are not works, people, events or venues.
   Wikidata QIDs give a clean head and a bad tail; free tags are cheap
diff --git a/README.md b/README.md
index 6a7b64a..d7299d7 100644
--- a/README.md
+++ b/README.md
@@ -12,37 +12,38 @@ that needs no server of its own, and it turns
 you run one — into a **personal sync server** in the sense
 [Groundmist](https://groundmist.xyz/) describes.
 
-**Status: Phase 1 — local only.** Thread, Mint and Compose run in the
-browser with no server of their own; existing records arrive by a
-deliberate import from the String, and Loom-made ones reach it by a
-deliberate send, until Phase 2 sync. The full argument, the review of the
+**Status: Phase 1b — the desk.** Loom runs in the browser with no server
+of its own: your String in a column, a bead or a strand written whole
+beside it, and every change — new, edited, kept, deleted — sent to the
+String when you press Send, until Phase 2 sync. The full argument, the review of the
 String that motivated it, and the build order are in
 **[LOOM.md](LOOM.md)** — start there.
 
 ## What it is
 
-Six surfaces, one page, one codebase:
+One page, one codebase:
 
-    Thread     the day, the month; beads, strands, proposals
-    Mint       the button: a bead in two taps
-    Compose    the full entry: narrative, place, items, photos
+    The desk   your String in a column; a whole bead or strand in the editor; Send
     Feeds      connectors, their last run, their proposals
     Vault      identities, connector credentials, devices
     Publish    what is public, what has drifted, what to send
 
-Two ways in, one mint fact: a **quick bead** (offline, no network on
-the critical path) or a **full diary entry**. A bead minted at 21:04
-can be *grown* into an entry at breakfast — the bead does not change,
-the strand wraps it.
+One way in: a **bead, whole** — kind, time, note, tags, place, photos,
+links and refs in one form, saved once — or a **strand** that strings
+beads together, built by ticking them in the String column. Any bead or
+strand can be edited or deleted; its provenance never changes.
 
-## Running it (Phase 1)
+## Running it
 
     docker compose up -d          # http://localhost:8108
 
-Open **string** in the bar, point it at your String (`http://localhost:8100`),
-**check**, then **import**. Mint and write; **send** puts Loom-made records on
-the String; **download backup** keeps a copy of everything in this browser.
-Phase 1 is desk-first on `localhost`: a phone needs Loom served over HTTPS.
+Open **settings**, point Loom at your String (`http://localhost:8100`) with its
+token, **check**, then **import**. Write with **+ New bead** and **+ New strand**,
+edit or delete anything from the String column; **send** takes every change to
+the String, and a record changed on both sides is marked for you to choose.
+**download backup** keeps a copy of everything in this browser. The String
+needs cultureblocs-string with PATCH null-removal and DELETE If-Match. Loom is
+desk-first on `localhost`: a phone needs Loom served over HTTPS.
 
     node --test app/test/*.test.mjs        # the app's tests, no dependencies (Node ≥ 22.7)
     scripts/vendor-sdk.sh                  # refresh app/vendor from ../cultureblocs-string
diff --git a/docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md b/docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md
index 3e5fad3..64c0672 100644
--- a/docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md
+++ b/docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md
@@ -1,6 +1,6 @@
 # Loom desk authoring — one environment to write and manage the String: design
 
-Status: approved in brainstorming 2026-09-15; awaiting review of this document.
+Status: approved 2026-09-15. Corrected 2026-09-15 from the implementation prototype (see §12).
 Builds on: [Phase 1 design](2026-09-14-loom-phase1-design.md) (the shipped app in `app/`, merged in PR #2).
 Parent design: [`LOOM.md`](../../../LOOM.md) — §3 is revised by this document (§11 below).
 Code lands in **this repository** under `app/`, after two small changes in **cultureblocs-string** (§8).
@@ -317,3 +317,54 @@ copy of the database (never `data/string.db`, never :8100):
   authoring*, noting Send now carries edits, state and deletes ahead of
   Phase 2 sync.
 - **§11** open questions: close "no timeline on the phone".
+
+## 12 · Corrections from the prototype (2026-09-15)
+
+The plan's code was built and run end to end before the plan was written.
+Where it differs from the sections above, this section is the design.
+
+- **Files.** The pure views are `ui/view-string.js` (String column),
+  `ui/view-bead.js`, `ui/view-strand.js`, `ui/view-form.js` (what both forms
+  share: fields to body, photos, provenance, footer, read-only) and
+  `ui/view-panels.js` (day, delete confirmation, deleted record, conflict,
+  top bar, Send page, settings). The controllers are `ui/string.js`,
+  `ui/editor.js` (one controller for both forms, new and existing),
+  `ui/pages.js` (top bar, Send page, day page, `sendAll`) and
+  `ui/settings.js`. `lib/routing.js` keeps only the route serialiser.
+- **Drafts of new records** live under `draft:<key>` like any draft, with
+  the record's `type` stored in the draft; `loom.newDrafts()` lists the
+  ones with no record yet. `#/new/bead` and `#/new/strand` reserve a key
+  and replace themselves with `#/edit/<key>`, so a reload keeps the draft.
+- **Envelope API.** `newKey(type)`, `createBead(key, body, { timeAnchored })`,
+  `createStrand(key, body)`, `save`, `keep`, `remove(key)` → keys of the
+  strands changed, `undoRemove`, `strandsUsing`, `saveDraft(key, body,
+  baseUpdatedAt, type)`, `newDrafts`. A strand losing a deleted bead is
+  rewritten with its state untouched. Saving a Phase 1 `draft` strand that
+  never reached the String keeps it; a `draft` from the String stays a
+  draft.
+- **`stringMedia`** joins `stringHlc` and `stringKeys`: the photos the
+  String's copy uses, so a PATCH uploads only new ones.
+- **Import** also refreshes `stringHlc`, `stringKeys` and `stringMedia`
+  on a record that is unchanged but was restamped on the String (a
+  publish restamps without changing the body).
+- **Send** fetches the String's record after every POST, for its hlc. A
+  PATCH or state change answered 404 is a conflict with nothing on the
+  String's side; a delete taken back while its DELETE was on its way is
+  the same. Keep mine on such a record posts it again under its own
+  `sourceApp`.
+- **Place.** The forms edit a place's name. A place's other parts (DID,
+  coordinates) are kept as they are and shown, not edited; coordinates
+  carry a fuzzing duty (defs#geo) that a free form should not take on.
+- **Send results** show on the Send page (`#/send`), which the top bar's
+  Send opens, with the waiting changes and "undo delete".
+- **The entry list** renders every day and scrolls the column to the
+  selected day; no paging was needed for a String of a few hundred records.
+- **Release** in the String column asks with a second press, as Phase 1 did.
+- **Another tab's save** while a form is open is shown in the form's
+  status line with "use the newer version" and "save mine over it",
+  separately from a String conflict.
+- **Confirmations.** Delete asks in a panel below the form; release (in
+  the column) and "take the String's" (in the conflict view) ask with a
+  second press. "Keep mine" does not ask: nothing is lost by it.
+- **A failed write** shows the browser's own message in the form's status
+  line ("draft not saved: …" for a draft), and the form keeps what was typed.
PATCH
```

- [ ] **Step 2: Run the tests**

Run: `node --test app/test/*.test.mjs` from `/Users/marksimpkins/TPM/cultureblocs-loom`
Expected: `# pass 154 # fail 0`

- [ ] **Step 3: Commit**

```bash
git -C /Users/marksimpkins/TPM/cultureblocs-loom add LOOM.md README.md docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md && \
git -C /Users/marksimpkins/TPM/cultureblocs-loom commit -q -F - <<'MSG'
docs(desk): LOOM.md, README and the spec follow the desk

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
MSG
git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short
```

Expected: the commit is made and `git status --short` prints nothing.

---

### Task 12: End-to-end run

**Files:** none (the controller runs this; subagents cannot drive the browser)

**Interfaces:** the whole app, in Chrome, against a throwaway String running the Task 1 code.

- [ ] **Step 1: Start a throwaway String from a read-only copy of the database**

```bash
S=/private/tmp/claude-501/-Users-marksimpkins-TPM-cultureblocs-loom/99198b84-1c25-4cd0-afcc-3d0ba1c968eb/scratchpad
rm -rf "$S/e2e-desk" && mkdir -p "$S/e2e-desk"
sqlite3 "file:/Users/marksimpkins/TPM/cultureblocs-string/data/string.db?mode=ro" ".backup $S/e2e-desk/string.db"
cp -R /Users/marksimpkins/TPM/cultureblocs-string/data/media "$S/e2e-desk/media"
docker rm -f loom-e2e-string >/dev/null 2>&1
docker run -d --name loom-e2e-string -p 8199:8100 \
  -v "$S/e2e-desk":/data \
  -v /Users/marksimpkins/TPM/cultureblocs-string/lexicons:/lexicons:ro \
  -v /Users/marksimpkins/TPM/cultureblocs-string/string/app:/srv/app:ro \
  -e STRING_DB=/data/string.db -e STRING_LEXICONS=/lexicons -e STRING_MEDIA=/data/media \
  cultureblocs-string-string:latest
curl -s localhost:8199/health | head -c 80
```

Expected: `{"ok":true,"lexicons":["com.cultureblocs.annotation",…`. The `string/app` mount runs the `feature/desk-writes` code, so the String repository must still be on that branch.

- [ ] **Step 2: Serve Loom from the branch**

Run: `docker compose up -d` from `/Users/marksimpkins/TPM/cultureblocs-loom`, then open `http://localhost:8108/` in a new Chrome tab.
Expected: the desk, with no errors in the console.

- [ ] **Step 3: Check each of these, recording the results in the ledger**

1. **Upgrade from Phase 1.** In a profile that ran Phase 1 (or after restoring a Phase 1 backup): one reload onto `loom-3`, `caches.keys()` is `['loom-3']`, the records are kept, and a Phase 1 `released` proposal now shows as a delete waiting on the Send page.
2. **Settings.** Set the URL to `http://localhost:8199`; **check** says "a String, holding …"; **import** reports the records and photos added.
3. **A bead in one go.** `+ New bead`: kind, note, place, tags, a photo with alt text, and a ref anchored to text in the note; edit the note around the anchor. The column lists the draft while you type and there is no record until **save**. After save: one record, `provenance.timeAnchored` true, the ref still covers its text, the photo 2000px on its long edge.
4. **A strand by ticking.** `+ New strand`: ticked beads from more than one day become items, **↑** reorders them, and after save the items are in that order.
5. **Edit another app's bead.** Change a Rounds bead's note and clear its tags; after Send, the String's copy has the new note and no `tags`, and `sourceApp` is still `rounds`.
6. **Keep and release.** Keep one proposal in the column; release another (two presses); Send; the first is `kept` on the String and the second answers 404.
7. **Delete a bead a strand uses.** The confirmation names the strands; after Send the strand no longer points at the bead, and the bead answers 404.
8. **Conflicts.** Change two records directly on the throwaway String (`curl -X PATCH localhost:8199/records/<id> -H 'Content-Type: application/json' -d '{"fields":{"note":"changed elsewhere"}}'`), edit both in Loom and Send: both are conflicts. **Keep mine** on one and **take the String's** on the other; Send; the String holds Loom's note for the first and its own for the second, and the top bar says "in sync".
9. **Import again.** Added 0, updated 0, no conflicts, top bar "in sync".
10. **Phone width.** In a 400px-wide frame of the same page, the String column shows alone, an entry opens full width with a **back** link, and nothing scrolls sideways.
11. **CSP.** No `securitypolicyviolation` events through all of the above.

- [ ] **Step 4: Clean up**

```bash
docker rm -f loom-e2e-string
rm -rf "$S/e2e-desk"
```

Close the Chrome tab.
