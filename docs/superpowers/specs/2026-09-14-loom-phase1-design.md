# Loom Phase 1 — local-only app: design

Status: approved 2026-09-14. Corrected 2026-09-15 from the implementation prototype (see §11) and from the final review (see §12).
Parent design: [`LOOM.md`](../../../LOOM.md) — §3 (shape), §4 (data model), §9 (referents), §10 Phase 1.
Code lands in **this repository** under `app/`.

## 1 · Goal

A complete diary app for one desk browser, with no server of its own:
read your existing string, mint beads, compose entries with photos and
refs, and keep it all safe in the browser — then deliberately import
from, and send to, the String until Phase 2 replaces both with sync.

Success looks like: Loom is where you tell a day, from a cold start with
the String switched off, and nothing you write there can be lost to a
reload, a second tab, a service-worker update or a full disk.

## 2 · Decisions taken

| Question | Decision |
|---|---|
| Existing records | **One-way import** from the String into IndexedDB (records and photos). Re-runnable. |
| Devices | **Desk first.** Both postures are built, but Phase 1 is served on `localhost`; phone use waits for HTTPS hosting (a phone cannot get a secure origin from `http://brick:…`). |
| Loom-made records | **Manual send to the String** through its existing `POST /records` and `POST /media`: new records only; later edits stay local until Phase 2. |
| Implementation | **Vanilla ES modules, no build**, in the house style of Easel, Pocket and Rounds; `sdk/js` modules and lexicons **vendored** into `app/vendor/` with a drift test. |
| Port | **`:8108`** — LOOM.md §3's `:8105` is Easel's. |

## 3 · Out of scope

The resolver/extractor and suggestions rail (Phase 3), publishing and
drift (Phase 4), Feeds and Vault (Phase 3), sync, discovery and sign-in
(Phase 2), phone hosting over HTTPS, deleting beads (a mint fact is not
deleted; only proposals are released), and merging records edited both in
Loom and in the String (reported, not merged).

## 4 · Architecture

```
app/
  index.html  loom.css  loom.js      shell: posture, routes, surface mounting
  manifest.webmanifest  sw.js        installable PWA; offline app shell
  lib/
    store.js        storage interface + IndexedDB implementation
    memstore.js     in-memory implementation (tests; same interface)
    envelope.js     create / keep / release / edit; state; validation gate
    tid.js          ATProto TIDs for rkeys
    hlc.js          HLC stamps in the String's format
    keys.js         local keys and item URIs; spine:// <-> loom:// mapping
    day.js          pure: records -> days, strands and members (Thread's model)
    anchors.js      pure: re-find a ref's anchor after the text changes
    importer.js     plan (pure) + apply import from the String
    sender.js       plan (pure) + apply send to the String
    backup.js       export / restore one JSON file
    images.js       resize photos (ported from easel/lib/image.js)
    media.js        content-addressed photo names, as the String names them
    string-client.js  the String's HTTP API as Loom uses it (every error names the URL)
    routing.js      pure: route serialisation and posture (the shell's decisions)
    lexicons.js     LexiconRegistry from app/vendor/lexicons
  ui/
    thread.js  mint.js  compose.js  string-panel.js   controllers
    html.js         escaped html templates; the shared error status line
    view-*.js       view-model functions the ui modules render (pure, tested; view-refs.js is the refs editor)
  vendor/
    lexicon.js  strip.js  refs.js    copied from cultureblocs-string sdk/js
    lexicons/                        copied from cultureblocs-string lexicons
  test/*.test.mjs                    node --test, no dependencies
scripts/vendor-sdk.sh                refresh app/vendor from ../cultureblocs-string
docker-compose.yml                   nginx serving app/ on :8108
```

Every module under `lib/` and every `view-*.js` imports nothing that
touches the DOM or IndexedDB directly, except `store.js`'s IndexedDB
implementation; that is what lets node test them.

## 5 · Data model

### Stores (IndexedDB database `loom`, version 1)

- **`records`**, keyPath `key`, index on `day` (the `YYYY-MM-DD` of
  `createdAt`, or `body.day` for strands) and on `stringId`.
- **`blobs`**, keyPath `hash` (SHA-256 hex), value `{ hash, mime, blob }`.
- **`meta`**, keyPath `k`: `deviceId`, `hlc`, `stringUrl`, `stringToken`,
  `lastImportAt`, `lastBackupAt`, `posture`, `masks`, `mask` (the last mask
  pressed), and `draft:<key>` = `{ body, at, baseUpdatedAt }` for unsaved edits.

### Envelope

