# Publish destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One press of publish puts a strand on the PDS and, when ticked, also posts it to Bluesky as an `app.bsky.feed.post`. Each destination is used once per strand, and adding a later destination means adding one new module.

**Architecture:** The String does the work. `POST /publish/<id>` gains `destinations` and `postText`, and runs two phases: phase 1 is today's `publish_strand`, unchanged; phase 2 hands the session and stripped members that phase 1 already holds to one adapter module per destination, and records each success in a new `syndications` table. Loom's Publishing block grows a checkbox per destination, a text box with a counter, and a link for a destination already used. It reaches all of this through `publisher.js`, which is the swap point.

**Tech Stack:** String: Python 3, FastAPI, SQLite, pytest, stdlib `urllib` for XRPC. Loom: vanilla ES modules with no build step, `node:test` + `node:assert/strict`, the `html` tagged template.

**Spec:** [`docs/superpowers/specs/2026-09-18-publish-destinations-design.md`](../specs/2026-09-18-publish-destinations-design.md). Every decision is in its §2. Do not reopen them.

## Global Constraints

- **Two repositories.** Tasks 1–6 are in `~/TPM/cultureblocs-string` on a new branch `feature/publish-destinations` off `main`. Tasks 7–11 are in `~/TPM/cultureblocs-loom` on the existing branch `feature/publish-destinations`. **The String's PR merges first** (spec §10).
- String suite: `python3 -m pytest tests/ -q` from the repo root. Baseline **246 passed**.
- Loom suite: `node --test 'app/test/*.test.mjs'`. The quotes matter, because a bare directory argument fails on node 22. Baseline **284 passed**.
- Never commit with a failing test. Commits use Conventional Commits with a `(destinations)` scope, e.g. `feat(destinations): …`, and end with the `Co-Authored-By` trailer the session supplies.
- **Phase 2 cannot fail phase 1.** A destination that raises leaves the strand published, writes no `syndications` row, and is reported with `status: "failed"`.
- **Validate before phase 1, execute after it.** An unknown destination, empty post text, or text over the limit is a **422 with a string `detail`** before any XRPC call is made.
- Bluesky limits: **`{"text": 300, "images": 4, "wants_link": False}`**. Text is counted in **code points** (`len()` in Python, `codePointLength` from `app/vendor/lexicon.js` in JS), never in `.length`.
- **Post text is sent exactly as written.** Do not trim, normalise or truncate it. Refuse it instead. Nothing in this system rewrites what a person wrote.
- **Blobs are reused, never re-uploaded.** The adapter must not call `publisher._upload_blob`.
- **Adapters read nothing unstripped.** Their `items` argument holds stripped bead bodies only. The Bluesky adapter composes nothing from `note` or `narrative`.
- Unpublishing a strand **does not** delete its posts, and does not touch its `syndications` rows.
- Loom: views are pure functions returning `html` results, and controllers own all I/O. All markup goes through `html` from `ui/html.js`.
- Loom: `app/sw.js` `VERSION` goes from `'loom-5'` to `'loom-6'` exactly once, in Task 10. No new Loom module is added, so `SHELL` does not change.

### Three places this plan is more specific than the spec

These are deliberate, and the PR descriptions should mention them.

1. **`createRecord`, not `putRecord`.** Spec §5 says "`putRecord` … a TID rkey". Python has no TID generator in this codebase, and `com.atproto.repo.createRecord` without an `rkey` has the PDS mint the TID. The result is the same, and the call still goes through the same `_xrpc` helper.
2. **`syndications` rides on list rows as well as single records.** Spec §7 names `GET /records/{id}`, but Loom's import reads `GET /records?day=`. Both go through `Store.get` and `Store.query`, so both carry the field, just as `publishedUri` does.
3. **`GET /destinations` answers `{"destinations": [...]}`.** The spec writes the bare list, but every other list endpoint on the String wraps its list (`{"identities": [...]}`, `{"days": [...]}`).

---

## File Structure

**cultureblocs-string**

| File | Responsibility |
|---|---|
| `string/app/db.py` (modify) | `syndications` table; `add_syndication`, `syndication`, `syndications`; `get`/`query` rows carry `syndications` |
| `string/app/publisher.py` (modify) | `publish_strand_full` returns what phase 2 needs; `publish_strand` becomes a thin wrapper |
| `string/app/syndicate/__init__.py` (create) | Registry: `DESTINATIONS`, `available()`, `check()`, `post()`, `run()` |
| `string/app/syndicate/bluesky.py` (create) | The Bluesky adapter: `NAME`, `LIMITS`, `post()` |
| `string/app/main.py` (modify) | `GET /destinations`; `POST /publish/<id>` gains `destinations` and `postText` |
| `PROMOTER.md` (modify) | A "Syndication" section |
| `tests/test_syndications_table.py` (create) | Table and store methods |
| `tests/test_publish_strand_full.py` (create) | What phase 1 hands to phase 2 |
| `tests/test_syndicate_bluesky.py` (create) | The adapter |
| `tests/test_syndicate_registry.py` (create) | `check` and `run` |
| `tests/test_api_syndication.py` (create) | The endpoints, end to end, with XRPC stubbed |

**cultureblocs-loom**

| File | Responsibility |
|---|---|
| `app/lib/string-client.js` (modify) | `listDestinations()`, where 404 means `[]`; `publish(id, identity, {destinations, postText})` |
| `app/test/fake-string.mjs` (modify) | Fake destinations, syndication results, `failSyndicate` |
| `app/lib/importer.js` (modify) | `stringFields` carries `syndications` |
| `app/lib/publisher.js` (modify) | `destinations()`; `publish(key, identity, opts)`; `mergeSyndications` |
| `app/ui/view-publish.js` (modify) | Checkboxes, text box, counter, used destination as a link, and the notice. Pure helpers `postLimit`, `postReady`, `counterView`, `syndicationNotice`, `destinationLabel` |
| `app/ui/editor.js` (modify) | Loads destinations, handles publish-block input, passes `{destinations, postText}`, shows the notice |
| `app/sw.js` (modify) | `VERSION` → `'loom-6'` |
| `LOOM.md` (modify) | §8 gains syndication |
| `docs/backlog.md` (modify) | Items 2 and 4 |

---

## Part A — cultureblocs-string

### Task 1: The `syndications` table

**Files:**
- Modify: `string/app/db.py` (`SCHEMA`, `Store.get`, `Store.query`, and a new section after `set_published`)
- Test: `tests/test_syndications_table.py`

**Interfaces:**
- Produces:
  - `Store.add_syndication(rid: str, destination: str, remote_id: str, remote_url: str | None) -> dict | None`. Returns the stored row, which is the **first** row if one already existed, or `None` if the record does not exist.
  - `Store.syndication(rid: str, destination: str) -> dict | None`
  - `Store.syndications(rid: str) -> list[dict]`
  - Row shape: `{"destination": str, "remoteId": str, "remoteUrl": str | None, "postedAt": str}`
  - Every dict from `Store.get` and `Store.query` gains `"syndications": [row, …]`, which is `[]` when there are none.

- [ ] **Step 0: Branch**

```bash
cd ~/TPM/cultureblocs-string && git checkout main && git pull && git checkout -b feature/publish-destinations
python3 -m pytest tests/ -q   # expect 246 passed
```

- [ ] **Step 1: Write the failing tests**

Create `tests/test_syndications_table.py`:

```python
"""The syndications table: one row per (record, destination).

The row *is* the one-shot rule — it lives in the database rather than in
Loom's state so it holds across a reload, a second device and a re-import.
Spec §4.2."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))
from app import db  # noqa: E402
from app.db import Store  # noqa: E402

STRAND = "com.cultureblocs.strand"


def a_strand(s: Store, key: str = "k1") -> str:
    body = {"$type": STRAND, "createdAt": "2026-09-18T10:00:00Z", "title": "A day out",
            "items": []}
    rid, _ = s.upsert(key, STRAND, "loom", "2026-09-18T10:00:00Z", body)
    return rid


def test_a_record_starts_with_no_syndications(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    rid = a_strand(s)
    assert s.syndications(rid) == []
    assert s.get(rid)["syndications"] == []


def test_adding_one_stores_it_and_the_record_carries_it(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    rid = a_strand(s)
    row = s.add_syndication(rid, "bluesky", "3post",
                            "https://bsky.app/profile/me.example/post/3post")
    assert row["destination"] == "bluesky"
    assert row["remoteId"] == "3post"
    assert row["remoteUrl"] == "https://bsky.app/profile/me.example/post/3post"
    assert row["postedAt"].endswith("Z")
    assert s.syndication(rid, "bluesky") == row
    assert s.get(rid)["syndications"] == [row]


def test_adding_twice_is_idempotent_and_keeps_the_first(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    rid = a_strand(s)
    first = s.add_syndication(rid, "bluesky", "3first", "https://x/first")
    again = s.add_syndication(rid, "bluesky", "3second", "https://x/second")
    assert again == first, "a used destination is never overwritten"
    assert len(s.syndications(rid)) == 1


def test_one_record_can_go_to_two_destinations(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    rid = a_strand(s)
    s.add_syndication(rid, "bluesky", "3a", "https://x/a")
    s.add_syndication(rid, "mastodon", "109", None)
    assert [r["destination"] for r in s.syndications(rid)] == ["bluesky", "mastodon"]
    assert s.syndication(rid, "mastodon")["remoteUrl"] is None


def test_list_rows_carry_syndications_too(tmp_path):
    """Loom imports from GET /records?day=, not /records/{id}."""
    s = Store(str(tmp_path / "s.db"))
    rid = a_strand(s)
    s.add_syndication(rid, "bluesky", "3a", "https://x/a")
    [row] = s.query(day="2026-09-18")
    assert row["syndications"][0]["remoteId"] == "3a"


def test_an_unknown_record_is_refused(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    assert s.add_syndication("no-such-id", "bluesky", "3a", None) is None


def test_deleting_the_record_removes_its_rows(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    rid = a_strand(s)
    s.add_syndication(rid, "bluesky", "3a", None)
    assert s.delete(rid) is True
    n = s.conn.execute("SELECT COUNT(*) FROM syndications").fetchone()[0]
    assert n == 0


def test_a_database_from_before_this_gains_the_table(tmp_path):
    """A running String has a string.db without the table; opening it adds it."""
    path = tmp_path / "old.db"
    before = db.SCHEMA.split("CREATE TABLE IF NOT EXISTS syndications")[0]
    conn = sqlite3.connect(path)
    conn.executescript(before)
    conn.close()
    s = Store(str(path))
    rid = a_strand(s)
    assert s.add_syndication(rid, "bluesky", "3a", None)["remoteId"] == "3a"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m pytest tests/test_syndications_table.py -q`
Expected: FAIL, with `AttributeError: 'Store' object has no attribute 'syndications'` and `KeyError: 'syndications'`.

- [ ] **Step 3: Implement**

In `string/app/db.py`, update the module docstring's opening from "Three tables:" to "Four tables:" and add this line after the `changes` entry:

```
  syndications — one row per (record, destination) a published strand was
               posted to; the row is the one-shot rule (see add_syndication)
```

Append to the end of `SCHEMA`, just before its closing `"""`:

```sql
CREATE TABLE IF NOT EXISTS syndications (
    record_id   TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    destination TEXT NOT NULL,
    remote_id   TEXT NOT NULL,
    remote_url  TEXT,
    posted_at   TEXT NOT NULL,
    PRIMARY KEY (record_id, destination)
);
```

(`PRAGMA foreign_keys=ON` is already set in `Store.__init__`, so the cascade works. An existing database gets the table from `CREATE TABLE IF NOT EXISTS` and needs no `MIGRATIONS` entry, because this is a new table rather than a new column.)

Replace `Store.get` and the last line of `Store.query`:

```python
    def get(self, rid: str) -> dict | None:
        with self._lock:
            cur = self.conn.execute("SELECT * FROM records WHERE id=?", (rid,))
            row = cur.fetchone()
            return self._with_syndications(self._row(row)) if row else None
```

