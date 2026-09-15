# Loom desk authoring — one environment to write and manage the String: design

Status: approved 2026-09-15. Corrected 2026-09-15 from the implementation prototype (see §12).
Builds on: [Phase 1 design](2026-09-14-loom-phase1-design.md) (the shipped app in `app/`, merged in PR #2).
Parent design: [`LOOM.md`](../../../LOOM.md) — §3 is revised by this document (§11 below).
Code lands in **this repository** under `app/`, after two small changes in **cultureblocs-string** (§8).

## 1 · Goal

Loom becomes a complete authoring and management environment for the
String. Your String is always in view; a new entry is written whole, in
one form, and saved once; any entry can be edited or deleted; and every
change — new, edited, kept, deleted — goes to the String on Send.

Success looks like: you never mint a bead and then edit it to finish it;
you can find, open, correct and remove any record on your String from one
page; and nothing Send does can silently overwrite a change made on the
String since you last saw it.

## 2 · Decisions taken

| Question | Decision |
|---|---|
| What is a new entry | **A full bead**, written in one form (kind, when, note, tags, place, photos, links, refs) and saved once. |
| String view | **Calendar stacked on a chronological entry list**, always visible. |
| Layout | **String in a left column**, editor filling the rest (desk). On a phone the same page stacks. |
| Mint | **Removed.** "+ New bead" opens the full form, on desk and phone alike. "Tell this" is removed too. |
| Management scope | **Edit any entry, keep/release proposals inline, create and edit strands, delete entries.** |
| Changes to sent records | **Sent on Send**: POST new, PATCH edits with If-Match, POST state, DELETE — conflicts shown for you to pick a side. |
| Strands | **"+ New strand"** opens the strand form; beads are attached by ticking them in the String column. |
| Ownership | **Every bead and strand on your String** is editable and deletable, whatever app made it; provenance is kept. Annotations stay read-only. |
| Approach | **Rework the Phase 1 app in place**: keep the data layer, replace the surfaces, extend send. |

## 3 · Out of scope

Field-by-field merging of conflicts and automatic two-way sync (Phase 2);
publishing and unpublishing (Phase 4 — a published strand cannot be
deleted from Loom); the resolver and suggestions rail, Feeds, Vault
(Phase 3); editing or deleting annotations; phone hosting over HTTPS;
undo beyond "undo delete" on a delete not yet sent.

## 4 · Architecture

The data layer of Phase 1 stays; the surfaces are replaced; send grows.

```
app/
  index.html  loom.css  loom.js     shell: top bar, two-column desk / stacked phone, routes
  lib/                              kept: tid hlc keys memstore store lexicons anchors media images backup routing
    envelope.js                     changed: createBead/createStrand, remove, undoRemove; mint/release/finish go
    day.js                          changed: list/calendar model, change detection (pending)
    importer.js                     changed: stringHlc, shared conflict marker, no mint-fact special case
    sender.js                       changed: plan and run POST / PATCH / state / DELETE
    string-client.js                changed: patchRecord, setState, deleteRecord (If-Match, 412)
    conflicts.js                    new: mark, compare, keep mine, take the String's
    migrate.js                      new: Phase 1 envelopes and backups → this model
  ui/
    view-string.js   string.js      new: calendar, entry list, filter, tick mode, proposal buttons
    view-bead.js     bead.js        new: the full bead form
    view-strand.js   strand.js      new: the full strand form with its items list
    view-refs.js                    kept (refs editor, publish hints)
    view-delete.js                  new: delete confirmation listing affected strands
    view-conflict.js                new: the two versions, field by field
    view-topbar.js   topbar.js      new: send count, Send, results, settings/backup menu
    html.js                         kept
    removed: view-thread thread view-mint mint view-compose compose
  sw.js                             cache `loom-3`, shell list updated
```

Views stay pure functions of state returning escaped HTML; controllers
are thin and mount into containers the shell owns (the Phase 1 pattern,
including serialised routes and `surfaceErrors`). No inline styles or
handlers: the CSP of Phase 1 is unchanged.

**Routes.** `#/` (selected day summary), `#/day/<YYYY-MM-DD>`,
`#/new/bead`, `#/new/strand`, `#/edit/<key>`, `#/send`, `#/settings`.
On desk every route renders into the editor column with the String
column always mounted; on a narrow viewport `#/` and `#/day/…` show the
String column and the rest show full-screen with a back link. The
posture setting is removed: layout follows width (breakpoint as today).

## 5 · Data model

### Envelope changes

```
state       proposal | kept | draft | published | edited
            (`released` is gone — see `deleted`)
origin      loom | mint | compose | import
            (`loom` for records made in the new editor; `mint`/`compose` remain on Phase 1 records)
stringHlc   the String's hlc as last imported or confirmed by a send — the If-Match value
stringKeys  the top-level keys of the String's body at that moment — so a PATCH can remove fields
deleted     true when deleted locally and not yet deleted on the String (tombstone)
conflict    { theirs: <String record as fetched>, at, reason: "import" | "send" }   (optional)
problems    [ the String's 422 problems from the last send ]   (optional)
```

Everything else in the Phase 1 envelope stays (`stringId`, `stringHash`,
`importedHash`, `importedState`, `missing`, `invalid`, `hlc`, …).

### Rules

- **One form, one save.** A new bead or strand exists only as a draft in
  `meta` (`draft:new:<key>`, the key's TID reserved when the form opens)
  until Save, which runs the validation gate and writes the record whole.
  The draft is listed at the top of its day with a "draft" marker, and
  can be discarded.
- **New bead body.** `createdAt` is the form's date/time (defaults to
  now); `provenance = { app: "loom", device, mintedAt: <moment of Save>,
  timeAnchored: <true when the date/time was left at now> }`; state
  `kept`; origin `loom`.
- **New strand body.** `createdAt` = moment of Save, `day` from the form,
  `items` from the ticked beads in order; state `kept`.
- **Provenance is fixed.** Save refuses a body whose `provenance` differs
  from the stored one; the form shows provenance read-only. Content is
  editable on any bead or strand, whatever its `sourceApp`.
- **Editing a proposal keeps it** (unchanged, and what the String's PATCH does).
- **Delete.**
  - No `stringId`: the record and its draft are removed after confirmation.
  - With a `stringId`: `deleted: true`; hidden from the String column and
    calendar counts; listed under Send with "undo delete".
  - Releasing a proposal is a delete (the String's own semantics).
  - A bead referenced by strands: the confirmation lists them, and the
    delete removes the bead's item from each (a normal save of each strand).
  - Refused for `state: published | edited` ("unpublish it first") and for
    annotations.
- **Pending change** (drives the send count), for a record that is not a draft:
  - *new* — no `stringId`;
  - *edited* — `stringId` and body hash ≠ `importedHash`;
  - *state* — `stringId` and state ≠ `importedState`;
  - *delete* — `deleted`.
  A record in `conflict` is not pending until resolved.
- **Import.** Stores `stringHlc`. A record deleted locally is never re-added
  or updated by import. A both-sides change sets `conflict`
  (`reason: "import"`) instead of being skipped and listed. The Phase 1
  rule that String edits to `origin: mint` bodies are always conflicts is
  dropped; a provenance change on the String is still a conflict.
- **Migration** (`migrate.js`, run on open and on restore of a Phase 1
  backup): `released` → `state: proposal, deleted: true`; `posture`,
  `masks`, `mask` meta removed; Phase 1 drafts (`draft:<key>`) kept.
  `stringHlc` is absent until the next import; Send treats a missing
  `stringHlc` as "fetch the record first and use its hlc only if its body
  hash equals `stringHash`", otherwise conflict.

## 6 · Surfaces

### Top bar
Loom · String status (`N changes ▸ Send`, or "in sync", or "not connected")
· menu (settings: String URL and token, check, import; backup, restore).
Send results appear under the bar, one line per record (sent, edited,
state, deleted, held: reason, conflict, invalid), each opening the record.

### String column
- **+ New bead**, **+ New strand**, a filter box (text, kind, source app).
- **Calendar**: month grid, days with entries tinted with a count, selected
  day filled, month arrows. Picking a day scrolls the list to it.
- **Entry list**: newest first, grouped under day headings, continuous
  (loads further days as you scroll). A row: kind or "strand", first line
  of note or title, markers for photo, proposal, draft, not sent, changed,
  conflict, invalid. Proposal rows carry **keep** and **release**.
- **Tick mode**: while a strand form is open, bead rows show a tick box;
  ticking appends the bead to the strand's items, unticking removes it.

### Bead form
kind (the ten lexicon kinds), date and time, note (3000 graphemes, with
anchored refs), tags (≤ 8), place (name, and lat/lng/precision when
given), photos (≤ 10, alt text each; resized as in Phase 1), links (≤ 8),
refs (the Phase 1 refs editor with publish hints). Below: provenance
(read-only), problems, **Save**, **Delete**, **Discard draft** (when a
draft differs from the saved record).

### Strand form
title (300), day, narrative (10 000, anchored refs), place, links, refs,
**Items**: the attached beads in order, each with ↑ ↓ and remove; ticks
in the String column add. Same footer as the bead form.

### Conflict view
Shown in place of the form's footer for a record in `conflict`: each
changed field with *yours* and *the String's* side by side. **Keep mine**
(send your body with `If-Match` = the String's current hlc) or **Take the
String's** (replace local with theirs; the draft, if any, is kept as a
draft so nothing typed is lost).

### Delete confirmation
What will be deleted, whether it is on the String (deleted on next Send),
and the strands it will be removed from.

### Phone
The String column is the home screen; forms, Send and settings open
full-screen with a back link. Same markup, stacked by CSS.

## 7 · Send

### Plan (pure: `planSend(records)` → `{ ready: [op], held: [{ key, reason }] }`)

Operations, in this order:

1. **media** — photos referenced by ready records and not yet on the String.
2. **post** beads (new), then **patch** beads (edited).
3. **post** strands (new) and **patch** strands (edited); items rewritten
   `loom://` → `spine://records/<id>`; held while an item has no
   `stringId` and is not posted earlier in this plan.
4. **state** changes (a proposal kept without an edit).
5. **delete** strands, then **delete** beads.

A record is held while it is a draft, in conflict, or waiting for items.

### Operations

| op | request | success | safe retry |
|---|---|---|---|
| post | `POST /records` with `dedupeKey loom:<rkey>`, `sourceApp loom` | created or duplicate (hashes from the String's stored body, as Phase 1) | dedupeKey |
| patch | `PATCH /records/{id}` `{ fields }`, `If-Match: <stringHlc>`; removed fields sent as `null` | 200: store the returned hlc, hashes, state | 412 whose `current` body hash equals ours → success |
| state | `POST /records/{id}/state` | store returned hlc and state | same state already → success |
| delete | `DELETE /records/{id}`, `If-Match: <stringHlc>` | remove the local record | 404 → success |

`fields` is Loom's whole body (items rewritten to `spine://`) plus `null`
for each key in `stringKeys` — the top-level keys of the String's body,
stored on import and after every send — that Loom's body no longer has.
A record without `stringKeys` (migrated from Phase 1) has its String
record fetched first to learn them.

After each success the envelope is updated on a fresh read (the Phase 1
rule: an edit saved while a request was in flight survives and reads as a
new change).

### Failures

- **412** → `conflict = { theirs: current, reason: "send" }`.
- **422** → `problems` set, shown in the form, record stays pending.
- **404 on patch or state** → conflict with `theirs: null` ("deleted on the
  String"): Keep mine re-posts it as new; Take the String's removes it locally.
- **Network / 5xx / timeout** → stays pending; the result line says so;
  Send can be pressed again.
- **401/403** → Send stops with "check the token in settings".

## 8 · Changes to cultureblocs-string

One branch and PR in `cultureblocs-string`, landed before the Loom branch:

1. **PATCH removes null fields.** In `PATCH /records/{rid}`, a field whose
   value is `null` is removed from the body; validation runs on the result.
   `db.patch` applies removals in the same UPDATE.
2. **DELETE honours If-Match.** `DELETE /records/{rid}` with `If-Match:
   <hlc>` deletes only if the stored hlc matches (enforced in the DELETE
   statement), otherwise 412 with the same detail shape as PATCH. Without
   the header, behaviour is unchanged.

Tests in pytest for both, including the unchanged no-header paths. Tests
never touch `data/string.db` or the String on :8100.

## 9 · Error handling

- Every controller uses `surfaceErrors`; a failed route shows its error in
  its own container only.
- Save with problems is disabled, with the problems listed.
- Changing selection flushes the current draft first; a draft never blocks
  navigation.
- Delete, release and "take the String's" ask for confirmation; nothing
  else does.
- Restore refuses while a Send or import is running (as Phase 1).
- Storage failures show "not saved — this browser's storage refused the
  write" and keep the form's content on screen.

## 10 · Testing

**Unit (`node --test`, memstore, fake String):**
- envelope: createBead/createStrand in one save; provenance fixed; draft
  for new records; remove with and without `stringId`; undo delete;
  cascade from bead delete into strands; refusal for published and
  annotations.
- day: calendar counts and list grouping ignore deleted; filter; pending
  classification for each kind of change.
- importer: `stringHlc` and `stringKeys` stored; deleted records untouched; both-sides
  change sets `conflict`; mint special case gone; provenance change is a
  conflict.
- sender: plan ordering and holds; each op's success, safe retry and
  failure (412, 422, 404, network, 401); null fields for removals;
  updates on fresh reads.
- conflicts: keep mine; take the String's with a draft preserved; deleted
  on the String.
- migrate: Phase 1 envelope with `released`; Phase 1 backup restores.
- views: bead form, strand form with items, string column (markers, tick
  mode), conflict view, delete confirmation, top bar — escaping and no
  inline styles.
- The fake String gains PATCH (with null removal and If-Match), state,
  and DELETE with If-Match and 412.

**String (pytest):** null removal; DELETE If-Match match, mismatch, absent.

**Chrome end-to-end** against a throwaway String container started from a
copy of the database (never `data/string.db`, never :8100):
1. Upgrade from a Phase 1 profile: `loom-3`, records kept, released
   proposals now pending deletes.
2. New bead in one go with photo, place, tags and an anchored ref; Send;
   the String holds it whole.
3. New strand by ticking three beads and reordering; Send; `spine://` items.
4. Edit a Rounds bead's note and remove its tags; Send; the String's body
   changed and tags gone; provenance unchanged.
5. Keep a proposal; release another; Send; state and delete on the String.
6. Delete a bead used by a strand; Send; strand patched, bead deleted.
7. Change a record on the String, edit it in Loom, Send → conflict; resolve
   with Keep mine on one and Take the String's on another.
8. Import after all of the above: nothing added, nothing pending.
9. Phone width: String home, form full-screen, back.
10. No CSP violations throughout.

## 11 · Changes to LOOM.md

- **§3** surfaces: replace Thread / Mint / Compose with *the desk* — String
  column, editor, top bar — and state that a new bead is written whole.
  Remove *posture*; the phone stacks the same page.
- **§3 "Two ways in, one mint fact"**: becomes *one way in*: the full bead;
  the mint fact is its provenance, fixed at Save, while its content stays
  editable. "Tell this" is replaced by building a strand from ticked beads.
- **§10** build order: insert this work after Phase 1 as *Phase 1b — desk
  authoring*, noting Send now carries edits, state and deletes ahead of
  Phase 2 sync.
- **§11** open questions: close "no timeline on the phone".

## 12 · Corrections from the prototype (2026-09-15)

The plan's code was built and run end to end before the plan was written.
Where it differs from the sections above, this section is the design.

- **Files.** The pure views are `ui/view-string.js` (String column),
  `ui/view-bead.js`, `ui/view-strand.js`, `ui/view-form.js` (what both forms
  share: fields to body, photos, provenance, footer, read-only) and
  `ui/view-panels.js` (day, delete confirmation, deleted record, conflict,
  top bar, Send page, settings). The controllers are `ui/string.js`,
  `ui/editor.js` (one controller for both forms, new and existing),
  `ui/pages.js` (top bar, Send page, day page, `sendAll`) and
  `ui/settings.js`. `lib/routing.js` keeps only the route serialiser.
- **Drafts of new records** live under `draft:<key>` like any draft, with
  the record's `type` stored in the draft; `loom.newDrafts()` lists the
  ones with no record yet. `#/new/bead` and `#/new/strand` reserve a key
  and replace themselves with `#/edit/<key>`, so a reload keeps the draft.
- **Envelope API.** `newKey(type)`, `createBead(key, body, { timeAnchored })`,
  `createStrand(key, body)`, `save`, `keep`, `remove(key)` → keys of the
  strands changed, `undoRemove`, `strandsUsing`, `saveDraft(key, body,
  baseUpdatedAt, type)`, `newDrafts`. A strand losing a deleted bead is
  rewritten with its state untouched. Saving a Phase 1 `draft` strand that
  never reached the String keeps it; a `draft` from the String stays a
  draft.
- **`stringMedia`** joins `stringHlc` and `stringKeys`: the photos the
  String's copy uses, so a PATCH uploads only new ones.
- **Import** also refreshes `stringHlc`, `stringKeys` and `stringMedia`
  on a record that is unchanged but was restamped on the String (a
  publish restamps without changing the body).
- **Send** fetches the String's record after every POST, for its hlc. A
  PATCH or state change answered 404 is a conflict with nothing on the
  String's side; a delete taken back while its DELETE was on its way is
  the same. Keep mine on such a record posts it again under its own
  `sourceApp`.
- **Place.** The forms edit a place's name. A place's other parts (DID,
  coordinates) are kept as they are and shown, not edited; coordinates
  carry a fuzzing duty (defs#geo) that a free form should not take on.
- **Send results** show on the Send page (`#/send`), which the top bar's
  Send opens, with the waiting changes and "undo delete".
- **The entry list** renders every day and scrolls the column to the
  selected day; no paging was needed for a String of a few hundred records.
- **Release** in the String column asks with a second press, as Phase 1 did.
- **Another tab's save** while a form is open is shown in the form's
  status line with "use the newer version" and "save mine over it",
  separately from a String conflict.
- **Confirmations.** Delete asks in a panel below the form; release (in
  the column) and "take the String's" (in the conflict view) ask with a
  second press. "Keep mine" does not ask: nothing is lost by it.
- **A failed write** shows the browser's own message in the form's status
  line ("draft not saved: …" for a draft), and the form keeps what was typed.
