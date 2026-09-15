# cultureblocs loom

*The frame that holds the threads while you work them. The beads are
already there — the loom is where they become cloth.*

Loom is a local-first app for the whole cultural-diary loop in one
interface: what the machines propose, what you mint, what you write,
what you publish. It is a client for the
[`com.cultureblocs.*` lexicons](https://www.cultureblocs.com/lexicons.html)
that needs no server of its own, and it turns
[the String](https://github.com/geocontrol/cultureblocs-string) — when
you run one — into a **personal sync server** in the sense
[Groundmist](https://groundmist.xyz/) describes.

**Status: Phase 1 — local only.** Thread, Mint and Compose run in the
browser with no server of their own; existing records arrive by a
deliberate import from the String, and Loom-made ones reach it by a
deliberate send, until Phase 2 sync. The full argument, the review of the
String that motivated it, and the build order are in
**[LOOM.md](LOOM.md)** — start there.

## What it is

Six surfaces, one page, one codebase:

    Thread     the day, the month; beads, strands, proposals
    Mint       the button: a bead in two taps
    Compose    the full entry: narrative, place, items, photos
    Feeds      connectors, their last run, their proposals
    Vault      identities, connector credentials, devices
    Publish    what is public, what has drifted, what to send

Two ways in, one mint fact: a **quick bead** (offline, no network on
the critical path) or a **full diary entry**. A bead minted at 21:04
can be *grown* into an entry at breakfast — the bead does not change,
the strand wraps it.

## Running it (Phase 1)

    docker compose up -d          # http://localhost:8108

Open **string** in the bar, point it at your String (`http://localhost:8100`),
**check**, then **import**. Mint and write; **send** puts Loom-made records on
the String; **download backup** keeps a copy of everything in this browser.
Phase 1 is desk-first on `localhost`: a phone needs Loom served over HTTPS.

    node --test app/test/*.test.mjs        # the app's tests, no dependencies
    scripts/vendor-sdk.sh                  # refresh app/vendor from ../cultureblocs-string

`app/test/store.html` (served at `/test/store.html`) runs the storage
contract against the browser's real IndexedDB.

## Three decisions this repo is built on

1. **Canonical data is local.** IndexedDB, keyed by lexicon NSID,
   validated in the browser against the same schemas the String uses.
   Loom works completely with no server at all; ATProto sign-in exists
   to *publish* and to *sync*, not to function.
2. **Credentials sync across devices**, encrypted under a passphrase
   the sync server never sees — except for the host credentials a
   server-side connector must actually read, which are released in a
   deliberate, labelled step and sealed at rest. See LOOM.md §6.
3. **Proposals are not facts.** Connectors propose beads; only a person
   keeps them. The dotted rail is a stored `state`, not a guess.

## Relationship to the other repos

| Repo | What it is |
|---|---|
| [cultureblocs-string](https://github.com/geocontrol/cultureblocs-string) | the record store, lexicons, publisher, workers, and today's surfaces (timeline, Studio, Pocket, Easel) |
| **cultureblocs-loom** (this one) | the unified local-first client, and the PSS changes the String needs to serve it |

Nothing in the String is retired by this work. Loom is built alongside;
daily use decides the rest.

## Build order

Phase 0 lands entirely in `cultureblocs-string` (a client-side lexicon
validator, one canonical publish strip with cross-language fixtures,
HLC on the change feed, an explicit record `state`) and is worth having
even if Loom stops there. Phases 1–5 live here. Details in
[LOOM.md §10](LOOM.md#10--build-order).

## Prior art worth reading

- [groundmist.xyz](https://groundmist.xyz/) — grjte on ATProto as a
  [distribution](https://whtwnd.com/grjte.sh/3lndb5weupc2r),
  [legibility](https://whtwnd.com/grjte.sh/3lndyhyvqdc2w) and
  [interoperability](https://whtwnd.com/grjte.sh/3lne2va62nc2y) layer
  for local-first software.
- [Local-first software](https://www.inkandswitch.com/local-first/) —
  Ink & Switch, the seven ideals.