```python
        with self._lock:
            return [self._with_syndications(self._row(r))
                    for r in self.conn.execute(sql, args).fetchall()]
```

(`.fetchall()` is required. `_with_syndications` runs its own query on the same connection, which would reset a cursor that is still being iterated.)

Add this section after `set_published`:

```python
    # -- syndications ----------------------------------------------------
    def add_syndication(self, rid: str, destination: str, remote_id: str,
                        remote_url: str | None) -> dict | None:
        """Record that a published record was posted to `destination`.

        One row per (record, destination), and the row *is* the one-shot
        rule: a post cannot be edited, and posting again would double-post
        to the same followers. So a second add for a pair already present
        changes nothing and returns the row that was there first. None if
        there is no such record.

        Not logged to the change feed and not restamped: syndication happens
        inside the publish request, whose set_published already restamps
        the strand and logs it, and that is what a second device notices.
        """
        with self._lock:
            if self.conn.execute("SELECT 1 FROM records WHERE id=?", (rid,)).fetchone() is None:
                return None
            with self.conn:
                self.conn.execute(
                    "INSERT OR IGNORE INTO syndications"
                    " (record_id, destination, remote_id, remote_url, posted_at)"
                    " VALUES (?,?,?,?,?)",
                    (rid, destination, remote_id, remote_url, now_iso()))
            return self.syndication(rid, destination)

    def syndication(self, rid: str, destination: str) -> dict | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT destination, remote_id, remote_url, posted_at FROM syndications"
                " WHERE record_id=? AND destination=?", (rid, destination)).fetchone()
            return self._syndication_row(row) if row else None

    def syndications(self, rid: str) -> list[dict]:
        with self._lock:
            cur = self.conn.execute(
                "SELECT destination, remote_id, remote_url, posted_at FROM syndications"
                " WHERE record_id=? ORDER BY posted_at, destination", (rid,))
            return [self._syndication_row(r) for r in cur.fetchall()]

    def _with_syndications(self, rec: dict) -> dict:
        rec["syndications"] = self.syndications(rec["id"])
        return rec

    @staticmethod
    def _syndication_row(row: sqlite3.Row) -> dict:
        return {"destination": row["destination"], "remoteId": row["remote_id"],
                "remoteUrl": row["remote_url"], "postedAt": row["posted_at"]}
```

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `python3 -m pytest tests/test_syndications_table.py -q && python3 -m pytest tests/ -q`
Expected: 8 passed, then **254 passed**. If an existing test compares a whole record dict with `==` and now fails only because of the new `syndications` key, add `"syndications": []` to its expected dict. Do not remove the key.

- [ ] **Step 5: Commit**

```bash
git add string/app/db.py tests/test_syndications_table.py
git commit -m "feat(destinations): a syndications table — the one-shot rule, in the database"
```

---

### Task 2: Phase 1 hands phase 2 what it already holds

**Files:**
- Modify: `string/app/publisher.py` (`publish_strand`)
- Test: `tests/test_publish_strand_full.py`

**Interfaces:**
- Produces: `publisher.publish_strand_full(store, strand_id, identity, media_dir=None) -> tuple[dict, dict | None]`, returning `(result, held)`.
  - `result` is exactly what `publish_strand` returns today.
  - `held` is `{"session": {"did", "jwt", "pds", "handle"}, "strand": <stripped strand record>, "items": [<stripped bead/annotation record>, …]}`, in item order. Each item's `images` is the list of `imageRef`s phase 1 just uploaded.
  - `held` is `None` when the record is not a strand (it went through `publish_record`).
- `publish_strand(...)` keeps its signature and returns `publish_strand_full(...)[0]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_publish_strand_full.py`:

```python
"""What phase 1 hands to phase 2 (spec §4.1): the session it already holds,
and the strand's members *as published* — stripped, with the image refs it
just uploaded. An adapter given only these cannot reach private data."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))
from app import publisher  # noqa: E402

DID = "did:plc:fake"
IDENTITY = {"name": "personal", "handle": "me.example", "app_password": "x",
            "pds": "https://pds.example"}
IMAGE = {"image": {"$type": "blob", "ref": {"$link": "bafkreiaaa"},
                   "mimeType": "image/jpeg", "size": 10},
         "alt": "Gasholder at dusk."}


class FakeStore:
    def __init__(self, records):
        self.records = records

    def get(self, rid):
        return self.records.get(rid)

    def set_published(self, rid, uri, phash):
        self.records[rid]["publishedUri"] = uri
        return True


def stub_network(monkeypatch):
    def fake_xrpc(_pds, method, *, body=None, token=None):
        if method == "com.atproto.server.createSession":
            return {"did": DID, "accessJwt": "jwt"}
        if method == "com.atproto.repo.putRecord":
            return {"uri": f"at://{DID}/{body['collection']}/{body['rkey']}", "cid": "bafycid"}
        raise AssertionError(f"unexpected xrpc call: {method}")
    monkeypatch.setattr(publisher, "_xrpc", fake_xrpc)
    monkeypatch.setattr(publisher, "_image_refs", lambda body, *_: [IMAGE] if body.get("media") else [])


def a_day(monkeypatch):
    stub_network(monkeypatch)
    return FakeStore({
        "s1": {"id": "s1", "type": publisher.STRAND, "publishedUri": None, "sourceApp": "loom",
               "body": {"$type": publisher.STRAND, "createdAt": "2026-09-18T10:00:00Z",
                        "title": "A day out", "narrative": "private-ish prose",
                        "items": [{"uri": "spine://records/b1"}, {"uri": "spine://records/b2"}]}},
        "b1": {"id": "b1", "type": "com.cultureblocs.bead", "publishedUri": None, "sourceApp": "loom",
               "body": {"$type": "com.cultureblocs.bead", "kind": "bloc", "note": "first",
                        "createdAt": "2026-09-18T10:00:00Z", "geo": {"lat": 51.5, "lon": -0.1},
                        "provenance": {"app": "loom", "mintedAt": "2026-09-18T10:00:00Z"},
                        "media": [{"uri": "/media/abc.jpg"}]}},
        "b2": {"id": "b2", "type": "com.cultureblocs.bead", "publishedUri": None, "sourceApp": "loom",
               "body": {"$type": "com.cultureblocs.bead", "kind": "bloc", "note": "second",
                        "createdAt": "2026-09-18T11:00:00Z"}},
    })


def test_the_session_phase_1_logged_in_with_is_handed_on(monkeypatch):
    store = a_day(monkeypatch)
    _, held = publisher.publish_strand_full(store, "s1", IDENTITY)
    assert held["session"] == {"did": DID, "jwt": "jwt", "pds": "https://pds.example",
                               "handle": "me.example"}


def test_items_are_stripped_members_in_order_with_their_uploaded_images(monkeypatch):
    store = a_day(monkeypatch)
    _, held = publisher.publish_strand_full(store, "s1", IDENTITY)
    assert [i["note"] for i in held["items"]] == ["first", "second"]
    assert held["items"][0]["images"] == [IMAGE]
    assert "images" not in held["items"][1]
    for item in held["items"]:
        assert "geo" not in item and "provenance" not in item and "media" not in item


def test_the_strand_is_handed_on_stripped(monkeypatch):
    store = a_day(monkeypatch)
    _, held = publisher.publish_strand_full(store, "s1", IDENTITY)
    assert held["strand"]["title"] == "A day out"
    assert held["strand"]["items"][0]["uri"].startswith("at://")


def test_the_result_is_what_publish_strand_returns(monkeypatch):
    result, _ = publisher.publish_strand_full(a_day(monkeypatch), "s1", IDENTITY)
    assert result == publisher.publish_strand(a_day(monkeypatch), "s1", IDENTITY)
    assert result["strandUri"] == f"at://{DID}/{publisher.STRAND}/s1"


def test_a_record_that_is_not_a_strand_holds_nothing_for_phase_2(monkeypatch):
    stub_network(monkeypatch)
    store = FakeStore({"w1": {"id": "w1", "type": "com.cultureblocs.creative.work",
                              "publishedUri": None, "sourceApp": "loom",
                              "body": {"$type": "com.cultureblocs.creative.work", "title": "x"}}})
    result, held = publisher.publish_strand_full(store, "w1", IDENTITY)
    assert held is None
    assert result["uri"].startswith("at://")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m pytest tests/test_publish_strand_full.py -q`
Expected: FAIL with `AttributeError: module 'app.publisher' has no attribute 'publish_strand_full'`.

- [ ] **Step 3: Implement**

In `string/app/publisher.py`, replace the whole `publish_strand` function with:

```python
def publish_strand_full(store, strand_id: str, identity: dict,
                        media_dir=None) -> tuple[dict, dict | None]:
    """Publish a strand, and hand back what syndication needs.

    Returns `(result, held)`. `result` is what `publish_strand` returns.
    `held` is what phase 2 of a publish request runs on (see syndicate/):
    the authenticated session this already opened, so no adapter logs in
    twice, and the strand and its members *as published* — stripped, with
    the image refs just uploaded — so no adapter can reach a field the
    strip withholds. `held` is None for a record that is not a strand.
    """
    strand = store.get(strand_id)
    if strand is None:
        raise ValueError("not found")
    if strand["type"] != STRAND:
        return publish_record(store, strand_id, identity), None
    did, jwt, pds = _login(identity)
    published = []
    item_refs = []
    items = []
    for it in (strand["body"].get("items") or []):
        rid = it["uri"].replace("spine://records/", "")
        rec = store.get(rid)
        if rec is None or rec["type"] not in BEAD_TYPES:
            continue
        _refuse_if_seeded(rec)
        images = _image_refs(rec["body"], media_dir, pds, jwt)
        stripped = strip_bead(rec["body"], images=images)
        res = _xrpc(pds, "com.atproto.repo.putRecord", token=jwt, body={
            "repo": did, "collection": rec["type"],
            "rkey": _rkey_for(rec, rid), "record": stripped})
        store.set_published(rid, res["uri"], drift_hash(rec["body"]))
        item_refs.append({"uri": res["uri"], "cid": res["cid"]})
        items.append(stripped)
        published.append(res["uri"])
    stripped_strand = strip_strand(strand["body"], item_refs)
    res = _xrpc(pds, "com.atproto.repo.putRecord", token=jwt, body={
        "repo": did, "collection": STRAND,
        "rkey": _rkey_for(strand, strand_id), "record": stripped_strand})
    store.set_published(strand_id, res["uri"], content_hash(stripped_strand))
    published.append(res["uri"])
    result = {"identity": identity["name"], "handle": identity["handle"],
              "did": did, "records": published, "strandUri": res["uri"]}
    held = {"session": {"did": did, "jwt": jwt, "pds": pds, "handle": identity["handle"]},
            "strand": stripped_strand, "items": items}
    return result, held


def publish_strand(store, strand_id: str, identity: dict,
                   media_dir=None) -> dict:
    return publish_strand_full(store, strand_id, identity, media_dir=media_dir)[0]
```

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `python3 -m pytest tests/test_publish_strand_full.py -q && python3 -m pytest tests/ -q`
Expected: 5 passed, then **259 passed**. The existing `test_publish_refuses_seeded.py` must still pass unchanged, because it calls `publish_strand`.

- [ ] **Step 5: Commit**

```bash
git add string/app/publisher.py tests/test_publish_strand_full.py
git commit -m "refactor(destinations): publish_strand_full hands phase 2 the session and stripped members"
```

---

### Task 3: The Bluesky adapter

**Files:**
- Create: `string/app/syndicate/bluesky.py`
- Create: `string/app/syndicate/__init__.py`. For this task it holds only the module docstring. Task 4 fills it.
- Test: `tests/test_syndicate_bluesky.py`

