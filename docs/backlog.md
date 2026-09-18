# Backlog — things to be added, or thought about first

Notes made while using the desk, after the first publish from Loom
(2026-09-16). Each entry says where it lands, what already exists, what is
genuinely new, and what has to be **decided** before it can be specced. None
of this is designed yet; `LOOM.md` stays the design, and a section of it moves
only when the item below is actually taken up.

The four surfaces in `LOOM.md` §3 sort them: **Feeds** takes 1 and 5,
**Publish** takes 2 and 4, and 3 is not Loom's at all.

| # | Item | Surface | Status |
|---|---|---|---|
| 1 | Totem beads into Loom, in place | Feeds | **done** 2026-09 |
| 2 | Publish a strand to Instagram | Publish | **seam built** 2026-09 — the adapter is a later module |
| 3 | A wall of my published blocs | *not Loom* | new; two partial precedents |
| 4 | Publish a strand to Bluesky, Mastodon, … | Publish | **done** 2026-09 for Bluesky |
| 5 | Extract works / people / events from prose | Feeds | **already designed** (§9); unbuilt |

---

## 1 · Totem beads into Loom, without switching windows

**Done**, 2026-09 — [spec](superpowers/specs/2026-09-17-loom-totem-sync-design.md),
[plan](superpowers/plans/2026-09-17-loom-totem-sync.md), merged as
[loom#6](https://github.com/geocontrol/cultureblocs-loom/pull/6). Built as a
fourth connector class on a minimal Feeds surface at `#/feeds`; Studio retired
in [string#8](https://github.com/geocontrol/cultureblocs-string/pull/8), which
also ended the Cardputer's sync path. The open questions below were resolved as
recorded in the spec's §2 — and the guess that this was "not a firmware job"
proved right: the totem has no network path by construction, so Web Serial in a
page was the whole answer.

**Ask.** Get beads off the ESP32 / M5StickS3 Totem into Loom without leaving
the desk.

**What happens today.** There is no automatic path, and none on the ROADMAP.
The Totem is pulled by hand through **CultureBloc Studio** on `:8102`
(`cultureblocs-string/studio/index.html`): `navigator.serial.requestPort()`,
send `D`, read the `---BEADS-BEGIN---` block, then `POST /records` to the
String. That Studio window is the window being switched to.

**The useful finding.** The Totem cannot be reached over the network at all —
`src/Link.cpp` does `WiFi.mode(WIFI_STA); WiFi.disconnect();` and then
`esp_now_init()`. The radio exists **only** for peer-to-peer mutual mint
(the shared `mintId`). There is no HTTP client, no BLE, no SD card. So this
is not a firmware job and not a networking job: the transport is USB, and
**Web Serial is available to Loom already**, because Loom is a page in a
browser. Studio's pull can move into Loom as a device connector with no
firmware change.

**New connector class.** `LOOM.md` §7's table has no Totem row, and the three
classes there (*produces records*, *context only*, *proposes refs*) do not fit
a device you plug in. A fourth — a **device connector**: no schedule, no
credential, runs when hardware is attached.

**What must move with it, not be left behind.**
- **Time resolution.** The device knows ticks, not wall clock.
  `bead_time = syncWallClock − (deviceNow − e)` lives in Studio, and its
  handling of beads from an older boot epoch (flagged, not silently
  misdated) is the part that is easy to lose.
- **Only kept beads push.** A crossing-out on the device defaults a bead to
  "let go".
- **The mask wardrobe push-back** (`W`), deliberately armed only *after* a
  successful pull.
- **Clearing the device is gated on a matching count** — the proof you
  actually synced. This is the safety property; it should not get weaker by
  moving.

**To decide.**
- Web Serial is Chromium-only and needs a secure context. Loom on
  `localhost` is fine; **an iPhone will never do this**, so the desk keeps a
  capability the phone does not have — acceptable, but say so rather than
  discover it.
- Does Studio then retire, or stay as the fallback? (`LOOM.md` §10 Phase 5
  currently says "Studio keeps Web Serial", which this would overturn.)
- Do Totem beads land as `proposal` (the dotted rail, kept or released) or
  as `kept` straight away? §9.7's "reverse entry" note argues they arrive
  sparse — "the totem does not know what you watched" — and get enriched in
  Loom, which points at `proposal`.
- `cultureblocs-string/bridge/culturebloc_bridge.py` carries an explicit
  `ADAPTATION POINT: swap this for your real C4 sync export reader (CBOR
  batches over BLE/WiFi)`. That BLE/WiFi export is aspirational and reads a
  hand-made JSONL today. Worth deciding whether it dies with this item.

---

## 2 & 4 · Publishing routes: syndication to other services

**Done for Bluesky**, 2026-09 — [spec](superpowers/specs/2026-09-18-publish-destinations-design.md),
[plan](superpowers/plans/2026-09-18-publish-destinations.md). Syndication runs
in the String as a second phase of `POST /publish/<id>`, one module per
destination behind a registry. Bluesky reuses the publish's session and
blobs. No link back yet: there is no per-strand permalink anywhere, so it
arrives with the wall (item 3). Instagram, Mastodon and Threads are each one
new module in `string/app/syndicate/`; Instagram's frictions below still
stand.

These are one feature, so they are one entry. **Everything goes to the PDS;
some of it is then syndicated elsewhere, always with a link back.** (The
IndieWeb calls this POSSE — publish on your own site, syndicate elsewhere.
Worth borrowing the name.)

**Ask.** After publishing a strand, optionally push it to Instagram (a
carousel of the beads' photos, the text, an Atmosphere link, maybe a
CultureBlocs endpiece), to Bluesky as a normal post in my own feed, and to
Mastodon / Threads / Facebook as further adapters. X is possible but unused.

**What exists today.** Nothing — and not even the concept. There is no
`destinations` notion anywhere; publishing is single-target by construction
in both `scripts/promote.py` and `LOOM.md` §8. Instagram, Facebook and Flickr
appear *only* as hand-typed outbound URLs in a record's `links[]` field, which
is the opposite of syndication. Mastodon, Threads, X and "cross-post" have
zero hits in either repo. Bluesky appears only as a PDS host and account
provider; nothing writes `app.bsky.feed.post`.

**Start with Bluesky, because it is barely syndication.** It is the *same
repo* as the strand, a different lexicon (`app.bsky.feed.post`), and needs
**no new credential** — the OAuth session that published the strand can write
it. That makes it the cheap first adapter and the one that proves the shape.
Instagram is the expensive one and should not go first.

**To decide.**
- **The strip still applies.** A syndicated post is a *rendering*, and geo,
  provenance and unidentified person refs must not leak into an Instagram
  caption any more than into a published record. This is the single most
  important constraint here and the easiest to forget, because a caption
  does not look like a record.
- **What was sent where.** Republishing a strand must not double-post. Needs
  a record of syndications — local state, or a record type. If a record, it
  is public, which is a choice.
- **Instagram's real friction.** The Graph API requires a Business or
  Creator account and a linked Facebook app; there is no personal-account
  posting API. And **captions cannot carry clickable links**, so "a link at
  the end to the Atmosphere URI" will be plain text the reader must copy.
  Both are worth knowing before this is promised. (Facebook may need no
  adapter at all if Instagram already reposts there.)
- **Credentials.** Every non-Bluesky adapter needs a token, which makes this
  a §6 vault matter as much as a §8 one.
- **Editing after syndication.** A PDS record can be revised in place. An
  Instagram post cannot. So syndication is a one-way, point-in-time act, and
  the Publish surface should not imply otherwise.
- **The philosophical headwind, stated plainly.** The ROADMAP draws "Diary
  tools ≠ publishing tools", and the README says "publishing is a deliberate
  press, never a side effect". A one-click fan-out to five services is in
  tension with that. The resolution is probably that each destination is its
  own deliberate press, never a default — but decide it rather than let
  convenience settle it.

---

## 3 · A wall of my published blocs

**Ask.** A page of all my published cultureblocs in date order, N per page
with paging back through older entries. Probably not Loom — an appview of one
account's published blocs.

**Right instinct: this is not Loom.** Loom is where the String is written;
this is a public read surface.

**What exists today.** No paged, date-ordered, per-actor wall. Two partial
precedents, both client-side, both reading the PDS directly rather than the
String or the appview:
- `<cultureblocs-strands>` (`cultureblocs-string/web/cultureblocs-strands.js`)
  — takes `actor=`, sorts by `createdAt` descending, hydrates each strand's
  beads. **This is the closest thing to the wall that exists**, and it is now
  the thing that renders narratives properly. But `limit` is hard-coded to 50
  and there is no paging; it is an embed for someone else's page.
- `catalogue/` — per-actor, date-sorted, and it *already does a real cursor
  loop* over `listRecords` with a `MAX_PAGES` guard. It renders everything
  rather than exposing pages, but the paging machinery is written.

The appview is a different thing: `GET /records?collection=&did=&limit=` is
date-ordered and indexed for it, but takes **`limit` only, no cursor**, and
returns JSON, not HTML. One parameter short of the wall's query.

**To decide.**
- **Data source.** Direct `listRecords` (as the strands element and catalogue
  both do) needs no server change and works for any actor. The appview index
  would be faster and could show reference counts, but needs a cursor added.
  Direct-from-PDS is the cheaper first cut and is probably right.
- **Extend or start fresh?** Growing the strands element a cursor and a page
  size would give the wall and improve the existing embeds at once.
- **`APPVIEW.md` says "No ranking, no feed, no algorithm."** A date-ordered
  wall of one consenting actor's own public records is arguably fine — there
  is no ranking and no inference — but if the wall lives in the appview, say
  so in `APPVIEW.md` explicitly rather than quietly crossing the line.

---

## 5 · Extract works, people and events from what I write

**Ask.** Pull works / people / events out of entries so they can be published
as metadata on the blocs. Switchable on and off, and able to point at a
preferred model, local or cloud.

**This is already designed, in detail** — `LOOM.md` §9 "Referents", and it is
Phase 3 in the build order (§10). Worth re-reading before anything is built,
because it answers most of the design questions already:
- §9.2 — **the extractor is a connector**, differing from the scrobbler only
  in proposing refs rather than records. No new surface: the form grows a
  rail, Feeds gains a `resolver` row, the review queue gains a refs tab.
- Candidates **never enter a record** — they live in the resolver cache, so
  nothing unconfirmed is validated, synced or published. They **do not
  sync**, being regenerable from the text. A ref already kept is never
  touched by a re-run.
- §9.7 — **default every candidate to off** ("The Pester entry surfaces
  fifteen. Unticking fourteen is worse than ticking three"), and
  **unresolved is publishable** — never gate publishing on resolution.
- §9.6 — Wikidata is the hub and everything else a spoke; remote authority
  lookups are explicit and batched, never per keystroke.

**The "switch on and off" already exists in the design**: §7's Feeds surface
gives every connector a switch, and the extractor is a connector.

**What is actually new is the model choice — and it contradicts §9.6.**
§9.6 currently reads: *"Extraction is local. A small model in the browser or
on the host. **Never a remote call.**"* The reason is not squeamishness: a
background extractor over a draft would stream unpublished, possibly
never-to-be-published prose to a third party continuously, which is the exact
leak the strip exists to prevent.

`LOOM.md` §11 already carries this as an open question — *"Whether the
extractor may ever call out. §9.6 says no… The honest fallback if it is too
weak is explicit, batched, user-initiated remote extraction with a clear
label — never a quiet background call."*

So this note **answers that open question**: yes, a cloud model may be
chosen. Taking it up means amending §9.6 rather than implementing around it,
and keeping §11's guardrails as the price:
- explicit and user-initiated — never a background pass over a draft;
- batched, not per keystroke;
- clearly labelled in the UI when prose is about to leave the machine;
- local remains the default, so the privacy posture holds for anyone who
  never changes it.

**State of the code.** Nothing is built. There is no resolver module, no
resolver cache store, no extractor, and **no model or provider configuration
anywhere in either repo** — this would be the first. The manual half is done:
`defs#ref` is shipped, `refs.py`/`refs.js` validate byte-range anchors, and
`app/ui/view-refs.js` is a working manual refs editor whose `publishHint()`
already explains in words what the strip will withhold.

Note that `matchConfidence` means two different things and they must not be
conflated: the resolver's own bookkeeping (cache only, never in a record),
and the shipped `annotation.matchConfidence` field
(`embedding | geometric | manual`) belonging to the parked AR image-matching
path.

---

## Two incidental flags, unrelated to the five

- **`cultureblocs-string/notes/lastfm.txt` has a live API key and shared
  secret committed to the repo.** Worth rotating and moving into the vault or
  an ignored file, independently of anything above.
- **`ROADMAP.md` says "Last updated: July 2026"** and predates Loom Phase 0,
  Phase 1, the desk, and publishing from Loom. Items 1–4 here have no home on
  it, and item 5 appears only obliquely. It needs a pass.