```
key         "<nsid>/<rkey>"                     e.g. com.cultureblocs.bead/3lqk2m4x7c22p
type        nsid
rkey        TID for Loom-made records; the String's id for imported ones
body        the lexicon record body (always valid against app/vendor/lexicons)
state       proposal | kept | draft | released | published | edited
            (Loom sets proposal→kept, draft→kept and proposal→released; released is local only,
            a tombstone awaiting Phase 2 sync; the last two come from imported records until Phase 4)
origin      mint | compose | import
sourceApp   "loom" for Loom-made; the String's sourceApp for imported
createdAt   ISO datetime (the record's own)
updatedAt   ISO datetime of the last local write
hlc         "<13-digit ms>-<5-digit counter>-<deviceId>"   (the String's format)
deviceId    this browser's id (generated once, kept in meta)
day         derived, for the index
stringId    the String's record id, once imported or sent
stringHash    sha256 of the String's body as last imported or sent
importedHash  sha256 of Loom's body as stored at that moment (differs for strands: items rewritten)
importedState the String's state at that moment
sentAt      when a Loom-made record was accepted by the String
missing     [ media file names that could not be fetched ]   (optional)
invalid     [ validator problems ]   (imported records that fail Loom's validator)
```

### Rules

- **Validation gate.** `envelope.js` runs `LexiconRegistry.validateRecord`
  and `anchorProblems` before any write of a Loom-made or edited record,
  and refuses to store one with problems. Imported records are the one
  exception: stored even if invalid, with `invalid` set and shown.
- **Mint facts are immutable.** `origin: "mint"` bodies are never
  rewritten by import: a String body change to one is planned as a
  conflict, never an update. A person may still edit a bead's note, place,
  photos and refs in Compose; that is an edit, recorded as one.