**Interfaces:**
- Consumes: `publisher._xrpc(pds, method, *, body, token)`. The adapter calls it as `publisher._xrpc` (module attribute, looked up at call time) so a test can monkeypatch one place. `held` shape from Task 2.
- Produces:
  - `bluesky.NAME == "bluesky"`
  - `bluesky.LIMITS == {"text": 300, "images": 4, "wants_link": False}`
  - `bluesky.post(session: dict, strand: dict, items: list[dict], text: str) -> {"id": rkey, "url": str, "dropped": int}`. Raises `ValueError` for empty or over-long text before making any network call.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_syndicate_bluesky.py`:

```python
"""The Bluesky adapter: a strand as an app.bsky.feed.post in the same repo.

The claim the whole design rests on (spec §5): the post reuses the blobs
phase 1 already uploaded — it never uploads again."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))
from app import publisher, strip  # noqa: E402
from app.syndicate import bluesky  # noqa: E402

SESSION = {"did": "did:plc:me", "jwt": "jwt", "pds": "https://pds.example", "handle": "me.example"}
STRAND = {"$type": "com.cultureblocs.strand", "createdAt": "2026-09-18T10:00:00Z",
          "title": "A day out", "narrative": "NARRATIVE-MUST-NOT-LEAVE", "items": []}


def blob(n: int) -> dict:
    return {"$type": "blob", "ref": {"$link": f"bafkrei{n}"}, "mimeType": "image/jpeg", "size": 10}


def item(*images, note="NOTE-MUST-NOT-LEAVE") -> dict:
    out = {"$type": "com.cultureblocs.bead", "kind": "bloc", "note": note,
           "createdAt": "2026-09-18T10:00:00Z"}
    if images:
        out["images"] = list(images)
    return out


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake_xrpc(pds, method, *, body=None, token=None):
        seen.append({"pds": pds, "method": method, "body": body, "token": token})
        return {"uri": "at://did:plc:me/app.bsky.feed.post/3post", "cid": "bafycid"}

    def no_upload(*_a, **_k):
        raise AssertionError("the adapter re-uploaded a blob; phase 1 already did")

    monkeypatch.setattr(publisher, "_xrpc", fake_xrpc)
    monkeypatch.setattr(publisher, "_upload_blob", no_upload)
    return seen


def test_it_declares_its_name_and_limits():
    assert bluesky.NAME == "bluesky"
    assert bluesky.LIMITS == {"text": 300, "images": 4, "wants_link": False}


def test_a_post_is_created_in_the_same_repo_with_the_text_as_written(calls):
    out = bluesky.post(SESSION, STRAND, [item()], "  A day out, Saturday  ")
    [c] = calls
    assert c["method"] == "com.atproto.repo.createRecord"
    assert c["pds"] == "https://pds.example" and c["token"] == "jwt"
    assert c["body"]["repo"] == "did:plc:me"
    assert c["body"]["collection"] == "app.bsky.feed.post"
    assert "rkey" not in c["body"], "the PDS mints the TID"
    rec = c["body"]["record"]
    assert rec["$type"] == "app.bsky.feed.post"
    assert rec["text"] == "  A day out, Saturday  ", "text is never rewritten"
    assert rec["createdAt"].endswith("Z")
    assert "embed" not in rec, "no images, no embed"
    assert out == {"id": "3post", "url": "https://bsky.app/profile/me.example/post/3post",
                   "dropped": 0}


def test_blob_refs_are_reused_with_alt_and_aspect_ratio_carried_across(calls):
    ref = {"image": blob(1), "alt": "Gasholder at dusk.",
           "aspectRatio": {"width": 1600, "height": 1067}}
    bluesky.post(SESSION, STRAND, [item(ref)], "x")
    embed = calls[0]["body"]["record"]["embed"]
    assert embed["$type"] == "app.bsky.embed.images"
    assert embed["images"] == [{"image": blob(1), "alt": "Gasholder at dusk.",
                                "aspectRatio": {"width": 1600, "height": 1067}}]


def test_a_missing_alt_becomes_empty_because_bluesky_requires_the_field(calls):
    bluesky.post(SESSION, STRAND, [item({"image": blob(1)})], "x")
    [img] = calls[0]["body"]["record"]["embed"]["images"]
    assert img == {"image": blob(1), "alt": ""}


def test_more_than_four_images_posts_the_first_four_and_says_how_many_dropped(calls):
    items = [item({"image": blob(1)}, {"image": blob(2)}), item(),
             item({"image": blob(3)}, {"image": blob(4)}, {"image": blob(5)})]
    out = bluesky.post(SESSION, STRAND, items, "x")
    imgs = calls[0]["body"]["record"]["embed"]["images"]
    assert [i["image"]["ref"]["$link"] for i in imgs] == [f"bafkrei{n}" for n in (1, 2, 3, 4)]
    assert out["dropped"] == 1


def test_text_at_the_limit_posts_and_one_over_is_refused_before_any_call(calls):
    bluesky.post(SESSION, STRAND, [], "a" * 300)
    with pytest.raises(ValueError, match="300"):
        bluesky.post(SESSION, STRAND, [], "a" * 301)
    assert len(calls) == 1


def test_text_is_counted_in_code_points_like_the_lexicon_validator(calls):
    bluesky.post(SESSION, STRAND, [], "🎭" * 300)       # 300 code points, 600 UTF-16 units
    with pytest.raises(ValueError):
        bluesky.post(SESSION, STRAND, [], "🎭" * 301)


@pytest.mark.parametrize("text", ["", "   ", None])
def test_empty_text_is_refused(calls, text):
    with pytest.raises(ValueError, match="empty"):
        bluesky.post(SESSION, STRAND, [], text)
    assert calls == []


def test_nothing_but_the_given_text_and_the_images_leaves(calls):
    """The adapter composes nothing from note or narrative (spec §6)."""
    bluesky.post(SESSION, STRAND, [item({"image": blob(1)})], "A day out")
    sent = json.dumps(calls[0]["body"])
    assert "NOTE-MUST-NOT-LEAVE" not in sent
    assert "NARRATIVE-MUST-NOT-LEAVE" not in sent


def test_the_strip_does_not_change():
    """Syndication must not quietly widen what leaves. Change these on purpose,
    with a fixture in tests/fixtures/strip-cases.json, or not at all."""
    assert strip.BEAD_FIELDS == ("createdAt", "kind", "note")
    assert strip.STRAND_FIELDS == ("createdAt", "title", "narrative", "day")
```

Create `string/app/syndicate/__init__.py` with only:

```python
"""Syndication: renderings of a published strand on other services."""
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m pytest tests/test_syndicate_bluesky.py -q`
Expected: FAIL with `ImportError: cannot import name 'bluesky' from 'app.syndicate'`.

- [ ] **Step 3: Implement**

Create `string/app/syndicate/bluesky.py`:

```python
"""Bluesky: a published strand as an app.bsky.feed.post, in the same repo.

Nearly free, which is why it is first. The post lands in the PDS repo the
strand was just written to, under the session phase 1 already opened, and
its images are the blobs phase 1 already uploaded: com.cultureblocs.defs
#imageRef mirrors app.bsky.embed.images#image field for field, so a ref
carries straight across. Nothing is uploaded twice.

What it says is the text a person wrote, sent exactly as written. It reads
nothing else: not the narrative, not a bead's note. An adapter that wants
more words than that must route them through the strip first (spec §6).

No link facet — there is no per-strand permalink to point at yet (spec §3).
"""
from __future__ import annotations

from datetime import datetime, timezone

from .. import publisher

NAME = "bluesky"
LIMITS = {"text": 300, "images": 4, "wants_link": False}
POST = "app.bsky.feed.post"


def check_text(text) -> None:
    """Refuse text Bluesky would refuse, before anything is sent.

    Counted in code points, as the String's lexicon validator counts
    maxGraphemes (lexicon.py). A code point count is never less than the
    grapheme count, so this can refuse an emoji-heavy post Bluesky would
    take, and can never pass one it rejects.
    """
    if not isinstance(text, str) or not text.strip():
        raise ValueError("post text is empty")
    if len(text) > LIMITS["text"]:
        raise ValueError(f"post text is {len(text)} characters; "
                         f"Bluesky takes at most {LIMITS['text']}")


def _embed_image(ref: dict) -> dict:
    # alt is optional on an imageRef and required on a Bluesky image; an
    # empty string is what Bluesky itself sends for "no description".
    out = {"image": ref["image"], "alt": ref.get("alt", "")}
    if ref.get("aspectRatio"):
        out["aspectRatio"] = ref["aspectRatio"]
    return out


def post(session: dict, strand: dict, items: list[dict], text: str) -> dict:
    """Post `text` with up to four of the strand's already-uploaded images.

    Returns {"id": rkey, "url": a bsky.app link, "dropped": images left out}.
    """
    check_text(text)
    refs = [ref for body in items for ref in (body.get("images") or [])]
    kept = refs[:LIMITS["images"]]
    record = {"$type": POST, "text": text,
              "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    if kept:
        record["embed"] = {"$type": "app.bsky.embed.images",
                           "images": [_embed_image(r) for r in kept]}
    res = publisher._xrpc(session["pds"], "com.atproto.repo.createRecord",
                          token=session["jwt"],
                          body={"repo": session["did"], "collection": POST, "record": record})
    rkey = res["uri"].rsplit("/", 1)[-1]
    return {"id": rkey, "url": f"https://bsky.app/profile/{session['handle']}/post/{rkey}",
            "dropped": len(refs) - len(kept)}
```

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `python3 -m pytest tests/test_syndicate_bluesky.py -q && python3 -m pytest tests/ -q`
Expected: 12 passed, then **271 passed**.

- [ ] **Step 5: Commit**

```bash
git add string/app/syndicate/ tests/test_syndicate_bluesky.py
git commit -m "feat(destinations): the Bluesky adapter — a post that reuses phase 1's blobs"
```

---

### Task 4: The registry: `check` before phase 1, `run` after it

**Files:**
- Modify: `string/app/syndicate/__init__.py`
- Test: `tests/test_syndicate_registry.py`

**Interfaces:**
- Consumes: `Store.syndication`, `Store.add_syndication` (Task 1); `held` (Task 2); `bluesky.NAME/LIMITS/post` (Task 3).
- Produces:
  - `syndicate.DESTINATIONS: dict[str, module]`
  - `syndicate.available() -> list[{"name": str, "limits": dict}]`
  - `syndicate.check(destinations: list[str], text: str | None) -> list[str]`. Each problem is a sentence; `[]` means the request may go ahead.
  - `syndicate.post(destination, *, session, strand, items, text) -> dict`
  - `syndicate.run(store, record_id: str, destinations: list[str], text: str, held: dict) -> list[dict]`, returning one result per distinct destination, in order:
    - `{"destination", "status": "posted", "remoteUrl", "postedAt", "droppedImages": int}`
    - `{"destination", "status": "already", "remoteUrl", "postedAt"}`
    - `{"destination", "status": "failed", "reason": str}`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_syndicate_registry.py`:

```python
"""The registry: validate before phase 1, execute after it (spec §4, §8)."""
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))
from app import syndicate  # noqa: E402
from app.db import Store  # noqa: E402

STRAND = "com.cultureblocs.strand"
HELD = {"session": {"did": "did:plc:me", "jwt": "jwt", "pds": "https://pds.example",
                    "handle": "me.example"},
        "strand": {"title": "A day out"}, "items": []}


def fake_adapter(name, limit=300, fail=None):
    calls = []

    def post(session, strand, items, text):
        calls.append(text)
        if fail:
            raise RuntimeError(fail)
        return {"id": f"{name}-{len(calls)}", "url": f"https://{name}.example/{len(calls)}",
                "dropped": 0}
    mod = types.SimpleNamespace(NAME=name, LIMITS={"text": limit, "images": 4,
                                                   "wants_link": False}, post=post)
    return mod, calls


@pytest.fixture
def store(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    s.upsert("k1", STRAND, "loom", "2026-09-18T10:00:00Z",
             {"$type": STRAND, "createdAt": "2026-09-18T10:00:00Z", "items": []})
    s.rid = s.query()[0]["id"]
    return s


def test_available_lists_bluesky_with_its_limits():
    assert {"name": "bluesky", "limits": {"text": 300, "images": 4, "wants_link": False}} \
        in syndicate.available()


def test_no_destinations_is_never_a_problem():
    assert syndicate.check([], None) == []


def test_an_unknown_destination_is_named_along_with_the_ones_that_exist():
    [problem] = syndicate.check(["myspace"], "hello")
    assert "myspace" in problem and "bluesky" in problem


@pytest.mark.parametrize("text", [None, "", "   "])
def test_empty_text_is_a_problem(text):
    assert syndicate.check(["bluesky"], text) == ["post text is empty"]


def test_text_is_held_to_the_smallest_ticked_limit(monkeypatch):
    tiny, _ = fake_adapter("tiny", limit=10)
    monkeypatch.setitem(syndicate.DESTINATIONS, "tiny", tiny)
    assert syndicate.check(["bluesky", "tiny"], "a" * 10) == []
    [problem] = syndicate.check(["bluesky", "tiny"], "a" * 11)
    assert "11" in problem and "10" in problem


def test_run_posts_and_records_the_row(monkeypatch, store):
    mod, calls = fake_adapter("bluesky")
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky", mod)
    [r] = syndicate.run(store, store.rid, ["bluesky"], "hello", HELD)
    assert r["status"] == "posted" and r["remoteUrl"] == "https://bluesky.example/1"
    assert r["droppedImages"] == 0 and r["postedAt"]
    assert calls == ["hello"]
    assert store.syndication(store.rid, "bluesky")["remoteId"] == "bluesky-1"


def test_a_second_run_skips_a_used_destination_and_says_so(monkeypatch, store):
    mod, calls = fake_adapter("bluesky")
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky", mod)
    syndicate.run(store, store.rid, ["bluesky"], "hello", HELD)
    [r] = syndicate.run(store, store.rid, ["bluesky"], "hello again", HELD)
    assert r == {"destination": "bluesky", "status": "already",
                 "remoteUrl": "https://bluesky.example/1",
                 "postedAt": store.syndication(store.rid, "bluesky")["postedAt"]}
    assert calls == ["hello"], "never double-posts"


def test_a_failing_destination_records_nothing_and_stays_available(monkeypatch, store):
    bad, _ = fake_adapter("bluesky", fail="PDS said no")
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky", bad)
    [r] = syndicate.run(store, store.rid, ["bluesky"], "hello", HELD)
    assert r == {"destination": "bluesky", "status": "failed", "reason": "PDS said no"}
    assert store.syndications(store.rid) == []
    good, _ = fake_adapter("bluesky")
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky", good)
    [r] = syndicate.run(store, store.rid, ["bluesky"], "hello", HELD)
    assert r["status"] == "posted"


def test_one_failure_does_not_stop_the_next_destination(monkeypatch, store):
    bad, _ = fake_adapter("bluesky", fail="down")
    other, calls = fake_adapter("other")
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky", bad)
    monkeypatch.setitem(syndicate.DESTINATIONS, "other", other)
    out = syndicate.run(store, store.rid, ["bluesky", "other"], "hi", HELD)
    assert [r["status"] for r in out] == ["failed", "posted"]


def test_a_name_given_twice_posts_once(monkeypatch, store):
    mod, calls = fake_adapter("bluesky")
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky", mod)
    out = syndicate.run(store, store.rid, ["bluesky", "bluesky"], "hi", HELD)
    assert len(out) == 1 and calls == ["hi"]


def test_the_adapter_is_given_exactly_what_phase_1_held(monkeypatch, store):
    seen = {}

    def post(session, strand, items, text):
        seen.update(session=session, strand=strand, items=items, text=text)
        return {"id": "1", "url": None, "dropped": 0}
    monkeypatch.setitem(syndicate.DESTINATIONS, "bluesky",
                        types.SimpleNamespace(NAME="bluesky", LIMITS={"text": 300}, post=post))
    syndicate.run(store, store.rid, ["bluesky"], "hi", HELD)
    assert seen == {"session": HELD["session"], "strand": HELD["strand"],
                    "items": HELD["items"], "text": "hi"}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m pytest tests/test_syndicate_registry.py -q`
Expected: FAIL with `AttributeError: module 'app.syndicate' has no attribute 'available'`, and the same for `DESTINATIONS`.

- [ ] **Step 3: Implement**

Replace `string/app/syndicate/__init__.py` with:

```python
"""Syndication: renderings of a published strand on other services.

