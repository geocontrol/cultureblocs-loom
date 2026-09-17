# Loom totem sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull beads off the M5StickS3 totem over USB from inside Loom, landing them as proposals on the days they belong to, and retire Studio.

**Architecture:** Four new modules under `app/lib/`, split so the two error-prone parts — protocol framing and timestamp resolution — are pure and testable with no hardware. `totem-port.js` is the only impure module and takes an injected `serial`, exactly as `stringClient` takes an injected `fetchImpl`. A new minimal `#/feeds` surface drives the ritual; the String column is the review, because it already renders proposals.

**Tech Stack:** Vanilla ES modules, no build step. `node:test` + `node:assert/strict`. Web Serial (`navigator.serial`). IndexedDB via the existing store, `createMemStore` in tests.

**Spec:** [`docs/superpowers/specs/2026-09-17-loom-totem-sync-design.md`](../specs/2026-09-17-loom-totem-sync-design.md)

## Global Constraints

- Run the suite with `node --test 'app/test/*.test.mjs'` — the quotes matter; a bare directory argument fails on node 22.
- Baseline before starting: **214 tests passing**. Never commit with a failing test.
- No framework, no build step, no dependencies. Vanilla ES modules only.
- Views are **pure functions** returning `html` template results; controllers own all I/O. Never mix the two in one file.
- All HTML goes through the `html` tagged template from `ui/html.js`, which escapes by default. Never concatenate user or device strings into markup.
- `e` and the dump's `NOW <n>` are **seconds**. Their difference is multiplied by 1000 to get milliseconds.
- Dedupe keys are byte-identical to Studio's, including the `t` display-string component. Do not "fix" them (spec §6.3).
- Every new module under `app/lib/` or `app/ui/` **must** be added to `SHELL` in `app/sw.js`, or `app/test/sw.test.mjs` fails.
- `app/sw.js`'s `VERSION` goes from `'loom-4'` to `'loom-5'` exactly once, in Task 8.
- Serial constants: **115200 8-N-1**.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/lib/totem-protocol.js` | **Create.** Pure. Dump/wardrobe/clear-reply text → structure. Throws on truncation. |
| `app/lib/totem-beads.js` | **Create.** Pure. Dump → bead bodies, `createdAt`, `timeAnchored`, dedupe keys. |
| `app/lib/totem-port.js` | **Create.** The only impure module. Web Serial with injected `serial`. |
| `app/lib/totem-sync.js` | **Create.** Orchestration: `runPull`, `runClear`, wardrobe read/write. |
| `app/lib/envelope.js` | **Modify.** Add `adoptBead` beside `createBead`. |
| `app/lib/sender.js` | **Modify.** Honour a record's own `dedupeKey`. |
| `app/ui/view-feeds.js` | **Create.** Pure view of the Feeds surface. |
| `app/ui/feeds.js` | **Create.** Controller: the ritual and its states. |
| `app/loom.js` | **Modify.** Route `#/feeds`. |
| `app/ui/view-panels.js` | **Modify.** A `feeds` link in the top bar. |
| `app/loom.css` | **Modify.** Feeds styles. |
| `app/sw.js` | **Modify.** SHELL entries + `VERSION`. |
| `app/test/fake-serial.mjs` | **Create.** Test double for `navigator.serial`. |
| `app/test/fixtures/totem-dumps.mjs` | **Create.** Dump fixtures as exported strings. |

---

### Task 1: The serial protocol, parsed

**Files:**
- Create: `app/lib/totem-protocol.js`
- Create: `app/test/fixtures/totem-dumps.mjs`
- Test: `app/test/totem-protocol.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `MARKERS` (object of marker strings), `DumpError` (Error subclass), `parseDump(text) -> { deviceId, now, epoch, beads, unparsed }`, `parseWardrobe(text) -> [{name,r,g,b}]`, `wardrobePayload(masks) -> string`, `parseClearReply(text) -> {ok:true,cleared} | {ok:false,have,want}`.

- [ ] **Step 1: Write the fixtures**

Create `app/test/fixtures/totem-dumps.mjs`:

```js
/* Dumps in the format culturebloc-totem/README.md documents (115200 8-N-1).
 * NOW/EPOCH is the device's uptime counter in SECONDS and its power-session
 * epoch. Bead 3 is from an earlier epoch: its order is known, its wall clock
 * is not. */
export const CLEAN = [
  '---BEADS-BEGIN---',
  '---DEVICE bloc-7---',
  '---NOW 9000 EPOCH 3---',
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3}',
  '{"seq":2,"mask":"gig","r":200,"g":40,"b":90,"e":6100,"ep":3,'
    + '"mintId":"a1b2c3d4e5f60718293a4b5c6d7e8f90","with":{"id":"peer-9","mask":"punk"}}',
  '{"seq":3,"mask":"cinema","r":13,"g":217,"b":53,"e":120,"ep":2}',
  '---BEADS-END---',
  '',
].join('\n');

/* No ---BEADS-END---: the read stopped early. */
export const TRUNCATED = CLEAN.slice(0, CLEAN.indexOf('---BEADS-END---'));

/* One line is not JSON. It must be reported, never silently dropped. */
export const MALFORMED = CLEAN.replace(
  '{"seq":3,"mask":"cinema","r":13,"g":217,"b":53,"e":120,"ep":2}',
  '{"seq":3,"mask":"cinem',
);

/* A bead struck out on the device: let go, not kept. */
export const WITH_STRUCK = CLEAN.replace(
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3}',
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3,"struck":true}',
);

/* A device with no clock anchor at all. */
export const NO_ANCHOR = [
  '---BEADS-BEGIN---',
  '---DEVICE bloc-7---',
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53}',
  '---BEADS-END---',
  '',
].join('\n');

export const WARDROBE = [
  '---MASKS-DUMP-BEGIN---',
  '{"name":"cinema","r":13,"g":217,"b":53}',
  '{"name":"gig","r":200,"g":40,"b":90}',
  '---MASKS-DUMP-END---',
  '',
].join('\n');

export const CLEAR_OK = '---CLEAR-OK 3---\n';
export const CLEAR_REFUSED = '---CLEAR-REFUSED have=4 want=3---\n';
```

- [ ] **Step 2: Write the failing tests**

Create `app/test/totem-protocol.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DumpError, MARKERS, parseClearReply, parseDump, parseWardrobe, wardrobePayload }
  from '../lib/totem-protocol.js';
import { CLEAN, CLEAR_OK, CLEAR_REFUSED, MALFORMED, NO_ANCHOR, TRUNCATED, WARDROBE }
  from './fixtures/totem-dumps.mjs';

test('a clean dump yields the device, its clock anchor and every bead', () => {
  const d = parseDump(CLEAN);
  assert.equal(d.deviceId, 'bloc-7');
  assert.equal(d.now, 9000);
  assert.equal(d.epoch, 3);
  assert.equal(d.beads.length, 3);
  assert.deepEqual(d.unparsed, []);
  assert.equal(d.beads[1].with.mask, 'punk');
});

test('a truncated dump throws rather than returning the beads it managed to read', () => {
  // A partial pull followed by a clear is how beads are lost.
  assert.throws(() => parseDump(TRUNCATED), (e) => e instanceof DumpError && /truncated/.test(e.message));
});

test('a bead line that will not parse is reported, never silently dropped', () => {
  const d = parseDump(MALFORMED);
  assert.equal(d.beads.length, 2);
  assert.equal(d.unparsed.length, 1);
});

test('a dump with no clock anchor still parses, with nothing to resolve against', () => {
  const d = parseDump(NO_ANCHOR);
  assert.equal(d.now, null);
  assert.equal(d.epoch, null);
  assert.equal(d.beads.length, 1);
});

test('a dump with no begin marker is not a dump', () => {
  assert.throws(() => parseDump('hello'), DumpError);
  assert.throws(() => parseDump(''), DumpError);
});

test('the wardrobe parses to masks with their colours', () => {
  assert.deepEqual(parseWardrobe(WARDROBE), [
    { name: 'cinema', r: 13, g: 217, b: 53 },
    { name: 'gig', r: 200, g: 40, b: 90 },
  ]);
});

test('a wardrobe payload is pipe-delimited lines closed by a lone dot', () => {
  assert.equal(wardrobePayload([{ name: 'cinema', r: 13, g: 217, b: 53 }]), 'cinema|13|217|53\n.\n');
  assert.equal(wardrobePayload([]), '.\n', 'an empty wardrobe still terminates');
});

test('the clear reply says how many went, or refuses with both counts', () => {
  assert.deepEqual(parseClearReply(CLEAR_OK), { ok: true, cleared: 3 });
  assert.deepEqual(parseClearReply(CLEAR_REFUSED), { ok: false, have: 4, want: 3 });
  assert.throws(() => parseClearReply('nothing useful'), DumpError);
});

