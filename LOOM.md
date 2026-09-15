# Loom — one interface for the string

*A local-first app where the whole loop lives in one place: what the
machines propose, what you mint, what you write, what you publish.
Named for the frame that holds the threads while you work them —
the beads are already there; the loom is where they become cloth.*

Status: **design, not built.** Nothing here is committed to yet. This
document is the argument and the plan; it names what changes in the
String, what stays, and what it deliberately does not do.

Three decisions taken up front, which everything below follows from:

1. **The String becomes a personal sync server.** Loom's canonical data
   is local. The String stops being the source of truth and becomes an
   optional, user-owned sync-and-publish backend, discovered from your
   own repository. Loom works completely with no String at all.
2. **Credentials sync across devices**, encrypted with a key the String
   never sees — with one honest exception, named in §5.
3. **Nothing is retired.** Timeline, Studio, Pocket and Easel keep
   running. Loom is built alongside; daily use decides the rest.

---

## 1 · Where this comes from

Two lineages meet here.

**The String's own.** The three principles in the README —
local-first, own your data, privacy by default — are already enforced
by architecture. The wire format is already the federation format.
Records are already lexicon-validated and already stored under their
NSID. Very little of what follows is new philosophy; most of it is
finishing what the String started.

**Groundmist** ([groundmist.xyz](https://groundmist.xyz/), the three
essays by grjte) contributes the part the String has not done, which is
to say what the *client* is allowed to assume:

- **Distribution layer.** Data stays private and local; ATProto login
  exists *only* to publish. This is exactly the String's Stage F, and
  exactly Pocket's OAuth path — already the house pattern.
- **Legibility layer.** Lexicons are the shared understanding, and they
  apply to *private* data too, not just published records. Interfaces
  can then be produced independently of servers: an AppView needs the
  data and the schema, never your rendering code.
- **Interoperability.** The move from an *app-specific* sync server —
  every user of one app on one box — to a **personal sync server**: one
  person's data from many apps converging in a store they own, keyed by
  lexicon path, authorised by their own DID.

Groundmist's prototype syncs Automerge documents into lexicon-named
directories, authenticating against the user's PDS and discovering the
sync server from it. The String is most of that already. It has the
lexicons, the NSID-keyed store, the append-only change feed, the
publish pipeline. What it lacks is: sync in the other direction, an
identity-derived authorisation model, a discovery record, and any
client that can survive without it.

Loom is that client. Making it means finishing the String into a PSS.

---

## 2 · Review of what exists (and what Loom must fix)

Read honestly, because these are the constraints the design has to
answer, not a complaint about work that has served well.

*Every file path in this section is in the sibling repository,
[`cultureblocs-string`](https://github.com/geocontrol/cultureblocs-string).*

**Good, and to be kept**

- `string/app/lexicon.py` — a real validator, small, understandable.
- `/changes` with a cursor — the sync substrate is already there, and
  was clearly built with this in mind ("the upgrade path to CRDT/PDS
  promotion later").
- `publisher.py`'s strip rules — geo, provenance, media, device ids
  never leave. This is the most important code in the repository.
- Easel — already the shape Loom needs: IndexedDB, content-addressed
  blobs, drift against `publishedCanonical`, OAuth with a
  non-extractable DPoP key. Loom is Easel's architecture applied to
  beads and strands. `easel/oauth.js`, `easel/lib/store.js`,
  `easel/lib/rkey.js` and `easel/lib/image.js` port almost unchanged.

**Problems Loom's design has to answer**

| | Where | What |
|---|---|---|
| R1 | `db.py: upsert` | Existing `dedupeKey` returns `duplicate` and writes nothing. Correct for mint facts; wrong for connector proposals, which cannot be corrected on a re-run. Loom needs *revisable proposals* and *immutable mints* to be different things. |
| R2 | `db.py: identities` | App passwords sit in plaintext SQLite. The README says so honestly. A synced credential store must not repeat this. |
| R3 | `main.py: auth` | `STRING_TOKEN` is one shared bearer for the entire surface. Any client holding it — a browser tab, a phone, a cron worker — can read every record and rewrite every identity. There is no scoping and no revocation short of rotating everything. |
| R4 | `main.py` CORS | `allow_origins=["*"]`. With a token set this is survivable; with the token unset ("home lab mode") any page you happen to visit can read and write `localhost:8100`. |
| R5 | `publisher.py`, `scripts/promote.py`, `scripts/export_public.py` | Three copy-pasted implementations of the bead/strand strip (Easel publishes only `creative.work` and has none). They agree today. Nothing enforces that they keep agreeing — and Loom will add a fourth, in JavaScript — and the failure mode is publishing something that should never have left. |
| R6 | `db.py: patch` | Shallow merge, last-writer-wins, no revision precondition. Two tabs — never mind two devices — silently lose each other's edits. |
| R7 | `timeline: isMachine` | `MACHINE_APPS` is a hardcoded array in the page. Every new connector means editing the UI to keep the dotted rail honest. |
| R8 | validation | Lives only on the server. A client that cannot validate offline is not local-first; it is a form that posts to an API. |
| R9 | `changes` | One-directional, and each row stores a full body. It grows without bound and carries no actor or device, so bidirectional sync would echo a device's own writes back at it. |
| R10 | `defs#workRef`, `bead`, `strand` | An entry can name a work in prose but cannot properly *reference* one. `#workRef` has a few fixed id slots (`wikidata`, `accession`, `linkedArt`) but no open `externalIds`, no role and no text anchor; `strand` has no ref field at all. Worse, a work has two homes on a bead — the declared `subject` union and an undeclared `work` field the timeline and `strip_bead` use — and `strip_bead` reduces `subject` to `{name}`, so a workRef subject never publishes. Two people writing about the same thing produce records that cannot be connected, so the corpus never becomes a graph. |

R3, R8 and R9 are the ones that actually block a local-first client.
R10 blocks something different: without it Loom is a very good private
diary and nothing else, and the whole argument for publishing rests on
entries finding each other. The rest are worth fixing on the way past.

*A note on R5 found while specifying R10.* The strip is an **allowlist**
at the top level and passes whatever it allows through whole. So the
realistic failure is a nested field riding out inside an allowed one —
`annotation.work.image`, a local `mediaRef` URI, publishes today — and,
for any new field, silently never publishing at all. The fixture suite
has to assert nested shapes, not just top-level keys.

---

## 3 · The shape of Loom

One responsive page, one codebase. Vanilla ES modules and IndexedDB, in
the manner of Easel and Pocket — no framework, no build step, served as
static files (`:8108` in compose; deployable to cultureblocs.com like
Pocket, because the OAuth client id must be a stable URL).

    ┌ The desk ──────── your String always in view, and an editor beside it
    │   String column   calendar, the entries newest first, filter, proposals
    │   Editor          a whole bead or a whole strand, in one form
    │   Send            every change for the String: new, edited, kept, deleted
    ├ Feeds ─────────── connectors, their last run, their proposals
    ├ Vault ─────────── identities, connector credentials, devices
    └ Publish ───────── what is public, what has drifted, what to send

**The desk, not surfaces to switch between.** Loom is where the String
is written and managed, so the String is never out of sight: a column
with a month calendar over the entries, newest first, where proposals
are kept or released in place. Choosing an entry opens it in the editor
beside the column; **+ New bead** and **+ New strand** open an empty form
there. On a narrow screen the same page stacks: the String column is the
home screen and a form opens over it, with a way back.

This replaces the earlier plan of a *posture* — a phone that opened on a
two-tap Mint button and a desk that opened on Thread. A bead is wanted
written whole, not minted and then finished, from the same page everywhere.

### One way in, one mint fact

**A bead, whole.** Kind, when it happened, note, tags, place, photos,
links and refs, in one form, saved once. Until Save there is only a
draft, in this browser; Save validates the record and writes it.
`provenance.app = "loom"` and `provenance.mintedAt` = the save. This is
the *mint fact*, and it is fixed: provenance never changes after Save.
The bead's content stays editable — a correction is an edit, recorded
as one — on any bead on your String, whichever app made it.

**A strand, whole.** A `com.cultureblocs.strand` composed as a diary
page: title, day, `narrative` (10 000 graphemes), place, links, refs,
and the beads it strings together. While a strand is open, the beads in
the String column carry tick boxes: ticking one puts it in the strand,
in order, and ticking a proposal keeps it. The beads do not change —
the strand points at them.

**Refs.** Both forms carry the refs editor (§9.7): what the entry is
about and what it reaches for, anchored in its text.

**Send.** Everything waiting goes to the String on Send — new records,
edits, proposals kept, records deleted — each against the version Loom
last saw, so nothing overwrites a change made on the String meanwhile:
that record is marked as a conflict, both versions are shown, and the
person chooses. Two-way sync (§5) replaces Send in Phase 2.

---

## 4 · Data model: local-first, lexicon-legible

### The local store

IndexedDB, one `records` store, keyed by NSID path — the same shape the
PSS will hold, so sync is a copy rather than a translation:

    key    com.cultureblocs.bead/3lqk2m4x7c22p
    value  { type, rkey, body, dedupeKey,
             createdAt, updatedAt, hlc, deviceId,
             state, origin,
             publishedUri, publishedCanonical }

- **`rkey` from birth.** A TID assigned locally at mint (`easel/lib/
  rkey.js` already does this), used as the record id everywhere. Publish
  then writes under the id the record already had, and `publisher.py`'s
  `_rkey_for` fallback dance becomes unnecessary for anything Loom made.
- **`state`** ∈ `proposal | kept | draft | published | edited`. Explicit,
  stored, synced — which retires R7. The dotted rail renders `proposal`,
  not a hardcoded list of app names.
- **`origin`** ∈ `loom | connector:<id> | import` (`mint` and `compose` on
  records made before the desk). Provenance for
  the UI; `body.provenance` remains the record's own, and still never
  publishes.
- **Blobs** content-addressed by SHA-256 in a second store, exactly as
  Easel does, with the same orphan sweep.
- **Resolver cache** in a third store (§9.6): authority lookups, local
  match history, per-ref `matchConfidence` and `clusterHint`, and
  candidate refs not yet kept. Derived state — not lexicon-validated,
  never synced as records, never published, same orphan sweep as blobs.
  A kept ref's confirmed status is expressed by its presence in the
  record body, so the `state` enum does not change.

### Legibility: the validator moves to the client

Port `string/app/lexicon.py` to `loom/lib/lexicon.js` and ship the
`com.cultureblocs.*` and `community.lexicon.*` JSON alongside the app.
Validation then happens at the point of writing, offline, before
anything is queued. The String revalidates on receipt — it must, since
it accepts writes from workers too — but Loom never depends on a server
to know whether a record is well-formed.

This is the legibility argument taken literally: the schema travels
with the app, so an AppView (or a second client, or an agent) needs the
data and the lexicon and nothing else.

*Test seam:* the same fixture set runs against `lexicon.py` under
pytest and `lexicon.js` under `node --test`, so the two validators
cannot drift. Same trick for the strip (R5): one JSON fixture file of
`{ input, expectedPublic }` pairs, asserted by both languages. If a
field is ever added to a lexicon and not to the strip, a test fails
rather than a coordinate leaks.

### Conflicts: HLC and last-writer-wins per field, with a shadow

Groundmist syncs Automerge documents. Loom should not, at least not
yet, and the reason is worth stating: this is a single-person diary
whose records are overwhelmingly append-only. The one place a CRDT
genuinely earns its weight is concurrent editing of a long text field —
`strand.narrative` — from two devices, which is a corner rather than
the common case.

So: **field-level last-writer-wins, ordered by a hybrid logical clock**
(`hlc` = `<physical ms>-<counter>-<node>`, fixed-width so string order is
causal order), which is a few dozen
lines and no wasm. When two devices did write the same field
concurrently, the loser is *not* discarded — it is kept as a conflict
shadow on the record and the UI says so, with both versions offered.
Silent loss is the thing to avoid; a merge algorithm is not the only way
to avoid it.

One exception to "per field": **`refs` and the text field its anchors
point into** (`strand.narrative`, `bead.note`, `annotation.note`) are a
single conflict unit, compared and won together. Otherwise one device's
narrative can win while another's refs win, and every byte offset
points at the wrong words.

The upgrade path stays open: `narrative` and `note` can later become
Automerge text documents stored beside the record, synced as binary
blobs through the same channel, without touching the envelope. Do it if
and when two-device editing actually hurts.

---

## 5 · Sync: the String as a personal sync server

Four changes to the String. None of them break the existing API, so
timeline, Studio, Pocket and the workers keep working throughout.

### 5.1 Discovery — no more typing a URL and a token

Publish one record to your own repository:

    com.cultureblocs.sync.server
      { endpoint: "https://brick.tailnet.ts.net", createdAt }

Loom, after ATProto sign-in, resolves your DID, reads that record, and
finds your String. Pointing a new device at your own data becomes:
sign in. This is Groundmist's discovery move, and it is the single
biggest daily-friction win in the whole design — the timeline's URL and
token boxes are the current answer, and they are why a second device is
a chore.

If the record is absent, Loom is simply a local app. That is a
supported, complete configuration, not a degraded one.

### 5.2 Authorisation — DID-scoped, NSID-scoped grants

Retire the shared bearer for interactive clients (R3):

- Loom obtains a **service-auth JWT** from your PDS
  (`com.atproto.server.getServiceAuth`, audience = the String's DID or
  configured identifier) and presents it. The String verifies the
  signature against the DID document. No shared secret ever reaches a
  browser.
- A **grants** table gives every non-interactive actor a scope:

      name       scrobbler
      subject    key:<hash>            # or a DID
      paths      com.cultureblocs.bead
      ops        write,propose
      expires    2027-01-01

  A connector that can propose listen beads cannot read your
  identities, cannot read your notes, and can be revoked by itself.
  This is the capability model the PSS essay describes, made concrete
  by the fact that our storage keys are already NSIDs.
- `STRING_TOKEN` remains for the transition and for workers that have
  not been migrated. CORS narrows to configured origins (R4).

### 5.3 Sync — the change feed learns to go both ways

`GET /changes` already gives a cursor. Add:

- `POST /changes` — a batch of ops `{ path, hlc, deviceId, op, body }`,
  applied with the same HLC rule the client uses, returning the server's
  cursor. Idempotent on `(path, hlc)`.
- `GET /sync` (WebSocket) — the same thing live: send a cursor, receive
  ops, push ops. Falls back to polling `/changes` where sockets are
  awkward.
- `changes` gains `device_id`, `actor` and `hlc` columns, so a device
  filters its own echo (R9), and a compaction job collapses superseded
  update rows for a record beyond a retention window.
- `patch` takes an optional `If-Match: <hlc>` precondition (R6).

Records the connector framework produces arrive with `state:
"proposal"`, which is revisable on re-run — R1 — while anything with
`origin: "mint"` keeps today's insert-once behaviour. The mint fact
stays immutable because it is *declared* so, not because the store
cannot express an update.

### 5.4 What does not change

The String stays FastAPI and SQLite WAL on your own hardware
(`HOST-SPEC.md` is unaffected — the DataBrick is the natural home for a
personal sync server, and this design makes that framing literal). The
AppView stays an index of *public* references only. Publishing stays a
deliberate act with the same strip.

One corollary from §9.6: the AppView indexes public refs, but Loom
**resolves locally first** and never needs the AppView to know what an
entry is about. The AppView's "no identity resolution beyond DIDs" rule
holds because a person's name only publishes when it already carries a
DID or a public-authority identifier (§9.8) — it clusters works, events,
venues and concepts by descriptor, and people only by identifiers they
already have.

---

## 6 · The vault: credentials that sync

The answer to "sync tokens", and the fix for R2. The distinction that
makes it honest is **who has to be able to read the secret**.

**Device credentials — end-to-end encrypted; the String stores
ciphertext and can never read it.** Your ATProto OAuth session, and any
connector Loom can run in the browser.

- A vault key derived from a passphrase (PBKDF2-HMAC-SHA256 via
  WebCrypto, or Argon2id in wasm if we take the dependency), never
  transmitted.
- Records under `com.cultureblocs.vault.item`, body
  `{ label, kind, createdAt, cipher: { alg, iv, ct } }`. The *schema* is
  public and published like every other lexicon; the *payload* is
  opaque bytes.
- A second device: sign in, enter the passphrase, and the connectors
  and identities are there. This is the whole feature.
- The DPoP private key stays non-extractable per device and is never
  vaulted — a session is re-established per device by design.

**Host credentials — plaintext to your own machine, sealed at rest.**
A Last.fm API key, an IMAP password, anything a server-side connector
must present while your laptop is shut. These *cannot* be end-to-end
encrypted; a server that must use a secret must be able to read it.

- Loom decrypts locally and *releases* the credential to the String in a
  deliberate, labelled step — the same grammar as publishing a strand.
- The String seals it at rest under a host key held outside the
  database (file with `0600`, or the OS keyring), so a stolen backup is
  not a stolen credential. This also retires R2 for the existing
  `identities` table, which should move behind the same seal.
- The UI marks these credentials **released to the host** and says
  plainly what that means. Nothing pretends to a guarantee it cannot
  make.

Migration for existing identities: read plaintext, write sealed, on
first start after the upgrade.

Authority API keys (TMDb and the like, §9.6) are **host class** by this
taxonomy. No new vault machinery.

---

## 7 · Feeds: connectors that propose

Generalise the scrobbler into a framework, and keep the ROADMAP's
sharpest rule intact — **proposals are not facts, and only a person
keeps them.**

### A connector is a manifest plus a runner

    id             lastfm
    name           Last.fm scrobbles
    credentials    [{ key: "api_key", label: …, class: "host" },
                    { key: "user",    label: …, class: "host" }]
    schedule       hourly
    produces       com.cultureblocs.bead
    dedupeKey      scrobble:{user}:{sessionStart}
    provenance     { app: "lastfm" }
    state          proposal

`workers/scrobbler.py` becomes the first instance almost unchanged: it
already clusters, already mints one bead per closed session, already
has an idempotent dedupe key, already only closes complete sessions.
What it gains is registration, a scoped grant instead of the master
token, and a `state` it sets explicitly instead of the timeline
inferring it from an app-name list.

### Where runners live

- **Host runners** (default): registered with the String, scheduled by
  systemd timers as today. Required for anything needing a credential
  the browser cannot hold or a poll while you sleep — Last.fm, IMAP.
- **Client runners**: run inside Loom against CORS-friendly APIs with
  device credentials. Useful for connectors nobody wants to hand a
  server, and the reason the manifest names a credential *class*.

Same manifest either way; the runner location is a property, not a fork.

### The Feeds surface

One list: each connector, its last run, its next run, how many
proposals are waiting, and a switch. Then a **review queue** — the
dotted rail, gathered in one place instead of scattered through the
days. Keep, discard, or keep-and-tell (which opens Compose with the
bead attached). A connector that has produced nothing for a week says
so; a connector whose credential expired says that instead of failing
quietly, which is the scrobbler's current behaviour and a real source
of missing history.

### Connectors worth specifying next

| Connector | Produces | Notes |
|---|---|---|
| Last.fm | `listen` beads | exists; port first |
| Booking mail | `booking` beads | ROADMAP §2; JSON-LD `EventReservation` in most confirmations. Future tense — the stub before the show |
| Browser extension | `note` beads with links | the del.icio.us gesture; posts to Loom's local store via the same grant model |
| Letterboxd / Trakt | `watch` beads | RSS is enough; no credential class beyond a username |
| Calendar | context, not beads | *shows* what you had on that day beside the thread, and never mints. We are not replacing calendars |

The calendar row matters: a connector is allowed to be *context only*.
Not every feed has to produce a record.

That makes three connector classes, named in the manifest's `produces`:

- **produces records** — Last.fm, booking mail, Letterboxd.
- **context only** — calendar.
- **proposes refs** — the resolver (§9.2). It reads records rather than
  minting them, and its output lives in the resolver cache until a
  person keeps a ref. The review queue gains a refs tab.

---

## 8 · Publishing

Unchanged in intent, moved in place. Loom publishes client-side, as
Easel and Pocket already do, using the OAuth session — so the String is
not required in order to publish, and a Loom user with no String at all
still has the full loop.

- One canonical strip in `loom/lib/strip.js`, fixture-tested against
  `publisher.py` (R5).
- Drift against `publishedCanonical`, exactly Easel's model — the
  timeline's per-strand publish/republish/unpublish becomes a Publish
  surface listing everything public and everything that has moved since.
- One-click publish for a lone bead (ROADMAP §1) falls out for free:
  it is an auto-titled single-item strand, and Compose already builds
  strands.
- The round trip (`scripts/import_repo.py`) becomes a Loom action:
  pull born-public beads home to be told, republish in place.
- Refs publish under the rules in §9.8, fixture-tested in both
  languages alongside the rest of the strip.

---

## 9 · Referents

*What an entry is about, as data rather than as prose.* Fixes R10. It
sits after Publishing because the strip rules in §8 are a precondition
for publishing refs at all.

### 9.1 The problem

A strand's `narrative` can say that the book was Ben Pester's *The
Expansion Project*, that it rhymes with *Severance* and with a couple
of early *Twilight Zone* episodes, and that its ancestry runs back
through the SF New Wave to Priest, Harrison and Ballard. All of that
is legible to a human reader and invisible to everything else.

Prose does not join. Two people write two paragraphs about the same
film and there is no common key anywhere in either record. The
referent layer is that key: a small structured array beside the text,
naming the things the entry is about and the things it reaches for.

The text is never rewritten. No wikilinks, no inline markup, no
square brackets. A ref is metadata *alongside* the text, so the
narrative stays editable, translatable and plain, and a reader that
ignores refs entirely still renders a diary entry correctly.

This is the move ATProto already makes with `facets` on a post: byte
range plus feature, text untouched, rendering left to the client. The
lexicon description says so, and the anchor uses facets' field names,
because anyone who has implemented facets has already implemented most
of this.

### 9.2 Refs are proposals

**A candidate ref is exactly what §7 already describes.** A machine
suggests, a person keeps, the dotted rail renders it as a proposal.
The extractor is a connector: it registers with a manifest, runs on a
schedule or on demand, and differs from the scrobbler only in that it
proposes refs rather than records.

What follows:

- **No seventh surface.** Compose grows a rail; Feeds gains a
  `resolver` row; §7's review queue gains a refs tab.
- **Candidates never enter a record.** Proposals live in the resolver
  cache (§4). Only a ref a person has kept is written into the record
  body, so nothing unconfirmed is ever lexicon-validated, synced as a
  record, or published.
- **Candidates do not sync.** They are regenerable from the text. A
  second device re-runs the extractor rather than receiving another
  device's guesses; the kept refs arrive with the record.
- **R1 does real work.** Re-running the extractor over an edited
  narrative *should* revise its proposals. A ref already kept must not
  be touched — the revisable-proposal / immutable-mint split, one level
  down.

### 9.3 `defs#ref`

A new shared definition:

```
defs#ref
  type         person | work | event | venue | concept     knownValues
  role         subject | mention
  descriptor   { label, creator?, creatorDid?, date? }     required
  did          DID of the referent itself                  optional
  externalIds  [ defs#externalId ]                         optional
  index        { byteStart, byteEnd }                      optional
```

`descriptor` is required and is the portable payload; everything else
is an optimisation. A ref with nothing but a label and a creator is
valid and clusterable — badly, but clusterable — and publishes its label
(the creator's name waits for an identifier, §9.8). The long
tail is the point: the zine bought at a fair, the noise gig in a
basement, the Bandcamp-only tape. None have identifiers and all belong
in the diary. `label` rather than `title` because a person or a
concept has no title; `date` is freeform, exactly as in `#workRef`.
`did` identifies the referent itself — a person, or a venue with an
account — while a work's maker goes in `descriptor.creatorDid`.

There is **no `note`** in the descriptor. A free-text field written by
the author is subject to no strip, and "saw this with J after the
thing at hers" is exactly what would end up in it.

**`externalIds` reuses the existing `defs#externalId`** (`{ scheme, id,
uri? }`) rather than inventing a second shape. Its `knownValues` grow
by `isbn`, `olid`, `tmdb`, `linkedArt` and `accession`; the existing
`wikidata`, `musicbrainz` and the rest stand. The vocabulary is open —
an unknown scheme is carried, not rejected.

**Resolver bookkeeping is not in the lexicon.** `matchConfidence` (how
sure the resolver was) and `clusterHint` (the AppView's cluster id)
live in the resolver cache, keyed by record path and ref, never in the
body. Neither should ever publish, the public def stays clean, the
name no longer collides with `annotation.matchConfidence`, and there is
no float in an ATProto record. A cluster id is also **never the
identity**: if refs joined on cluster ids the graph would only exist
through one AppView. Any indexer must be able to rebuild it from
`descriptor`, `did` and `externalIds` alone.

**Where `refs` goes.** `refs` (array, `maxLength` 50) is added to
`bead`, `strand` and `annotation`, and **refs owns works**:

- A work, person, event or concept an entry is about is a ref with
  `role: subject`.
- `bead.subject` narrows to what it already carries in practice —
  `#placeRef` and `#strongRef`. `#workRef` leaves the union.
- `#workRef` is deprecated. Readers map an existing one to
  `{ type: work, role: subject, descriptor: { label: title, creator,
  creatorDid, date }, externalIds: [wikidata, linkedArt,
  accession…] }`. Existing data needing migration: one annotation's
  `work`, and zero beads. The undeclared `bead.work` field used by the
  timeline and `strip_bead` is retired in the same step.
- `annotation.work` stays required for now — it is the AR gallery's
  contract — and is mirrored as a subject ref on write until that
  surface migrates.

A strand's refs are *not* the union of its beads' refs. The Ballard
mention belongs to the telling, not to any bead.

### 9.4 Subject and mention

`role` is the highest-value field in the def and the cheapest to
implement.

- **subject** — what the bead or entry is *about*. Usually one,
  occasionally two.
- **mention** — invoked, compared, gestured at.

Without it the Pester entry deposits nine refs of equal weight, and
*Severance*'s cluster fills with entries by people writing about
something else. Every well-known work accumulates a fog of entries not
about it, and evidence weighting stops meaning anything: a mention is
not a watch, not a read, not an attendance. Readers do the obvious
thing — reads shown prominently, "mentioned in" as a quieter shelf.

**Deliberately not doing:** typed relations. `influencedBy`,
`resembles`, `descendsFrom` are where twenty years of semantic web
effort went. Subject versus mention is unambiguous, needs no ontology,
and captures nearly all of the value.

### 9.5 Presentation

A new optional object on `bead`:

```
presentation
  format      string, knownValues hints     "IMAX 70mm", "35mm", "streaming", "hardback"
  venueRef    defs#ref (type venue)         optional
  eventRef    defs#ref (type event)         optional
```

Two people log the same film. The work ref is identical, which is what
connects them. One saw it at the Peckhamplex, the other on IMAX 70mm,
and one of them found it awe-inspiring. The work explains why they are
in the same conversation; the presentation explains why they disagree.

This is the manifestation layer. Record at the level the person knew —
"I read *The Left Hand of Darkness*" is a complete claim and nobody
should be made to pick an edition — but capture the edition when they
do know it, because an index can generalise upward and never downward.
For film and live work the manifestation is a screening or a
performance, which is an event: hence `eventRef`.

`venueRef` is a *reference* to a venue, not a location, and carries no
coordinates. `bead.subject`'s `#placeRef` remains where-you-were, with
geo, stripped to its name as today. The two can name the same place;
only one of them can ever carry a coordinate.

### 9.6 Resolution: local first

Resolution cannot be an AppView-only concern. A background task
querying Wikipedia and TMDb as you type transmits the contents of an
unpublished — possibly never-to-be-published — draft to third parties,
continuously. The strip exists to stop exactly that class of leak, and
this would route around it. So:

1. **Extraction is local.** A small model in the browser or on the
   host. Never a remote call.
2. **Resolution hits the local cache first** — everything this person
   has resolved before, plus whatever the AppView has synced.
3. **Remote authority lookups are explicit and batched**, on opening
   the rail, never per keystroke. Optionally proxied through the String
   so upstream sees a service, not a user.

**Wikidata is the hub, everything else is a spoke.** It already carries
cross-references to OpenLibrary, MusicBrainz and TMDb, so one lookup
gets the set. IMDb is not used — proprietary ids, no reusable public
API, hostile terms. Authority API keys are host credentials (§6).

### 9.7 The refs rail

Compose gains a rail listing what the extractor found: the detected
string, the proposed type, and candidate referents with their member
counts from the AppView where available.

- **Default every candidate to off.** The Pester entry surfaces fifteen.
  Unticking fourteen is worse than ticking three.
- **Never ask twice for what an answer implies.** Keeping *The
  Expansion Project* fills its descriptor's `creator` with Ben Pester
  from the work record. It does not add a separate person ref — that
  would be a second claim the person did not make.
- **Unresolved is publishable.** Never gate publishing on resolution.
  When someone else later resolves the same string confidently, the
  entry surfaces in a backfill queue: *12 of your entries now have
  suggested matches.* A pleasant optional activity, not a tax on
  capture.

**Narrow screens.** The refs editor sits inside the form; there is no
separate rail on a phone (§3).

**Reverse entry.** Compose is prose first, entities extracted
backwards. Mint from a search box is the other direction: resolve
first, then write into a bead already connected. Totem beads need the
first because the totem does not know what you watched; manual entry
usually wants the second.

### 9.8 Strip rules

R5 territory: the fixtures land in the same commit as the lexicon
change. Because the strip is an allowlist that passes allowed values
whole (§2), refs are **stripped per item and per sub-field**, not by
allowing the `refs` key.

| Field | Publishes | Why |
|---|---|---|
| `type` | yes | needed to render and to cluster |
| `role` | yes | the whole point of the distinction |
| `descriptor.label`, `.date` | yes | the portable payload |
| `descriptor.creator` | **only if identified** | a maker's bare name may be a private individual — see below |
| `descriptor.creatorDid` | yes, if a well-formed DID | a public identifier by definition |
| `did` | yes, if a well-formed DID | a public identifier by definition |
| `externalIds` | yes — on person refs, authority schemes only | what makes matching free; see below |
| `index` | yes | readers need it to render inline |
| anything else on a ref | **no** | unknown fields never ride out |

Three rules protect people who never chose to be in the atmosphere. The
strip enforces each in both languages, and the shared fixtures assert
both halves of each.

**A person's name publishes only if they are already public.** A
`type: person` ref publishes only when it carries a well-formed `did`, or
an `externalId` from a **public authority** — a registry of people who
are already public figures:

    wikidata · viaf · isni · orcid · musicbrainz · discogs · ipi

On a person ref, ids from any other scheme — an email, a handle, a
phone number, a scheme nobody has heard of — are dropped at publish,
even when an authority id is present, and do not count towards being
identified. A bare-name person ref ("J") is kept locally, works in the
diary, and is dropped by the strip. This is also what keeps the AppView
inside its own "no identity resolution beyond DIDs" rule.

**Unrecognised types are treated as people.** `type` is an open
vocabulary, so the rule above cannot key on the literal string `person`:
`"Person"`, `"individual"` or a resolver's typo would walk straight past
it. Any ref whose type is not `work`, `event`, `venue` or `concept` is
held to the person rule — it publishes only if identified, with
authority ids only — and publishes its `type` as authored when it does.
Works, events, venues and concepts keep the open id vocabulary
(`isbn`, `tmdb`, `accession`…), because those identify things, not people.

**A maker's name publishes only when the work is identified.** A
`descriptor.creator` is a bare name, and "a painting by J" names a
private person as surely as a person ref does. It publishes when the
maker is identified by a well-formed `creatorDid`, or when the thing
itself is identified — its own well-formed `did`, or an external id that
survives the strip — because then the maker's name is already public
record. Otherwise the label publishes and the creator stays local. The
same rule applies to the deprecated `annotation.work` (identified by
`creatorDid`, `wikidata`, `linkedArt` or `accession`).

This costs the long tail something real: the zine bought at a fair and
the Bandcamp-only tape publish without a maker's name, so they cluster
on title and date alone until someone resolves them. That is the right
way round — the backfill queue (§9.7) can add a name later; nothing can
take one back out of the atmosphere.

`presentation.format`, `.venueRef` and `.eventRef` publish, the refs
under the same per-field rules. None carry coordinates; the geo strip
is unaffected.

### 9.9 Offsets

`index` uses **UTF-8 byte offsets**, matching ATProto facets, and
anchors into the record's own text: `narrative` on a strand, `note` on
a bead or annotation.

Text limits are in *graphemes*. These are different units, and mixing
them is a bug that surfaces the first time someone writes about a film
with an accented title. There is a second trap already present:
`lexicon.py` enforces `maxGraphemes` with `len()`, which counts code
points. The JS port must match whatever Python does, and the fixture
suite includes accented, combining-mark and emoji cases so the two —
and the byte offsets — cannot drift.

**Editing.** When the text changes, the client re-anchors each ref by
finding its previously anchored substring; if it cannot, the `index`
is dropped and the ref stays. A lost anchor is cosmetic; a wrong one
underlines the wrong words. `refs` and its text are one conflict unit
for sync (§4).

---

## 10 · Build order

Each phase ends somewhere usable. Nothing is retired at any point.

**Phase 0 — foundations, no new app.** *Small, and valuable even if
Loom stops here.* Lands in `cultureblocs-string`.
- `lexicon.js` port + shared fixture suite (R8).
- `strip.js` + cross-language strip fixtures (R5), including nested
  shapes; fix the `annotation.work.image` leak.
- `changes` gains `hlc`, `device_id`, `actor`; `patch` takes `If-Match`
  (R6, R9).
- Records grow an explicit `state`; the scrobbler sets `proposal`;
  timeline reads it instead of `MACHINE_APPS` (R7, R1).
- Refs lexicon work (R10): `defs#ref`; `externalId` knownValues
  extended; `refs` on `bead`, `strand`, `annotation`; `presentation` on
  `bead`; `#workRef` removed from `bead.subject` and deprecated; the
  undeclared `bead.work` retired and the one existing `annotation.work`
  mirrored. Ref cases — including bare-name person refs and multibyte
  offsets — in both fixture suites. `APPVIEW.md` notes how refs cluster.

**Phase 1 — Loom, local only.** IndexedDB store, Thread (read the
day/month), Mint (quick bead, offline queue), Compose (full entry,
with a manual ref editor — a form over an array, so refs are written
from day one). No server, no sign-in, no sync. Installable PWA. *This
is already a complete app for one device.* Until Phase 2, existing
records arrive by a deliberate one-way import from the String, and
Loom-made records reach it by a deliberate send over the String's
existing API; desk-first on localhost, phone once hosted over HTTPS.
Design: [`docs/superpowers/specs/2026-09-14-loom-phase1-design.md`](docs/superpowers/specs/2026-09-14-loom-phase1-design.md).

**Phase 1b — the desk.** Loom becomes the place the String is written
and managed (§3): the String column always in view, a bead or a strand
written whole in one form, any bead or strand edited or deleted, and
Send carrying every change — POST, PATCH with If-Match, state, DELETE
with If-Match — with conflicts shown for the person to choose, ahead of
Phase 2 sync. Mint, Thread and posture are retired. Two small String
changes land first: PATCH removes a field sent as `null`, and DELETE
honours `If-Match`.
Design: [`docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md`](docs/superpowers/specs/2026-09-15-loom-desk-authoring-design.md).

**Phase 2 — sync.** `com.cultureblocs.sync.server` discovery record;
service-auth verification; `POST /changes` and `GET /sync`; grants
table; CORS narrowed (R3, R4). Sign in on a second device and the
string is there.

**Phase 3 — vault and feeds.** `vault.item` lexicon; passphrase-derived
key; host-key sealing and identity migration (R2); connector manifests;
scrobbler ported; review queue. The resolver connector, resolver cache,
authority lookups and refs rail land here too — they *are* a connector.

**Phase 4 — publish.** Publish surface, drift, single-bead publish,
round trip.

**Phase 5 — decide by use.** After a season of daily use, ask what
timeline and Pocket are still for. Studio keeps Web Serial; Easel keeps
the diary/publishing separation the ROADMAP draws. Retire nothing on
argument alone. Ask too whether subject versus mention survived contact
with real use, and whether anyone ever touched the backfill queue.

---

## 11 · Open questions

- **The name.** *Loom* is the working title — the frame that holds
  threads while you work them, which sits right beside the quipu.
  Alternatives: *Knot*, *Frame*, *Desk*.
- **Passphrase recovery.** A forgotten vault passphrase means
  re-entering every credential. Acceptable? A printed recovery code is
  the usual answer and adds a surface to get wrong.
- **Automerge, later or never.** §4 argues later. If two-device
  narrative editing turns out to be common, that judgement was wrong
  and the answer is Groundmist's directly.
- **Does the sync-server record belong upstream?** `xyz.groundmist.
  sync` may already define one. Pointing at their NSID rather than
  minting `com.cultureblocs.sync.server` is better if the shapes agree
  — the same reasoning that made us adopt the community calendar
  lexicons rather than keep `venue.listing`.
- **How `concept` refs resolve.** Movements and genres — the SF New
  Wave, liminal horror — are not works, people, events or venues.
  Wikidata QIDs give a clean head and a bad tail; free tags are cheap
  and produce tag soup, and `bead.tags` already exists for the mask.
  Fuzzy is probably acceptable because nothing downstream depends on
  precision, but decide it rather than let concepts fall in as
  second-class works.
- **Whether sameness assertions go public.** A `com.cultureblocs.sameAs`
  record would put identity judgements in the atmosphere — signed,
  portable, with provenance — rather than in one AppView's database,
  and let a second AppView bootstrap warm. Costs: write volume, and a
  tap in a picker minting a public record. If done, mint on *publish*,
  not on resolve.
- **Whether the extractor may ever call out.** §9.6 says no. A local
  model good enough for titles, names and venues is a real constraint,
  and sits awkwardly with "no build step". The honest fallback if it is
  too weak is explicit, batched, user-initiated remote extraction with
  a clear label — never a quiet background call.
- **Naming the ref layer.** *Warp* was offered: the threads the loom is
  strung with before work begins, which every cloth on it shares. The
  UI says *Refs* for now.

## Related

- [`ROADMAP.md`](https://github.com/geocontrol/cultureblocs-string/blob/main/ROADMAP.md) — §1 (the String), §2 (capture surfaces,
  witness workers). Loom is a way of doing much of both at once.
- [`HOST-SPEC.md`](https://github.com/geocontrol/cultureblocs-string/blob/main/HOST-SPEC.md) — the DataBrick, which this design
  turns into a personal sync server in the Groundmist sense.
- [`PROMOTER.md`](https://github.com/geocontrol/cultureblocs-string/blob/main/PROMOTER.md) — the strip rules Loom must reproduce
  exactly.
- [groundmist.xyz](https://groundmist.xyz/) — and grjte's three essays
  on ATProto as a [distribution](https://whtwnd.com/grjte.sh/3lndb5weupc2r),
  [legibility](https://whtwnd.com/grjte.sh/3lndyhyvqdc2w) and
  [interoperability](https://whtwnd.com/grjte.sh/3lne2va62nc2y) layer
  for local-first software.