POSSE — publish on your own site, syndicate elsewhere. The PDS is where the
record lives; everything here is a rendering of it, made once, after the
strand is safely published (spec: docs/superpowers/specs/
2026-09-18-publish-destinations-design.md in cultureblocs-loom).

One module per destination, each exposing exactly NAME, LIMITS and
post(session, strand, items, text) -> {"id", "url", "dropped"}. Adding a
destination is a new module and one line in DESTINATIONS.

A rule for whoever writes the next one: any adapter that composes text from
`narrative`, a bead's `note` or any other record field must route it through
the strip first. The Bluesky adapter reads only the text a person wrote.
"""
from __future__ import annotations

from . import bluesky

DESTINATIONS = {bluesky.NAME: bluesky}


def available() -> list[dict]:
    """Every destination and its declared limits; Loom sizes its text box from these."""
    return [{"name": name, "limits": dict(mod.LIMITS)} for name, mod in DESTINATIONS.items()]


def check(destinations: list[str], text: str | None) -> list[str]:
    """Why this syndication request must not go ahead, in words; [] if it may.

    Run before phase 1: publishing and *then* failing on the post text is
    the worst order available.
    """
    if not destinations:
        return []
    unknown = [d for d in dict.fromkeys(destinations) if d not in DESTINATIONS]
    if unknown:
        return [f"unknown destination: {', '.join(unknown)} "
                f"(known: {', '.join(DESTINATIONS)})"]
    if not isinstance(text, str) or not text.strip():
        return ["post text is empty"]
    limit = min(DESTINATIONS[d].LIMITS["text"] for d in destinations)
    if len(text) > limit:
        return [f"post text is {len(text)} characters; the most every chosen "
                f"destination takes is {limit}"]
    return []


def post(destination: str, *, session: dict, strand: dict, items: list[dict],
         text: str) -> dict:
    """-> {"id": str, "url": str | None, "dropped": int}. Raises on failure."""
    return DESTINATIONS[destination].post(session, strand, items, text)


def run(store, record_id: str, destinations: list[str], text: str,
        held: dict) -> list[dict]:
    """Phase 2: post to each destination not already used, and record it.

    Never raises for a destination's sake. A failure is reported and records
    nothing, so the destination stays available to try again; the strand
    phase 1 published is untouched either way.
    """
    results = []
    for dest in dict.fromkeys(destinations):
        done = store.syndication(record_id, dest)
        if done:
            results.append({"destination": dest, "status": "already",
                            "remoteUrl": done["remoteUrl"], "postedAt": done["postedAt"]})
            continue
        try:
            out = post(dest, session=held["session"], strand=held["strand"],
                       items=held["items"], text=text)
        except Exception as exc:  # noqa: BLE001 — any adapter failure is reported, not raised
            results.append({"destination": dest, "status": "failed", "reason": str(exc)})
            continue
        row = store.add_syndication(record_id, dest, out["id"], out.get("url")) or {}
        results.append({"destination": dest, "status": "posted",
                        "remoteUrl": row.get("remoteUrl", out.get("url")),
                        "postedAt": row.get("postedAt"),
                        "droppedImages": out.get("dropped", 0)})
    return results
```

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `python3 -m pytest tests/test_syndicate_registry.py -q && python3 -m pytest tests/ -q`
Expected: 13 passed, then **284 passed**.

- [ ] **Step 5: Commit**

```bash
git add string/app/syndicate/__init__.py tests/test_syndicate_registry.py
git commit -m "feat(destinations): the registry — check before publishing, run after"
```

---

### Task 5: The endpoints

**Files:**
- Modify: `string/app/main.py` (imports; `PublishIn`; `publish`; a new `destinations` route; the module docstring's "Interfaces" list)
- Test: `tests/test_api_syndication.py`

**Interfaces:**
- Consumes: `syndicate.available/check/run` (Task 4), `publisher.publish_strand_full` (Task 2).
- Produces (what Loom relies on):
  - `GET /destinations` → `{"destinations": [{"name": "bluesky", "limits": {"text": 300, "images": 4, "wants_link": false}}]}`
  - `POST /publish/{id}` body: `{"identity": str, "destinations"?: [str], "postText"?: str}`
    - With no `destinations`, the response is **byte-for-byte today's** and carries no `syndications` key.
    - With `destinations`, the response is today's plus `"syndications": [result, …]`, using Task 4's result shapes.
    - An unknown destination, empty text, text over the limit, or destinations on a non-strand record → **422**, `detail` a string, **before any XRPC call**.
  - `GET /records/{id}` and `GET /records?…` rows carry `syndications` (from Task 1).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api_syndication.py`:

```python
"""POST /publish with destinations, and GET /destinations, end to end with
the network stubbed. Spec §4 (two phases), §8 (error handling)."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))

STRAND = "com.cultureblocs.strand"
BEAD = "com.cultureblocs.bead"
DAY = "2026-09-18T10:00:00Z"


@pytest.fixture
def api(client, monkeypatch):
    """The client, a held identity, a strand with one bead, and a recorded network."""
    import app.main as main
    calls = []

    def fake_xrpc(_pds, method, *, body=None, token=None):
        calls.append(method)
        if method == "com.atproto.server.createSession":
            return {"did": "did:plc:me", "accessJwt": "jwt"}
        if method == "com.atproto.repo.putRecord":
            return {"uri": f"at://did:plc:me/{body['collection']}/{body['rkey']}", "cid": "bafycid"}
        if method == "com.atproto.repo.createRecord":
            return {"uri": "at://did:plc:me/app.bsky.feed.post/3post", "cid": "bafypost"}
        raise AssertionError(f"unexpected xrpc call: {method}")

    monkeypatch.setattr(main.publisher, "_xrpc", fake_xrpc)
    client.put("/identities/personal", json={"handle": "me.example", "appPassword": "x",
                                             "pds": "https://pds.example"})
    [bead] = client.post("/records", json={"records": [{
        "dedupeKey": "b1", "type": BEAD, "sourceApp": "loom", "createdAt": DAY,
        "body": {"$type": BEAD, "kind": "bloc", "note": "first", "createdAt": DAY}}]}).json()["results"]
    [strand] = client.post("/records", json={"records": [{
        "dedupeKey": "s1", "type": STRAND, "sourceApp": "loom", "createdAt": DAY,
        "body": {"$type": STRAND, "createdAt": DAY, "title": "A day out",
                 "items": [{"uri": f"spine://records/{bead['id']}"}]}}]}).json()["results"]
    client.calls = calls
    client.main = main
    client.strand = strand["id"]
    client.bead = bead["id"]
    return client


def publish(api, **extra):
    return api.post(f"/publish/{api.strand}", json={"identity": "personal", **extra})


def test_destinations_are_listed_with_their_limits(api):
    body = api.get("/destinations").json()
    assert {"name": "bluesky", "limits": {"text": 300, "images": 4, "wants_link": False}} \
        in body["destinations"]


def test_publish_without_destinations_is_exactly_as_before(api):
    body = publish(api).json()
    assert body["strandUri"].startswith("at://")
    assert "syndications" not in body
    assert "com.atproto.repo.createRecord" not in api.calls


def test_publish_with_bluesky_reports_both_phases_separately(api):
    body = publish(api, destinations=["bluesky"], postText="A day out").json()
    assert body["strandUri"] == f"at://did:plc:me/{STRAND}/{api.strand}"
    [s] = body["syndications"]
    assert s["destination"] == "bluesky" and s["status"] == "posted"
    assert s["remoteUrl"] == "https://bsky.app/profile/me.example/post/3post"
    assert api.calls.count("com.atproto.server.createSession") == 1, "phase 2 reuses the session"