test('the markers are exported, so the port knows what to read until', () => {
  assert.equal(MARKERS.beadsEnd, '---BEADS-END---');
  assert.equal(MARKERS.masksEnd, '---MASKS-DUMP-END---');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test 'app/test/totem-protocol.test.mjs'`
Expected: FAIL — `Cannot find module '.../app/lib/totem-protocol.js'`

- [ ] **Step 4: Write the implementation**

Create `app/lib/totem-protocol.js`:

```js
/* The totem's serial protocol, as text. Pure: no serial, no DOM, no clock.
 *
 * 115200 8-N-1. The device answers `D` with a framed dump, `W` with its mask
 * wardrobe, `M` + lines + `.` with a count, and `C<n>` with a gated clear.
 * See culturebloc-totem/README.md for the command table.
 *
 * A truncated dump THROWS. Returning the beads that happened to arrive would
 * let a clear erase the ones that did not. */

export const MARKERS = {
  beadsBegin: '---BEADS-BEGIN---',
  beadsEnd: '---BEADS-END---',
  masksBegin: '---MASKS-DUMP-BEGIN---',
  masksEnd: '---MASKS-DUMP-END---',
  masksOk: '---MASKS-OK',
  clearOk: '---CLEAR-OK',
  clearRefused: '---CLEAR-REFUSED',
};

export class DumpError extends Error {}

/* The text between two markers, or a DumpError naming which one is missing. */
function framed(text, begin, end, what) {
  const s = String(text ?? '');
  const from = s.indexOf(begin);
  if (from === -1) throw new DumpError(`this is not a ${what}: no ${begin}`);
  const to = s.indexOf(end);
  if (to === -1) throw new DumpError(`the ${what} is truncated: no ${end}`);
  return s.slice(from + begin.length, to);
}

const jsonLines = (body) => body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));

/* A `D` dump. `now` and `epoch` are the device's uptime counter in seconds and
 * its power-session epoch; both may be null on older firmware. `unparsed`
 * holds any bead line we could not read — the caller must not clear the
 * device while it is non-empty. */
export function parseDump(text) {
  const body = framed(text, MARKERS.beadsBegin, MARKERS.beadsEnd, 'bead dump');
  const device = /---DEVICE\s+([^\s-]+)/.exec(body);
  const now = /---NOW\s+(\d+)/.exec(body);
  const epoch = /EPOCH\s+(\d+)/.exec(body);
  const beads = [];
  const unparsed = [];
  for (const line of jsonLines(body)) {
    try {
      const o = JSON.parse(line);
      if (typeof o.seq !== 'number') throw new Error('a bead needs a seq');
      beads.push(o);
    } catch {
      unparsed.push(line);
    }
  }
  return {
    deviceId: device ? device[1] : null,
    now: now ? Number(now[1]) : null,
    epoch: epoch ? Number(epoch[1]) : null,
    beads,
    unparsed,
  };
}

/* A `W` dump. A mask line we cannot read is skipped: the wardrobe is
 * presentation, and one bad colour is not worth failing a sync for. */
export function parseWardrobe(text) {
  const body = framed(text, MARKERS.masksBegin, MARKERS.masksEnd, 'wardrobe dump');
  const out = [];
  for (const line of jsonLines(body)) {
    try {
      const m = JSON.parse(line);
      if (typeof m.name === 'string') out.push({ name: m.name, r: m.r | 0, g: m.g | 0, b: m.b | 0 });
    } catch { /* skipped on purpose */ }
  }
  return out;
}

/* The body sent after `M`: one `name|r|g|b` per line, then a lone dot. */
export function wardrobePayload(masks) {
  const lines = (masks || []).map((m) => `${m.name}|${m.r}|${m.g}|${m.b}`);
  return lines.length ? `${lines.join('\n')}\n.\n` : '.\n';
}

/* A `C<n>` reply. Refused means the device holds a different number of beads
 * than the caller counted — it gained one during the sync. */
export function parseClearReply(text) {
  const s = String(text ?? '');
  const refused = /---CLEAR-REFUSED\s+have=(\d+)\s+want=(\d+)---/.exec(s);
  if (refused) return { ok: false, have: Number(refused[1]), want: Number(refused[2]) };
  const ok = new RegExp(`${MARKERS.clearOk}\\s+(\\d+)---`).exec(s);
  if (ok) return { ok: true, cleared: Number(ok[1]) };
  throw new DumpError('the totem did not confirm the clear');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test 'app/test/totem-protocol.test.mjs'`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add app/lib/totem-protocol.js app/test/totem-protocol.test.mjs app/test/fixtures/totem-dumps.mjs
git commit -m "feat(totem): parse the totem's serial protocol

A truncated dump throws rather than returning the beads that arrived,
and a bead line that will not parse is reported rather than silently
dropped — both because a clear follows a pull, and erasing a bead
nobody ever saw is the worst outcome available.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 2: Beads, and the epoch rule

**Files:**
- Create: `app/lib/totem-beads.js`
- Test: `app/test/totem-beads.test.mjs`

**Interfaces:**
- Consumes: `parseDump` from Task 1 (for test input shape).
- Produces: `needsDay(dump) -> boolean`, `toBeads(dump, { syncWallClock, day, deviceLabel }) -> [{ dedupeKey, createdAt, timeAnchored, body }]`.

- [ ] **Step 1: Write the failing tests**

Create `app/test/totem-beads.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsDay, toBeads } from '../lib/totem-beads.js';
import { parseDump } from '../lib/totem-protocol.js';
import { CLEAN, NO_ANCHOR, WITH_STRUCK } from './fixtures/totem-dumps.mjs';

const SYNC = Date.parse('2026-09-17T12:00:00Z');   // the moment the dump was read
const OPTS = { syncWallClock: SYNC, day: '2026-09-16', deviceLabel: '' };

test('a bead from the dump’s own power session resolves to a true instant', () => {
  // NOW 9000, e 5240 -> 3760s before the sync = 12:00:00 - 1:02:40
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  assert.equal(first.createdAt, '2026-09-17T10:57:20.000Z');
  assert.equal(first.timeAnchored, true);
  assert.equal(first.body.provenance.timeAnchored, true);
});

test('the picked date is ignored for a resolved bead, so a late-night bead keeps its own date', () => {
  const [first] = toBeads(parseDump(CLEAN), { ...OPTS, day: '1999-01-01' });
  assert.equal(first.createdAt.slice(0, 10), '2026-09-17');
});

test('a bead from an earlier power session keeps its order and admits it has no instant', () => {
  // ep 2 against EPOCH 3: the wall clock is honestly unknowable, seq preserves order
  const third = toBeads(parseDump(CLEAN), OPTS).find((b) => b.body.tags[0] === 'cinema'
    && b.timeAnchored === false);
  assert.equal(third.createdAt, '2026-09-16T00:00:03.000Z');
  assert.equal(third.timeAnchored, false);
});

test('a dump with no clock anchor at all falls to the picked date at midnight', () => {
  const [only] = toBeads(parseDump(NO_ANCHOR), OPTS);
  assert.equal(only.createdAt, '2026-09-16T00:00:00.000Z');
  assert.equal(only.timeAnchored, false);
});

test('the date is needed only when a dump holds a bead that cannot be resolved', () => {
  assert.equal(needsDay(parseDump(CLEAN)), true, 'bead 3 is from an earlier epoch');
  assert.equal(needsDay(parseDump(NO_ANCHOR)), true);
  const allCurrent = parseDump(CLEAN);
  allCurrent.beads = allCurrent.beads.filter((b) => b.ep === 3);
  assert.equal(needsDay(allCurrent), false, 'nothing to ask about');
});

