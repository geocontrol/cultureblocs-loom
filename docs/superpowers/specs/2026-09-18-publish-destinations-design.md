# Publish destinations — everything to the PDS, some of it syndicated: design

Status: approved 2026-09-18.
Builds on: [publishing from the desk](../../../LOOM.md) §8 (merged, loom PR #4) and [totem sync](2026-09-17-loom-totem-sync-design.md) (merged, loom PR #6).
Parent design: [`LOOM.md`](../../../LOOM.md) — §8 is extended by this document (§11 below).
Code lands in **both repositories**: the endpoint, the adapters and the table in **cultureblocs-string**; the surface in **cultureblocs-loom**. The String's PR merges first (§10).

## 1 · Goal

A published strand can go out to other services in the same press, with
the PDS remaining the record of account. Bluesky is the first adapter;
Instagram, Mastodon and Threads are later modules behind the same seam.

Success looks like: you tick Bluesky in the Publishing block, write a
line, press publish once, and the strand is on your PDS and the post is
in your feed; republishing the strand afterwards never double-posts; and
adding Instagram later touches one new file and no existing one.

The IndieWeb name for the shape is POSSE — publish on your own site,
syndicate elsewhere. Worth borrowing, because it names the thing the
architecture is: the PDS is not one destination among several, it is
where the record lives, and the rest are renderings.

## 2 · Decisions taken

| Question | Decision |
|---|---|
| Where syndication runs | **In the String.** It holds the identity and the authenticated session; an Instagram token could not live in a browser anyway. |
| When it fires | **One press.** Destinations ride on `POST /publish/<id>`; publish and syndicate are two *phases* of one request. |
| The link back | **None for now.** No per-strand permalink exists anywhere (§3). It arrives with the wall, and link facets are additive. |
| What the post says | **A short text you write**, defaulting to the strand's title. Not auto-composed, not truncated prose. |
| On republish | **One-shot per destination.** A used destination is skipped and reported; an unused one stays available. |
| Enforcement | **A `syndications` table**, not UI state — the rule survives a reload, another device and a re-import. |
| Validation order | **Validate before phase 1, execute after it.** Publishing and *then* failing on the post text is the worst ordering available. |
| Adapter shape | **A module per destination behind a registry**, with declared `LIMITS`. Modules, not classes: `publisher.py`, `strip.py` and `refs.py` are all plain functions. |
| Unpublishing a strand | **Does not delete its posts.** A post is a moment that happened; retracting the record of account does not unsay it. |

## 3 · The finding that shaped the scope

**There is no human-facing permalink to a single strand anywhere.** Not
in `cultureblocs-string`, `cultureblocs-site` or `geekyoto`. Every
renderer is actor-addressed and list-shaped:
`<cultureblocs-strands>` takes an `actor` and shows the N most recent,
and at `web/cultureblocs-strands.js:133` it **discards `s.uri`** before
rendering, so the component does not know the rkey of what it displays.
The appview's only HTML route is an operator dashboard; `GET /record?uri=`
is JSON. `scripts/export_public.py` writes one `strands.json`, not pages.
No code anywhere builds a web URL from a DID and an rkey.

So the "link at the end to the Atmosphere URI" from the original note has
nothing to point at that a person could use. Rather than build a
permalink here — which pulls a slice of the wall forward and still yields
no link card without server-side rendering — Bluesky ships without one.
It is the destination that needs a link least: the post lands in **the
same PDS repo as the strand**, same actor, same moment, so the two are
already tied by provenance. Instagram is the destination that needs a
link, and Instagram cannot make one clickable in a caption regardless.

## 4 · Architecture

Two phases inside one request, and a registry behind them.

    POST /publish/<id>  { identity, destinations[], postText }
      │
      ├── validate: destination names known? postText within LIMITS?   ← before anything publishes
      │
      ├── PHASE 1  publish_strand()  — unchanged: blobs, beads, strand, set_published
      │
      └── PHASE 2  for each destination not already used:
                     syndicate.post(dest, session=…, strand=…, items=…, text=…)
                     store.add_syndication(record_id, dest, remote_id, remote_url)

Phase 2 **cannot fail phase 1**. A destination that raises leaves the
strand published, records nothing, and is reported as failed — so it
stays available to retry. This split is the reason destinations ride on
the publish request rather than being folded into `publish_strand`:
publish is already the slowest, least atomic thing in the system, and
syndication's failure modes must not tangle with its reporting.

### 4.1 `string/app/syndicate/` — the registry

```python
DESTINATIONS = {"bluesky": bluesky}          # name -> module

def post(destination, *, session, strand, items, text) -> dict:
    """-> {"id": str, "url": str | None}. Raises on failure."""
```

Each adapter module exposes exactly:

```python
NAME   = "bluesky"
LIMITS = {"text": 300, "images": 4, "wants_link": False}
def post(session, strand, items, text) -> {"id": …, "url": …}
```

Three properties of the signature carry weight:

- **`session` is passed in** — the `(did, jwt, pds)` triple phase 1 already
  holds. No second `createSession`.
- **`items` are the strand's members *as published*** — stripped bodies and
  their image refs. An adapter structurally cannot reach private data,
  which is what makes §6's strip argument a guarantee rather than a
  coincidence.
- **`LIMITS` is declared, not assumed.** Loom reads it to size its text
  box, so a second adapter with different limits needs no UI change.

### 4.2 The `syndications` table

`(record_id, destination, remote_id, remote_url, posted_at)`, one row per
pair, mirroring the `published_uri` / `published_hash` precedent in
`db.py`.

`remote_id` is the destination's own identifier for the thing it created —
the rkey, for Bluesky. `remote_url` is a URL a person can open, or NULL
where the destination gives none. They are separate because an id is what
you would need to address the post again and a URL is what you show
someone, and not every service provides both.

The row **is** the one-shot enforcement. Because it lives in the database
rather than in Loom's state, the rule holds across a reload, a second
device and a re-import — and it is what makes republishing safe: a second
publish naming a used destination skips it and says so, rather than
double-posting to the same followers.

## 5 · The Bluesky adapter

Writes an `app.bsky.feed.post` with the same `com.atproto.repo.putRecord`
helper `publish_strand` already uses — `collection: "app.bsky.feed.post"`,
a TID rkey.

| Field | Value |
|---|---|
| `text` | the hand-written text, checked against `LIMITS["text"]` before posting |
| `createdAt` | now — this is a post *about* a day, not a backdated one |
| `embed` | `app.bsky.embed.images`, up to four of the strand's **already-uploaded** blobs |

The embed carries each image's `alt` and `aspectRatio` straight across,
because `com.cultureblocs.defs#imageRef` deliberately mirrors
`app.bsky.embed.images#image` field-for-field (`defs.json:143`). **The
blobs are reused, not re-uploaded** — phase 1 already put them in the same
PDS. This is what makes the first adapter small, and it is the claim §9's
tests pin.

Returns `{"id": rkey, "url": "https://bsky.app/profile/<handle>/post/<rkey>"}`.
That URL construction is **new to this codebase** — nothing currently
builds a web URL from a handle and an rkey — and exists so Loom can link
you to the post it just made.

### 5.1 Graphemes, and why the house approximation is safe here

Bluesky's lexicons are **not vendored** in this repository, so the 300 and
4 are the published limits rather than values this design can verify from
source. The adapter therefore validates text itself and refuses with a
clear message rather than letting the PDS reject.

For counting, reuse the house convention rather than inventing a second
counter. `string/app/lexicon.py:146` counts `len(value)` — code points —
and `sdk/js/lexicon.js:21-27` counts the same way on purpose, its comment
noting that the two "have to approximate it identically or a record valid
on the desk is invalid on the phone."

That approximation is **safe in the right direction** for this use. A
grapheme is always one or more code points, so a code-point count is
always ≥ the true grapheme count. If the String measures ≤ 300 code
points the text is certainly ≤ 300 graphemes. The adapter may therefore
occasionally refuse an emoji-heavy post Bluesky would have accepted; it
can never let through one Bluesky rejects. Loom's counter uses the
vendored `codePointLength`, so desk and server agree.

### 5.2 Stated limitations

- **More than four images is truncated**, and the adapter reports how many
  it dropped rather than silently choosing.
- **No link facets are built.** There is nothing to link to (§3). When the
  wall lands this is additive, and the byte-range machinery already exists
  in `refs.py`.
- **A post cannot be edited.** Bluesky has no edit; delete-and-repost
  yields a new URI and destroys replies and likes. Hence one-shot.

## 6 · The strip, and a rule for the next adapter

The backlog flagged that a syndicated rendering must not leak what the
strip withholds — geo, provenance, unidentified person refs. It cannot,
here, and for three structural reasons: the post text is **hand-written**;
its default is `title`, which is *in* `STRAND_FIELDS` (`strip.py:30`) and
therefore already public; and the images are blobs **phase 1 already
uploaded**. Nothing in phase 2 reads an unstripped field.

That is a property of this design rather than a guarantee of the seam, so
the rule is stated for whoever writes the next adapter:

> **Any adapter that composes text from `narrative`, a bead's `note`, or
> any other record field must route it through the strip first.** Instagram
> is precisely the adapter likely to want that, because a caption wants
> more words than a title.

## 7 · Loom's surface

The Publishing block from PR #4 grows three things:

- **A checkbox per destination**, from a new `GET /destinations` →
  `[{name, limits}]`.
- **A text box, shown only when something is ticked**, pre-filled with the
  strand's title, with a counter sized from the smallest ticked
  destination's `limits.text`.
- **A destination already used renders as a link**, not a checkbox —
  "posted to Bluesky", pointing at the post.

Per-record state rides the path `publishedUri` already travels:
`GET /records/{id}` gains `syndications: [{destination, remoteUrl,
postedAt}]`, and Loom's `stringFields` (`app/lib/importer.js`) carries it,
exactly as `publishedUri` was added in PR #4.

`app/lib/publisher.js` — the seam — grows `destinations()`, and `publish()`
takes `{destinations, postText}`. The client-side OAuth publisher §8 wants
eventually still replaces that one module and nothing else.

**Graceful degradation.** Loom asks `GET /destinations`; a String without
it 404s; Loom then shows no destination options and publishes exactly as
it does today. This matters because both run locally and may be at
different versions, and it means the two PRs can merge in either order
even though the String's is the natural first.

## 8 · Error handling

Validation happens **before** phase 1; execution after.

| Condition | Behaviour |
|---|---|
| `postText` over the smallest ticked destination's limit | **Refused before publishing.** Nothing is published |
| `postText` empty (the box was cleared) | Refused — an empty post is not a thing to send |
| Unknown destination name | 422, naming the destinations that exist |
| Phase 1 fails | As today; phase 2 never runs |
| Phase 1 ok, phase 2 ok | "published, posted to Bluesky" + a link to the post |
| Phase 1 ok, phase 2 failed | "published — Bluesky failed: `<reason>`". **Nothing recorded**, so the destination stays available |
| Destination already used | Skipped, reported as already posted |
| More than four images | Four posted, the dropped count reported |

## 9 · Testing

- **The adapter** (`_xrpc` stubbed): the post body's shape; the text
  refusal at the limit; the four-image cap with its dropped count; `alt`
  and `aspectRatio` carried across; and specifically that **blob refs are
  reused rather than re-uploaded**, which is the claim the whole design
  rests on.
- **The endpoint**: both phases reported separately; a failing destination
  leaves the publish intact and records nothing; a second publish skips a
  used destination; an unknown name is 422; over-long text is refused
  before anything publishes.
- **The table**: one row per `(record, destination)`; adding twice is
  idempotent.
- **The strip does not change** — asserted, so a future adapter cannot
  quietly widen what leaves.
- **Loom**: `string-client` for the new calls and fields; `publisher.js`
  for the seam; `view-publish` for the checkbox / text box / counter
  states and for a used destination rendering as a link; the controller
  for the press.
- Loom's `sw.js` `SHELL` gains nothing (no new module) — but `VERSION`
  bumps, because `view-publish.js` and `publisher.js` change.

## 10 · Delivery

**Two PRs. `cultureblocs-string` merges first** — it holds the endpoint,
the adapter and the table, and Loom's surface is inert without them. Note
this is the opposite order to the totem work, where Loom had to land
first.

- **cultureblocs-string** — `syndicate/` with the registry and the Bluesky
  adapter; `POST /publish/<id>` gains `destinations` and `postText`;
  `GET /destinations`; the `syndications` table and its rows on
  `GET /records/{id}`; a section in `PROMOTER.md`.
- **cultureblocs-loom** — the Publishing block's destinations, text box and
  counter; `publisher.js`'s `destinations()`; `stringFields` carrying
  `syndications`; `LOOM.md` §8; `docs/backlog.md` items 2 and 4.

## 11 · Changes to LOOM.md

- **§8 gains syndication.** It currently describes exactly one destination
  ("Loom publishes client-side… using the OAuth session"). It needs the
  POSSE framing: the PDS is where the record lives, other services get
  renderings, and each is a deliberate tick rather than a default.
- **§8's client-side ambition is unaffected** — `publisher.js` remains the
  swap point, and syndication sits behind it like publishing does.
- **`docs/backlog.md` items 2 and 4 both close.** They were always one
  feature; the backlog said so and this design confirms it.

## 12 · Out of scope

- **Instagram, Mastodon, Threads, Facebook, X.** The seam exists for them;
  none is built. Instagram's real frictions are recorded in
  `docs/backlog.md`: a Business or Creator account, a linked Facebook app,
  and captions that cannot carry clickable links.
- **A per-strand permalink**, and therefore link cards and link facets
  (§3). Arrives with the wall.
- **Editing or deleting a syndicated post.** One-shot (§5.2). Unpublishing
  a strand does **not** delete its posts — a post is a moment that
  happened, and retracting the record of account does not unsay it.
- **Drift across destinations.** A post never updates, so there is nothing
  to drift against.