def test_the_record_then_carries_its_syndication_singly_and_in_lists(api):
    publish(api, destinations=["bluesky"], postText="A day out")
    one = api.get(f"/records/{api.strand}").json()
    assert one["syndications"][0]["remoteUrl"] == "https://bsky.app/profile/me.example/post/3post"
    listed = [r for r in api.get("/records?day=2026-09-18").json()["records"]
              if r["id"] == api.strand]
    assert listed[0]["syndications"] == one["syndications"]


def test_republishing_skips_a_used_destination_and_never_double_posts(api):
    publish(api, destinations=["bluesky"], postText="A day out")
    [s] = publish(api, destinations=["bluesky"], postText="A day out").json()["syndications"]
    assert s["status"] == "already"
    assert api.calls.count("com.atproto.repo.createRecord") == 1


def test_a_failing_destination_leaves_the_publish_intact_and_records_nothing(api, monkeypatch):
    def down(*_a, **_k):
        raise RuntimeError("bsky is down")
    monkeypatch.setattr(api.main.syndicate.bluesky, "post", down)
    resp = publish(api, destinations=["bluesky"], postText="A day out")
    assert resp.status_code == 200
    assert resp.json()["syndications"] == [
        {"destination": "bluesky", "status": "failed", "reason": "bsky is down"}]
    rec = api.get(f"/records/{api.strand}").json()
    assert rec["publishedUri"].startswith("at://"), "phase 2 cannot fail phase 1"
    assert rec["syndications"] == []


@pytest.mark.parametrize("extra, words", [
    ({"destinations": ["myspace"], "postText": "hi"}, "unknown destination"),
    ({"destinations": ["bluesky"], "postText": "a" * 301}, "301"),
    ({"destinations": ["bluesky"], "postText": "   "}, "empty"),
    ({"destinations": ["bluesky"]}, "empty"),
])
def test_a_bad_request_is_refused_before_anything_publishes(api, extra, words):
    resp = publish(api, **extra)
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], str) and words in resp.json()["detail"]
    assert api.calls == [], "no network call at all"
    assert api.get(f"/records/{api.strand}").json()["publishedUri"] is None


def test_destinations_on_a_record_that_is_not_a_strand_are_refused(api):
    resp = api.post(f"/publish/{api.bead}", json={"identity": "personal",
                                                  "destinations": ["bluesky"], "postText": "hi"})
    assert resp.status_code == 422
    assert "strand" in resp.json()["detail"]
    assert api.calls == []
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m pytest tests/test_api_syndication.py -q`
Expected: FAIL. `/destinations` 404s, the response has no `syndications` key, and the 422 cases publish anyway.

- [ ] **Step 3: Implement**

In `string/app/main.py`:

1. Change the import to `from . import publisher, refs, syndicate`.
2. In the module docstring's `Interfaces:` list, after the `GET   /lexicons` line, add:

```
  GET   /destinations     where a published strand can also be posted
  POST  /publish/{id}     publish a strand; optionally syndicate it too
```

3. Replace `PublishIn` and `publish`, and add `destinations` after them:

```python
class PublishIn(BaseModel):
    identity: str
    # Syndication (spec: publish destinations). Ignored by /unpublish.
    destinations: list[str] = Field(default_factory=list, max_length=20)
    postText: str | None = Field(default=None, max_length=5000)


@app.get("/destinations", dependencies=[Depends(auth)])
def destinations():
    """Where a published strand can also go, and each one's limits."""
    return {"destinations": syndicate.available()}


@app.post("/publish/{strand_id}", dependencies=[Depends(auth)])
def publish(strand_id: str, body: PublishIn):
    """Publish a strand to the PDS, then post it to any `destinations`.

    Two phases in one request. Everything that could refuse the syndication
    is checked first, so nothing publishes on a request that would then
    fail on its post text. Phase 2 cannot fail phase 1: a destination that
    fails is reported in `syndications` and recorded nowhere.
    """
    ident = store.identity_get(body.identity)
    if ident is None:
        raise HTTPException(status_code=404, detail="unknown identity")
    if body.destinations:
        problems = syndicate.check(body.destinations, body.postText)
        rec = store.get(strand_id)
        if rec is not None and rec["type"] != publisher.STRAND:
            problems.append("only a strand is posted elsewhere; this record publishes on its own")
        if problems:
            raise HTTPException(status_code=422, detail="; ".join(problems))
    try:
        result, held = publisher.publish_strand_full(store, strand_id, ident,
                                                     media_dir=MEDIA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"publish failed: {exc}")
    if body.destinations and held is not None:
        result["syndications"] = syndicate.run(store, strand_id, body.destinations,
                                               body.postText, held)
    return result
```

(`unpublish` keeps taking `PublishIn`, and the two new fields are ignored there. `MEDIA_DIR` is defined lower in the module and read at call time, exactly as the current `publish` reads it.)

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `python3 -m pytest tests/test_api_syndication.py -q && python3 -m pytest tests/ -q`
Expected: 11 passed, then **295 passed**.

- [ ] **Step 5: Commit**

```bash
git add string/app/main.py tests/test_api_syndication.py
git commit -m "feat(destinations): POST /publish takes destinations; GET /destinations"
```

---

### Task 6: Document it, verify, and open the String's PR

**Files:**
- Modify: `PROMOTER.md` (a new section before `## Known limitations (release one)`)

- [ ] **Step 1: Write the section**

Insert this into `PROMOTER.md` immediately before `## Known limitations (release one)`:

```markdown
## Syndication: posting a published strand elsewhere

The PDS is where a strand lives; other services get renderings of it
(POSSE). `POST /publish/<id>` takes two optional fields:

    { "identity": "personal", "destinations": ["bluesky"], "postText": "A day out" }

and runs in two phases. Phase 1 is the publish above, unchanged. Phase 2
posts to each destination and reports it under `syndications` in the
answer: `posted` (with `remoteUrl`), `already` (used before, so skipped), or
`failed` (with `reason`). A failed destination leaves the strand published
and records nothing, so it can be tried again. Bad requests — an unknown
destination, empty text, text over a destination's limit — are refused
with 422 **before** anything publishes.

`GET /destinations` lists what exists and each one's limits.

**One-shot.** Each (strand, destination) pair is posted once; the
`syndications` table enforces it, so republishing never double-posts.
Unpublishing a strand does not delete its posts.

**Bluesky** writes an `app.bsky.feed.post` into the same repo, under the
session the publish already opened, with up to four of the images phase 1
already uploaded — reused, not re-uploaded. The text is exactly what was
written, at most 300 characters (counted in code points, like the lexicon
validator). No link back yet: there is no per-strand web page to point at.

**Adding a destination** is one module in `string/app/syndicate/` exposing
`NAME`, `LIMITS` and `post(session, strand, items, text)`, plus one line in
`DESTINATIONS`. If it composes text from `narrative` or a bead's `note`, it
must route that text through the strip first.
```

- [ ] **Step 2: Full verification**

Run: `python3 -m pytest tests/ -q`
Expected: **295 passed**, 0 failed.

Run: `python3 -c "import sys; sys.path.insert(0,'string'); import app.syndicate as s; print(s.available())"`
Expected: `[{'name': 'bluesky', 'limits': {'text': 300, 'images': 4, 'wants_link': False}}]`

- [ ] **Step 3: Commit, push, open the PR**

```bash
git add PROMOTER.md
git commit -m "docs(destinations): syndication in PROMOTER.md"
git push -u origin feature/publish-destinations
gh pr create --title "feat: syndicate a published strand — Bluesky first" --body "…"
```

The PR body covers:
- **What:** two phases in `POST /publish/<id>`, the registry, the Bluesky adapter, the `syndications` table, and `GET /destinations`.
- **Why this order:** this PR merges **before** the Loom one. Loom's surface is inert without it, and it degrades to today's behaviour if it merges first.
- The three places this is more specific than the spec, from Global Constraints: `createRecord`, list rows, and the wrapped list.
- **Tests:** 246 → 295.
- **After merge:** restart the String so the new table is created. `CREATE TABLE IF NOT EXISTS` handles it, and no migration step runs against `data/string.db`.
- End with the session's PR attribution line.

**Do not merge.** The user merges on GitHub.

---

## Part B — cultureblocs-loom

All of Part B runs in `~/TPM/cultureblocs-loom` on the existing branch `feature/publish-destinations`. Baseline: `node --test 'app/test/*.test.mjs'` → **284 passed**.

### Task 7: The client and the fake String

**Files:**
- Modify: `app/lib/string-client.js` (`listDestinations`, `publish`)
- Modify: `app/test/fake-string.mjs` (`listDestinations`, `publish`, `destinations`, `failSyndicate`)
- Test: `app/test/string-client.test.mjs`

**Interfaces:**
- Produces:
  - `client.listDestinations() -> Promise<[{name, limits}]>`. A **404 resolves to `[]`**, because it means a String older than this feature. Any other failure throws `StringError` as usual.
  - `client.publish(id, identity, { destinations = [], postText } = {})`. The request body is `{identity}` when `destinations` is empty (unchanged from today), and `{identity, destinations, postText}` otherwise. It resolves to the String's JSON, which includes `syndications` when destinations were sent.
  - `fakeString({ …, destinations = [{ name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } }] })`. `out.failSyndicate` holds a reason string or null. The fake's `publish(id, identity, opts)` records `{id, identity, destinations, postText}` in `published` and keeps per-record rows in `rec.syndications`.

- [ ] **Step 1: Write the failing tests**

Append to `app/test/string-client.test.mjs`:

```js
/* Destinations (publish-destinations spec §7). A String older than this
 * answers 404, and Loom then offers none and publishes as it always has. */

test('listDestinations returns what the String can post to, with limits', async () => {
  const list = [{ name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } }];
  const f = scriptedFetch(() => [200, { destinations: list }]);
  const c = stringClient('http://string.test', 't', f.impl);
  assert.deepEqual(await c.listDestinations(), list);
  assert.deepEqual(f.seen.map((r) => [r.method, r.path]), [['GET', '/destinations']]);
});

test('a String without /destinations offers none, rather than failing', async () => {
  const c = stringClient('http://string.test', '', scriptedFetch(() => [404, { detail: 'Not Found' }]).impl);
  assert.deepEqual(await c.listDestinations(), []);
});

test('listDestinations still fails loudly on anything but a 404', async () => {
  const down = stringClient('http://string.test', '', scriptedFetch(() => [500, { detail: 'boom' }]).impl);
  await assert.rejects(down.listDestinations(), (e) => e instanceof StringError && e.status === 500);
  const wrong = stringClient('http://string.test', '', scriptedFetch(() => [200, { names: ['bluesky'] }]).impl);
  await assert.rejects(wrong.listDestinations(), (e) => e instanceof StringError && /destinations/.test(e.message));
});

test('publish with destinations sends them and the post text alongside the identity', async () => {
  const answer = { records: [], strandUri: 'at://x/s/1',
    syndications: [{ destination: 'bluesky', status: 'posted', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: 't' }] };
  const f = scriptedFetch(() => [200, answer]);
  const c = stringClient('http://string.test', '', f.impl);
  assert.deepEqual(await c.publish('sid-1', 'personal', { destinations: ['bluesky'], postText: 'A day out' }), answer);
  assert.deepEqual(JSON.parse(f.seen[0].body), { identity: 'personal', destinations: ['bluesky'], postText: 'A day out' });
});

test('publish with no destinations sends exactly what it always did', async () => {
  const f = scriptedFetch(() => [200, { records: [] }]);
  const c = stringClient('http://string.test', '', f.impl);
  await c.publish('sid-1', 'personal', { destinations: [], postText: 'ignored' });
  assert.deepEqual(JSON.parse(f.seen[0].body), { identity: 'personal' });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/test/string-client.test.mjs`