test('a mutual mint is an encounter, names its peer, and carries the shared mint id', () => {
  const enc = toBeads(parseDump(CLEAN), OPTS).find((b) => b.body.kind === 'encounter');
  assert.equal(enc.body.note, 'mutual mint with punk · peer-9');
  assert.equal(enc.body.provenance.mutualMint, true);
  assert.equal(enc.body.provenance.mintId, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assert.equal(enc.dedupeKey, 'cb:a1b2c3d4e5f60718293a4b5c6d7e8f90');
});

test('a solo press is a bloc — the neutral default; the totem cannot know you were out', () => {
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  assert.equal(first.body.kind, 'bloc');
  assert.equal(first.body.provenance.mutualMint, false);
  assert.equal('mintId' in first.body.provenance, false);
  assert.equal('note' in first.body, false);
});

test('the mask becomes the only tag, and its colour never reaches the record', () => {
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  assert.deepEqual(first.body.tags, ['cinema']);
  assert.equal(JSON.stringify(first.body).includes('217'), false, 'rgb is wardrobe presentation');
});

test('a bead with no mint id gets Studio’s composite key, byte for byte', () => {
  // Kept identical to Studio's, including `t` — a display string doing
  // identity work. Computed here the same way, so the test is timezone-proof.
  const [first] = toBeads(parseDump(CLEAN), OPTS);
  const t = new Date(Date.parse('2026-09-17T10:57:20Z')).toTimeString().slice(0, 8);
  assert.equal(first.dedupeKey, `cb:bloc-7:2026-09-17:3:1:${t}`);
});

test('an old-epoch bead’s key uses the em dash Studio displays for it', () => {
  const third = toBeads(parseDump(CLEAN), OPTS).find((b) => b.timeAnchored === false);
  assert.equal(third.dedupeKey, 'cb:bloc-7:2026-09-16:2:3:—');
});

test('the device names itself, and an override replaces it in the key', () => {
  const [plain] = toBeads(parseDump(CLEAN), OPTS);
  assert.equal(plain.body.provenance.device, 'bloc-7');
  const [named] = toBeads(parseDump(CLEAN), { ...OPTS, deviceLabel: 'bloc-9' });
  assert.equal(named.body.provenance.device, 'bloc-9');
  assert.match(named.dedupeKey, /^cb:bloc-9:/);
});

test('a bead struck out on the device is not pulled at all', () => {
  const beads = toBeads(parseDump(WITH_STRUCK), OPTS);
  assert.equal(beads.length, 2);
  assert.equal(beads.some((b) => b.dedupeKey.includes(':1:')), false);
});

test('every bead carries the provenance the lexicon requires', () => {
  for (const b of toBeads(parseDump(CLEAN), OPTS)) {
    assert.equal(b.body.provenance.app, 'culturebloc');
    assert.equal(b.body.provenance.mintedAt, b.createdAt);
    assert.equal(b.body.$type, 'com.cultureblocs.bead');
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'app/test/totem-beads.test.mjs'`
Expected: FAIL — `Cannot find module '.../app/lib/totem-beads.js'`

- [ ] **Step 3: Write the implementation**

Create `app/lib/totem-beads.js`:

```js
/* A totem dump becomes bead bodies. Pure: the clock arrives as
 * `syncWallClock`, taken once when the dump was read.
 *
 * THE EPOCH RULE, which is the whole of this file: a bead resolves to a real
 * instant only within the power session that dumped it. The device counts
 * seconds since boot; a power loss restarts that count, so a bead from an
 * earlier epoch has a known ORDER and an unknowable wall clock. Inventing a
 * time for it would be a lie the lexicon takes seriously, because
 * `timeAnchored` claims a real instant.
 *
 * Dedupe keys are Studio's, byte for byte — including `t`, a display string
 * doing identity work (see the spec, §6.3). Changing them would break dedupe
 * against every bead Studio ever pushed. */
import { BEAD } from './envelope.js';

const struck = (o) => o.keep === false || o.struck === true;

/* Is there a clock anchor to resolve against at all? */
const anchorable = (o, dump) => dump.now != null && typeof o.e === 'number';

/* Was this bead minted in the session that produced this dump? Older firmware
 * sends no `ep`, and a dump may carry no EPOCH — in both cases we have only
 * the device's word for it, and take it. */
const sameEpoch = (o, dump) => (o.ep === undefined || dump.epoch == null) || o.ep === dump.epoch;

const resolved = (o, dump) => anchorable(o, dump) && sameEpoch(o, dump);

/* True when a dump holds a bead whose date the person has to supply. */
export function needsDay(dump) {
  return (dump.beads || []).some((o) => !struck(o) && !resolved(o, dump));
}

export function toBeads(dump, { syncWallClock, day, deviceLabel = '' } = {}) {
  const device = deviceLabel || dump.deviceId || 'bloc-1';
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const out = [];
  for (const o of dump.beads || []) {
    if (struck(o)) continue;
    let createdAt;
    let timeAnchored;
    let t;
    if (resolved(o, dump)) {
      const at = new Date(syncWallClock - (dump.now - o.e) * 1000);
      createdAt = at.toISOString();
      timeAnchored = true;
      t = at.toTimeString().slice(0, 8);            // local HH:MM:SS, as Studio displays it
    } else if (anchorable(o, dump)) {
      createdAt = new Date(midnight + (o.seq ?? 0) * 1000).toISOString();
      timeAnchored = false;
      t = '—';                                       // order known, wall clock not
    } else {
      createdAt = new Date(midnight).toISOString();
      timeAnchored = false;
      t = '?';
    }
    const body = {
      $type: BEAD,
      createdAt,
      kind: o.with ? 'encounter' : 'bloc',
      tags: [o.mask || 'unknown'],
      provenance: {
        app: 'culturebloc',
        device,
        mintedAt: createdAt,
        mutualMint: Boolean(o.with),
        timeAnchored,
      },
    };
    if (o.mintId) body.provenance.mintId = o.mintId;
    if (o.with) body.note = `mutual mint with ${o.with.mask} · ${o.with.id}`;
    const dedupeKey = o.mintId
      ? `cb:${o.mintId}`
      : `cb:${device}:${createdAt.slice(0, 10)}:${o.ep ?? 0}:${o.seq}:${t}`;
    out.push({ dedupeKey, createdAt, timeAnchored, body });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test 'app/test/totem-beads.test.mjs'`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/totem-beads.js app/test/totem-beads.test.mjs
git commit -m "feat(totem): map a dump onto beads, honouring the epoch rule

A bead resolves to a real instant only within the power session that
dumped it. Across a power loss the order survives in seq and the wall
clock does not, so those beads take the picked date and say
timeAnchored: false rather than inventing an instant the lexicon would
read as a real claim.

Dedupe keys are Studio's byte for byte, including the t component —
a display string doing identity work. Changing it would break dedupe
against every bead Studio pushed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 3: The serial port, behind a fake

**Files:**
- Create: `app/lib/totem-port.js`
- Create: `app/test/fake-serial.mjs`
- Test: `app/test/totem-port.test.mjs`

**Interfaces:**
- Consumes: `MARKERS` from Task 1.
- Produces: `openPort({ serial, baudRate }) -> Promise<{ send(cmd), readUntil(marker, {timeoutMs}), close() }>`, `PortError`, and `hasSerial()` for the view. Test double: `fakeSerial({ reply, chunk, neverAnswers, disconnect }) -> { serial, written }`.

- [ ] **Step 1: Write the test double**

Create `app/test/fake-serial.mjs`:

```js
/* A fake navigator.serial. `reply(cmd)` decides what the device sends back;
 * `chunk` splits that reply into n-byte pieces to prove readUntil reassembles
 * lines split mid-stream, which is what a real port does. */
export function fakeSerial({ reply = () => '', chunk = 0, neverAnswers = false,
  disconnect = false } = {}) {
  const written = [];
  let emit = null;
  let finish = null;
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(c) {
      emit = (s) => c.enqueue(encoder.encode(s));
      finish = () => c.close();
    },
  });

  const writable = new WritableStream({
    write(bytes) {
      const cmd = new TextDecoder().decode(bytes);
      written.push(cmd);
      if (neverAnswers) return;
      if (disconnect) { finish(); return; }
      const text = reply(cmd);
      if (!text) return;
      if (!chunk) { emit(text); return; }
      for (let i = 0; i < text.length; i += chunk) emit(text.slice(i, i + chunk));
    },
  });

  const port = { readable, writable, async open() {}, async close() {} };
  return { serial: { requestPort: async () => port }, written };
}
```

- [ ] **Step 2: Write the failing tests**

Create `app/test/totem-port.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKERS } from '../lib/totem-protocol.js';
import { PortError, hasSerial, openPort } from '../lib/totem-port.js';
import { fakeSerial } from './fake-serial.mjs';
import { CLEAN } from './fixtures/totem-dumps.mjs';

const dumpOnD = (cmd) => (cmd.trim() === 'D' ? CLEAN : '');

test('send writes the command and readUntil returns everything up to the marker', async () => {
  const f = fakeSerial({ reply: dumpOnD });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  const text = await port.readUntil(MARKERS.beadsEnd);
  assert.deepEqual(f.written, ['D']);
  assert.match(text, /---BEADS-END---/);
  await port.close();
});

test('a reply split mid-line is reassembled', async () => {
  // A real port hands you bytes, not lines: 7 is deliberately awkward.
  const f = fakeSerial({ reply: dumpOnD, chunk: 7 });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  const text = await port.readUntil(MARKERS.beadsEnd);
  assert.match(text, /"mask":"cinema"/);
  assert.match(text, /---BEADS-END---/);
  await port.close();
});

test('a sleeping totem times out, and says so in words a person can act on', async () => {
  const f = fakeSerial({ neverAnswers: true });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  await assert.rejects(port.readUntil(MARKERS.beadsEnd, { timeoutMs: 20 }),
    (e) => e instanceof PortError && /didn’t answer|did not answer/.test(e.message));
  await port.close();
});

test('a port that disconnects mid-read fails rather than returning half a dump', async () => {
  const f = fakeSerial({ disconnect: true });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  await assert.rejects(port.readUntil(MARKERS.beadsEnd, { timeoutMs: 50 }),
    (e) => e instanceof PortError && /disconnect/.test(e.message));
});

test('hasSerial reports whether this browser can talk to a device at all', () => {
  assert.equal(hasSerial({}), false);
  assert.equal(hasSerial({ serial: {} }), true);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test 'app/test/totem-port.test.mjs'`
Expected: FAIL — `Cannot find module '.../app/lib/totem-port.js'`

- [ ] **Step 4: Write the implementation**

Create `app/lib/totem-port.js`:

```js
/* Web Serial, and the only impure module in the totem path.
 *
 * `serial` is injected exactly as stringClient takes a fetchImpl, so the tests
 * drive a fake and never need a device. Two realities the protocol table does
 * not mention live here: bytes arrive split mid-line, and a totem in deep
 * sleep never answers at all — which is the likeliest first experience, so its
 * message has to tell you to press a button rather than report a fault. */

export class PortError extends Error {}

/* Whether this browser can talk to a device. Firefox and Safari cannot. */
export const hasSerial = (nav = globalThis.navigator) => Boolean(nav && nav.serial);

export async function openPort({ serial = globalThis.navigator?.serial, baudRate = 115200 } = {}) {
  if (!serial) throw new PortError('this browser has no Web Serial');
  const port = await serial.requestPort();
  await port.open({ baudRate });
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const decoder = new TextDecoder();
  let buffer = '';

  /* reader.read() with a deadline. A timer left running would hold the process
   * open, so it is always cleared. */
  async function readChunk(ms) {
    let timer = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new PortError(
          'the totem didn’t answer — wake it with a button press and pull again')), ms); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    async send(cmd) {
      await writer.write(new TextEncoder().encode(cmd));
    },
    /* Everything received up to and including `marker`. Text already read past
     * a previous marker is kept, so two reads in a row do not lose bytes. */
    async readUntil(marker, { timeoutMs = 5000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const at = buffer.indexOf(marker);
        if (at !== -1) {
          const text = buffer.slice(0, at + marker.length);
          buffer = buffer.slice(at + marker.length);
          return text;
        }
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new PortError('the totem didn’t answer — wake it with a button press and pull again');
        }
        const { value, done } = await readChunk(left);
        if (done) throw new PortError('the totem disconnected part way through — nothing was saved');
        buffer += decoder.decode(value, { stream: true });
      }
    },
    async close() {
      try { reader.releaseLock(); writer.releaseLock(); } catch { /* already gone */ }
      try { await port.close(); } catch { /* already gone */ }
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test 'app/test/totem-port.test.mjs'`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add app/lib/totem-port.js app/test/fake-serial.mjs app/test/totem-port.test.mjs
git commit -m "feat(totem): Web Serial behind an injected port

serial is injected as stringClient takes a fetchImpl, so the fake drives
every test and no device is needed. readUntil owns the two realities the
protocol table omits: bytes split mid-line, and a totem in deep sleep
that never answers — the likeliest first experience, so it says press a
button rather than reporting a fault.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 4: Adopting a bead minted elsewhere

**Files:**
- Modify: `app/lib/envelope.js` — add `adoptBead` after `createBead` (near line 137)
- Test: `app/test/envelope.test.mjs` (append)

**Interfaces:**
- Consumes: the existing `create`, `check`, `stamp` internals of `envelope.js`.
- Produces: `loom.adoptBead(key, body, { dedupeKey, sourceApp })` → the stored envelope, with `state: 'proposal'`, `origin: 'connector:totem'`, and the body's own provenance left untouched.

- [ ] **Step 1: Write the failing tests**

Append to `app/test/envelope.test.mjs`:

```js
test('a bead minted on a device is adopted as a proposal, keeping its own provenance', async () => {
  const { store, loom: l } = await loom();
  const body = {
    $type: BEAD, createdAt: '2026-09-17T10:57:20.000Z', kind: 'bloc', tags: ['cinema'],
    provenance: { app: 'culturebloc', device: 'bloc-7', mintedAt: '2026-09-17T10:57:20.000Z',
      mutualMint: false, timeAnchored: true },
  };
  const env = await l.adoptBead(l.newKey(BEAD), body, { dedupeKey: 'cb:bloc-7:2026-09-17:3:1:x' });

  assert.equal(env.state, 'proposal', 'it sits on the dotted rail until kept');
  assert.equal(env.origin, 'connector:totem');
  assert.equal(env.sourceApp, 'culturebloc-totem');
  assert.equal(env.dedupeKey, 'cb:bloc-7:2026-09-17:3:1:x');
  assert.equal(env.body.provenance.app, 'culturebloc', 'the device’s provenance, not Loom’s');
  assert.equal(env.day, '2026-09-17');
  assert.ok(env.hlc, 'stamped by this device’s clock like any other write');
  assert.deepEqual(await store.getRecord(env.key), env);
});

test('an adopted bead is validated like any other write, because it is not on the String yet', async () => {
  const { loom: l } = await loom();
  await assert.rejects(
    l.adoptBead(l.newKey(BEAD), { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z' }, {}),
    InvalidRecord, 'kind is required',
  );
});

test('adopting over an existing key is refused', async () => {
  const { loom: l } = await loom();
  const body = { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z', kind: 'bloc',
    provenance: { app: 'culturebloc', mintedAt: '2026-09-17T10:00:00.000Z' } };
  const key = l.newKey(BEAD);
  await l.adoptBead(key, body, {});
  await assert.rejects(l.adoptBead(key, body, {}), /already exists/);
});

test('an adopted proposal can be kept, like any other proposal', async () => {
  const { loom: l } = await loom();
  const body = { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z', kind: 'bloc',
    provenance: { app: 'culturebloc', mintedAt: '2026-09-17T10:00:00.000Z' } };
  const env = await l.adoptBead(l.newKey(BEAD), body, {});
  assert.equal((await l.keep(env.key)).state, 'kept');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'app/test/envelope.test.mjs'`
Expected: FAIL — `l.adoptBead is not a function`

- [ ] **Step 3: Write the implementation**

In `app/lib/envelope.js`, change `create` to accept the fields that vary, then add `adoptBead`.

Replace the existing `create` function:

```js
  /* `at` is the moment of the save: the record's updatedAt, and the time its body records. */
  async function create(key, type, body, at, extra = {}) {
    check(type, body);
    if (await store.getRecord(key)) throw new Error(`${key} already exists`);
    const env = {
      key, type, rkey: key.slice(type.length + 1), body, state: 'kept', origin: 'loom', sourceApp: 'loom',
      createdAt: body.createdAt, updatedAt: at, hlc: await stamp(), deviceId,
      day: dayOf(type, body, body.createdAt),
      ...extra,
    };
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }
```

Add after `createStrand` in the returned object:

```js
    /* A bead minted on a device and pulled in over serial. It arrives whole
     * and already triaged on the device, so its body — provenance included —
     * is the device's own, not Loom's. It lands as a `proposal`: the dotted
     * rail in the String column is the review, kept or released in place.
     *
     * `dedupeKey` is the device's own identity for the bead (`cb:…`), carried
     * so Send posts it instead of `loom:<rkey>` and the String dedupes it
     * against anything Studio pushed. Validated like any other write: unlike
     * an import, this record is not on the String yet. */
    adoptBead(key, body, { dedupeKey = null, sourceApp = 'culturebloc-totem' } = {}) {
      const extra = { state: 'proposal', origin: 'connector:totem', sourceApp };
      if (dedupeKey) extra.dedupeKey = dedupeKey;
      return create(key, BEAD, body, iso(), extra);
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test 'app/test/envelope.test.mjs'`
Expected: PASS. Then `node --test 'app/test/*.test.mjs'` — still 214 + 4 new.

- [ ] **Step 5: Commit**

```bash
git add app/lib/envelope.js app/test/envelope.test.mjs
git commit -m "feat(totem): adopt a bead minted on a device

create() hardcodes state kept, origin loom and Loom's own provenance, so
a totem bead cannot go through createBead. adoptBead writes it as a
proposal with origin connector:totem and the device's provenance intact,
and still validates — unlike an import, this record is not on the String
yet, so there is nothing to be gained by hiding it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 5: Send honours a record's own dedupe key

**Files:**
- Modify: `app/lib/sender.js:195`
- Test: `app/test/sender.test.mjs` (append)

**Interfaces:**
- Consumes: `env.dedupeKey` written by `adoptBead` (Task 4).
- Produces: no new exports. Behaviour change only.

- [ ] **Step 1: Write the failing tests**

Append to `app/test/sender.test.mjs`:

```js
test('a record that brought its own dedupe key is posted under it, not under loom:', async () => {
  // A totem bead keeps `cb:<mintId>` so the String dedupes it against
  // anything Studio pushed; posting it as loom:<rkey> would mint a twin.
  const s = fakeString();
  const store = createMemStore();
  const l = await openLoom({ store, registry: await registry(), now: steppingNow(),
    newDeviceId: () => 'loom-test' });
  const body = { $type: BEAD, createdAt: '2026-09-17T10:00:00.000Z', kind: 'bloc',
    provenance: { app: 'culturebloc', mintedAt: '2026-09-17T10:00:00.000Z' } };
  await l.adoptBead(l.newKey(BEAD), body, { dedupeKey: 'cb:deadbeef' });

  await runSend({ store, client: s.client });

  assert.equal(s.posted[0].dedupeKey, 'cb:deadbeef');
  assert.equal(s.posted[0].sourceApp, 'culturebloc-totem');
});

test('a record Loom made still posts under loom:<rkey>', async () => {
  const s = fakeString();
  const store = createMemStore();
  const l = await openLoom({ store, registry: await registry(), now: steppingNow(),
    newDeviceId: () => 'loom-test' });
  const bead = await makeBead(l);

  await runSend({ store, client: s.client });

  assert.equal(s.posted[0].dedupeKey, `loom:${bead.rkey}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'app/test/sender.test.mjs'`
Expected: FAIL — the first test sees `loom:<rkey>` where `cb:deadbeef` was expected.

- [ ] **Step 3: Write the implementation**

In `app/lib/sender.js`, at the POST (line 195), replace:

```js
      const [res] = await client.postRecords([{ dedupeKey: `loom:${env.rkey}`, type: env.type,
        sourceApp: env.sourceApp || 'loom', createdAt: env.createdAt, body }]);
```

with:

```js
      // A record adopted from a device brings its own identity (`cb:…`); the
      // String must dedupe it against what that device already pushed.
      const [res] = await client.postRecords([{ dedupeKey: env.dedupeKey || `loom:${env.rkey}`,
        type: env.type, sourceApp: env.sourceApp || 'loom', createdAt: env.createdAt, body }]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test 'app/test/sender.test.mjs'` then `node --test 'app/test/*.test.mjs'`
Expected: PASS throughout.

- [ ] **Step 5: Commit**

```bash
git add app/lib/sender.js app/test/sender.test.mjs
git commit -m "feat(totem): Send posts a record's own dedupe key when it has one

A totem bead keeps cb:<mintId> so the String dedupes it against anything
Studio pushed; posting it as loom:<rkey> would mint a twin of every bead
already up there.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 6: The sync, orchestrated

**Files:**
- Create: `app/lib/totem-sync.js`
- Test: `app/test/totem-sync.test.mjs`

**Interfaces:**
- Consumes: `parseDump`, `parseWardrobe`, `wardrobePayload`, `parseClearReply`, `MARKERS` (Task 1); `needsDay`, `toBeads` (Task 2); a port object shaped like Task 3's; `loom.adoptBead` (Task 4).
- Produces: `absorbDump({ store, loom, dump, syncWallClock, day, deviceLabel }) -> { deviceId, count, added, duplicate, skipped, problems, needsDay }`, `runPull({ store, loom, port, now, day, deviceLabel })` (same return), `runClear({ port, count })`, `readWardrobe({ port })`, `writeWardrobe({ port, masks })`.
- `absorbDump` exists because the paste fallback has a dump but no port. `runPull` is the serial path: read, parse, then `absorbDump`. Both store through the one function, so the paste path cannot drift from the real one.

- [ ] **Step 1: Write the failing tests**

Create `app/test/totem-sync.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { absorbDump, readWardrobe, runClear, runPull, writeWardrobe } from '../lib/totem-sync.js';
import { parseDump } from '../lib/totem-protocol.js';
import { fakeSerial } from './fake-serial.mjs';
import { openPort } from '../lib/totem-port.js';
import { CLEAN, CLEAR_OK, CLEAR_REFUSED, MALFORMED, TRUNCATED, WARDROBE }
  from './fixtures/totem-dumps.mjs';
import { registry, steppingNow } from './helpers.mjs';

const SYNC = Date.parse('2026-09-17T12:00:00Z');

async function desk() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(),
    newDeviceId: () => 'loom-test' });
  return { store, loom };
}

const portFor = (text) => openPort({ serial: fakeSerial({ reply: () => text }).serial });

test('a pull writes every kept bead as a proposal and reports what happened', async () => {
  const { store, loom } = await desk();
  const port = await portFor(CLEAN);

  const r = await runPull({ store, loom, port, now: () => SYNC, day: '2026-09-16' });

  assert.equal(r.deviceId, 'bloc-7');
  assert.equal(r.added.length, 3);
  assert.equal(r.duplicate, 0);
  assert.deepEqual(r.problems, []);
  const records = await store.allRecords();
  assert.equal(records.length, 3);
  assert.ok(records.every((x) => x.state === 'proposal' && x.origin === 'connector:totem'));
});

test('pulling the same dump twice adds nothing the second time', async () => {
  const { store, loom } = await desk();
  await runPull({ store, loom, port: await portFor(CLEAN), now: () => SYNC, day: '2026-09-16' });

  const again = await runPull({ store, loom, port: await portFor(CLEAN), now: () => SYNC, day: '2026-09-16' });

  assert.equal(again.added.length, 0);
  assert.equal(again.duplicate, 3);
  assert.equal((await store.allRecords()).length, 3);
});

test('a truncated dump writes nothing at all', async () => {
  const { store, loom } = await desk();
  await assert.rejects(
    runPull({ store, loom, port: await portFor(TRUNCATED), now: () => SYNC, day: '2026-09-16' }),
    /truncated/,
  );
  assert.deepEqual(await store.allRecords(), []);
});

test('an unparseable bead line lands the rest but reports a problem, which withholds the clear', async () => {
  const { store, loom } = await desk();
  const r = await runPull({ store, loom, port: await portFor(MALFORMED), now: () => SYNC, day: '2026-09-16' });

  assert.equal(r.added.length, 2);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /could not be read/);
});

test('the pull reports whether a date was needed, and the count the device holds', async () => {
  const { store, loom } = await desk();
  const r = await runPull({ store, loom, port: await portFor(CLEAN), now: () => SYNC, day: '2026-09-16' });
  assert.equal(r.needsDay, true, 'bead 3 is from an earlier epoch');
  assert.equal(r.count, 3, 'what the device holds — the clear is gated on this');
});

test('the clock is read once, so every bead in a dump shares one anchor', async () => {
  const { store, loom } = await desk();
  let calls = 0;
  await runPull({ store, loom, port: await portFor(CLEAN), day: '2026-09-16',
    now: () => { calls += 1; return SYNC; } });
  assert.equal(calls, 1);
});

test('a clear confirms how many went', async () => {
  const port = await portFor(CLEAR_OK);
  assert.deepEqual(await runClear({ port, count: 3 }), { ok: true, cleared: 3 });
});

test('a clear the device refuses reports both counts, so the mismatch is visible', async () => {
  const port = await portFor(CLEAR_REFUSED);
  assert.deepEqual(await runClear({ port, count: 3 }), { ok: false, have: 4, want: 3 });
});

test('the clear sends the count the device is asked to match', async () => {
  const f = fakeSerial({ reply: () => CLEAR_OK });
  const port = await openPort({ serial: f.serial });
  await runClear({ port, count: 7 });
  assert.equal(f.written.at(-1), 'C7');
});

test('the wardrobe reads back, and writes as pipe-delimited lines closed by a dot', async () => {
  const f = fakeSerial({ reply: (cmd) => (cmd.trim() === 'W' ? WARDROBE : '---MASKS-OK 1---\n') });
  const port = await openPort({ serial: f.serial });

  assert.deepEqual((await readWardrobe({ port })).map((m) => m.name), ['cinema', 'gig']);
  await writeWardrobe({ port, masks: [{ name: 'gallery', r: 1, g: 2, b: 3 }] });

  assert.equal(f.written.includes('M'), true);
  assert.equal(f.written.at(-1), 'gallery|1|2|3\n.\n');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'app/test/totem-sync.test.mjs'`
Expected: FAIL — `Cannot find module '.../app/lib/totem-sync.js'`

- [ ] **Step 3: Write the implementation**

Create `app/lib/totem-sync.js`:

```js
/* One sync with the totem, shaped like runSend and runImport: the caller
 * supplies the store, the clock and the port, and gets back a report.
 *
 * The order matters. A pull stores every bead locally BEFORE the device is
 * cleared, so the durable step is IndexedDB rather than the network — which is
 * why Loom can clear the device before Send, where Studio had to push to the
 * String first. `problems` is what stands between a pull and a clear: if
 * anything could not be read or stored, the device keeps its beads. */
import { needsDay, toBeads } from './totem-beads.js';
import { MARKERS, parseClearReply, parseDump, parseWardrobe, wardrobePayload }
  from './totem-protocol.js';

const PULL_TIMEOUT = 8000;      // a dump of a few hundred beads, plus a sleepy device
const REPLY_TIMEOUT = 4000;

/* Store a parsed dump's beads as proposals. The one write path, shared by the
 * serial pull and the paste fallback, so the fallback cannot drift from the
 * real thing. Anything survivable becomes a `problems` entry, which the caller
 * must treat as "do not clear". */
export async function absorbDump({ store, loom, dump, syncWallClock, day, deviceLabel = '' }) {
  const problems = dump.unparsed.map((line) =>
    `a bead line could not be read, so the device has not been cleared: ${line.slice(0, 40)}…`);
  const known = new Set((await store.allRecords()).map((r) => r.dedupeKey).filter(Boolean));
  const added = [];
  let duplicate = 0;
  for (const bead of toBeads(dump, { syncWallClock, day, deviceLabel })) {
    if (known.has(bead.dedupeKey)) { duplicate += 1; continue; }
    try {
      const env = await loom.adoptBead(loom.newKey(BEAD), bead.body, { dedupeKey: bead.dedupeKey });
      added.push(env.key);
      known.add(bead.dedupeKey);
    } catch (err) {
      problems.push(`a bead from ${dump.deviceId || 'the totem'} was refused: ${err.message}`);
    }
  }
  return {
    deviceId: dump.deviceId,
    count: dump.beads.length + dump.unparsed.length,   // what the device holds
    added,
    duplicate,
    skipped: dump.beads.length - added.length - duplicate,
    problems,
    needsDay: needsDay(dump),
  };
}

/* The serial path: read the dump, then absorb it. Throws only when the dump
 * itself is unusable — a truncated read must never become a partial store. */
export async function runPull({ store, loom, port, now = () => Date.now(), day,
  deviceLabel = '' }) {
  await port.send('D');
  const text = await port.readUntil(MARKERS.beadsEnd, { timeoutMs: PULL_TIMEOUT });
  const dump = parseDump(text);                 // throws on a truncated dump
  return absorbDump({ store, loom, dump, syncWallClock: now(), day, deviceLabel });
}

/* Gated clear. `count` is what the device holds, from the pull that preceded
 * this — never a figure derived here, so a clear cannot be issued without a
 * pull behind it. */
export async function runClear({ port, count }) {
  await port.send(`C${count}`);
  const text = await port.readUntil('---', { timeoutMs: REPLY_TIMEOUT });
  return parseClearReply(text);
}

export async function readWardrobe({ port }) {
  await port.send('W');
  return parseWardrobe(await port.readUntil(MARKERS.masksEnd, { timeoutMs: REPLY_TIMEOUT }));
}

export async function writeWardrobe({ port, masks }) {
  await port.send('M');
  await port.send(wardrobePayload(masks));
  return port.readUntil(MARKERS.masksOk, { timeoutMs: REPLY_TIMEOUT });
}
```

Note two details: `runClear` reads until `'---'` because both replies begin with it and `parseClearReply` then distinguishes them; and the file imports `BEAD` directly rather than reading it off `loom`, so add

```js
import { BEAD } from './envelope.js';
```

to the imports at the top.

Also add a test for the shared write path, since it is now the seam the paste fallback uses:

```js
test('a pasted dump stores through the same path as a pull', async () => {
  const { store, loom } = await desk();
  const r = await absorbDump({ store, loom, dump: parseDump(CLEAN),
    syncWallClock: SYNC, day: '2026-09-16' });
  assert.equal(r.added.length, 3);
  assert.ok((await store.allRecords()).every((x) => x.state === 'proposal'));
});
```

and extend the import in the test file to `absorbDump` and `parseDump`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test 'app/test/totem-sync.test.mjs'`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/totem-sync.js app/test/totem-sync.test.mjs
git commit -m "feat(totem): one sync, orchestrated

Shaped like runSend and runImport. The pull stores every bead locally
before the device is cleared, so the durable step is IndexedDB rather
than the network — which is why Loom can clear before Send where Studio
had to push to the String first.

problems is what stands between a pull and a clear: if any line could
not be read or any bead was refused, the device keeps its beads.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 7: The Feeds view

**Files:**
- Create: `app/ui/view-feeds.js`
- Test: `app/test/view-feeds.test.mjs`

**Interfaces:**
- Consumes: `html` from `ui/html.js`.
- Produces: `feedsView(state) -> Safe`, where state is `{ serial, connected, busy, result, needsDay, day, deviceId, deviceLabel, masks, wardrobeArmed, paste, error }`.

- [ ] **Step 1: Write the failing tests**

Create `app/test/view-feeds.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedsView } from '../ui/view-feeds.js';

const view = (s) => String(feedsView({ serial: true, ...s }));

test('a browser without Web Serial is offered the paste box instead of a connect button', () => {
  const html = view({ serial: false });
  assert.ok(!html.includes('data-action="connect"'));
  assert.match(html, /data-action="paste"/);
  assert.match(html, /Firefox|Safari|cannot talk/i);
});

test('before connecting, connect is the only device action', () => {
  const html = view({ connected: false });
  assert.match(html, /data-action="connect"/);
  assert.ok(!html.includes('data-action="pull"'));
  assert.ok(!html.includes('data-action="clear"'));
});

test('once connected, the totem can be pulled', () => {
  const html = view({ connected: true });
  assert.match(html, /data-action="pull"/);
});

test('a pull reports what arrived, and offers the clear', () => {
  const html = view({ connected: true,
    result: { deviceId: 'bloc-7', count: 3, added: ['a', 'b'], duplicate: 1, skipped: 0, problems: [] } });
  // The comma is load-bearing: "2 new," cannot match a wrongly pluralised
  // "2 news,", whereas a bare /2 new/ would pass on either.
  assert.match(html, /2 new,/);
  assert.match(html, /1 already here/);
  assert.match(html, /3 beads on the totem/);
  assert.match(html, /data-action="clear"/);
});

test('a pull with a problem withholds the clear and says why', () => {
  const html = view({ connected: true,
    result: { count: 3, added: ['a'], duplicate: 0, skipped: 0,
      problems: ['a bead line could not be read, so the device has not been cleared: {"seq…'] } });
  assert.ok(!html.includes('data-action="clear"'), 'never erase a bead nobody saw');
  assert.match(html, /could not be read/);
});

test('struck beads are reported as skipped, so the count is accounted for', () => {
  const html = view({ connected: true,
    result: { count: 3, added: ['a'], duplicate: 0, skipped: 2, problems: [] } });
  assert.match(html, /2 struck/);
});

test('the date is asked for only when a dump needed one', () => {
  assert.ok(!view({ connected: true, result: { count: 1, added: [], duplicate: 0, skipped: 0, problems: [] }, needsDay: false })
    .includes('name="day"'));
  assert.match(view({ connected: true, needsDay: true, day: '2026-09-16',
    result: { count: 1, added: [], duplicate: 0, skipped: 0, problems: [] } }), /name="day"/);
});

test('the device label is shown, and disagreeing with the device is warned about', () => {
  const agree = view({ connected: true, deviceId: 'bloc-7', deviceLabel: 'bloc-7' });
  assert.ok(!/warn/i.test(agree));
  const clash = view({ connected: true, deviceId: 'bloc-7', deviceLabel: 'bloc-9' });
  assert.match(clash, /bloc-7/);
  assert.match(clash, /duplicate|disagree/i);
});

test('the wardrobe is inert until a pull has read it', () => {
  assert.ok(!view({ connected: true, wardrobeArmed: false }).includes('data-action="wardrobe-save"'));
  assert.match(view({ connected: true, wardrobeArmed: true, masks: [{ name: 'cinema', r: 1, g: 2, b: 3 }] }),
    /data-action="wardrobe-save"/);
});

test('while busy, the device actions are disabled', () => {
  const html = view({ connected: true, busy: true });
  assert.match(html, /disabled/);
});

test('an error is shown, and device names are escaped rather than injected', () => {
  const html = view({ connected: true, error: 'the totem didn’t answer',
    deviceId: '<script>alert(1)</script>' });
  assert.match(html, /didn’t answer/);
  assert.ok(!html.includes('<script>'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'app/test/view-feeds.test.mjs'`
Expected: FAIL — `Cannot find module '.../app/ui/view-feeds.js'`

- [ ] **Step 3: Write the implementation**

Create `app/ui/view-feeds.js`:

```js
/* The Feeds surface: one row, the totem. Pure.
 *
 * Deliberately not a review list. Studio needs one because it has nowhere to
 * put the beads; here they land as proposals in the String column, on their
 * own days, beside everything else from that day — which is the review.
 *
 * `clear` appears only when a pull completed with no problems. Erasing a bead
 * nobody ever saw is the worst outcome available, so the button is withheld
 * rather than warned about. */
import { html } from './html.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function resultLine(r) {
  // "new" never takes an s, so it is interpolated rather than pluralised.
  const bits = [`${r.added.length} new`];
  if (r.duplicate) bits.push(`${r.duplicate} already here`);
  if (r.skipped) bits.push(`${r.skipped} struck on the device`);
  return `${plural(r.count, 'bead')} on the totem — ${bits.join(', ')}.`;
}

/* state: { serial, connected, busy, result, needsDay, day, deviceId, deviceLabel,
 *          masks, wardrobeArmed, paste, error } */
export function feedsView(state = {}) {
  const { serial = true, connected = false, busy = false, result = null, needsDay = false,
    day = '', deviceId = '', deviceLabel = '', masks = [], wardrobeArmed = false,
    error = '' } = state;
  const clash = Boolean(deviceId && deviceLabel && deviceLabel !== deviceId);
  const canClear = Boolean(result && !result.problems.length && result.count > 0);
  const off = busy ? 'disabled' : '';

  return html`
    <section class="feeds">
      <h2>Feeds</h2>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}

      <article class="feed" data-feed="totem">
        <h3>Totem</h3>
        ${serial
    ? html`<p class="hint">Plug the totem in over USB. If it has been asleep, press a
             button to wake it first.</p>`
    : html`<p class="hint">This browser cannot talk to a device — Web Serial needs Chrome
             or Edge. You can still paste a dump below: send <code>D</code> in a serial
             monitor and copy the whole block.</p>`}

        <div class="row">
          ${serial && !connected ? html`<button type="button" class="primary" data-action="connect" ${off}>connect</button>` : ''}
          ${serial && connected ? html`<button type="button" class="primary" data-action="pull" ${off}>${busy ? 'pulling…' : 'pull'}</button>` : ''}
          ${canClear ? html`<button type="button" class="danger" data-action="clear" ${off}>clear the totem</button>` : ''}
        </div>

        ${result ? html`<p class="result">${resultLine(result)}</p>` : ''}
        ${result && result.problems.length
    ? html`<ul class="problems">${result.problems.map((p) => html`<li>${p}</li>`)}</ul>
             <p class="hint">The totem has not been cleared, so nothing is lost. Pull again.</p>`
    : ''}

        ${deviceId ? html`<p class="hint">the totem calls itself <code>${deviceId}</code></p>` : ''}
        <label>device label <input name="deviceLabel" value="${deviceLabel}"></label>
        ${clash ? html`<p class="warn">This disagrees with the totem, and the label is part of
          each bead’s identity — beads pulled under it will not match ones already
          sent as <code>${deviceId}</code>, so you may get duplicates.</p>` : ''}

        ${needsDay ? html`
          <label>the day these beads belong to <input type="date" name="day" value="${day}"></label>
          <p class="hint">Some of these were minted before the totem last lost power, so their
            time of day is genuinely unknowable. Their order is kept; the date is yours to give.</p>` : ''}

        ${wardrobeArmed ? html`
          <fieldset class="wardrobe"><legend>masks on the device</legend>
            ${masks.length ? html`<ul>${masks.map((m, i) => html`<li data-mask="${i}">
              <input name="maskName" value="${m.name}">
              <input type="color" name="maskColour" value="${rgbHex(m)}">
              <button type="button" data-action="mask-remove" ${off}>remove</button></li>`)}</ul>`
    : html`<p class="empty">The device holds no masks.</p>`}
            <div class="row">
              <button type="button" data-action="mask-add" ${off}>add a mask</button>
              <button type="button" data-action="wardrobe-save" ${off}>write to the totem</button>
            </div>
          </fieldset>` : ''}

        <details class="paste">
          <summary>paste a dump instead</summary>
          <p class="hint">Send <code>D</code> in a serial monitor and copy the block,
            <code>---BEADS-BEGIN---</code> to <code>---BEADS-END---</code>.</p>
          <textarea name="paste" rows="4"></textarea>
          <button type="button" data-action="paste" ${off}>read the pasted dump</button>
        </details>
      </article>
    </section>`;
}

const hex2 = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
export const rgbHex = (m) => `#${hex2(m.r)}${hex2(m.g)}${hex2(m.b)}`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test 'app/test/view-feeds.test.mjs'`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add app/ui/view-feeds.js app/test/view-feeds.test.mjs
git commit -m "feat(totem): the Feeds surface, as a pure view

One row, the totem. Deliberately no review list: the beads land as
proposals in the String column on their own days, which is the review
Studio has to build for itself.

The clear button is withheld rather than warned about when a pull
reported a problem — erasing a bead nobody ever saw is the worst outcome
available.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 8: The Feeds controller, wired into the desk

**Files:**
- Create: `app/ui/feeds.js`
- Modify: `app/loom.js` — import `mountFeeds`, add the `feeds` route beside `send` (near line 138)
- Modify: `app/ui/view-panels.js:75` — a `feeds` link in the top bar
- Modify: `app/loom.css` — Feeds styles
- Modify: `app/sw.js` — SHELL entries and `VERSION`
- Test: `app/test/desk-controllers.test.mjs` (append)

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: `mountFeeds(root, ctx) -> { render, unmount }`, matching `mountSend`.

- [ ] **Step 1: Write the failing tests**

Append to `app/test/desk-controllers.test.mjs`:

```js
/* The Feeds controller. `ctx.openPort` is the seam: the desk asks for a port
 * and does not know it is Web Serial. */
import { mountFeeds } from '../ui/feeds.js';
import { CLEAN, CLEAR_OK } from './fixtures/totem-dumps.mjs';
import { fakeSerial } from './fake-serial.mjs';
import { openPort } from '../lib/totem-port.js';

const totemCtx = async (reply) => {
  const ctx = await context();
  const f = fakeSerial({ reply });
  ctx.serial = { present: true };
  ctx.openPort = () => openPort({ serial: f.serial });
  ctx.written = f.written;
  return ctx;
};

test('Feeds offers connect, then pulls the totem’s beads in as proposals', async () => {
  const ctx = await totemCtx(() => CLEAN);
  const root = fakeRoot();
  await mountFeeds(root, ctx);
  assert.match(root.innerHTML, /data-action="connect"/);

  await root.fire('click', button('connect'));
  await root.fire('click', button('pull'));

  const records = await ctx.store.allRecords();
  assert.equal(records.length, 3);
  assert.ok(records.every((r) => r.state === 'proposal'));
  assert.match(root.innerHTML, /3 beads on the totem/);
  assert.ok(ctx.events.includes('broadcast changed'), 'the String column hears about it');
});

test('the clear is offered after a clean pull and sends the device’s own count', async () => {
  const ctx = await totemCtx((cmd) => (cmd.trim().startsWith('C') ? CLEAR_OK : CLEAN));
  const root = fakeRoot();
  await mountFeeds(root, ctx);
  await root.fire('click', button('connect'));
  await root.fire('click', button('pull'));
  assert.match(root.innerHTML, /data-action="clear"/);

  await root.fire('click', button('clear'));

  assert.equal(ctx.written.at(-1), 'C3');
});

test('a sleeping totem is reported in words, and nothing is written', async () => {
  const ctx = await context();
  const f = fakeSerial({ neverAnswers: true });
  ctx.openPort = () => openPort({ serial: f.serial });
  const root = fakeRoot();
  await mountFeeds(root, ctx);
  await root.fire('click', button('connect'));

  await root.fire('click', button('pull'));

  assert.match(root.innerHTML, /didn’t answer|did not answer/);
  assert.deepEqual(await ctx.store.allRecords(), []);
});

test('a browser with no Web Serial still renders, offering the paste path', async () => {
  const ctx = await context();
  ctx.openPort = null;
  const root = fakeRoot();
  await mountFeeds(root, ctx);
  assert.match(root.innerHTML, /data-action="paste"/);
  assert.ok(!root.innerHTML.includes('data-action="connect"'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'app/test/desk-controllers.test.mjs'`
Expected: FAIL — `Cannot find module '.../app/ui/feeds.js'`

- [ ] **Step 3: Write the controller**

Create `app/ui/feeds.js`:

```js
/* The Feeds controller: the totem sync ritual and its states.
 *
 * `ctx.openPort` is the seam — the desk asks for a port and does not know it
 * is Web Serial, so the tests drive a fake. The port is held open between
 * actions because connecting is a user gesture the browser will not let us
 * repeat silently. */
import { hasSerial } from '../lib/totem-port.js';
import { parseDump } from '../lib/totem-protocol.js';
import { absorbDump, readWardrobe, runClear, runPull, writeWardrobe } from '../lib/totem-sync.js';
import { errorLine, html, surfaceErrors } from './html.js';
import { feedsView } from './view-feeds.js';

const today = (now) => new Date(now()).toISOString().slice(0, 10);

export async function mountFeeds(root, ctx) {
  const state = {
    serial: Boolean(ctx.openPort) && (ctx.serial?.present ?? hasSerial()),
    connected: false, busy: false, result: null, needsDay: false,
    day: today(ctx.now), deviceId: '', deviceLabel: '', masks: [], wardrobeArmed: false,
    error: '',
  };
  let port = null;

  async function render() {
    root.innerHTML = String(html`${feedsView(state)}`);
  }

  /* Read the form fields the view owns, before an action uses them. */
  function readFields() {
    for (const el of root.querySelectorAll?.('.feeds [name]') || []) {
      if (el.name === 'day') state.day = el.value || state.day;
      if (el.name === 'deviceLabel') state.deviceLabel = el.value.trim();
    }
  }

  async function busy(fn) {
    state.busy = true;
    state.error = '';
    await render();
    try {
      await fn();
    } catch (err) {
      state.error = err?.message || String(err);
    } finally {
      state.busy = false;
    }
    await render();
  }

  /* Fold a pull or paste result into the view's state. */
  function absorbed(r) {
    state.result = r;
    state.deviceId = r.deviceId || state.deviceId;
    if (!state.deviceLabel && r.deviceId) state.deviceLabel = r.deviceId;
    state.needsDay = r.needsDay;
    if (r.added.length) ctx.broadcast();
  }

  async function onClick(e) {
    const btn = e.target.closest?.('button[data-action]');
    if (!btn) return;
    readFields();
    const action = btn.dataset.action;

    if (action === 'connect') {
      return busy(async () => {
        port = await ctx.openPort();
        state.connected = true;
      });
    }
    if (action === 'pull') {
      return busy(async () => {
        absorbed(await runPull({ store: ctx.store, loom: ctx.loom, port, now: ctx.now,
          day: state.day, deviceLabel: state.deviceLabel }));
        state.masks = await readWardrobe({ port }).catch(() => state.masks);
        state.wardrobeArmed = true;     // armed only after a successful pull
      });
    }
    if (action === 'clear') {
      return busy(async () => {
        const r = await runClear({ port, count: state.result.count });
        if (r.ok) { state.result = null; state.wardrobeArmed = false; }
        else state.error = `the totem refused: it holds ${r.have} beads, not ${r.want}. Pull again.`;
      });
    }
    if (action === 'paste') {
      return busy(async () => {
        const box = root.querySelector?.('textarea[name="paste"]');
        absorbed(await absorbDump({ store: ctx.store, loom: ctx.loom,
          dump: parseDump(box?.value || ''), syncWallClock: ctx.now(),
          day: state.day, deviceLabel: state.deviceLabel }));
      });
    }
    if (action === 'mask-add') {
      state.masks = [...state.masks, { name: 'new mask', r: 128, g: 128, b: 128 }];
      return render();
    }
    if (action === 'mask-remove') {
      const i = Number(btn.closest('[data-mask]')?.dataset.mask);
      state.masks = state.masks.filter((_, n) => n !== i);
      return render();
    }
    if (action === 'wardrobe-save') {
      return busy(() => writeWardrobe({ port, masks: state.masks }));
    }
  }

  const show = async (message) => { state.error = message; await render(); };
  const click = surfaceErrors(onClick, show);
  root.addEventListener('click', click);
  await render();
  return {
    render,
    async unmount() {
      root.removeEventListener('click', click);
      await port?.close?.().catch?.(() => {});
    },
  };
}
```

- [ ] **Step 4: Wire it into the shell**

In `app/loom.js`, add the import beside the other UI imports:

```js
import { mountFeeds } from './ui/feeds.js';
```

Add to `ctx` (beside `publisher`):

```js
    /* A connected totem port, or null when this browser has no Web Serial.
     * The desk asks for a port and does not know what it is. */
    openPort: hasSerial() ? (opts) => openPort(opts) : null,
```

with, at the top:

```js
import { hasSerial, openPort } from './lib/totem-port.js';
```

Add the route, after the `send` branch:

```js
    } else if (surface === 'feeds') {
      current.keep(await mountFeeds(pane, ctx), mounted);
```

In `app/ui/view-panels.js:75`, replace the settings link line:

```js
    <a class="feeds" href="#/feeds">feeds</a>
    <a class="settings" href="#/settings">settings</a>`;
```

Append to `app/loom.css`:

```css
.feeds{max-width:44rem}
.feed{border:1px solid var(--line);border-radius:6px;padding:.6rem .9rem 1rem;margin:.8rem 0}
.feed h3{font:12px var(--mono);color:var(--faint);font-weight:400;margin:.2rem 0 .5rem;text-transform:lowercase}
.feed .row{align-items:center;margin:.7rem 0}
.feed .result{font:12px var(--mono);margin:.4rem 0}
.feed .problems{margin:.3rem 0 .3rem 1.1rem;font-size:14px;color:var(--performance)}
.feed .warn{font-size:14px;color:var(--dwell);margin:.3rem 0}
.feed .wardrobe ul{list-style:none;margin:0;padding:0}
.feed .wardrobe li{display:flex;gap:.5rem;align-items:center;margin:.3rem 0}
.feed .paste summary{font-size:14px;color:var(--faint);cursor:pointer}
.feed .paste textarea{width:100%;font:12px var(--mono)}
```

In `app/sw.js`, add the four lib modules and the view to `SHELL`, and bump `VERSION`:

```js
const VERSION = 'loom-5';
```

`SHELL` gains `'./lib/totem-beads.js'`, `'./lib/totem-port.js'`, `'./lib/totem-protocol.js'`, `'./lib/totem-sync.js'`, `'./ui/feeds.js'`, `'./ui/view-feeds.js'` — each inserted in alphabetical order within its group.

Update `app/test/sw.test.mjs` to expect the new version:

```js
  assert.match(sw, /const VERSION = 'loom-5';/);
```

- [ ] **Step 5: Run the whole suite**

Run: `node --test 'app/test/*.test.mjs'`
Expected: PASS. The SHELL guard confirms every new module is precached.

- [ ] **Step 6: Commit**

```bash
git add app/ui/feeds.js app/loom.js app/ui/view-panels.js app/loom.css app/sw.js \
        app/test/desk-controllers.test.mjs app/test/sw.test.mjs
git commit -m "feat(totem): the Feeds controller, wired into the desk

ctx.openPort is the seam: the desk asks for a port and does not know it
is Web Serial, so the tests drive a fake. The port is held open between
actions because connecting is a user gesture the browser will not let us
repeat silently.

The wardrobe editor is armed only after a successful pull, as Studio
does, so a wardrobe is never written before it has been read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 9: The design documents follow the code

**Files:**
- Modify: `LOOM.md` — opening decision 3 (line ~20), §7's connector table (~line 431), §10 Phase 5 (~line 833), §3's layout (~line 128)
- Modify: `docs/backlog.md` — item 1

**Interfaces:** none; documentation only.

- [ ] **Step 1: Overturn opening decision 3**

In `LOOM.md`, replace:

```markdown
3. **Nothing is retired.** Timeline, Studio, Pocket and Easel keep
   running. Loom is built alongside; daily use decides the rest.
```

with:

```markdown
3. **Almost nothing is retired.** Timeline, Pocket and Easel keep
   running; Loom is built alongside and daily use decides the rest.
   *Studio is the one exception, retired in 2026-09 once Loom took Web
   Serial and the totem sync ([spec](docs/superpowers/specs/2026-09-17-loom-totem-sync-design.md)).
   The totem has no network path by construction, so a browser holding
   the serial port is the only way in, and two apps holding it was one
   too many.*
```

- [ ] **Step 2: Add the device connector class in §7**

After the three connector classes ("produces records", "context only", "proposes refs"), add:

```markdown
- **a device** — the totem. No schedule and no credential: it runs when
  hardware is attached. The sync is a ritual rather than a poll (pull,
  store, clear), and the clear is gated on a count the device itself
  checks, so the connector's contract is with a cable rather than an
  API.
```

And add a row to the connector table, after Last.fm:

```markdown
| Totem | `bloc` / `encounter` beads | Web Serial over USB; exists; ported from Studio, which retires with it |
```

- [ ] **Step 3: Correct §10 Phase 5 and §3's layout**

In §10 Phase 5, replace `Studio keeps Web Serial; Easel keeps` with:

```markdown
Studio is gone — Loom took Web Serial (§7). Easel keeps
```

In §3's layout block, change the Feeds line to record that it exists:

```
    ├ Feeds ─────────── connectors, their last run, their proposals — the totem today
```

- [ ] **Step 4: Mark backlog item 1 done**

In `docs/backlog.md`, change item 1's status row in the table to `**done** 2026-09`, and add at the top of its section:

```markdown
**Done**, 2026-09 — [spec](superpowers/specs/2026-09-17-loom-totem-sync-design.md),
[plan](superpowers/plans/2026-09-17-loom-totem-sync.md). Built as a fourth
connector class on a minimal Feeds surface; Studio retired; the Cardputer's
sync path ended with it. The open questions below were resolved as recorded in
the spec's §2.
```

- [ ] **Step 5: Verify nothing else claims Studio lives**

Run: `grep -rn "Studio" LOOM.md docs/backlog.md`
Expected: every remaining mention is either historical ("ported from Studio") or the retirement itself. Fix any that still read as present tense.

- [ ] **Step 6: Commit**

```bash
git add LOOM.md docs/backlog.md
git commit -m "docs(totem): the design follows the code

Opening decision 3 said nothing is retired. Studio is, so the decision
now says so and names why: the totem has no network path, a browser
holding the serial port is the only way in, and two apps holding it was
one too many.

§7 gains the device connector class and a totem row, §10 Phase 5 no
longer says Studio keeps Web Serial, and backlog item 1 is done.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
```

---

### Task 10: Retire Studio (cultureblocs-string)

**Files, in `~/TPM/cultureblocs-string` on a branch off `main`:**
- Delete: `studio/` (the whole directory)
- Modify: `docker-compose.yml` — the `studio` service
- Modify: `README.md` — the repo-layout line and Studio mentions
- Modify: `MEETUP-RUNBOOK.md` — steps at lines 45 and 53
- Modify: `HOST-SPEC.md` — Studio references in the cutover checklist

**Interfaces:** none; a deletion.

> **Do this only after the Loom PR is merged**, so there is never a window with no sync path.

- [ ] **Step 1: Branch**

```bash
cd ~/TPM/cultureblocs-string
git checkout main && git pull
git checkout -b chore/retire-studio
```

- [ ] **Step 2: Find every reference before deleting anything**

Run: `grep -rn "studio\|Studio" --include=* . | grep -v "^./.git/" | grep -v node_modules`
Record the list. Every hit must be handled in step 3 or 4.

- [ ] **Step 3: Delete the app and its service**

```bash
git rm -r studio/
```

In `docker-compose.yml`, delete the whole `studio:` service block (it maps `8102:80`).

- [ ] **Step 4: Update the prose**

- `README.md` — remove `studio/` from the repo-layout block; rewrite the Studio bullet to say the totem now syncs through Loom, linking `cultureblocs-loom`.
- `MEETUP-RUNBOOK.md` — steps 45 and 53 tell the operator to pull and clear via Studio on `:8102`. Rewrite both for Loom's Feeds surface on `:8108`: connect, pull, then clear once the beads show as proposals.
- `HOST-SPEC.md` — the cutover checklist mentions repointing Studio's settings. Remove Studio from it; the scrobbler and `sonos-lastfm` lines stay.

Keep `~/TPM/culturebloc-totem/studio/index.html` — it is self-contained, needs no Loom, and is the break-glass tool if Web Serial misbehaves with a device full of unsynced beads. **Do not touch the firmware repository.**

- [ ] **Step 5: Verify**

```bash
python3 -m pytest tests/ -q          # expect 246 passed
node --test 'web/test/*.test.mjs'    # expect 32 passing
docker compose config >/dev/null     # the compose file still parses
grep -rn "8102" . | grep -v "^./.git/"
```
Expected: no `8102` outside the git history.

- [ ] **Step 6: Commit and open the PR**

```bash
git add -A
git commit -m "chore: retire Studio — the totem syncs through Loom now

Studio existed to hold the serial port, and Loom now holds it: pull,
store as proposals, then a gated clear, all on the desk (see the totem
sync spec in cultureblocs-loom). Two apps competing for one USB device
was one too many.

The copy in culturebloc-totem/studio/index.html is deliberately kept as
a break-glass tool: self-contained, needs no Loom, and the thing to
reach for if Web Serial ever misbehaves with a device full of unsynced
beads.

This also ends the Cardputer's only sync path, accepted deliberately
when the spec was agreed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FsXhJoKwTNNuynEKLjgeu5"
git push -u origin chore/retire-studio
gh pr create --title "chore: retire Studio — the totem syncs through Loom now" --body "…"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §1 goal, USB-only rationale | 1–8 |
| §2 decisions (full port, totem only, proposal, Feeds, clear timing, inputs, keys, `bloc`, struck) | 2, 4, 6, 7, 8 |
| §3 out of scope | honoured by omission; legacy `t` absent from Task 2 |
| §4.1 `totem-protocol` | 1 |
| §4.2 `totem-beads` | 2 |
| §4.3 `totem-port` | 3 |
| §4.4 `totem-sync` | 6 |
| §4.5 `adoptBead` | 4 |
| §4.6 sender `dedupeKey` | 5 |
| §5 protocol table | 1 (fixtures + parsers), 6 (commands sent) |
| §6.1 field mapping | 2 |
| §6.2 three timestamp cases | 2 |
| §6.3 dedupe keys | 2 |
| §7 Feeds surface, all page elements | 7, 8 |
| §8 error handling, clear gate | 3 (port errors), 6 (`problems`), 7 (clear withheld), 8 (messages) |
| §9 retire Studio | 10 |
| §10 testing | every task |
| §11 LOOM.md changes | 9 |

No gaps.

**2. Placeholders** — none. The only `…` is in the `gh pr create --body` of Task 10, where the body is the commit message already written above it.

**3. Type consistency** — `parseDump` returns `{deviceId, now, epoch, beads, unparsed}`, used with those names in Tasks 2, 6, 8. `toBeads` returns `{dedupeKey, createdAt, timeAnchored, body}`, consumed as such in 6 and 8. `runPull` returns `{deviceId, count, added, duplicate, skipped, problems, needsDay}`, and `feedsView`'s `result` reads `count`, `added`, `duplicate`, `skipped`, `problems` — consistent. `adoptBead(key, body, {dedupeKey, sourceApp})` is called with that shape in 6 and 8. `openPort` returns `{send, readUntil, close}`, used in 6 and 8.

The first draft of this plan had `runPull` and the controller's paste handler
each map-and-store. That is now fixed: `absorbDump` in Task 6 is the single
write path, `runPull` reads then calls it, and the controller calls it directly
for the paste fallback — so the fallback cannot drift from the real thing, and
the controller holds no store-writing logic of its own. Task 6 carries a test
for `absorbDump` because it is now the seam.
