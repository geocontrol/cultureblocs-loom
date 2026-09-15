# Loom Phase 1 — local-only app: design

Status: approved 2026-09-14. Corrected 2026-09-15 from the implementation prototype (see §11).
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
    images.js       resize + content-address photos (ported from easel/lib/image.js)
  ui/
    thread.js  mint.js  compose.js  refs-editor.js  string-panel.js
    view-*.js       view-model functions the ui modules render (pure, tested)
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
  `lastImportAt`, `lastBackupAt`, `posture`, `masks`.

### Envelope

```
key         "<nsid>/<rkey>"                     e.g. com.cultureblocs.bead/3lqk2m4x7c22p
type        nsid
rkey        TID for Loom-made records; the String's id for imported ones
body        the lexicon record body (always valid against app/vendor/lexicons)
state       proposal | kept | draft | published | edited
            (Loom sets only the first three; the last two come from imported records until Phase 4)
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
  rewritten by import. A person may still edit a bead's note, place,
  photos and refs in Compose; that is an edit, recorded as one.
- **Proposals.** `keep` sets `state: kept`; `release` deletes the record
  and is offered only for `state: proposal`. Editing a proposal keeps it
  (as on the String since cultureblocs-string PR #1).
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
- Chips: **unsent** (Loom-made, not yet accepted by the String), **invalid**
  (imported record failing the validator), **photo missing**.
- No inline editing: one editor, in Compose.

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
`strand` lexicon has no media field.

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
**Import** with counts. **Send** with the unsent list. **Backup** and
**Restore**. Storage persistence status. Counts of unsent records and the
time of the last backup.

## 7 · Import and send

### Import (`importer.js`)

1. `GET /health` — must list the `com.cultureblocs.*` lexicons, or stop.
2. `GET /records?type=<nsid>&limit=2000` for bead, annotation, strand (and
   any other record type the vendored lexicons define that the String holds).
3. **Plan** (pure) each String record against the local store:
   - *add* — no local record with that `stringId`;
   - *update* — unchanged locally (body still hashes to `importedHash` and
     state equals `importedState`) and the String's body or state differs;
   - *unchanged* — the String's body hashes to `stringHash` and its state
     equals `importedState`;
   - *conflict* — changed on both sides (body or state); left alone and listed.
     Keeping or releasing an imported proposal in Loom is a local change.
4. **Apply** one record per transaction: rewrite strand items to local keys
   (after all records are added), store, then fetch each referenced photo
   not already in `blobs` from `GET /media/<name>`; failures go to `missing`
   and are retried next import.

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
   next import sees the record as unchanged. On `invalid`, keep the record
   unsent and show the String's problems.

Edits to records that already have a `stringId` — including keeping or
releasing an imported proposal — are not sent in Phase 1; the panel counts
them as "local changes, sync in Phase 2".

## 8 · Error handling

- **Browser-only data.** Request `navigator.storage.persist()` on first
  run; show a banner if refused. Backup/Restore round-trips everything
  (records, blobs as base64, meta minus the token). The panel shows unsent
  count and last backup time; after 20 unsent records or 7 days since the
  last backup, a quiet reminder appears in Thread.
- **Drafts.** Compose autosaves to IndexedDB on every change (debounced
  500 ms): a new strand is a record in `state: draft`; an edit to an
  existing record is kept as a pending body in `meta` under
  `draft:<key>` until saved or discarded. Nothing unsaved is lost on
  reload, crash or service-worker update.
- **Two tabs.** Save compares the stored `updatedAt` with the one loaded;
  on mismatch the save is refused and both versions are shown to choose
  from. Tabs announce writes over `BroadcastChannel("loom")` and re-render.
- **Quota.** A failed write shows the error, keeps the draft in memory, and
  offers Backup.
- **Network.** Import and send name the URL and the status in every error;
  both are resumable; send is idempotent by dedupe key.
- **Service worker.** Versioned shell cache; a new version waits until no
  Compose has unsaved changes, then `skipWaiting` + `clients.claim` +
  reload.

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