Expected: FAIL with `c.listDestinations is not a function`, and the destinations body assertion fails.

- [ ] **Step 3: Implement the client**

In `app/lib/string-client.js`, add after `listIdentities`:

```js
    /* Where a published strand can also be posted: [{ name, limits }]. A 404
     * is a String older than syndication, so it offers none — and Loom then
     * publishes exactly as it did before — rather than failing the block. */
    async listDestinations() {
      let body;
      try {
        body = await json('/destinations', (b) => (Array.isArray(b?.destinations)
          && b.destinations.every((d) => isObject(d) && typeof d.name === 'string' && isObject(d.limits))
          ? null : 'expected { destinations: [{ name, limits }] }'));
      } catch (e) {
        if (e instanceof StringError && e.status === 404) return [];
        throw e;
      }
      return body.destinations;
    },
```

Replace `publish`:

```js
    /* Publish a strand and the beads it lists, as `identity`, and post it to
     * any `destinations` with `postText`. The String does the strip and talks
     * to the PDS, inline: this is a slow request, and it is not atomic (see
     * the Publish panel's notes). Re-publishing is how a half-finished publish
     * is repaired — the rkeys are reused — and never posts twice. With no
     * destinations the request is exactly what it always was. */
    async publish(id, identity, { destinations = [], postText } = {}) {
      const payload = destinations.length ? { identity, destinations, postText } : { identity };
      return json(`/publish/${encodeURIComponent(id)}`, (b) => (Array.isArray(b?.records)
        ? null : 'expected { records: [...] }'),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    },
```

- [ ] **Step 4: Teach the fake String the same**

In `app/test/fake-string.mjs`:

Change the signature to add `destinations`:

```js
export function fakeString({ records = [], media = {}, failMedia = new Set(), reject = {},
  identities = [{ name: 'personal', handle: 'someone.example', pds: 'https://bsky.social' }],
  destinations = [{ name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } }] } = {}) {
```

Add after `listIdentities`:

```js
    async listDestinations() {
      reach('/destinations');
      calls.push('listDestinations');
      return structuredClone(destinations);
    },
```

Replace `publish`:

```js
    /* The String publishes to the PDS and stamps `publishedUri` on the record;
     * then posts to each destination not already used, keeping one row each. */
    async publish(id, identity, { destinations: chosen = [], postText } = {}) {
      const path = `/publish/${id}`;
      reach(path);
      calls.push(`publish ${id} ${identity}`);
      const rec = find(id, path);
      if (!identities.some((i) => i.name === identity)) throw fail(path, 404, 'unknown identity');
      if (out.failPublish) throw fail(path, 400, out.failPublish);
      published.push(chosen.length ? { id, identity, destinations: chosen, postText } : { id, identity });
      const uri = `at://did:plc:fake/${rec.type}/${id}`;
      rec.publishedUri = uri;
      const key = rec.type.endsWith('strand') ? 'strandUri' : 'uri';
      const result = { identity, handle: 'someone.example', did: 'did:plc:fake', records: [uri], [key]: uri };
      if (!chosen.length) return result;
      rec.syndications ??= [];
      result.syndications = chosen.map((destination) => {
        const had = rec.syndications.find((s) => s.destination === destination);
        if (had) return { destination, status: 'already', remoteUrl: had.remoteUrl, postedAt: had.postedAt };
        if (out.failSyndicate) return { destination, status: 'failed', reason: out.failSyndicate };
        const row = { destination, remoteId: `${destination}-${id}`,
          remoteUrl: `https://${destination}.example/post/${id}`, postedAt: '2026-09-18T12:00:00Z' };
        rec.syndications.push(row);
        return { destination, status: 'posted', remoteUrl: row.remoteUrl, postedAt: row.postedAt, droppedImages: 0 };
      });
      return result;
    },
```

Change the `out` object at the bottom to include the new knobs:

```js
  /* `failPublish` / `failUnpublish` / `failSyndicate` are set by a test to make the String refuse. */
  const out = { client, records, media, posted, calls, published, unpublished, identities, destinations,
    editOnString, state, failPublish: null, failUnpublish: null, failSyndicate: null };
```

- [ ] **Step 5: Run the client tests, then the whole suite**

Run: `node --test app/test/string-client.test.mjs && node --test 'app/test/*.test.mjs'`
Expected: all pass. The suite goes 284 → **289 passed**. The existing `publisher.test.mjs` assertion `deepEqual(s.published, [{ id: 'sid-1', identity: 'personal' }])` must still pass, because publishing with no destinations records the old shape.

- [ ] **Step 6: Commit**

```bash
git add app/lib/string-client.js app/test/fake-string.mjs app/test/string-client.test.mjs
git commit -m "feat(destinations): the String client lists destinations and sends them on publish"
```

---

### Task 8: The record carries its syndications; the publisher passes them through

**Files:**
- Modify: `app/lib/importer.js` (`stringFields`)
- Modify: `app/lib/publisher.js` (`destinations`, `publish`, `record`, `mergeSyndications`, header comment)
- Test: `app/test/importer.test.mjs`, `app/test/publisher.test.mjs`

**Interfaces:**
- Consumes: Task 7's `client.listDestinations`, `client.publish(id, identity, opts)`, and the fake's `failSyndicate`.
- Produces:
  - Every record `stringFields` touches gains `syndications: [{ destination, remoteUrl, postedAt }]`. It is `[]` when the String has none, so "none" and "never asked" read differently.
  - `mergeSyndications(had = [], results = []) -> [{destination, remoteUrl, postedAt}]`: a `posted` or `already` result replaces or adds by `destination`, and `failed` adds nothing.
  - `publisher.destinations() -> Promise<[{name, limits}]>`
  - `publisher.publish(key, identity, { destinations = [], postText } = {})`. It resolves to the String's result. The local record gets `publishedUri` and, when any destination was sent, the merged `syndications`.
  - `unpublish` leaves `syndications` alone.

- [ ] **Step 1: Write the failing tests**

Append to `app/test/importer.test.mjs`:

```js
test('import carries where a strand was posted, so the desk can link to it', async () => {
  const posted = [{ destination: 'bluesky', remoteId: '3p', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: '2026-09-18T12:00:00Z' }];
  const s = fakeString({ records: [
    bead('u1', 'public', { publishedUri: 'at://did:plc:x/com.cultureblocs.bead/b1', syndications: posted }),
    bead('u2', 'private'),
  ] });
  const store = createMemStore();
  await runImport({ store, registry: await registry(), client: s.client });

  assert.deepEqual((await store.getRecord(`${B}/u1`)).syndications,
    [{ destination: 'bluesky', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: '2026-09-18T12:00:00Z' }]);
  assert.deepEqual((await store.getRecord(`${B}/u2`)).syndications, [],
    'a String that says "none" reads as none, not as unknown');
});
```

(Check how `bead(…)` in that file merges its third argument. The existing `publishedUri` test passes top-level record fields the same way, so `syndications` rides along just as `publishedUri` does.)

Append to `app/test/publisher.test.mjs`:

```js
import { mergeSyndications } from '../lib/publisher.js';

test('the publisher lists the String’s destinations', async () => {
  const d = await desk();
  assert.deepEqual((await d.publisher.destinations()).map((x) => x.name), ['bluesky']);
});

