# Loom totem sync — the device plugs into the desk: design

Status: approved 2026-09-17.
Builds on: [the desk](2026-09-15-loom-desk-authoring-design.md) (merged, PR #3) and publishing from the desk (merged, PR #4).
Parent design: [`LOOM.md`](../../../LOOM.md) — this document **overturns opening decision 3** and revises §7 and §10 (see §11 below).
Code lands in **this repository** under `app/`; **cultureblocs-string** loses `studio/` (§9).

## 1 · Goal

Beads minted on the totem arrive in Loom without opening another
window. The whole sync ritual — connect, pull, clear the device —
happens on the desk, and the beads land as proposals on the days they
belong to, where proposals already live.

Success looks like: you plug in the totem, press pull, and the new
beads are on your String column seconds later; you clear the device
without leaving the page; and no bead is ever erased from the device
that Loom did not durably store first.

The totem cannot be reached any other way. `src/Link.cpp` calls
`WiFi.mode(WIFI_STA); WiFi.disconnect();` and then `esp_now_init()` —
the radio exists only for peer-to-peer mutual mint. There is no HTTP
client, no BLE, no SD card. USB is the only path, so this is a Web
Serial job, not a networking one, and it needs no firmware change.

## 2 · Decisions taken

| Question | Decision |
|---|---|
| Scope | **Full port.** Loom takes `D`, `W`, `M`, `C` and the paste fallback; Studio retires. |
| Devices | **Totem only.** The Cardputer's sync path ends with Studio (§3). |
| Where pulled beads land | **Loom's local store, as `proposal`** — the dotted rail, kept or released in place, then Send. |
| Where it lives | **A new minimal Feeds surface** (`#/feeds`) with one row, the totem. Not Phase 3's full Feeds. |
| Review list | **None.** The String column already renders proposals with keep/release; that *is* the review. |
| When the device may be cleared | **After the pull is durable locally**, before Send — the local store is the safe point, not the String. |
| Sync-time inputs | **Date** (shown only when a dump contains old-epoch beads) and **device label** (auto-filled, editable, warns on disagreement). The batch event name is dropped. |
| Dedupe keys | **Byte-identical to Studio's**, warts included (§6.3). |
| Solo bead kind | **`bloc`**, following Studio's code and the lexicon, not Studio's stale comment. |
| Struck beads | **Not pulled at all.** |

## 3 · Out of scope

- **The Cardputer.** Its dumps add `P`/`V`, typed notes, asserted times
  and archive-not-erase clear semantics. Retiring Studio ends its only
  sync path. Accepted deliberately; any beads still on that device are
  stranded, and Studio's code remains in git history if that turns out
  to matter.
- **Phase 3 Feeds.** No scheduling, no credentials, no review queue, no
  connector manifests. One row, one device.
- **Legacy `t`-beads.** Studio has a fourth timestamp case for firmware
  reporting only time-of-day. Current firmware does not emit it; those
  beads fall to case 3 (§6.2). A deliberate narrowing, not an oversight.
- **The wardrobe as a design surface.** `W`/`M` move across as they are:
  read the masks, edit name and colour, write them back.

## 4 · Architecture

Four modules, split so that the two things most likely to be wrong —
the protocol framing and the timestamp resolution — are testable with
no hardware attached. This follows the house pattern: pure `lib`, pure
views, one injected impure client (`stringClient(url, token, fetchImpl)`).

    ui/feeds.js ─────────── controller: the ritual, the states
    ui/view-feeds.js ────── pure view
          │
    lib/totem-sync.js ───── orchestration (runPull, runClear, wardrobe)
          │                 shaped like runSend / runImport
          ├── lib/totem-port.js ───── the ONLY impure module: navigator.serial
          ├── lib/totem-protocol.js ─ pure: text in, structure out
          ├── lib/totem-beads.js ──── pure: dump -> bead bodies + dedupe keys
          └── lib/envelope.js ─────── adoptBead(), a sibling to createBead()

### 4.1 `lib/totem-protocol.js` — pure

```
parseDump(text)      -> { deviceId, now, epoch, beads: [{seq, mask, r,g,b, e, ep, mintId?, with?}] }
parseWardrobe(text)  -> [{ name, r, g, b }]
wardrobePayload(m)   -> "name|r|g|b\n…\n.\n"     // the body sent after 'M'
parseClearReply(t)   -> { ok: true, cleared } | { ok: false, have, want }
MARKERS              -> what the port reads until
```

`parseDump` **throws on a truncated dump** rather than returning the
beads it managed to read. A partial pull followed by a clear is how
beads are lost, and that is the one failure this design refuses to
allow.

### 4.2 `lib/totem-beads.js` — pure

```
needsDay(dump)  -> boolean                        // drives the conditional date field
toBeads(dump, { syncWallClock, day, deviceLabel })
                -> [{ dedupeKey, createdAt, timeAnchored, body }]
```

### 4.3 `lib/totem-port.js` — the only impure module

```
openPort({ serial = navigator.serial, baudRate = 115200 })
  -> { send(cmd), readUntil(marker, { timeoutMs }), close() }
```

`serial` is injected so tests drive a fake. `readUntil` owns two
realities the protocol table does not mention: chunks arrive split
mid-line, and a sleeping totem never answers at all.

### 4.4 `lib/totem-sync.js` — orchestration

```
runPull({ store, loom, port, now, day, deviceLabel }) -> { deviceId, added, duplicate, skipped, problems }
runClear({ port, count })
readWardrobe({ port }) / writeWardrobe({ port, masks })
```

`runPull`'s result is what the row reports: `added` are the keys
written, `duplicate` were already in the store, `skipped` were struck
on the device, and a non-empty `problems` is what withholds the clear
(§8). `runClear`'s `count` is the number of bead lines in the dump the
controller holds from that pull — not a figure `runClear` derives, so
that a clear can never be issued without a pull behind it.

### 4.5 `lib/envelope.js` — one new write path

`create()` hardcodes `state: 'kept'`, `origin: 'loom'`,
`sourceApp: 'loom'`, and `createBead` stamps Loom's own provenance, so
a totem bead cannot go through it. `adoptBead(key, body, { dedupeKey,
provenance })` writes `state: 'proposal'`, `origin: 'connector:totem'`,
`sourceApp: 'culturebloc-totem'` and the **device's** provenance —
while validating like every other write, since these are new records
not yet on the String. (The importer's exemption from validation exists
because those records are already on the String; these are not.)

### 4.6 `lib/sender.js` — one line

`sender.js:195` posts `dedupeKey: \`loom:${env.rkey}\``. A totem bead
must keep its `cb:` key or the String will not dedupe it against
anything Studio pushed, and re-pulling would mint duplicates. So:
`env.dedupeKey ?? \`loom:${env.rkey}\``.

**Known edge case, accepted.** `importer.js`'s `sentFrom` links a
record back to its local copy by the `loom:` prefix, for when a POST
response is lost. A `cb:`-keyed record whose response is lost will not
match, and a later import will see the String's copy as a new bead —
one duplicate, locally, in a rare failure. Recorded rather than built
for.

## 5 · The serial protocol

115200 8-N-1, from `culturebloc-totem/README.md`:

| Command | Sent | Device replies |
|---|---|---|
| Dump beads | `D` | `---BEADS-BEGIN---` · `---DEVICE <id>---` · `---NOW <n> EPOCH <k>---` · bead JSON lines · `---BEADS-END---` |
| Dump wardrobe | `W` | `---MASKS-DUMP-BEGIN---` · `{"name","r","g","b"}` lines · `---MASKS-DUMP-END---` |
| Set wardrobe | `M`, then `name\|r\|g\|b` lines, then `.` | `---MASKS-OK <n>---` |
| Gated clear | `C<count>` | `---CLEAR-OK <n>---` or `---CLEAR-REFUSED have=<X> want=<Y>---` |

A bead:

```json
{"seq":6,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3,"mintId":"<32 hex>","with":{"id":"<peer id>","mask":"punk"}}
```

`e` and the dump's `NOW <n>` are **seconds** — Studio multiplies their
difference by 1000.

## 6 · The bead mapping

### 6.1 Fields

| Totem | Record |
|---|---|
| `mask` | `tags: [mask]` |
| `with` present | `kind: 'encounter'`, `provenance.mutualMint: true`, and a note naming the peer's mask and id |
| `with` absent | `kind: 'bloc'` |
| `mintId` | `provenance.mintId`, and the dedupe key |
| `e`, `ep`, `NOW`, `EPOCH` | `createdAt` and `timeAnchored` (§6.2) |
| `seq` | ordering inside an old-epoch batch; part of the composite dedupe key |
| `r`, `g`, `b` | **never reach a record.** Colour is wardrobe presentation; only the mask name travels |

`kind: 'bloc'` for a solo press. Studio's inline comment says
"solo -> visit" but its code says `bloc`, and the lexicon settles it:
*"bloc is the neutral default (a marked moment)"*, while `visit` means
being out — which the totem cannot know. The comment is stale.

**Struck beads are not pulled.** A crossing-out on the device means
"let go", and Studio excludes them from its push. Loom's proposals
*are* the review, so importing a bead already released would re-ask an
answered question. The result line reports how many were skipped.

### 6.2 Timestamps

The epoch rule is the whole thing: **a bead resolves only within the
power session that dumped it.**

| Case | Condition | `createdAt` | `timeAnchored` |
|---|---|---|---|
| 1 | bead's `ep` equals the dump's `EPOCH` | `syncWallClock − (NOW − e) × 1000` — a true instant | `true` |
| 2 | an earlier `ep` | picked date at midnight + `seq` seconds | `false` |
| 3 | no usable time | picked date at midnight | `false` |

`syncWallClock` is captured **once**, when the dump is read, and is the
anchor for every bead in it.

In case 1 the picked date is **ignored**, so a bead pressed at 23:50
keeps its real date even if you sync the next morning. Case 2 is the
only reason the date field exists, which is why it appears only when
`needsDay(dump)` is true: the wall clock is honestly unknowable across
a power loss, but the order is not, so `seq` seconds preserve the
ordering without inventing times.

`timeAnchored: false` is not a defect. The lexicon treats an anchored
instant as a real claim, so declining to invent one is the point.

### 6.3 Dedupe keys

- mutual mint: `cb:{mintId}`
- otherwise: `cb:{device}:{YYYY-MM-DD}:{ep}:{seq}:{t}`

where `t` is Studio's **display** string — local `HH:MM:SS` for a
resolved bead, `—` for an old-epoch one, `?` for no time.

Not to be confused with §3's dropped legacy `t`-beads. That is about no
longer *reading* a `t` field off the device; this `t` is *computed* by
the mapping from whichever timestamp case applied. It is always present
and is still part of the key.

This is a wart: a display string does identity work, so the key depends
on the syncing machine's timezone. It is kept **exactly**, because it is
an identity contract with beads already on the String. Changing it
would alter every key and break dedupe against everything Studio ever
pushed — the opposite of the goal. Inherited deliberately.

## 7 · The Feeds surface

`#/feeds`, one row. The ritual:

1. **Connect** — `navigator.serial.requestPort()`. A browser rule
   requires a user gesture, so it is a button. Loom persists no port;
   the browser remembers the grant.
2. **Pull** — send `D`, read to `---BEADS-END---`, capturing
   `syncWallClock` as the dump lands.
3. Parse, map, and write the beads as `proposal`, deduped against the
   local store.
4. Report: *11 beads — 9 already here, 2 new, 1 struck and skipped*.
   The new ones appear in the String column on their own days.
5. **Clear the device** — safe now, because the beads are durable in
   IndexedDB.
6. Later, in the ordinary desk flow: keep or release in the column,
   open to add a note, then Send.

On the page:

- **The totem row** — connect / pull / clear, last-synced time, last result.
- **The date field** — only when `needsDay(dump)`.
- **The device label** — auto-filled from `---DEVICE <id>---`, editable,
  and it **warns when the typed value disagrees** with what the device
  reported, because that is how duplicates get minted silently.
- **The wardrobe block** — read, edit, write back. Armed only after a
  successful pull, as Studio does, so a wardrobe is never written
  before it has been read. Masks seen on beads but absent from the
  wardrobe are folded in, as Studio does.
- **A paste fallback** — a textarea taking a dump copied from a serial
  monitor, through the identical parse path. Covers Firefox and Safari,
  which have no Web Serial, and a port that will not open.

Web Serial requires a secure context; `http://localhost:8108` qualifies.
It will not work on a phone — a capability the desk has and the phone
does not, stated rather than discovered.

## 8 · Error handling and the clear gate

The governing rule: **clear is offered only when the pull was complete
and every bead landed.** Stronger than Studio, which gates on a count
match alone.

| Condition | Behaviour |
|---|---|
| No Web Serial | The row says so and offers the paste box. A path, not an error |
| Port picker cancelled | Silent no-op |
| Device asleep, no answer | `readUntil` times out → "the totem didn't answer — wake it with a button press and pull again" |
| Truncated dump | `parseDump` throws; **nothing written**; clear unavailable |
| A bead line will not parse | Counted and reported; **clear withheld** |
| A bead fails validation | Named; the rest still land; clear withheld |
| `CLEAR-REFUSED have=X want=Y` | Both numbers shown — the device gained beads during the sync; pull again |
| Port disconnects mid-read | Surfaced; nothing written |

The malformed-line rule is a deliberate change from Studio, which wraps
each bead parse in `try{}catch(e){}` and silently drops what it cannot
read. Survivable when a human eyeballs a list; not when a clear
follows. Erasing a bead nobody ever saw is the worst outcome available,
so an unparseable line blocks the clear.

**The clear count is every bead line in the dump, including struck
ones** — the device compares against what it *holds*, not what you
kept. Sending the imported count would see the clear refused whenever
something had been struck.

The clear button arms then confirms, matching the editor's existing
delete-confirm panel. One confirm suffices: the beads are durable by
then.

## 9 · Changes to cultureblocs-string

Studio retires. **This repository's PR merges first**, so there is
never a window with no sync path.

- Delete `studio/` and its `:8102` service from `docker-compose.yml`.
- `README.md` — the repo-layout line and the Studio mentions.
- `MEETUP-RUNBOOK.md` — steps 45 and 53 tell you to clear the device
  via Studio.
- `HOST-SPEC.md` — the Studio references in the cutover checklist.

**Keep `culturebloc-totem/studio/index.html`.** It is self-contained,
needs no Loom, and is the break-glass tool if Web Serial in Loom ever
misbehaves with a device full of unsynced beads. Delete the String's
copy; keep the firmware repository's.

## 10 · Testing

Pure modules carry the weight. Test-first throughout.

- **`totem-protocol`** — fixtures: a clean dump, a truncated dump, a
  dump with a malformed bead line, a wardrobe dump, both clear replies.
- **`totem-beads`** — the three timestamp cases; the epoch rule at its
  boundary (`ep === dumpEpoch` and one either side); struck exclusion;
  a `cb:{mintId}` key and a composite; mask → tags; the encounter note;
  `needsDay` true only for case 2 and 3 dumps.
- **`totem-port`** — a fake `serial` yielding chunks **split mid-line**;
  one that never answers (timeout); one that disconnects mid-read.
- **`totem-sync`** — against `createMemStore`: proposals land with the
  right state and origin; duplicates skip; a truncated dump writes
  nothing; clear blocked after a partial pull; `syncWallClock` taken
  once.
- **`envelope`** — `adoptBead` sets proposal/origin/sourceApp, carries
  the device's provenance, and still validates.
- **`sender`** — a record with a `dedupeKey` posts that key; one
  without still posts `loom:<rkey>`.
- **`feeds`** view and controller — each state, including the date
  field appearing only for old-epoch dumps, the override warning, and
  clear withheld after a parse problem.

`sw.js`'s SHELL guard will require the new modules; `VERSION` goes to
`loom-5`.

Fixtures are built from the documented format. **A real dump from the
device would be a better fixture** and should replace them when one can
be captured.

## 11 · Changes to LOOM.md

- **Opening decision 3 is overturned.** It reads "Nothing is retired.
  Timeline, Studio, Pocket and Easel keep running." Studio is retired
  here. The decision stands for Timeline, Pocket and Easel; it must say
  so rather than be quietly contradicted.
- **§7 gains a fourth connector class** — a *device connector*: no
  schedule, no credential, runs when hardware is attached. The
  connector table gains a totem row.
- **§10 Phase 5** says "Studio keeps Web Serial". Overturned.
- **§3's layout** gains Feeds as a built surface, minimally.
- **`docs/backlog.md` item 1** is marked done, with its open questions
  resolved as recorded in §2 above.