- **Proposals.** `keep` sets `state: kept`; `release` is offered only for
  `state: proposal`. A proposal only Loom holds is deleted; one the String
  holds (it has a `stringId`) becomes a `released` tombstone — hidden from
  Thread, counted as a local change, never re-added by import. Editing a
  proposal keeps it (as on the String since cultureblocs-string PR #1).
- **Saving recomputes flags.** A save drops `invalid` (the body passed the
  gate) and keeps only `missing` names the new body still references.
- **Strand items** reference local keys as `{ uri: "loom://<nsid>/<rkey>" }`.
  Import rewrites `spine://records/<id>` to the local key of the record
  whose `stringId` is `<id>`; send rewrites back (§7).
- **Photos** are referenced in `body.media` as `/media/<sha256>.<ext>` — the
  String's own content-addressed naming — so an imported photo, a
  Loom-made photo and the String's copy are the same name. Rendering
  resolves the name through the `blobs` store.
- **Anchors** are UTF-8 byte offsets (§9.9). On every narrative or note
  edit, `anchors.js` re-finds each anchored ref by the exact text it
  covered before the edit; a unique match moves the anchor, anything else
  drops the anchor and keeps the ref. `refs` and the text they anchor into
  are saved together.

## 6 · Surfaces

**Shell.** Routes `#/thread/<YYYY-MM>`, `#/thread/<YYYY-MM-DD>`, `#/mint`,
`#/compose/<key>`, `#/compose/new?day=…&wrap=<key>`. Narrow viewports open
in *totem posture* (Mint full screen; a deliberate "thread" link), wide ones
in *desk posture* (Thread centre, Compose beside it). Posture is a setting.

**Thread.**
- *Month*: days with counts and a small mark for days holding unsent records.
- *Day*: the timeline's string — beads by time, strands wrapping members,
  proposals on the dotted rail with **keep** and **release**; the same kind
  colours and `· auto` marker as `cultureblocs-string/timeline`.
- Every bead has **tell this** → Compose, new strand wrapping that bead.
- Chips: **unsent** (Loom-made, finished, not yet accepted by the String),
  **draft**, **invalid** (imported record failing the validator), **photo missing**.
- No inline editing: one editor, in Compose. **Annotations are read-only in
  Phase 1** (the AR app owns them): Thread offers no edit, and
  `#/compose/<annotation key>` — or any type Compose does not edit, or a
  released tombstone — shows a read-only notice.

**Mint.** Mask strip (default masks as Pocket's), optional one-line note,
kind picker (default `bloc`), press. Writes a bead with `origin: "mint"`,
`provenance: { app: "loom", device, mintedAt: <press> }`, tag = mask name, to
IndexedDB before any animation; then a bloom (a CSS pulse; Pocket's dot
matrix is not ported in Phase 1). No network.

**Compose — strand.** Title, day, place name, links; narrative (plain
textarea); items (the day's beads, tick to include, drag or arrows to
order; proposals shown with keep-and-include); refs (below). Live
problems list; **Save** (stays a draft) and **save as told** (kept, and so
sendable) are disabled while any exist. Photos belong to beads: the
`strand` lexicon has no media field. An entry still in draft that was
started in Compose offers **discard this draft**, which deletes it (and its
pending draft) on a second press; every other record offers **discard
changes**. Opening a record with a pending draft says "restored an unsaved
draft from <time>".

**Compose — bead.** Note, kind, place, links, photos (pick, resized to a
2000px edge, content-addressed, with alt text), refs.

**Refs editor.** One row per ref: type (`work`, `person`, `event`, `venue`,
`concept`, or free text), role (`subject`/`mention`), label, creator,
creatorDid, date, did, external ids (`scheme` + `id` pairs). **Anchor**
takes the current text selection in the narrative/note and stores its
byte range; **clear anchor** removes it. A privacy hint under each row
states, from `vendor/strip.js`, whether the ref would publish and what
would be withheld (for example "creator stays local until the work is
identified") — informational only in Phase 1.

**String panel** (drawer). String URL and token; **Check** calls `/health`
and shows the lexicon list, so a wrong port is caught before anything else.
**Import** with counts. **Send** with the unsent list, disabled when nothing
is ready to send. **Backup** and **Restore**. Storage persistence status.
Counts of unsent records, of drafts not sent (separately), of local changes
to records already on the String, and the time of the last backup. Failures
show in one status line (`role="alert"`), in every surface.

## 7 · Import and send

### Import (`importer.js`)

1. `GET /health` — must list the `com.cultureblocs.*` lexicons, or stop.
2. `GET /days`, then `GET /records?day=<day>&limit=2000` for each day, keeping
   the record types the vendored lexicons define that the String holds. A day
   that answers the full 2000 fails the import loudly, naming the URL (some
   records would be missed); a 200 that is not JSON or not the expected shape
   is an error naming the URL and what was wrong.
3. **Plan** (pure) each String record against the local store:
   - *add* — no local record with that `stringId`, and not one Loom sent;
   - *link* — the String record's `dedupeKey` is `loom:<rkey>` and the local
     `<nsid>/<rkey>` (sourceApp `loom`) has no `stringId` (for example after
     restoring an older backup): set `stringId`, `sentAt` and the hashes as
     send would — `importedHash` from the String's body in Loom form, so a
     differing local body reads as a local change. Never a second copy;
   - *update* — unchanged locally (body still hashes to `importedHash` and
     state equals `importedState`) and the String's body or state differs;
   - *unchanged* — the String's body hashes to `stringHash` and its state
     equals `importedState`;
   - *conflict* — changed on both sides (body or state); left alone and listed.
     Keeping or releasing an imported proposal in Loom is a local change, and
     a String body change to a mint fact is always a conflict.
4. **Apply** one record per transaction: rewrite strand items to local keys
   (after all records are added), fetch each referenced photo not already in
   `blobs` from `GET /media/<name>` (failures go to `missing`, are retried
   next import, and still-failing retries are counted), then **re-read the
   local record and plan it again just before writing** — an edit saved in
   another tab during the network wait makes it a conflict, never an
   overwrite. Afterwards, strands unchanged locally whose `spine://` items
   now resolve (a member arrived later) are rewritten to `loom://`, with
   `importedHash` moved to match.

### Send (`sender.js`)

1. **Plan** (pure): unsent Loom-made records, beads and annotations before
   strands; a strand is held back while any of its items lacks a `stringId`
   (named in the plan).
2. For each record: upload photos not yet on the String (`POST /media`,
   whose response name must equal the local name, else stop that record);
   rewrite strand items `loom://…` → `spine://records/<stringId>`;
   `POST /records` with `dedupeKey: "loom:<rkey>"`, `sourceApp: "loom"`,
   `createdAt` and `body`. (Phase 1 creates no proposals, so no `state` is
   sent; the String stores its default, `kept`. Draft strands are not sent.)
3. On `created` or `duplicate`, set `stringId` and `sentAt`, and the same
   `stringHash` / `importedHash` / `importedState` an import would, so the
   next import sees the record as unchanged — written onto a fresh read of
   the record, so an edit saved during the post keeps its body and reads as
   a local change. On `duplicate` the String already held a body (perhaps an
   older one, if an earlier response was lost): fetch `GET /records/{id}` and
   take `stringHash` from that body and `importedHash` from it in Loom form.
   On `invalid`, keep the record unsent and show the String's problems.

Edits to records that already have a `stringId` — including keeping or
releasing an imported proposal — are not sent in Phase 1; the panel counts
them as "local changes, sync in Phase 2".

## 8 · Error handling

- **Browser-only data.** Request `navigator.storage.persist()` on first
  run; show a banner if refused. Backup/Restore round-trips everything
  (records, blobs as base64, meta minus the token). The panel shows unsent
  count and last backup time; after 20 records that live only in this
  browser (drafts included) or 7 days since the last backup, a quiet
  reminder appears in Thread.
- **Restore** asks first, naming how many records (and how many not yet
  sent) it replaces, with **download a backup first**. It checks the whole
  file and decodes every photo before clearing anything, clears the three
  stores in one transaction, and keeps this browser's `stringToken`,
  `deviceId` and a clock that only moves forward (put back even if a write
  fails part way). Afterwards every tab reloads.
- **Drafts.** Compose autosaves to IndexedDB on every change (debounced
  500 ms): a new strand is a record in `state: draft`; an edit to an
  existing record is kept as a pending body in `meta` under
  `draft:<key>` until saved or discarded, with the `updatedAt` it was typed
  against — saving a restored draft over a record changed since is a
  Conflict. A save waits for any draft write in flight, so no draft outlives
  it. Nothing unsaved is lost on reload, crash or service-worker update.
- **Two tabs.** Save compares the stored `updatedAt` with the one loaded;
  on mismatch the save is refused and both versions are shown to choose
  from. Tabs announce writes over `BroadcastChannel("loom")` and re-render.
- **Quota.** A failed write shows the error, keeps the draft in memory, and
  offers Backup.
- **Network.** Import and send name the URL and the status in every error;
  both are resumable; send is idempotent by dedupe key.
- **Service worker.** Versioned shell cache (fetched with `cache: 'reload'`;
  a test fails if a module is not listed); a new version waits until no
  Compose has unsaved changes, then `skipWaiting` + `clients.claim`, and each
  tab reloads only after writing its pending draft and being clean.
- **Content Security Policy.** `index.html` declares `default-src 'self';
  img-src 'self' blob: data:; style-src 'self'; script-src 'self';
  connect-src *; worker-src 'self'; manifest-src 'self'`. Views carry no
  inline styles or handlers: kind colours come from `data-kind` (a known
  kind, else `bloc`) and stylesheet rules.

## 9 · Testing

- **Pure modules** under `node --test`, no dependencies: `envelope`, `tid`,
  `hlc`, `keys`, `day`, `anchors`, importer and sender planners, `backup`
  serialisation, and every `view-*.js`.
- **Store contract.** One suite of storage behaviours run against
  `memstore.js` in node and against the IndexedDB implementation in a
  browser test page (`app/test/store.html`).
- **HLC parity.** The JS HLC produces stamps that sort correctly against
  the String's `string/app/hlc.py` format (shared cases in the test).
- **Vendor drift.** Fails if `app/vendor/*` differs from
  `../cultureblocs-string/sdk/js/*` or `lexicons/` when that sibling exists;
  skipped (with a message) when it does not.
- **Render smoke.** Each `ui/*.js` renders its view model against a stub
  DOM without throwing (the approach of `timeline/test/render.test.mjs`).
- **End-to-end, once, last.** A scripted browser run against a **throwaway
  String** (a container on another port, started from a copy of
  `data/string.db`): check, import, mint, compose a strand wrapping that
  bead with an anchored ref and a photo, edit the narrative so the anchor
  moves, back up, clear the database, restore, send, and confirm the String
  holds the bead, the strand with `spine://` items, and the photo. Never
  against the real String.

## 10 · Changes to LOOM.md

- §3: port `:8108`, not `:8105`.
- §10 Phase 1: add the one-way import and manual send, and that Phase 1 is
  desk-first on localhost.

## 11 · Corrections from the prototype (2026-09-15)

Found while building and running the Phase 1 prototype against a copy of
the real String:

- **Strands carry no photos.** The `strand` lexicon has no media field;
  photos are edited on beads (§6).
- **Two hashes, not one.** Import rewrites strand items, so detecting a
  Loom edit and detecting a String change need different hashes
  (`importedHash` for the local body, `stringHash` for the String's) (§5, §7).
- **Send records its hashes.** Without them every record sent from Loom
  came back from the next import as "changed on both sides" (§7).
- **Sent strands are `kept` on the String**, its default; drafts stay home (§7).
- **The first service-worker install must not reload the page** — only the
  replacement of an existing worker is an update (§8).

## 12 · Corrections from the final review (2026-09-15)

- **Writes after a network wait re-read first** (send, import, photo retry), so
  a concurrent edit is never undone (§7).
- **Import links records Loom sent** by `dedupeKey` instead of copying them;
  **send handles `duplicate`** from the String's stored body (§7).
- **Import lists day by day**, failing loudly on a full page (§7).
- **Released proposals are tombstones**; **mint facts** are never updated by
  import (§5).
- **Annotations are read-only**; **draft entries can be discarded**; drafts
  carry `baseUpdatedAt` (§6, §8).
- **Restore confirms and keeps this browser's identity**; **CSP** (§8).