test('publish with a destination sends it and the text, and the record learns where it went', async () => {
  const d = await desk();
  const key = await sentStrand(d);

  const result = await d.publisher.publish(key, 'personal', { destinations: ['bluesky'], postText: 'A day out' });

  assert.deepEqual(d.s.published, [{ id: 'sid-1', identity: 'personal', destinations: ['bluesky'], postText: 'A day out' }]);
  assert.equal(result.syndications[0].status, 'posted');
  const rec = await d.store.getRecord(key);
  assert.match(rec.publishedUri, /^at:\/\//);
  assert.deepEqual(rec.syndications, [{ destination: 'bluesky',
    remoteUrl: 'https://bluesky.example/post/sid-1', postedAt: '2026-09-18T12:00:00Z' }]);
});

test('a destination that failed is not recorded, so it stays available', async () => {
  const d = await desk();
  const key = await sentStrand(d);
  d.s.failSyndicate = 'bsky is down';

  const result = await d.publisher.publish(key, 'personal', { destinations: ['bluesky'], postText: 'x' });

  assert.equal(result.syndications[0].status, 'failed');
  const rec = await d.store.getRecord(key);
  assert.match(rec.publishedUri, /^at:\/\//, 'the strand is still published');
  assert.deepEqual(rec.syndications, []);
});

test('publishing with no destinations leaves syndications untouched', async () => {
  const d = await desk();
  const key = await sentStrand(d);
  await d.publisher.publish(key, 'personal');
  assert.equal((await d.store.getRecord(key)).syndications, undefined);
});

test('unpublishing a strand does not forget where it was posted', async () => {
  const d = await desk();
  const key = await sentStrand(d);
  await d.publisher.publish(key, 'personal', { destinations: ['bluesky'], postText: 'x' });
  await d.publisher.unpublish(key, 'personal');
  const rec = await d.store.getRecord(key);
  assert.equal(rec.publishedUri, null);
  assert.equal(rec.syndications.length, 1, 'a post is a moment that happened');
});

test('mergeSyndications keeps posted and already, drops failed, replaces by destination', () => {
  const had = [{ destination: 'bluesky', remoteUrl: 'old', postedAt: 't0' }];
  assert.deepEqual(mergeSyndications(had, [
    { destination: 'bluesky', status: 'already', remoteUrl: 'old', postedAt: 't0' },
    { destination: 'mastodon', status: 'posted', remoteUrl: 'm', postedAt: 't1', droppedImages: 0 },
    { destination: 'threads', status: 'failed', reason: 'no' },
  ]), [{ destination: 'bluesky', remoteUrl: 'old', postedAt: 't0' },
    { destination: 'mastodon', remoteUrl: 'm', postedAt: 't1' }]);
  assert.deepEqual(mergeSyndications(undefined, undefined), []);
});
```

(Put the `import { mergeSyndications }` line with the other imports at the top of the file. It is shown here only for clarity. Better still, extend the existing `import { stringPublisher, whyNotPublishable } from '../lib/publisher.js';`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/test/importer.test.mjs app/test/publisher.test.mjs`
Expected: FAIL. `syndications` is `undefined` after import, `publisher.destinations is not a function`, and `mergeSyndications` is not exported.

- [ ] **Step 3: Implement**

In `app/lib/importer.js`, replace `stringFields` and its comment:

```js
/* What the String holds about a record beyond its body: its version, the
 * fields and photos it has, whether it is public, and where it was posted.
 * `publishedUri` is normalised to null and `syndications` to [] rather than
 * left undefined, so "the String says it is not published / posted nowhere"
 * and "we have never asked" do not read the same. */
export const stringFields = (rec) => ({ stringHlc: rec.hlc ?? null,
  stringKeys: Object.keys(rec.body || {}), stringMedia: mediaNames(rec.body),
  publishedUri: rec.publishedUri ?? null, publishedHash: rec.publishedHash ?? null,
  syndications: Array.isArray(rec.syndications)
    ? rec.syndications.map((s) => ({ destination: s.destination, remoteUrl: s.remoteUrl ?? null, postedAt: s.postedAt ?? null }))
    : [] });
```

In `app/lib/publisher.js`:

Extend the header comment's last sentence of the first paragraph to read: `the UI only ever sees \`identities\`, \`destinations\`, \`publish\` and \`unpublish\`.`

Add after `isPublished`:

```js
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
```

Replace `record`:

```js
  /* Write what the String now holds onto a fresh read, so a save made while
   * the (slow) publish was in flight is not overwritten by a stale copy.
   * `results` is the publish's `syndications`, when destinations were sent. */
  async function record(key, publishedUri, results = null) {
    const fresh = await store.getRecord(key);
    if (!fresh) return;
    const posted = results ? { syndications: mergeSyndications(fresh.syndications, results) } : {};
    await store.putRecord({ ...fresh, publishedUri, ...posted });
  }
```

Add `destinations` after `identities` in the returned object, and replace `publish`:

```js
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
```

`unpublish` is unchanged. It calls `record(key, null)`, which leaves `syndications` alone.

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `node --test app/test/importer.test.mjs app/test/publisher.test.mjs && node --test 'app/test/*.test.mjs'`
Expected: all pass, **296 passed**. If an existing test `deepEqual`s a whole imported record and fails only because of the new `syndications: []`, add that key to its expected value.

- [ ] **Step 5: Commit**

```bash
git add app/lib/importer.js app/lib/publisher.js app/test/importer.test.mjs app/test/publisher.test.mjs
git commit -m "feat(destinations): records carry where they were posted; the publisher passes destinations"
```

---

### Task 9: The Publishing block's view

**Files:**
- Modify: `app/ui/view-publish.js`
- Modify: `app/loom.css` (two small rules)
- Test: `app/test/view-publish.test.mjs`

**Interfaces:**
- Consumes: `record.syndications` (Task 8); `codePointLength` from `../vendor/lexicon.js`.
- Produces, all pure:
  - `destinationLabel(name) -> string`: `'bluesky'` → `'Bluesky'`
  - `postLimit(destinations, ticked) -> number | null`: the smallest `limits.text` among ticked destinations, or `null` when none are ticked
  - `postReady(text, limit) -> boolean`: true when `limit === null`, else non-blank and `codePointLength(text) <= limit`
  - `counterView(text, limit) -> html`: `<span class="counter[ over]">N / LIMIT</span>`
  - `syndicationNotice(results = []) -> string`: `''` for none
  - `publishView({ record, identities, busy, error, destinations = [], ticked = [], postText = '', notice = '' })`

Markup contract for the controller (Task 10):
- Checkbox: `<input type="checkbox" name="destination" value="<name>">`
- Text box: `<textarea name="postText">`, rendered only when `ticked.length > 0`
- Counter slot: `<p class="hint post-counter">` wrapping `counterView(...)`
- Used destination: `<a class="posted" href="<remoteUrl>">posted to Bluesky</a>`, shown instead of its checkbox
- Notice: `<p class="hint notice" role="status">`
- The publish button is `disabled` when `busy` or `!postReady(postText, postLimit(...))`

- [ ] **Step 1: Write the failing tests**

Append to `app/test/view-publish.test.mjs`:

```js
import { counterView, destinationLabel, postLimit, postReady, syndicationNotice } from '../ui/view-publish.js';

const BLUESKY = { name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } };
const TINY = { name: 'tiny', limits: { text: 10, images: 1, wants_link: true } };

test('each unused destination is a checkbox, unticked by default, with no text box yet', () => {
  const html = view({ record: strand(), destinations: [BLUESKY] });
  assert.match(html, /type="checkbox" name="destination" value="bluesky"/);
  assert.match(html, /Bluesky/);
  assert.ok(!/checked/.test(html));
  assert.ok(!html.includes('name="postText"'), 'no text box until something is ticked');
});

test('ticking a destination shows the text box with its text and a counter', () => {
  const html = view({ record: strand(), destinations: [BLUESKY], ticked: ['bluesky'], postText: 'A day out' });
  assert.match(html, /value="bluesky" checked/);
  assert.match(html, /<textarea name="postText"[^>]*>A day out<\/textarea>/);
  assert.match(html, /9 \/ 300/);
});

test('the counter is sized from the smallest ticked destination, and over it publish is disabled', () => {
  const html = view({ record: strand(), destinations: [BLUESKY, TINY], ticked: ['bluesky', 'tiny'], postText: 'eleven char' });
  assert.match(html, /class="counter over">11 \/ 10/);
  assert.match(html, /data-action="publish" disabled/);
});

test('a cleared text box disables publish rather than posting nothing', () => {
  const html = view({ record: strand(), destinations: [BLUESKY], ticked: ['bluesky'], postText: '   ' });
  assert.match(html, /data-action="publish" disabled/);
});

test('a destination already used is a link to the post, not a checkbox', () => {
  const html = view({ record: strand({ publishedUri: 'at://x/s/1',
    syndications: [{ destination: 'bluesky', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: 't' }] }),
  destinations: [BLUESKY] });
  assert.match(html, /<a class="posted" href="https:\/\/bsky\.app\/profile\/me\/post\/3p"[^>]*>posted to Bluesky<\/a>/);
  assert.ok(!html.includes('value="bluesky"'), 'no second chance to double-post');
});

test('with no destinations on offer the block is exactly as before', () => {
  const html = view({ record: strand(), destinations: [] });
  assert.ok(!html.includes('name="destination"'));
  assert.ok(!html.includes('Also post to'));
});

test('the notice from the last publish is shown', () => {
  assert.match(view({ record: strand(), notice: 'posted to Bluesky' }), /role="status">posted to Bluesky/);
});

test('helpers: labels, limits, readiness, counter', () => {
  assert.equal(destinationLabel('bluesky'), 'Bluesky');
  assert.equal(postLimit([BLUESKY, TINY], []), null);
  assert.equal(postLimit([BLUESKY, TINY], ['bluesky']), 300);
  assert.equal(postLimit([BLUESKY, TINY], ['bluesky', 'tiny']), 10);
  assert.equal(postReady('', null), true, 'nothing ticked, nothing to check');
  assert.equal(postReady('', 300), false);
  assert.equal(postReady('🎭'.repeat(10), 10), true, 'code points, not UTF-16 units');
  assert.equal(postReady('🎭'.repeat(11), 10), false);
  assert.equal(String(counterView('🎭🎭', 300)), '<span class="counter">2 / 300</span>');
});

test('syndicationNotice says what happened to each destination', () => {
  assert.equal(syndicationNotice([]), '');
  assert.equal(syndicationNotice(undefined), '');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 0 }]), 'Posted to Bluesky.');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 2 }]),
    'Posted to Bluesky (2 images left out: it takes four).');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'already' }]),
    'Already posted to Bluesky, so not posted again.');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'failed', reason: 'bsky is down' }]),
    'Published, but Bluesky failed: bsky is down. It can be tried again.');
});
```

(As in Task 8, merge the new import into the file's existing `import { publishView } …` line.)

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/test/view-publish.test.mjs`
Expected: FAIL. The new named exports are missing, and no checkbox is rendered.

- [ ] **Step 3: Implement**

In `app/ui/view-publish.js`, add to the imports:

```js
import { codePointLength } from '../vendor/lexicon.js';
```

Add these helpers above `publishView`:

```js
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
      return r.droppedImages ? `Posted to ${name} (${r.droppedImages} images left out: it takes four).` : `Posted to ${name}.`;
    }
    if (r.status === 'already') return `Already posted to ${name}, so not posted again.`;
    return `Published, but ${name} failed: ${r.reason}. It can be tried again.`;
  }).join(' ');
}

/* The "also post to" part: a link for each destination already used, a
 * checkbox for each one not yet, and — once one is ticked — the post text. */
function destinationsView(record, destinations, ticked, postText, limit) {
  if (!destinations.length) return '';
  const used = new Map((record.syndications || []).map((s) => [s.destination, s]));
  return html`<fieldset class="destinations">
    <legend>Also post to</legend>
    ${destinations.map((d) => (used.has(d.name)
    ? html`<p class="chip-line">${used.get(d.name).remoteUrl
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
```

Update the `html.js` import to also bring in `raw`: `import { html, raw } from './html.js';`.

In `publishView`, change the signature and the final `return`:

```js
/* state: { record, identities, busy, error, destinations, ticked, postText, notice } */
export function publishView({ record = null, identities = [], busy = false, error = '',
  destinations = [], ticked = [], postText = '', notice = '' } = {}) {
```

The three early returns (`why`, `error`, `!identities.length`) stay as they are. The final return becomes:

```js
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
        ${identities.map((i) => html`<option value="${i.name}">${i.handle || i.name}</option>`)}
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
```

**Watch the button markup.** The old template rendered `data-action="publish" ${busy ? 'disabled' : ''}>`, which leaves a trailing space. The new one renders `data-action="publish"${blocked ? raw(' disabled') : ''}>`, so the tests' `/data-action="publish" disabled/` matches exactly. Run the existing view and controller tests afterwards to confirm nothing else depended on the old spacing.

Add to `app/loom.css`, next to the existing `.publish` rules (search for `.publish`):

```css
.publish .destinations { border: 0; padding: 0; margin: .5rem 0; }
.publish .counter.over { color: var(--performance); font-weight: 600; }
```

(`--performance` is the colour `button.danger` already uses.)

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `node --test app/test/view-publish.test.mjs && node --test 'app/test/*.test.mjs'`
Expected: all pass, **305 passed**.

- [ ] **Step 5: Commit**

```bash
git add app/ui/view-publish.js app/loom.css app/test/view-publish.test.mjs
git commit -m "feat(destinations): the Publishing block offers destinations, a post text and a counter"
```

---

### Task 10: The editor drives it, and the shell version bumps

**Files:**
- Modify: `app/ui/editor.js` (`publish` state, `loadPublishing`, `render`'s `publishView` call, `onInput`, `goPublic`)
- Modify: `app/sw.js` (`VERSION`)
- Test: `app/test/desk-controllers.test.mjs`

**Interfaces:**
- Consumes: `publisher.destinations()` and `publisher.publish(key, identity, {destinations, postText})` (Task 8); `publishView`, `postLimit`, `postReady`, `counterView`, `syndicationNotice` (Task 9).
- Produces: user-visible behaviour only.

- [ ] **Step 1: Write the failing tests**

In `app/test/desk-controllers.test.mjs`, extend `fakePublisher` so that it lists destinations and passes options through. Replace the function with:

```js
function fakePublisher({ store, identities = [{ name: 'personal', handle: 'someone.example' }],
  destinations = [], syndicate = null, fail = null, failIdentities = null } = {}) {
  const done = [];
  // Stamps `publishedUri` as lib/publisher.js does, so the editor's re-read
  // afterwards sees what the real publisher would have left.
  const stamp = async (key, uri, extra = {}) => store.putRecord({ ...(await store.getRecord(key)), publishedUri: uri, ...extra });
  return { done, identities,
    publisher: {
      async identities() { if (failIdentities) throw new Error(failIdentities); return identities; },
      async destinations() { return destinations; },
      async publish(key, identity, opts = {}) {
        if (fail) throw Object.assign(new Error('HTTP 400'), { status: 400, detail: fail });
        done.push(opts.destinations?.length
          ? `publish ${key} as ${identity} to ${opts.destinations.join(',')}: ${opts.postText}`
          : `publish ${key} as ${identity}`);
        const strandUri = 'at://did:plc:x/com.cultureblocs.strand/s1';
        const syndications = opts.destinations?.length ? (syndicate || opts.destinations.map((d) => ({
          destination: d, status: 'posted', remoteUrl: `https://${d}.example/p`, postedAt: 't', droppedImages: 0 }))) : undefined;
        const posted = (syndications || []).filter((r) => r.status !== 'failed')
          .map(({ destination, remoteUrl, postedAt }) => ({ destination, remoteUrl, postedAt }));
        await stamp(key, strandUri, posted.length ? { syndications: posted } : {});
        return { strandUri, records: [strandUri], ...(syndications ? { syndications } : {}) };
      },
      async unpublish(key, identity) {
        done.push(`unpublish ${key} as ${identity}`);
        await stamp(key, null);
        return 1;
      },
    } };
}
```

Then append these tests after `'with no String configured a strand shows no publishing surface'`:

```js
const BLUESKY = { name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } };

/* An input inside the Publishing block (not the editor form). */
const publishInput = (name, value, extra = {}) => ({ name, value, type: 'text', ...extra,
  closest: (sel) => (sel === 'section.publish' ? {} : null) });
const tick = (name, checked = true) => publishInput('destination', name, { type: 'checkbox', checked });

test('a String with destinations offers them on the strand', async () => {
  const ctx = await context();
  const p = fakePublisher({ store: ctx.store, destinations: [BLUESKY] });
  const key = await strandOnString(ctx, p);
  const root = fakeRoot();

  await mountEditor(root, ctx, { key });

  assert.match(root.innerHTML, /name="destination" value="bluesky"/);
});

test('ticking Bluesky shows the text box, pre-filled with the strand’s title', async () => {
  const ctx = await context();
  const p = fakePublisher({ store: ctx.store, destinations: [BLUESKY] });
  const key = await strandOnString(ctx, p);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key });

  await root.fire('input', tick('bluesky'));

  assert.match(root.innerHTML, /<textarea name="postText"[^>]*>A day out<\/textarea>/);
  assert.match(root.innerHTML, /9 \/ 300/);
});

test('publish sends the ticked destination and the text as edited, then says it posted', async () => {
  const ctx = await context();
  const p = fakePublisher({ store: ctx.store, destinations: [BLUESKY] });
  const key = await strandOnString(ctx, p);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key });

  await root.fire('input', tick('bluesky'));
  await root.fire('input', publishInput('postText', 'Saturday at the gasholders'));
  await root.fire('click', button('publish'));

  assert.deepEqual(p.done, [`publish ${key} as personal to bluesky: Saturday at the gasholders`]);
  assert.match(root.innerHTML, /role="status">Posted to Bluesky\./);
  assert.match(root.innerHTML, /<a class="posted" href="https:\/\/bluesky\.example\/p"/, 'now a link, not a checkbox');
  assert.ok(!root.innerHTML.includes('name="postText"'), 'the text box goes once nothing is ticked');
});

test('unticking takes the destination back out of the publish', async () => {
  const ctx = await context();
  const p = fakePublisher({ store: ctx.store, destinations: [BLUESKY] });
  const key = await strandOnString(ctx, p);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key });

  await root.fire('input', tick('bluesky'));
  await root.fire('input', tick('bluesky', false));
  await root.fire('click', button('publish'));

  assert.deepEqual(p.done, [`publish ${key} as personal`]);
});

test('a failed destination is reported beside a publish that worked', async () => {
  const ctx = await context();
  const p = fakePublisher({ store: ctx.store, destinations: [BLUESKY],
    syndicate: [{ destination: 'bluesky', status: 'failed', reason: 'bsky is down' }] });
  const key = await strandOnString(ctx, p);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key });

  await root.fire('input', tick('bluesky'));
  await root.fire('click', button('publish'));

  assert.match(root.innerHTML, /Published, but Bluesky failed: bsky is down/);
  assert.match(root.innerHTML, /name="destination" value="bluesky"/, 'still available to try again');
  assert.match(root.innerHTML, /data-action="unpublish"/, 'the strand itself is published');
});

test('typing in the Publishing block does not touch the strand being edited', async () => {
  const ctx = await context();
  const p = fakePublisher({ store: ctx.store, destinations: [BLUESKY] });
  const key = await strandOnString(ctx, p);
  const root = fakeRoot();
  await mountEditor(root, ctx, { key });
  const before = structuredClone((await ctx.store.getRecord(key)).body);

  await root.fire('input', tick('bluesky'));
  await root.fire('input', publishInput('postText', 'something else'));

  assert.deepEqual((await ctx.store.getRecord(key)).body, before);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/test/desk-controllers.test.mjs`
Expected: the new tests FAIL, because no checkbox is rendered and the ticks are ignored. The existing publishing tests still pass.

- [ ] **Step 3: Implement**

In `app/ui/editor.js`:

1. Extend the view import:

```js
import { counterView, postLimit, postReady, publishView, syndicationNotice } from './view-publish.js';
```

2. Replace the `publish` state declaration and `loadPublishing`:

```js
  /* Publishing, asked for once when a strand opens: `available` is false when
   * no String is configured, and the surface then stays hidden entirely.
   * `ticked` and `postText` are the syndication choices for the next press;
   * `postText` is null until someone types, and reads as the title until then. */
  const publish = { identities: [], destinations: [], ticked: [], postText: null, notice: '',
    error: '', busy: false, available: false };

  async function loadPublishing() {
    if (type !== STRAND || !ctx.publisher) return;
    const publisher = await ctx.publisher();
    if (!publisher) return;
    publish.available = true;
    try {
      publish.identities = await publisher.identities();
      publish.destinations = (await publisher.destinations?.()) || [];
    } catch (err) {
      publish.error = err?.message || String(err);
    }
  }

  const postText = () => publish.postText ?? (state.body.title || '');
```

3. In `render`, replace the `publishView({ … })` call with:

```js
      ? publishView({ record, identities: publish.identities, busy: publish.busy, error: publish.error,
        destinations: publish.destinations, ticked: publish.ticked, postText: postText(), notice: publish.notice })
```

4. Add this function above `onInput`, and make it the first line of `onInput`:

```js
  /* Input inside the Publishing block: a destination ticked or unticked, or
   * the post text typed. Never part of the strand's body, never a draft. */
  function onPublishInput(el) {
    if (el.name === 'destination') {
      const rest = publish.ticked.filter((d) => d !== el.value);
      publish.ticked = el.checked ? [...rest, el.value] : rest;
      return render();
    }
    if (el.name === 'postText') {
      publish.postText = el.value;
      const limit = postLimit(publish.destinations, publish.ticked);
      const slot = root.querySelector('.post-counter');
      if (slot) slot.innerHTML = String(counterView(publish.postText, limit));
      root.querySelectorAll('button[data-action="publish"]').forEach((b) => { b.disabled = publish.busy || !postReady(publish.postText, limit); });
    }
    return undefined;
  }
```

```js
  function onInput(e) {
    if (e.target.closest?.('section.publish')) return onPublishInput(e.target);
    if (record?.deleted) return;                      // the form is shown read-only
    // … rest unchanged
```

5. Replace `goPublic`:

```js
  /* Publish or unpublish this strand, as the chosen identity, and post it to
   * whatever is ticked. The request is slow, so the surface goes busy first;
   * the record is re-read afterwards because the publisher stamps the public
   * URI, and where it was posted, on it. */
  async function goPublic(action) {
    const publisher = await ctx.publisher?.();
    if (!publisher) return;
    const chosen = root.querySelector?.('select[name="identity"]')?.value
      || publish.identities[0]?.name;
    publish.busy = true;
    publish.notice = '';
    await render();
    try {
      if (action === 'publish') {
        const destinations = [...publish.ticked];
        const result = await publisher.publish(key, chosen,
          destinations.length ? { destinations, postText: postText() } : {});
        publish.notice = syndicationNotice(result?.syndications);
        publish.ticked = [];
        publish.postText = null;
      } else {
        await publisher.unpublish(key, chosen);
      }
      record = await ctx.store.getRecord(key);
      changed();
    } catch (err) {
      state.error = reason(err);
    } finally {
      publish.busy = false;
    }
    await render();
  }
```

(If a publish throws, `ticked` and `postText` are kept, so a refusal such as a 422 on over-long text leaves the person's text for them to fix.)

6. In `app/sw.js`, change `const VERSION = 'loom-5';` to `const VERSION = 'loom-6';`. No `SHELL` entry changes, because no module was added.

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `node --test app/test/desk-controllers.test.mjs && node --test 'app/test/*.test.mjs'`
Expected: all pass, **311 passed**. The existing controller test `'publish goes through the publisher and the strand then reads as published'` still expects `p.done` to equal `` [`publish ${key} as personal`] `` and must pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/ui/editor.js app/sw.js app/test/desk-controllers.test.mjs
git commit -m "feat(destinations): the editor ticks destinations, sends the post text, reports each one"
```

---

### Task 11: Docs, a real-browser check, and the Loom PR

**Files:**
- Modify: `LOOM.md` §8
- Modify: `docs/backlog.md` (table rows 2 and 4, and the `## 2 & 4` section head)

- [ ] **Step 1: `LOOM.md` §8**

Directly after the line `## 8 · Publishing` and its first paragraph (the one ending "…still has the full loop."), insert:

```markdown
**Everything goes to the PDS; some of it is then syndicated.** The PDS is
where a record lives, and other services get renderings of it — POSSE, in
the IndieWeb's word. Each destination is a deliberate tick on the
Publishing block, never a default. One press does one intent: the strand
publishes, then each ticked destination gets a short post whose text is
written by hand (it starts as the strand's title) and sent as written.
Each destination is posted to **once** per strand — the String's
`syndications` table enforces it, so republishing never double-posts — and
unpublishing a strand does not delete its posts, because a post is a
moment that happened. Bluesky is the first destination; Instagram,
Mastodon and Threads are later modules behind the same seam
([design](docs/superpowers/specs/2026-09-18-publish-destinations-design.md)).
The client-side ambition below is unaffected: `app/lib/publisher.js` stays
the swap point, and syndication sits behind it as publishing does.
```

- [ ] **Step 2: `docs/backlog.md`**

Change the two table rows to:

```markdown
| 2 | Publish a strand to Instagram | Publish | **seam built** 2026-09 — the adapter is a later module |
| 4 | Publish a strand to Bluesky, Mastodon, … | Publish | **done** 2026-09 for Bluesky |
```

Directly under `## 2 & 4 · Publishing routes: syndication to other services`, insert:

```markdown
**Done for Bluesky**, 2026-09 — [spec](superpowers/specs/2026-09-18-publish-destinations-design.md),
[plan](superpowers/plans/2026-09-18-publish-destinations.md). Syndication runs
in the String as a second phase of `POST /publish/<id>`, one module per
destination behind a registry. Bluesky reuses the publish's session and
blobs. No link back yet: there is no per-strand permalink anywhere, so it
arrives with the wall (item 3). Instagram, Mastodon and Threads are each one
new module in `string/app/syndicate/`; Instagram's frictions below still
stand.
```

- [ ] **Step 3: Full suite**

Run: `node --test 'app/test/*.test.mjs'`
Expected: **311 passed**, 0 failed.

- [ ] **Step 4: Check it in a real browser, against the String branch, with no real post**

This step must **not** post to the user's real Bluesky account. Ask the user before pressing publish with Bluesky ticked against a live identity.

1. In `~/TPM/cultureblocs-string`, run the Task 1–6 branch as the local String on :8100. First run `lsof -iTCP:8100` to check whether `~/TPM/turnout` is holding the port. Confirm with `curl -s localhost:8100/destinations`.
2. Open Loom at `http://localhost:8108`. Its compose mounts `./app` live. In DevTools, unregister the service worker and clear caches (**not** IndexedDB), then reload.
3. Open a strand that has been sent to the String. Check that the Publishing block shows "Also post to" with a Bluesky checkbox. Tick it, and check that the text box appears holding the title, with the counter reading `N / 300`. Type past 300 characters and check that the counter turns red and publish is disabled. Clear the text and check that publish is disabled.
4. Point Loom at a String **without** `/destinations` (the `main` branch) and check that the block looks exactly as it did before this work.
5. Stop here and report to the user. Whether to do a real post to Bluesky, and to which account, is their decision.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add LOOM.md docs/backlog.md
git commit -m "docs(destinations): LOOM.md §8 gains syndication; backlog items 2 and 4"
git push
gh pr create --title "feat: post a published strand to Bluesky from the Publishing block" --body "…"
```

The PR body covers:
- **What:** checkboxes, the text box and counter, a used destination shown as a link, the notice, and `publisher.js`'s `destinations()`. It also covers `stringFields` carrying `syndications`, and `VERSION` → `loom-6`.
- **Depends on** the cultureblocs-string PR from Task 6, which should merge first. If it hasn't, this degrades gracefully: with no `/destinations`, Loom shows no options.
- **Tests:** 284 → 311.
- **After merge:** reload Loom so the new service worker takes over. Run Import once so strands posted from another device pick up `syndications`.
- End with the session's PR attribution line.

**Do not merge.** The user merges on GitHub.
