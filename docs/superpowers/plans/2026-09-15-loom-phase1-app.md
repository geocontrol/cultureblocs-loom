# Loom Phase 1 — Local-Only App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Loom Phase 1 in `cultureblocs-loom/app/`, a local-first PWA for one desk browser:
- **Thread:** read the diary by month and by day.
- **Mint:** a bead in two taps.
- **Compose:** entries and beads, with an anchored refs editor and photos on beads.
- **Import** from the String, **send** to the String, and **back up / restore**.

All data lives in IndexedDB. No server of Loom's own.

**Architecture:** Vanilla ES modules and no build step, the house style of Easel, Pocket and Rounds.
- **`app/lib/`:** pure logic, plus one IndexedDB adapter. Tested in node against an in-memory store with the same interface.
- **`app/ui/`:** pure `view-*.js` functions return escaped HTML strings; thin controllers mount them and delegate events.
- **`app/vendor/`:** the String's `sdk/js` modules and lexicons, copied in, with a drift test.
- **`loom.js`:** the shell. It routes surfaces, applies posture, keeps tabs in step and manages the service worker.

**Tech Stack:** Browser ES modules, IndexedDB, Service Worker, WebCrypto. Node 22 `node:test` with no dependencies. Served by `nginx:1.27-alpine` on `:8108`.

**Spec:** `/Users/marksimpkins/TPM/cultureblocs-loom/docs/superpowers/specs/2026-09-14-loom-phase1-design.md`. Task 13 applies its §11 corrections, which were found while prototyping. Parent design: `LOOM.md` §3, §4, §9, §10.

## Global Constraints

- **Repository:** all work is in `/Users/marksimpkins/TPM/cultureblocs-loom`; paths are relative to it. The sibling `/Users/marksimpkins/TPM/cultureblocs-string` is read only by `scripts/vendor-sdk.sh` and the drift test.
- **Branch:** `feature/phase1-loom-app`, created from `docs/phase1-spec`. The spec and this plan ride along in the same PR. **Never push, and never touch the String's `data/`.**
- **No dependencies and no build step.** Nothing in `app/lib/`, `app/ui/` or `app/vendor/` may import `node:*`. Only `app/lib/store.js` and the `ui/*.js` controllers may touch the DOM or IndexedDB.
- **Port `:8108`.** Easel has 8105.
- **Stores:** IndexedDB database `loom`, version 1. `records` (keyPath `key`, indexes `day` and `stringId`), `blobs` (keyPath `hash`), `meta` (keyPath `k`).
- **Record key:** `"<nsid>/<rkey>"`. The rkey is a TID for Loom-made records, or the String's id for imported ones. A strand item referencing a local record is `{ uri: "loom://<key>" }`; on the String it is `spine://records/<id>`.
- **HLC stamps** use the String's format: `<13-digit ms>-<5-digit counter>-<node>`.
- **Photos** are named `/media/<sha256><ext>`, with `.jpg` for `image/jpeg`, `.png`, `.webp`, `.gif` and `.heic` (the String's `MEDIA_EXT`).
- **Send** posts `dedupeKey: "loom:<rkey>"` with `sourceApp: "loom"`. Drafts are never sent.
- **Validation gate:** every Loom-made or edited record passes `LexiconRegistry.validateRecord` and `anchorProblems` before it is stored. Imported records are stored even if invalid, and flagged.
- **Commits:** Conventional Commits scoped `phase1`, each ending with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
  ```
- **Tests:** `node --test app/test/*.test.mjs`, run from the repo root.
- **Git prerequisite:** git on this machine refuses to run until the Xcode licence is accepted (`sudo xcodebuild -license accept`, done by the user). If any `git` command prints the licence message, stop and report BLOCKED.

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `scripts/vendor-sdk.sh`, `app/vendor/**` | 1 | Copy the String's `sdk/js` and lexicons; `lexicons/index.json` lists them for the browser |
| `app/lib/lexicons.js` | 1 | `loadRegistry(readJson, base)` builds a `LexiconRegistry` |
| `app/test/helpers.mjs`, `app/test/vendor.test.mjs` | 1 | Shared test fixtures; the drift test |
| `docker-compose.yml` | 1 | nginx serving `app/` on :8108 |
| `app/lib/tid.js`, `app/lib/hlc.js` | 2 | Record keys that sort; HLC stamps |
| `app/lib/keys.js`, `app/lib/memstore.js`, `app/lib/store.js` | 3 | Keys and item URIs; the in-memory and IndexedDB stores |
| `app/test/store-contract.js`, `app/test/store.html` | 3 | One storage contract, run in node and in the browser |
| `app/lib/envelope.js` | 4 | `openLoom`: the single write path (mint, create, save, keep, release, finish, drafts) |
| `app/lib/day.js`, `app/lib/anchors.js` | 5 | Thread's model; UTF-8 anchor conversions and re-anchoring |
| `app/lib/media.js`, `app/lib/images.js`, `app/test/fake-string.mjs` | 6 | Photo naming and storage; resizing; the fake String used by later tests |
| `app/lib/string-client.js`, `app/lib/importer.js` | 7 | The String's HTTP API; one-way import |
| `app/lib/sender.js` | 8 | Manual send |
| `app/lib/backup.js` | 9 | One-file backup and restore |
| `app/ui/html.js`, `app/ui/view-*.js` | 10 | Escaped HTML and pure views |
| `app/ui/thread.js`, `mint.js`, `compose.js`, `string-panel.js` | 11 | Controllers |
| `app/index.html`, `loom.js`, `loom.css`, `sw.js`, `manifest.webmanifest`, icons | 12 | Shell, posture, service worker, PWA |
| spec, `README.md` | 13 | Spec corrections, run instructions, and the end-to-end run |

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Check git works and the spec branch exists**

Run: `git -C /Users/marksimpkins/TPM/cultureblocs-loom rev-parse --verify docs/phase1-spec && git -C /Users/marksimpkins/TPM/cultureblocs-loom status --short`
Expected: a commit hash and a clean tree. If git prints the Xcode licence message, stop: BLOCKED.

- [ ] **Step 2: Create the branch**

```bash
cd /Users/marksimpkins/TPM/cultureblocs-loom
git checkout docs/phase1-spec
git checkout -b feature/phase1-loom-app
```

---

### Task 1: Scaffold, vendored SDK, drift test, serving

**Files:**
- Create: `scripts/vendor-sdk.sh`, `app/lib/lexicons.js`, `app/test/helpers.mjs`, `app/test/vendor.test.mjs`, `docker-compose.yml`
- Generate: `app/vendor/lexicon.js`, `strip.js`, `refs.js`, and `app/vendor/lexicons/**` including `index.json`

**Interfaces:**
- Produces:
  - `loadRegistry(readJson: (path) => Promise<object>, base = './vendor/lexicons/') => Promise<LexiconRegistry>`
  - Test helpers: `APP` (the app directory), `readJson(path)`, `registry() => Promise<LexiconRegistry>`, `steppingNow(start?) => () => number` (advances 1 ms per call)
  - From `app/vendor`: `LexiconRegistry` (`.load(docs)`, `.validateRecord(nsid, body)`, `.recordTypes()`); `anchorProblems(nsid, body)`; `stripRef`, `contentHash(obj) => Promise<hex>`

- [ ] **Step 1: Write the drift test and helpers**

Create `app/test/helpers.mjs`:

```js
// Shared test fixtures: a registry from the vendored lexicons, a memory store,
// and deterministic clocks.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../lib/lexicons.js';

export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readJson = async (path) => JSON.parse(readFileSync(join(APP, path), 'utf8'));

export const registry = () => loadRegistry(readJson, 'vendor/lexicons/');

/* A clock that advances 1 ms per call, starting at `start`. */
export function steppingNow(start = Date.parse('2026-09-15T09:00:00Z')) {
  let t = start;
  return () => (t += 1);
}
```

Create `app/lib/lexicons.js`:

```js
/* Build a LexiconRegistry from app/vendor/lexicons. The browser cannot list a
 * directory, so vendor-sdk.sh writes index.json; `readJson` is fetch in the
 * browser and fs in node. */
import { LexiconRegistry } from '../vendor/lexicon.js';

export async function loadRegistry(readJson, base = './vendor/lexicons/') {
  const files = await readJson(`${base}index.json`);
  const docs = await Promise.all(files.map((f) => readJson(base + f)));
  return new LexiconRegistry().load(docs);
}
```

Create `app/test/vendor.test.mjs`:

```js
/* app/vendor must be an exact copy of the String's sdk/js and lexicons, or
 * Loom validates and strips by different rules than the String. Refresh with
 * scripts/vendor-sdk.sh. Skipped when the sibling repository is not present. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './helpers.mjs';

const STRING = process.env.STRING_REPO || join(APP, '..', '..', 'cultureblocs-string');
const present = existsSync(join(STRING, 'sdk', 'js', 'strip.js'));
const read = (p) => readFileSync(p, 'utf8');

test('vendored sdk/js modules match the String', { skip: present ? false : `no cultureblocs-string at ${STRING}` }, () => {
  for (const f of ['lexicon.js', 'strip.js', 'refs.js']) {
    assert.equal(read(join(APP, 'vendor', f)), read(join(STRING, 'sdk', 'js', f)), `app/vendor/${f} has drifted — run scripts/vendor-sdk.sh`);
  }
});

test('vendored lexicons match the String', { skip: present ? false : `no cultureblocs-string at ${STRING}` }, () => {
  const files = JSON.parse(read(join(APP, 'vendor', 'lexicons', 'index.json')));
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.equal(read(join(APP, 'vendor', 'lexicons', f)), read(join(STRING, 'lexicons', f)), `lexicon ${f} has drifted — run scripts/vendor-sdk.sh`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test app/test/*.test.mjs`
Expected: failures, because `app/vendor/lexicons/index.json` and `app/vendor/*.js` don't exist yet.

- [ ] **Step 3: Write and run the vendor script**

Create `scripts/vendor-sdk.sh`:

```sh
#!/bin/sh
# Refresh app/vendor from the sibling cultureblocs-string checkout.
# Loom must work with no String running, so the validator, strip, refs
# helpers and lexicons are copied in rather than loaded from the String.
# app/test/vendor.test.mjs fails if these copies drift from the String's.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
string=${STRING_REPO:-"$here/../cultureblocs-string"}
[ -d "$string/sdk/js" ] || { echo "no cultureblocs-string at $string (set STRING_REPO)" >&2; exit 1; }

vendor="$here/app/vendor"
rm -rf "$vendor/lexicons"
mkdir -p "$vendor/lexicons"
cp "$string/sdk/js/lexicon.js" "$string/sdk/js/strip.js" "$string/sdk/js/refs.js" "$vendor/"
(cd "$string/lexicons" && find . -name '*.json' | sed 's|^\./||' | sort) > "$vendor/lexicons/.files"
while read -r f; do
  mkdir -p "$vendor/lexicons/$(dirname "$f")"
  cp "$string/lexicons/$f" "$vendor/lexicons/$f"
done < "$vendor/lexicons/.files"
# The browser cannot list a directory, so ship the list as JSON.
node -e 'const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f.replace(/\.files$/,"index.json"),JSON.stringify(fs.readFileSync(f,"utf8").trim().split("\n"),null,2)+"\n");fs.unlinkSync(f)' "$vendor/lexicons/.files"
echo "vendored $(ls "$vendor"/*.js | wc -l | tr -d ' ') modules and $(node -e 'console.log(require(process.argv[1]).length)' "$vendor/lexicons/index.json") lexicons from $string"
```

Run: `chmod +x scripts/vendor-sdk.sh && scripts/vendor-sdk.sh`
Expected: `vendored 3 modules and 17 lexicons from /Users/marksimpkins/TPM/cultureblocs-loom/../cultureblocs-string` (the count is 17 at `cultureblocs-string` main as of 2026-09-15).

- [ ] **Step 4: Add serving**

Create `docker-compose.yml`:

```yaml
# Loom, served as static files for the desk (Phase 1 is localhost-only).
#   docker compose up -d        ->  http://localhost:8108
services:
  loom:
    image: nginx:1.27-alpine
    ports: ["8108:80"]
    volumes:
      - ./app:/usr/share/nginx/html:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 3s
      retries: 3
```

- [ ] **Step 5: Run the tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail|skipped)'`
Expected: `# pass 2`, `# fail 0`, `# skipped 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/vendor-sdk.sh app/vendor app/lib/lexicons.js app/test/helpers.mjs app/test/vendor.test.mjs docker-compose.yml
git commit -m "feat(phase1): vendor the String's sdk/js and lexicons, with a drift test

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 2: TIDs and HLC stamps

**Files:**
- Create: `app/test/tid.test.mjs`, `app/test/hlc.test.mjs`
- Create: `app/lib/tid.js`, `app/lib/hlc.js`

**Interfaces:**
- Produces:
  - `tidGenerator({ nowMicros?: () => bigint, clockId?: number }) => () => string` (13-character, sortable, monotonic)
  - `isTid(s) => boolean`
  - `createClock(node, { now?, last? }) => { tick(): string, observe(stamp): string, last: string|null }`
  - `parseStamp(s) => { ms, counter, node }` (throws on bad input)

- [ ] **Step 1: Write the tests**

Create `app/test/tid.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTid, tidGenerator } from '../lib/tid.js';

test('TIDs are 13 base32-sortable characters', () => {
  const tid = tidGenerator({ nowMicros: () => 1_757_926_800_000_000n, clockId: 7 });
  const t = tid();
  assert.equal(t.length, 13);
  assert.ok(isTid(t), t);
});

test('TIDs sort in the order they were made, even within one microsecond or a clock step back', () => {
  const times = [1_757_926_800_000_000n, 1_757_926_800_000_000n, 1_757_926_799_000_000n, 1_757_926_900_000_000n];
  const tid = tidGenerator({ nowMicros: () => times.shift(), clockId: 3 });
  const made = [tid(), tid(), tid(), tid()];
  assert.deepEqual([...made].sort(), made);
  assert.equal(new Set(made).size, 4);
});

test('isTid rejects the obvious non-TIDs', () => {
  for (const bad of ['', 'self', '3lqk2m4x7c22', 'zzzzzzzzzzzzz', '3LQK2M4X7C22P', 42]) assert.equal(isTid(bad), false, String(bad));
});
```

Create `app/test/hlc.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, parseStamp } from '../lib/hlc.js';

test("stamps use the String's format and round-trip", () => {
  const clock = createClock('desk-1', { now: () => 1757926800123 });
  const s = clock.tick();
  assert.equal(s, '1757926800123-00000-desk-1');
  assert.deepEqual(parseStamp(s), { ms: 1757926800123, counter: 0, node: 'desk-1' });
});

test('ticks stay monotonic when the wall clock stalls or steps back', () => {
  const walls = [1000, 1000, 500, 2000];
  const clock = createClock('d', { now: () => walls.shift() });
  const stamps = [clock.tick(), clock.tick(), clock.tick(), clock.tick()];
  assert.deepEqual([...stamps].sort(), stamps);
  assert.equal(stamps[2], '0000000001000-00002-d');
});

test('observing a later stamp (e.g. from the String) moves past it', () => {
  const clock = createClock('d', { now: () => 1000 });
  clock.tick();
  assert.equal(clock.observe('0000000005000-00007-string'), '0000000005000-00008-d');
  assert.ok(clock.tick() > '0000000005000-00008-d');
});

test('a clock seeded with the last stored stamp never issues an earlier one', () => {
  const clock = createClock('d', { now: () => 10, last: '0000000009999-00003-d' });
  assert.ok(clock.tick() > '0000000009999-00003-d');
});

test('bad node ids and stamps are refused', () => {
  assert.throws(() => createClock('has space'));
  assert.throws(() => parseStamp('1757926800123.00000.d'));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/tid.test.mjs app/test/hlc.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/tid.js` (and `hlc.js`)

- [ ] **Step 3: Implement**

Create `app/lib/tid.js`:

```js
/* ATProto TIDs: 13 characters of base32-sortable, from 53 bits of
 * microseconds since the epoch and a 10-bit clock id. Lexically sortable, so
 * a record's rkey orders the way it was made. Monotonic within a generator:
 * two calls in the same microsecond (or a clock that steps back) still yield
 * increasing TIDs. */

const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
const TID_RE = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;

export function isTid(s) {
  return typeof s === 'string' && TID_RE.test(s);
}

function encode(n, length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ALPHABET[Number(n % 32n)] + out;
    n /= 32n;
  }
  return out;
}

/* nowMicros: () => bigint microseconds. clockId: 0..1023. */
export function tidGenerator({ nowMicros = () => BigInt(Date.now()) * 1000n, clockId } = {}) {
  const clock = BigInt(clockId ?? Math.floor(Math.random() * 1024));
  let last = 0n;
  return function tid() {
    let t = nowMicros();
    if (t <= last) t = last + 1n;
    last = t;
    return encode((t << 10n) | clock, 13);
  };
}
```

Create `app/lib/hlc.js`:

```js
/* Hybrid logical clock stamps in the String's format
 * (cultureblocs-string string/app/hlc.py):  <13-digit ms>-<5-digit counter>-<node>
 * Fixed-width, so plain string comparison is causal order in any language. */

const MAX_COUNTER = 99_999;
const NODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STAMP_RE = /^(\d{13})-(\d{5})-([A-Za-z0-9_-]{1,64})$/;

export function parseStamp(stamp) {
  const m = typeof stamp === 'string' ? STAMP_RE.exec(stamp) : null;
  if (!m) throw new Error(`not an HLC stamp: ${JSON.stringify(stamp)}`);
  return { ms: Number(m[1]), counter: Number(m[2]), node: m[3] };
}

const fmt = (ms, counter, node) =>
  `${String(ms).padStart(13, '0')}-${String(counter).padStart(5, '0')}-${node}`;

export function createClock(node, { now = () => Date.now(), last = null } = {}) {
  if (!NODE_RE.test(node)) throw new Error(`bad node id: ${JSON.stringify(node)}`);
  let ms = 0, counter = 0;
  const set = (m, c) => {
    if (c > MAX_COUNTER) { m += 1; c = 0; }       // spill, as the String does
    ms = m; counter = c;
    return fmt(ms, counter, node);
  };
  const clock = {
    /* A stamp for a local write, after every stamp issued or observed. */
    tick() {
      const t = now();
      return t > ms ? set(t, 0) : set(ms, counter + 1);
    },
    /* Merge a stamp from elsewhere (an imported record); returns a local stamp after both. */
    observe(stamp) {
      const r = parseStamp(stamp);
      const t = Math.max(now(), ms, r.ms);
      if (t === ms && t === r.ms) return set(t, Math.max(counter, r.counter) + 1);
      if (t === ms) return set(t, counter + 1);
      if (t === r.ms) return set(t, r.counter + 1);
      return set(t, 0);
    },
    get last() { return ms ? fmt(ms, counter, node) : null; },
  };
  if (last) clock.observe(last);
  return clock;
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 10`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/tid.js app/lib/hlc.js app/test/tid.test.mjs app/test/hlc.test.mjs
git commit -m "feat(phase1): sortable TID record keys and HLC stamps in the String's format

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 3: Keys and the two stores

**Files:**
- Create: `app/test/store-contract.js`, `app/test/store.test.mjs`, `app/test/store.html`
- Create: `app/lib/keys.js`, `app/lib/memstore.js`, `app/lib/store.js`

**Interfaces:**
- Produces:
  - `keys.js`: `recordKey(type, rkey)`, `splitKey(key) => { type, rkey }`, `itemUri(key) => 'loom://…'`, `keyFromItemUri(uri) => key|null`, `spineUri(id)`, `idFromSpineUri(uri) => id|null`, `dayOf(type, body, createdAt) => 'YYYY-MM-DD'|null`
  - **The store interface**, shared by `createMemStore()` and `await openStore(indexedDB?, name?)`:
    - records: `getRecord(key)`, `putRecord(env)`, `deleteRecord(key)`, `allRecords()`, `recordsByDay(day)`, `recordByStringId(id)`
    - blobs: `getBlob(hash) => { hash, mime, blob }`, `putBlob(row)`, `deleteBlob(hash)`, `blobHashes()`
    - meta: `getMeta(k)`, `setMeta(k, v)`, `deleteMeta(k)`, `allMeta() => object`
    - `clear()`; and, on the IndexedDB store only, `close()`
    - All methods are async. Stored values are copies of what was passed in.

- [ ] **Step 1: Write the contract and its runners**

Create `app/test/store-contract.js`:

```js
/* Behaviours every store implementation must have. Run in node against
 * lib/memstore.js (store.test.mjs) and in a browser against lib/store.js's
 * IndexedDB store (store.html). `assert` is node:assert or the page's shim. */

const rec = (key, day, extra = {}) => ({ key, type: 'com.cultureblocs.bead', rkey: key.split('/').pop(),
  day, body: { note: key }, ...extra });

export const storeContract = {
  async 'records round-trip, list, and delete'(store, assert) {
    await store.putRecord(rec('com.cultureblocs.bead/a', '2026-09-14'));
    await store.putRecord(rec('com.cultureblocs.bead/b', '2026-09-15', { stringId: 'sid-b' }));
    assert.deepEqual((await store.getRecord('com.cultureblocs.bead/a')).body, { note: 'com.cultureblocs.bead/a' });
    assert.equal((await store.allRecords()).length, 2);
    await store.deleteRecord('com.cultureblocs.bead/a');
    assert.equal(await store.getRecord('com.cultureblocs.bead/a'), undefined);
  },
  async 'records are found by day and by String id'(store, assert) {
    await store.putRecord(rec('com.cultureblocs.bead/a', '2026-09-14'));
    await store.putRecord(rec('com.cultureblocs.bead/b', '2026-09-15', { stringId: 'sid-b' }));
    assert.deepEqual((await store.recordsByDay('2026-09-15')).map((r) => r.key), ['com.cultureblocs.bead/b']);
    assert.equal((await store.recordByStringId('sid-b')).key, 'com.cultureblocs.bead/b');
    assert.equal(await store.recordByStringId('nope'), undefined);
  },
  async 'a stored record is a copy, not the caller\'s object'(store, assert) {
    const r = rec('com.cultureblocs.bead/a', '2026-09-14');
    await store.putRecord(r);
    r.body.note = 'mutated after put';
    assert.equal((await store.getRecord('com.cultureblocs.bead/a')).body.note, 'com.cultureblocs.bead/a');
  },
  async 'blobs round-trip and list by hash'(store, assert) {
    await store.putBlob({ hash: 'h1', mime: 'image/jpeg', blob: new Blob(['pixels'], { type: 'image/jpeg' }) });
    const row = await store.getBlob('h1');
    assert.equal(row.mime, 'image/jpeg');
    assert.equal(await row.blob.text(), 'pixels');
    assert.deepEqual(await store.blobHashes(), ['h1']);
    await store.deleteBlob('h1');
    assert.equal(await store.getBlob('h1'), undefined);
  },
  async 'meta values round-trip, list and delete'(store, assert) {
    await store.setMeta('deviceId', 'desk-1');
    await store.setMeta('draft:x', { body: { note: 'half' } });
    assert.equal(await store.getMeta('deviceId'), 'desk-1');
    assert.deepEqual(await store.allMeta(), { deviceId: 'desk-1', 'draft:x': { body: { note: 'half' } } });
    await store.deleteMeta('draft:x');
    assert.equal(await store.getMeta('draft:x'), undefined);
  },
  async 'clear empties every store'(store, assert) {
    await store.putRecord(rec('com.cultureblocs.bead/a', '2026-09-14'));
    await store.putBlob({ hash: 'h1', mime: 'image/png', blob: new Blob(['x']) });
    await store.setMeta('k', 1);
    await store.clear();
    assert.deepEqual(await store.allRecords(), []);
    assert.deepEqual(await store.blobHashes(), []);
    assert.deepEqual(await store.allMeta(), {});
  },
};
```

Create `app/test/store.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemStore } from '../lib/memstore.js';
import { storeContract } from './store-contract.js';

for (const [name, run] of Object.entries(storeContract)) {
  test(`memstore: ${name}`, () => run(createMemStore(), assert));
}
```

Create `app/test/store.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>Loom store contract — IndexedDB</title>
<pre id="out">running…</pre>
<script type="module">
  // Open at http://localhost:8108/test/store.html. Runs the same contract as
  // test/store.test.mjs against the real IndexedDB store, in a throwaway
  // database, and prints PASS/FAIL per case. window.storeContractResult holds
  // { passed, failed } for scripted checks.
  import { openStore } from '../lib/store.js';
  import { storeContract } from './store-contract.js';

  const assert = {
    equal(a, b) { if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
    deepEqual(a, b) {
      const s = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());
      if (JSON.stringify(a) !== JSON.stringify(b) && s(a) !== s(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    },
  };
  const lines = [];
  let passed = 0, failed = 0;
  for (const [name, run] of Object.entries(storeContract)) {
    const dbName = `loom-contract-${Math.random().toString(36).slice(2)}`;
    const store = await openStore(indexedDB, dbName);
    try { await run(store, assert); lines.push(`PASS ${name}`); passed++; }
    catch (e) { lines.push(`FAIL ${name}: ${e.message}`); failed++; }
    finally { store.close(); indexedDB.deleteDatabase(dbName); }
  }
  lines.push(`\n${passed} passed, ${failed} failed`);
  document.getElementById('out').textContent = lines.join('\n');
  window.storeContractResult = { passed, failed };
</script>
```

- [ ] **Step 2: Run the node half to see it fail**

Run: `node --test app/test/store.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/memstore.js`

- [ ] **Step 3: Implement**

Create `app/lib/keys.js`:

```js
/* Local record keys and the item URIs strands use to point at them.
 *
 * In Loom a strand's items reference local keys, loom://<nsid>/<rkey>; on the
 * String they reference spine://records/<id>. Import rewrites one way, send the
 * other (see importer.js and sender.js). */

export const recordKey = (type, rkey) => `${type}/${rkey}`;

export function splitKey(key) {
  const i = key.lastIndexOf('/');
  return { type: key.slice(0, i), rkey: key.slice(i + 1) };
}

export const itemUri = (key) => `loom://${key}`;
export const keyFromItemUri = (uri) =>
  typeof uri === 'string' && uri.startsWith('loom://') ? uri.slice('loom://'.length) : null;

export const spineUri = (stringId) => `spine://records/${stringId}`;
export const idFromSpineUri = (uri) =>
  typeof uri === 'string' && uri.startsWith('spine://records/') ? uri.slice('spine://records/'.length) : null;

/* The day a record belongs to, for the Thread index: a strand's `day`, else createdAt. */
export function dayOf(type, body, createdAt) {
  const src = type === 'com.cultureblocs.strand' && typeof body?.day === 'string' ? body.day : createdAt;
  return typeof src === 'string' ? src.slice(0, 10) : null;
}
```

Create `app/lib/memstore.js`:

```js
/* In-memory store with the same interface as store.js's IndexedDB store.
 * Used by the node tests and by anything that needs a scratch store. */

export function createMemStore() {
  const records = new Map(), blobs = new Map(), meta = new Map();
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    async getRecord(key) { return clone(records.get(key)); },
    async putRecord(env) { records.set(env.key, clone(env)); },
    async deleteRecord(key) { records.delete(key); },
    async allRecords() { return [...records.values()].map(clone); },
    async recordsByDay(day) { return [...records.values()].filter((r) => r.day === day).map(clone); },
    async recordByStringId(id) { return clone([...records.values()].find((r) => r.stringId === id)); },
    async getBlob(hash) { return blobs.get(hash); },
    async putBlob(row) { blobs.set(row.hash, row); },
    async deleteBlob(hash) { blobs.delete(hash); },
    async blobHashes() { return [...blobs.keys()]; },
    async getMeta(k) { return clone(meta.get(k)); },
    async setMeta(k, v) { meta.set(k, clone(v)); },
    async deleteMeta(k) { meta.delete(k); },
    async allMeta() { return Object.fromEntries([...meta].map(([k, v]) => [k, clone(v)])); },
    async clear() { records.clear(); blobs.clear(); meta.clear(); },
  };
}
```

Create `app/lib/store.js`:

```js
/* IndexedDB store: database "loom", stores records / blobs / meta.
 * Browser-only; lib/memstore.js implements the same interface for node.
 *
 *   records  keyPath key,  indexes day, stringId
 *   blobs    keyPath hash  { hash, mime, blob }
 *   meta     keyPath k     { k, v }
 */

const DB = 'loom', VERSION = 1;

function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openStore(indexedDB = globalThis.indexedDB, name = DB) {
  const open = indexedDB.open(name, VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    const records = db.createObjectStore('records', { keyPath: 'key' });
    records.createIndex('day', 'day');
    records.createIndex('stringId', 'stringId');
    db.createObjectStore('blobs', { keyPath: 'hash' });
    db.createObjectStore('meta', { keyPath: 'k' });
  };
  const db = await request(open);

  function run(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const result = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  }

  return {
    getRecord: (key) => run('records', 'readonly', (s) => s.get(key)),
    putRecord: (env) => run('records', 'readwrite', (s) => { s.put(env); }),
    deleteRecord: (key) => run('records', 'readwrite', (s) => { s.delete(key); }),
    allRecords: () => run('records', 'readonly', (s) => s.getAll()),
    recordsByDay: (day) => run('records', 'readonly', (s) => s.index('day').getAll(day)),
    recordByStringId: (id) => run('records', 'readonly', (s) => s.index('stringId').get(id)),
    getBlob: (hash) => run('blobs', 'readonly', (s) => s.get(hash)),
    putBlob: (row) => run('blobs', 'readwrite', (s) => { s.put(row); }),
    deleteBlob: (hash) => run('blobs', 'readwrite', (s) => { s.delete(hash); }),
    blobHashes: () => run('blobs', 'readonly', (s) => s.getAllKeys()),
    getMeta: async (k) => (await run('meta', 'readonly', (s) => s.get(k)))?.v,
    setMeta: (k, v) => run('meta', 'readwrite', (s) => { s.put({ k, v }); }),
    deleteMeta: (k) => run('meta', 'readwrite', (s) => { s.delete(k); }),
    allMeta: async () => Object.fromEntries(
      (await run('meta', 'readonly', (s) => s.getAll())).map(({ k, v }) => [k, v])),
    clear: () => Promise.all(['records', 'blobs', 'meta'].map((n) => run(n, 'readwrite', (s) => { s.clear(); }))),
    close: () => db.close(),
  };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 16`, `# fail 0`. The browser half (`store.html`) runs in Task 12, once the app is served.

- [ ] **Step 5: Commit**

```bash
git add app/lib/keys.js app/lib/memstore.js app/lib/store.js app/test/store-contract.js app/test/store.test.mjs app/test/store.html
git commit -m "feat(phase1): record keys, and one storage contract for the memory and IndexedDB stores

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 4: The envelope — the single write path

**Files:**
- Create: `app/test/envelope.test.mjs`
- Create: `app/lib/envelope.js`

**Interfaces:**
- Consumes: `createClock` and `tidGenerator` (Task 2); `recordKey` and `dayOf` (Task 3); the store interface (Task 3); `LexiconRegistry` and `anchorProblems` (Task 1).
- Produces:
  - Constants `BEAD`, `STRAND`; errors `InvalidRecord` (`.problems`) and `Conflict` (`.current`)
  - `await openLoom({ store, registry, now?, newDeviceId?, nowMicros? })` returns:
    - `deviceId`
    - `validate(type, body) => string[]`
    - `create(type, body, { origin, state }) => env`
    - `mint({ mask?, note?, kind? }) => env`
    - `save(key, body, { expectUpdatedAt? }) => env` — throws `Conflict` or `InvalidRecord`; editing a proposal makes it `kept`; clears the draft
    - `get(key)`
    - `keep(key)` (proposal → kept), `finish(key)` (draft → kept), `release(key)` (deletes; proposals only)
    - `saveDraft(key, body)`, `getDraft(key) => { body, at }|undefined`, `discardDraft(key)`
  - **Envelope fields:** `key`, `type`, `rkey`, `body`, `state`, `origin`, `sourceApp`, `createdAt`, `updatedAt`, `hlc`, `deviceId`, `day`

- [ ] **Step 1: Write the tests**

Create `app/test/envelope.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, Conflict, InvalidRecord, STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { isTid } from '../lib/tid.js';
import { createMemStore } from '../lib/memstore.js';
import { registry, steppingNow } from './helpers.mjs';

async function loom(store = createMemStore()) {
  return { store, loom: await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' }) };
}

test('mint writes a valid kept bead with Loom provenance and a TID key', async () => {
  const { store, loom: l } = await loom();
  const env = await l.mint({ mask: 'ART', note: '  Rothko room, empty.  ', kind: 'visit' });
  assert.ok(isTid(env.rkey));
  assert.equal(env.key, `${BEAD}/${env.rkey}`);
  assert.equal(env.state, 'kept');
  assert.equal(env.origin, 'mint');
  assert.equal(env.sourceApp, 'loom');
  assert.equal(env.day, env.createdAt.slice(0, 10));
  assert.deepEqual(env.body.tags, ['art']);
  assert.equal(env.body.note, 'Rothko room, empty.');
  assert.equal(env.body.provenance.app, 'loom');
  assert.equal(env.body.provenance.mintedAt, env.createdAt);
  assert.match(env.hlc, /^\d{13}-\d{5}-desk-1$/);
  assert.deepEqual(await store.getRecord(env.key), env);
});

test('an invalid record is refused and nothing is stored', async () => {
  const { store, loom: l } = await loom();
  await assert.rejects(
    l.create(STRAND, { $type: STRAND, createdAt: '2026-09-15T09:00:00Z' }, { origin: 'compose', state: 'draft' }),
    (e) => e instanceof InvalidRecord && e.problems.includes('$.items: required field missing'));
  assert.deepEqual(await store.allRecords(), []);
});

test('an anchor outside the text is refused', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'Saw Severance' });
  const body = { ...bead.body, refs: [{ type: 'work', role: 'subject', descriptor: { label: 'Severance' },
    index: { byteStart: 4, byteEnd: 99 } }] };
  await assert.rejects(l.save(bead.key, body), (e) => e instanceof InvalidRecord
    && e.problems[0] === '$.refs[0].index: 4..99 is outside note (13 bytes)');
});

test('a strand wraps a bead by local item uri and indexes by its day', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  const strand = await l.create(STRAND, { $type: STRAND, createdAt: '2026-09-15T20:00:00Z', day: '2026-09-14T00:00:00Z',
    title: 'Sunday', items: [{ uri: itemUri(bead.key) }] }, { origin: 'compose', state: 'draft' });
  assert.equal(strand.day, '2026-09-14');
  assert.equal(strand.body.items[0].uri, `loom://${bead.key}`);
});

test('save refuses when another tab wrote first, and writes when it did not', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'one' });
  const other = await l.save(bead.key, { ...bead.body, note: 'other tab' }, { expectUpdatedAt: bead.updatedAt });
  await assert.rejects(l.save(bead.key, { ...bead.body, note: 'mine' }, { expectUpdatedAt: bead.updatedAt }),
    (e) => e instanceof Conflict && e.current.body.note === 'other tab');
  const mine = await l.save(bead.key, { ...bead.body, note: 'mine' }, { expectUpdatedAt: other.updatedAt });
  assert.equal(mine.body.note, 'mine');
  assert.ok(mine.hlc > other.hlc);
});

test('editing a proposal keeps it; keep and release only apply to proposals', async () => {
  const { store, loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await store.putRecord({ ...bead, key: `${BEAD}/p1`, rkey: 'p1', state: 'proposal', origin: 'import' });
  const edited = await l.save(`${BEAD}/p1`, { ...bead.body, note: 'kept by editing' });
  assert.equal(edited.state, 'kept');
  await assert.rejects(l.release(bead.key), /only a proposal/);
  await assert.rejects(l.keep(bead.key), /a kept record cannot become kept/);
  await store.putRecord({ ...bead, key: `${BEAD}/p2`, rkey: 'p2', state: 'proposal' });
  assert.equal((await l.keep(`${BEAD}/p2`)).state, 'kept');
  await store.putRecord({ ...bead, key: `${BEAD}/p3`, rkey: 'p3', state: 'proposal' });
  await l.release(`${BEAD}/p3`);
  assert.equal(await store.getRecord(`${BEAD}/p3`), undefined);
});

test('the device id and clock survive reopening the store', async () => {
  const { store, loom: first } = await loom();
  const a = await first.mint({ note: 'a' });
  const second = await openLoom({ store, registry: await registry(), now: () => 1, newDeviceId: () => 'never-used' });
  assert.equal(second.deviceId, 'desk-1');
  const b = await second.mint({ note: 'b' });
  assert.ok(b.hlc > a.hlc, 'a reopened clock must not go backwards even if the wall clock did');
});

test('drafts persist until saved or discarded', async () => {
  const { loom: l } = await loom();
  const bead = await l.mint({ note: 'x' });
  await l.saveDraft(bead.key, { ...bead.body, note: 'half-typed' });
  assert.equal((await l.getDraft(bead.key)).body.note, 'half-typed');
  await l.save(bead.key, { ...bead.body, note: 'done' });
  assert.equal(await l.getDraft(bead.key), undefined);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/envelope.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/envelope.js`

- [ ] **Step 3: Implement**

Create `app/lib/envelope.js`:

```js
/* The one write path for records made or edited in Loom.
 *
 * Every write validates against the vendored lexicons and the refs anchor
 * checks before it touches the store; a record with problems is never stored.
 * Every write is stamped with this device's HLC. Imported records arrive
 * through importer.js instead and are the one exception to validation (they
 * are already on the String, so hiding them would be worse). */
import { anchorProblems } from '../vendor/refs.js';
import { createClock } from './hlc.js';
import { dayOf, recordKey } from './keys.js';
import { tidGenerator } from './tid.js';

export const BEAD = 'com.cultureblocs.bead';
export const STRAND = 'com.cultureblocs.strand';

export class InvalidRecord extends Error {
  constructor(problems) {
    super(`record is not valid: ${problems.join('; ')}`);
    this.problems = problems;
  }
}

/* Another tab (or an import) wrote the record after this editor loaded it. */
export class Conflict extends Error {
  constructor(current) {
    super('record changed since it was loaded');
    this.current = current;
  }
}

const randomDeviceId = () => `loom-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

export async function openLoom({ store, registry, now = () => Date.now(), newDeviceId = randomDeviceId, nowMicros }) {
  let deviceId = await store.getMeta('deviceId');
  if (!deviceId) {
    deviceId = newDeviceId();
    await store.setMeta('deviceId', deviceId);
  }
  const clock = createClock(deviceId, { now, last: await store.getMeta('hlc') });
  const tid = tidGenerator({ nowMicros: nowMicros ?? (() => BigInt(now()) * 1000n) });
  const iso = () => new Date(now()).toISOString();

  async function stamp() {
    const s = clock.tick();
    await store.setMeta('hlc', s);
    return s;
  }

  function validate(type, body) {
    return [...registry.validateRecord(type, body), ...anchorProblems(type, body)];
  }

  function check(type, body) {
    const problems = validate(type, body);
    if (problems.length) throw new InvalidRecord(problems);
  }

  async function create(type, body, { origin, state }) {
    check(type, body);
    const rkey = tid();
    const env = {
      key: recordKey(type, rkey), type, rkey, body, state, origin, sourceApp: 'loom',
      createdAt: body.createdAt, updatedAt: iso(), hlc: await stamp(), deviceId,
      day: dayOf(type, body, body.createdAt),
    };
    await store.putRecord(env);
    return env;
  }

  /* The mint fact: a bead written before anything else happens. */
  function mint({ mask, note, kind = 'bloc' }) {
    const at = iso();
    const body = { $type: BEAD, createdAt: at, kind };
    if (note && note.trim()) body.note = note.trim();
    if (mask) body.tags = [mask.toLowerCase()];
    body.provenance = { app: 'loom', device: deviceId, mintedAt: at, timeAnchored: true };
    return create(BEAD, body, { origin: 'mint', state: 'kept' });
  }

  /* Replace a record's body. `expectUpdatedAt` is the updatedAt the editor
   * loaded; if the stored record has moved on, nothing is written. Editing a
   * proposal keeps it: a person has stood behind it. */
  async function save(key, body, { expectUpdatedAt } = {}) {
    const current = await store.getRecord(key);
    if (!current) throw new Error(`no record ${key}`);
    if (expectUpdatedAt !== undefined && current.updatedAt !== expectUpdatedAt) throw new Conflict(current);
    check(current.type, body);
    const env = {
      ...current, body, updatedAt: iso(), hlc: await stamp(), deviceId,
      state: current.state === 'proposal' ? 'kept' : current.state,
      day: dayOf(current.type, body, current.createdAt),
    };
    await store.putRecord(env);
    await store.deleteMeta(`draft:${key}`);
    return env;
  }

  async function setState(key, state, allowedFrom) {
    const current = await store.getRecord(key);
    if (!current) throw new Error(`no record ${key}`);
    if (!allowedFrom.includes(current.state)) throw new Error(`a ${current.state} record cannot become ${state}`);
    const env = { ...current, state, updatedAt: iso(), hlc: await stamp(), deviceId };
    await store.putRecord(env);
    return env;
  }

  return {
    deviceId,
    validate,
    create,
    mint,
    save,
    get: (key) => store.getRecord(key),
    keep: (key) => setState(key, 'kept', ['proposal']),
    /* A strand leaves draft when its author says it is told. */
    finish: (key) => setState(key, 'kept', ['draft']),
    async release(key) {
      const current = await store.getRecord(key);
      if (current?.state !== 'proposal') throw new Error('only a proposal can be released');
      await store.deleteRecord(key);
    },
    /* Unsaved edits to an existing record survive reloads here until saved or discarded. */
    saveDraft: (key, body) => store.setMeta(`draft:${key}`, { body, at: iso() }),
    getDraft: (key) => store.getMeta(`draft:${key}`),
    discardDraft: (key) => store.deleteMeta(`draft:${key}`),
  };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 24`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/envelope.js app/test/envelope.test.mjs
git commit -m "feat(phase1): one validated, stamped write path: mint, create, save, keep, release, drafts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 5: Thread's model and anchors

**Files:**
- Create: `app/test/day.test.mjs`, `app/test/anchors.test.mjs`
- Create: `app/lib/day.js`, `app/lib/anchors.js`

**Interfaces:**
- Consumes: `keyFromItemUri` (Task 3).
- Produces:
  - `day.js`:
    - `isUnsent(r)` — `sourceApp === 'loom'` and no `stringId`
    - `monthDays(records) => [{ day, count, unsent }]`, newest first
    - `dayString(dayRecords, allRecords?) => [{ kind: 'strand', record, members } | { kind: 'item', record }]`
  - `anchors.js`:
    - `selectionToIndex(text, selStart, selEnd) => { byteStart, byteEnd }|null`
    - `anchoredText(text, index) => string|null`
    - `reanchor(before, after, refs) => refs`

- [ ] **Step 1: Write the tests**

Create `app/test/day.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayString, isUnsent, monthDays } from '../lib/day.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const rec = (key, type, createdAt, extra = {}) => ({ key, type, createdAt, day: createdAt.slice(0, 10),
  sourceApp: 'loom', body: {}, ...extra });

test('monthDays counts records and unsent Loom-made records per day, newest first', () => {
  const days = monthDays([
    rec('b/1', B, '2026-09-14T09:00:00Z', { stringId: 'x' }),
    rec('b/2', B, '2026-09-14T10:00:00Z'),
    rec('b/3', B, '2026-09-15T10:00:00Z', { sourceApp: 'pocket', stringId: 'y' }),
  ]);
  assert.deepEqual(days, [{ day: '2026-09-15', count: 1, unsent: 0 }, { day: '2026-09-14', count: 2, unsent: 1 }]);
});

test('only Loom-made records without a String id are unsent', () => {
  assert.equal(isUnsent({ sourceApp: 'loom' }), true);
  assert.equal(isUnsent({ sourceApp: 'loom', stringId: 'x' }), false);
  assert.equal(isUnsent({ sourceApp: 'scrobbler' }), false);
});

test('dayString wraps strand members, keeps loose items, orders by earliest time', () => {
  const a = rec('b/a', B, '2026-09-14T08:00:00Z');
  const b = rec('b/b', B, '2026-09-14T12:00:00Z');
  const c = rec('b/c', B, '2026-09-14T10:00:00Z');
  const s = rec('s/1', S, '2026-09-14T22:00:00Z', { body: { items: [{ uri: 'loom://b/b' }, { uri: 'loom://b/c' }] } });
  const out = dayString([a, b, c, s]);
  assert.deepEqual(out.map((e) => [e.kind, e.record.key, (e.members || []).map((m) => m.key)]), [
    ['item', 'b/a', []],
    ['strand', 's/1', ['b/b', 'b/c']],
  ]);
});

test('a strand member made on another day still appears inside it', () => {
  const early = rec('b/early', B, '2026-09-13T23:30:00Z');
  const s = rec('s/1', S, '2026-09-14T09:00:00Z', { body: { items: [{ uri: 'loom://b/early' }, { uri: 'loom://b/gone' }] } });
  const out = dayString([s], [early, s]);
  assert.deepEqual(out[0].members.map((m) => m.key), ['b/early']);
});
```

Create `app/test/anchors.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchoredText, reanchor, selectionToIndex } from '../lib/anchors.js';

const ref = (index, label = 'x') => ({ type: 'work', role: 'subject', descriptor: { label }, ...(index ? { index } : {}) });

test('a textarea selection becomes UTF-8 byte offsets', () => {
  const text = 'Amélie at the Ritzy';
  assert.deepEqual(selectionToIndex(text, 14, 19), { byteStart: 15, byteEnd: 20 });
  assert.equal(anchoredText(text, { byteStart: 15, byteEnd: 20 }), 'Ritzy');
  assert.deepEqual(selectionToIndex('🎬 Severance', 3, 12), { byteStart: 5, byteEnd: 14 });
  assert.equal(selectionToIndex(text, 4, 4), null);
});

test('an anchor follows its text when words are inserted before it', () => {
  const [moved] = reanchor('Saw Severance', 'Finally saw Severance', [ref({ byteStart: 4, byteEnd: 13 })]);
  assert.deepEqual(moved.index, { byteStart: 12, byteEnd: 21 });
});

test('an anchor is dropped, and the ref kept, when its text is gone or ambiguous', () => {
  const [gone] = reanchor('Saw Severance', 'Saw it again', [ref({ byteStart: 4, byteEnd: 13 })]);
  assert.equal('index' in gone, false);
  assert.equal(gone.descriptor.label, 'x');
  const [twice] = reanchor('Severance', 'Severance, then Severance again', [ref({ byteStart: 0, byteEnd: 9 })]);
  assert.equal('index' in twice, false);
});

test('refs without an anchor pass through, and inputs are not mutated', () => {
  const refs = [ref(null, 'loose'), ref({ byteStart: 0, byteEnd: 4 })];   // 'Amé' is 4 bytes
  const out = reanchor('Amé', 'Oh, Amé', refs);
  assert.equal(out[0], refs[0]);
  assert.deepEqual(out[1].index, { byteStart: 4, byteEnd: 8 });
  assert.deepEqual(refs[1].index, { byteStart: 0, byteEnd: 4 });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/day.test.mjs app/test/anchors.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/day.js` (and `anchors.js`)

- [ ] **Step 3: Implement**

Create `app/lib/day.js`:

```js
/* Thread's model, pure: which days hold what, and how a day's records
 * string together. Strands wrap the beads their items point at; everything
 * else stands alone, in time order. */
import { keyFromItemUri } from './keys.js';

const STRAND = 'com.cultureblocs.strand';

export const isUnsent = (r) => r.sourceApp === 'loom' && !r.stringId;

/* [{ day, count, unsent }] newest first. */
export function monthDays(records) {
  const days = new Map();
  for (const r of records) {
    if (!r.day) continue;
    const d = days.get(r.day) || { day: r.day, count: 0, unsent: 0 };
    d.count += 1;
    if (isUnsent(r)) d.unsent += 1;
    days.set(r.day, d);
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/* A day's string: [{ kind: 'strand', record, members } | { kind: 'item', record }],
 * ordered by the earliest time in each entry. Members of a strand appear only
 * inside it. `allRecords` resolves members that were made on another day. */
export function dayString(dayRecords, allRecords = dayRecords) {
  const byKey = new Map(allRecords.map((r) => [r.key, r]));
  for (const r of dayRecords) byKey.set(r.key, r);
  const strands = dayRecords.filter((r) => r.type === STRAND);
  const inStrand = new Set();
  const entries = strands.map((s) => {
    const members = (s.body.items || [])
      .map((it) => byKey.get(keyFromItemUri(it.uri)))
      .filter(Boolean);
    members.forEach((m) => inStrand.add(m.key));
    return { kind: 'strand', record: s, members };
  });
  for (const r of dayRecords) {
    if (r.type !== STRAND && !inStrand.has(r.key)) entries.push({ kind: 'item', record: r });
  }
  const at = (e) => (e.kind === 'strand' && e.members.length
    ? e.members.map((m) => m.createdAt).sort()[0]
    : e.record.createdAt);
  return entries.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
}
```

Create `app/lib/anchors.js`:

```js
/* Ref anchors are UTF-8 byte offsets into the record's own text (LOOM.md §9.9).
 * A <textarea> reports selections in UTF-16 code units, and text changes as it
 * is edited, so the editor needs both conversions and a way to carry anchors
 * across an edit. Pure. */

const enc = new TextEncoder();
const dec = new TextDecoder();

const byteLength = (s) => enc.encode(s).length;

/* A textarea selection (UTF-16 offsets) as a byteSlice, or null if empty. */
export function selectionToIndex(text, selStart, selEnd) {
  if (!(selEnd > selStart)) return null;
  const start = byteLength(text.slice(0, selStart));
  return { byteStart: start, byteEnd: start + byteLength(text.slice(selStart, selEnd)) };
}

/* The text an index covers, or null if it is out of range. */
export function anchoredText(text, index) {
  const bytes = enc.encode(text);
  if (!index || index.byteStart < 0 || index.byteEnd > bytes.length || index.byteStart >= index.byteEnd) return null;
  return dec.decode(bytes.slice(index.byteStart, index.byteEnd));
}

/* Carry anchored refs from `before` to `after`: each anchor moves to the
 * single place its old text now appears; if it appears nowhere or more than
 * once, the anchor is dropped and the ref kept. Refs without an index pass
 * through untouched. Returns new ref objects; inputs are not mutated. */
export function reanchor(before, after, refs) {
  return (refs || []).map((ref) => {
    if (!ref?.index) return ref;
    const covered = anchoredText(before, ref.index);
    const { index, ...rest } = ref;
    if (!covered) return rest;
    const first = after.indexOf(covered);
    if (first === -1 || after.indexOf(covered, first + 1) !== -1) return rest;
    return { ...rest, index: selectionToIndex(after, first, first + covered.length) };
  });
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 32`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/day.js app/lib/anchors.js app/test/day.test.mjs app/test/anchors.test.mjs
git commit -m "feat(phase1): Thread's day and month model; UTF-8 anchors that follow their text

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 6: Photos

**Files:**
- Create: `app/test/fake-string.mjs`, `app/test/media.test.mjs`, `app/test/images.test.mjs`
- Create: `app/lib/media.js`, `app/lib/images.js`

**Interfaces:**
- Produces:
  - `media.js`:
    - `MEDIA_EXT`
    - `sha256Hex(bytes) => Promise<hex>`
    - `mediaName(hash, mime)`, `mediaUri(name)`, `nameFromUri(uri) => name|null`, `hashFromName(name) => hash|null`, `mediaNames(body) => name[]`
    - `putPhoto(store, blob) => Promise<'/media/<name>'>`
    - `orphanedHashes(records, storedHashes)`
  - `images.js`: `MAX_EDGE = 2000`, `MAX_BYTES = 2_000_000`, `downscaleDims(w, h, maxEdge?)`; browser-only `preparePhoto(file) => { blob, width, height }`
  - `fake-string.mjs` (used by Tasks 7–9): `fakeString({ records?, media?, failMedia?, reject? }) => { client, records, media, posted }`, `photo(text?, type?) => Blob`. Its `client` implements the String client interface of Task 7.

- [ ] **Step 1: Write the tests and the fake String**

Create `app/test/fake-string.mjs`:

```js
// A fake String client for importer and sender tests: records and media held
// in memory, with the String's dedupe and naming behaviour.
import { mediaName, sha256Hex } from '../lib/media.js';

export function fakeString({ records = [], media = {}, failMedia = new Set(), reject = {} } = {}) {
  let n = 0;
  const posted = [];
  const client = {
    base: 'http://string.test',
    async health() { return ['com.cultureblocs.bead', 'com.cultureblocs.strand', 'com.cultureblocs.annotation'] ; },
    async listRecords(type) { return structuredClone(records.filter((r) => r.type === type)); },
    async getMedia(name) {
      if (failMedia.has(name) || !media[name]) throw new Error(`HTTP 404 for ${name}`);
      return media[name];
    },
    async postRecords(batch) {
      return batch.map((r) => {
        posted.push(structuredClone(r));
        if (reject[r.dedupeKey]) return { dedupeKey: r.dedupeKey, status: 'invalid', problems: reject[r.dedupeKey] };
        const existing = records.find((x) => x.dedupeKey === r.dedupeKey);
        if (existing) return { dedupeKey: r.dedupeKey, status: 'duplicate', id: existing.id };
        const id = `sid-${++n}`;
        records.push({ ...structuredClone(r), id, state: 'kept' });
        return { dedupeKey: r.dedupeKey, status: 'created', id };
      });
    },
    async postMedia(blob) {
      const name = mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
      media[name] = blob;
      return { uri: `/media/${name}`, mime: blob.type, bytes: blob.size };
    },
  };
  return { client, records, media, posted };
}

export const photo = (text = 'jpeg-bytes', type = 'image/jpeg') => new Blob([text], { type });
```

Create `app/test/media.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemStore } from '../lib/memstore.js';
import { hashFromName, mediaNames, nameFromUri, orphanedHashes, putPhoto, sha256Hex } from '../lib/media.js';
import { photo } from './fake-string.mjs';

const H = 'ab'.repeat(32);

test("photos are named exactly as the String names them: sha256 of the bytes plus the MIME extension", async () => {
  const store = createMemStore();
  const blob = photo('pixels');
  const uri = await putPhoto(store, blob);
  const hash = await sha256Hex(new TextEncoder().encode('pixels'));
  assert.equal(uri, `/media/${hash}.jpg`);
  assert.equal((await store.getBlob(hash)).mime, 'image/jpeg');
});

test('names are read from relative and absolute media uris, and junk is ignored', () => {
  assert.equal(nameFromUri(`/media/${H}.jpg`), `${H}.jpg`);
  assert.equal(nameFromUri(`http://brick:8100/media/${H}.png`), `${H}.png`);
  assert.equal(nameFromUri('/media/../../etc/passwd'), null);
  assert.equal(hashFromName(`${H}.webp`), H);
  assert.deepEqual(mediaNames({ media: [{ uri: `/media/${H}.jpg` }, { uri: 'nope' }, null] }), [`${H}.jpg`]);
});

test('orphaned photo hashes are those no record references', () => {
  const other = 'cd'.repeat(32);
  assert.deepEqual(orphanedHashes([{ body: { media: [{ uri: `/media/${H}.jpg` }] } }], [H, other]), [other]);
});
```

Create `app/test/images.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downscaleDims } from '../lib/images.js';

test('photos larger than the maximum edge scale down, keeping their shape', () => {
  assert.deepEqual(downscaleDims(4000, 3000), { width: 2000, height: 1500 });
  assert.deepEqual(downscaleDims(1200, 4800), { width: 500, height: 2000 });
  assert.deepEqual(downscaleDims(800, 600), { width: 800, height: 600 });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/media.test.mjs app/test/images.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/media.js` (and `images.js`)

- [ ] **Step 3: Implement**

Create `app/lib/media.js`:

```js
/* Photos are content-addressed exactly as the String names them:
 * /media/<sha256 hex><ext>, the extension chosen by MIME type
 * (cultureblocs-string string/app/main.py MEDIA_EXT). So a photo imported
 * from the String, one added in Loom, and the String's copy of it share one
 * name, and the blobs store is keyed by the hash. */

export const MEDIA_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/heic': '.heic' };

const NAME_RE = /^([0-9a-f]{64})\.[a-z0-9]{2,5}$/;

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const mediaName = (hash, mime) => `${hash}${MEDIA_EXT[mime] || '.bin'}`;
export const mediaUri = (name) => `/media/${name}`;

/* The file name from a media uri, relative ("/media/x.jpg") or absolute. */
export function nameFromUri(uri) {
  const name = typeof uri === 'string' ? uri.split('/').pop() : '';
  return NAME_RE.test(name) ? name : null;
}

export const hashFromName = (name) => NAME_RE.exec(name)?.[1] ?? null;

/* The media names a record body references. */
export const mediaNames = (body) =>
  (Array.isArray(body?.media) ? body.media : []).map((m) => nameFromUri(m?.uri)).filter(Boolean);

/* Store a photo; returns its media uri. */
export async function putPhoto(store, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const mime = blob.type || 'application/octet-stream';
  await store.putBlob({ hash, mime, blob });
  return mediaUri(mediaName(hash, mime));
}

/* Blob hashes no record references any more; the orphan sweep deletes these. */
export function orphanedHashes(records, storedHashes) {
  const live = new Set(records.flatMap((r) => mediaNames(r.body).map(hashFromName)));
  return storedHashes.filter((h) => !live.has(h));
}
```

Create `app/lib/images.js`:

```js
/* Photo preparation for records (ported from cultureblocs-string easel/lib/image.js):
 * pure sizing math, and browser canvas rendering to a JPEG under the lexicon's
 * 2 MB image budget. */

export const MAX_EDGE = 2000;
export const MAX_BYTES = 2_000_000;

export function downscaleDims(w, h, maxEdge = MAX_EDGE) {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/* Browser-only. A File/Blob from an <input> or a drop -> { blob, width, height }. */
export async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const dims = downscaleDims(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, dims.width, dims.height);
  bitmap.close?.();
  let quality = 0.9;
  for (let i = 0; i < 6; i++) {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_BYTES) return { blob, ...dims };
    quality -= 0.12;
  }
  return { blob: await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.3)), ...dims };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 36`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/media.js app/lib/images.js app/test/fake-string.mjs app/test/media.test.mjs app/test/images.test.mjs
git commit -m "feat(phase1): photos named and stored exactly as the String names them

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 7: The String client and one-way import

**Files:**
- Create: `app/test/importer.test.mjs`
- Create: `app/lib/string-client.js`, `app/lib/importer.js`

**Interfaces:**
- Consumes: the store interface (Task 3); `dayOf`, `idFromSpineUri`, `itemUri`, `recordKey` (Task 3); `hashFromName`, `mediaNames` (Task 6); `contentHash` (vendor).
- Produces:
  - `StringError`; `stringClient(baseUrl, token?, fetchImpl?)` returns:
    - `health() => recordTypes[]` — throws if the server isn't a String
    - `listRecords(type)`, `getMedia(name) => Blob`, `postRecords(records) => results`, `postMedia(blob) => { uri, mime, bytes }`
  - `planImport(stringRecords, localByStringId: Map) => [{ action: 'add'|'update'|'unchanged'|'conflict', rec, local? }]`
  - `runImport({ store, registry, client, now?, onProgress? }) => { counts: { add, update, unchanged, conflict, invalid, photos, missing }, conflicts: key[] }`
  - Imported envelope fields, in addition to Task 4's: `stringId`, `stringHash`, `importedHash`, `importedState`, and optionally `invalid[]` and `missing[]`

- [ ] **Step 1: Write the tests**

Create `app/test/importer.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, runImport } from '../lib/importer.js';
import { createMemStore } from '../lib/memstore.js';
import { mediaName, sha256Hex } from '../lib/media.js';
import { contentHash } from '../vendor/strip.js';
import { fakeString, photo } from './fake-string.mjs';
import { registry } from './helpers.mjs';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const T = '2026-09-13T10:00:00Z';
const bead = (id, note, extra = {}) => ({ id, type: B, sourceApp: 'pocket', createdAt: T, state: 'kept', hlc: null,
  body: { $type: B, createdAt: T, kind: 'bloc', note }, ...extra });

async function nameOf(blob) {
  return mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
}

test('first import adds records, rewrites strand items to local keys, fetches photos', async () => {
  const pic = photo();
  const name = await nameOf(pic);
  const s = fakeString({
    records: [
      bead('u1', 'with a photo', { body: { $type: B, createdAt: T, kind: 'bloc', note: 'p', media: [{ uri: `/media/${name}` }] } }),
      bead('u2', 'plain'),
      { id: 'u3', type: S, sourceApp: 'timeline', createdAt: T, state: 'draft',
        body: { $type: S, createdAt: T, title: 'Saturday', items: [{ uri: 'spine://records/u1' }, { uri: 'spine://records/elsewhere' }] } },
    ],
    media: { [name]: pic },
  });
  const store = createMemStore();
  const { counts, conflicts } = await runImport({ store, registry: await registry(), client: s.client, now: () => 1 });
  assert.equal(counts.add, 3);
  assert.equal(counts.photos, 1);
  assert.deepEqual(conflicts, []);
  const strand = await store.getRecord(`${S}/u3`);
  assert.deepEqual(strand.body.items, [{ uri: `loom://${B}/u1` }, { uri: 'spine://records/elsewhere' }]);
  assert.equal(strand.state, 'draft');
  assert.equal(strand.stringId, 'u3');
  assert.equal(strand.origin, 'import');
  assert.ok(await store.getBlob(name.slice(0, 64)));
  assert.equal(await store.getMeta('lastImportAt'), new Date(1).toISOString());
});

test('re-import: unchanged, updated from the String, and conflicts left alone', async () => {
  const s = fakeString({ records: [bead('u1', 'one'), bead('u2', 'two'), bead('u3', 'three')] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });

  s.records[1].body.note = 'two, edited on the String';                 // u2: String changed
  s.records[2].body.note = 'three, edited on the String';               // u3: both changed
  const u3 = await store.getRecord(`${B}/u3`);
  await store.putRecord({ ...u3, body: { ...u3.body, note: 'three, edited in Loom' } });

  const { counts, conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual([counts.add, counts.update, counts.unchanged, counts.conflict], [0, 1, 1, 1]);
  assert.deepEqual(conflicts, [`${B}/u3`]);
  assert.equal((await store.getRecord(`${B}/u2`)).body.note, 'two, edited on the String');
  assert.equal((await store.getRecord(`${B}/u3`)).body.note, 'three, edited in Loom');
});

test('keeping an imported proposal in Loom is a local change the String does not overwrite', async () => {
  const s = fakeString({ records: [bead('u1', '5 tracks', { state: 'proposal', sourceApp: 'scrobbler' })] });
  const store = createMemStore();
  const reg = await registry();
  await runImport({ store, registry: reg, client: s.client });
  const local = await store.getRecord(`${B}/u1`);
  await store.putRecord({ ...local, state: 'kept' });
  s.records[0].body.note = '6 tracks';
  const { conflicts } = await runImport({ store, registry: reg, client: s.client });
  assert.deepEqual(conflicts, [`${B}/u1`]);
  assert.equal((await store.getRecord(`${B}/u1`)).state, 'kept');
});

test('an invalid String record is imported and flagged, not dropped', async () => {
  const s = fakeString({ records: [{ ...bead('u1', 'x'), body: { $type: B, createdAt: T } }] });
  const store = createMemStore();
  const { counts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.equal(counts.invalid, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).invalid, ['$.kind: required field missing']);
});

test('a photo that cannot be fetched is recorded as missing and retried on the next import', async () => {
  const pic = photo('later');
  const name = await nameOf(pic);
  const failMedia = new Set([name]);
  const s = fakeString({ records: [bead('u1', 'p', { body: { $type: B, createdAt: T, kind: 'bloc', media: [{ uri: `/media/${name}` }] } })],
    media: { [name]: pic }, failMedia });
  const store = createMemStore();
  const reg = await registry();
  const first = await runImport({ store, registry: reg, client: s.client });
  assert.equal(first.counts.missing, 1);
  assert.deepEqual((await store.getRecord(`${B}/u1`)).missing, [name]);
  failMedia.clear();
  const second = await runImport({ store, registry: reg, client: s.client });
  assert.equal(second.counts.photos, 1);
  assert.equal('missing' in (await store.getRecord(`${B}/u1`)), false);
});

test('planImport is decided by hashes and states alone', async () => {
  const rec = bead('u1', 'x');
  const h = await contentHash(rec.body);
  const local = { key: `${B}/u1`, body: rec.body, state: 'kept', stringHash: h, importedHash: h, importedState: 'kept' };
  assert.equal((await planImport([rec], new Map([['u1', local]])))[0].action, 'unchanged');
  assert.equal((await planImport([{ ...rec, state: 'proposal' }], new Map([['u1', local]])))[0].action, 'update');
});

test('a server that is not a String is refused before anything is read', async () => {
  const store = createMemStore();
  const client = { async health() { throw new Error('http://localhost:8100/health: this does not look like a String'); } };
  await assert.rejects(runImport({ store, registry: await registry(), client }), /does not look like a String/);
  assert.deepEqual(await store.allRecords(), []);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/importer.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/importer.js`

- [ ] **Step 3: Implement**

Create `app/lib/string-client.js`:

```js
/* The String's HTTP API, as Loom uses it in Phase 1 (import and send).
 * Every error names the URL and the status, because "404" alone once meant a
 * different server was answering on the String's port. */

export class StringError extends Error {
  constructor(url, detail) {
    super(`${url}: ${detail}`);
    this.url = url;
  }
}

export function stringClient(baseUrl, token, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const auth = token ? { Authorization: `Bearer ${token}` } : {};

  async function call(path, init = {}) {
    const url = base + path;
    let res;
    try {
      res = await fetchImpl(url, { ...init, headers: { ...auth, ...(init.headers || {}) } });
    } catch (e) {
      throw new StringError(url, `unreachable (${e.message})`);
    }
    if (!res.ok) throw new StringError(url, `HTTP ${res.status}`);
    return res;
  }

  return {
    base,
    /* Confirms the thing answering is a String: it must list cultureblocs lexicons. */
    async health() {
      const body = await (await call('/health')).json().catch(() => null);
      const types = Array.isArray(body?.lexicons) ? body.lexicons : [];
      if (!body?.ok || !types.some((t) => t.startsWith('com.cultureblocs.'))) {
        throw new StringError(`${base}/health`, 'this does not look like a String (no cultureblocs lexicons)');
      }
      return types;
    },
    async listRecords(type) {
      return (await (await call(`/records?type=${encodeURIComponent(type)}&limit=2000`)).json()).records;
    },
    async getMedia(name) {
      return (await call(`/media/${encodeURIComponent(name)}`)).blob();
    },
    async postRecords(records) {
      const res = await call('/records', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }) });
      return (await res.json()).results;
    },
    async postMedia(blob) {
      const res = await call('/media', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      return res.json();   // { uri, mime, bytes }
    },
  };
}
```

Create `app/lib/importer.js`:

```js
/* One-way import from the String (Phase 1; replaced by sync in Phase 2).
 *
 * Re-runnable. Each String record is planned against its local copy:
 *   add        not held locally
 *   update     unchanged in Loom since the last import, changed on the String
 *   unchanged  the same on both sides
 *   conflict   changed on both sides: left alone and reported (merging is Phase 2)
 * "Changed in Loom" compares the local body with `importedHash` (its hash as
 * stored at import) and the state with `importedState`; "changed on the String"
 * compares the String's body with `stringHash` and its state with `importedState`.
 * Two hashes, because import rewrites a strand's items from spine:// to loom://. */
import { contentHash } from '../vendor/strip.js';
import { dayOf, idFromSpineUri, itemUri, recordKey } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const STRAND = 'com.cultureblocs.strand';

export async function planImport(stringRecords, localByStringId) {
  const plan = [];
  for (const rec of stringRecords) {
    const local = localByStringId.get(rec.id);
    const stringState = rec.state || 'kept';
    if (!local) { plan.push({ action: 'add', rec }); continue; }
    const stringChanged = (await contentHash(rec.body)) !== local.stringHash || stringState !== local.importedState;
    const loomChanged = (await contentHash(local.body)) !== local.importedHash || local.state !== local.importedState;
    const action = !stringChanged ? 'unchanged' : loomChanged ? 'conflict' : 'update';
    plan.push({ action, rec, local });
  }
  return plan;
}

/* spine://records/<id> -> loom://<key> where that record is held; other uris untouched. */
function rewriteItems(body, keyByStringId) {
  if (!Array.isArray(body.items)) return body;
  return { ...body, items: body.items.map((it) => {
    const key = keyByStringId.get(idFromSpineUri(it?.uri));
    return key ? { ...it, uri: itemUri(key) } : it;
  }) };
}

export async function runImport({ store, registry, client, now = () => Date.now(), onProgress = () => {} }) {
  const iso = () => new Date(now()).toISOString();
  const types = (await client.health()).filter((t) => registry.recordTypes().includes(t));
  const stringRecords = [];
  for (const type of types) stringRecords.push(...await client.listRecords(type));

  const locals = new Map((await store.allRecords()).filter((r) => r.stringId).map((r) => [r.stringId, r]));
  const plan = await planImport(stringRecords, locals);
  const counts = { add: 0, update: 0, unchanged: 0, conflict: 0, invalid: 0, photos: 0, missing: 0 };
  const conflicts = [];

  const keyByStringId = new Map([...locals.values()].map((r) => [r.stringId, r.key]));
  for (const { action, rec } of plan) {
    if (action === 'add') keyByStringId.set(rec.id, recordKey(rec.type, rec.id));
  }

  // Strands last, so every item they point at is already held.
  const ordered = [...plan].sort((a, b) => (a.rec.type === STRAND) - (b.rec.type === STRAND));
  for (const { action, rec, local } of ordered) {
    counts[action] += 1;
    if (action === 'conflict') conflicts.push(local.key);
    if (action !== 'add' && action !== 'update') continue;
    const body = rec.type === STRAND ? rewriteItems(rec.body, keyByStringId) : rec.body;
    const problems = registry.validateRecord(rec.type, rec.body);
    const env = {
      key: local?.key ?? recordKey(rec.type, rec.id), type: rec.type, rkey: local?.rkey ?? rec.id,
      body, state: rec.state || 'kept', origin: local?.origin ?? 'import', sourceApp: rec.sourceApp,
      createdAt: rec.createdAt, updatedAt: iso(), hlc: rec.hlc ?? null, deviceId: 'string',
      day: dayOf(rec.type, body, rec.createdAt), stringId: rec.id,
      stringHash: await contentHash(rec.body), importedHash: await contentHash(body),
      importedState: rec.state || 'kept',
    };
    if (problems.length) { env.invalid = problems; counts.invalid += 1; }
    const missing = [];
    for (const name of mediaNames(body)) {
      const hash = hashFromName(name);
      if (await store.getBlob(hash)) continue;
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash, mime: blob.type, blob });
        counts.photos += 1;
      } catch {
        missing.push(name);
      }
    }
    if (missing.length) { env.missing = missing; counts.missing += missing.length; }
    await store.putRecord(env);   // one record per write: an interrupted import leaves a consistent store
    onProgress(counts);
  }
  // Records added or updated before their photos could be fetched retry next time.
  for (const r of await store.allRecords()) {
    if (!r.missing?.length || plan.some((p) => p.rec.id === r.stringId && (p.action === 'add' || p.action === 'update'))) continue;
    const still = [];
    for (const name of r.missing) {
      try {
        const blob = await client.getMedia(name);
        await store.putBlob({ hash: hashFromName(name), mime: blob.type, blob });
        counts.photos += 1;
      } catch { still.push(name); }
    }
    const { missing: _, ...rest } = r;
    await store.putRecord(still.length ? { ...rest, missing: still } : rest);
  }
  await store.setMeta('lastImportAt', iso());
  return { counts, conflicts };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 43`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/string-client.js app/lib/importer.js app/test/importer.test.mjs
git commit -m "feat(phase1): re-runnable one-way import from the String, conflicts left alone

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 8: Manual send

**Files:**
- Create: `app/test/sender.test.mjs`
- Create: `app/lib/sender.js`

**Interfaces:**
- Consumes: `openLoom` and `STRAND` (Task 4); `isUnsent` (Task 5); `keyFromItemUri`, `spineUri` (Task 3); `hashFromName`, `mediaNames` (Task 6); `runImport` (Task 7, used by one test); `contentHash` (vendor).
- Produces:
  - `planSend(records) => { ready: env[], held: [{ key, reason }] }` — non-strands first; drafts and strands waiting on unsent items are held
  - `runSend({ store, client, now?, onProgress? }) => [{ key, status: 'sent'|'held'|'invalid'|'failed', stringId?, reason?, problems? }]`
  - When a record is sent it gains `stringId`, `sentAt`, `stringHash`, `importedHash` and `importedState`

- [ ] **Step 1: Write the tests**

Create `app/test/sender.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRAND, openLoom } from '../lib/envelope.js';
import { itemUri } from '../lib/keys.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { planSend, runSend } from '../lib/sender.js';
import { fakeString, photo } from './fake-string.mjs';
import { registry, steppingNow } from './helpers.mjs';

async function setup() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  return { store, loom };
}

const strandBody = (keys, title = 'Sunday') => ({ $type: STRAND, createdAt: '2026-09-15T20:00:00Z',
  day: '2026-09-15T00:00:00Z', title, items: keys.map((k) => ({ uri: itemUri(k) })) });

test('planSend: beads first, finished strands after, drafts and waiting strands held', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  const told = await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const draft = await loom.create(STRAND, strandBody([bead.key], 'draft'), { origin: 'compose', state: 'draft' });
  const orphan = await loom.create(STRAND, strandBody(['com.cultureblocs.bead/elsewhere']), { origin: 'compose', state: 'kept' });
  const { ready, held } = planSend(await store.allRecords());
  assert.deepEqual(ready.map((r) => r.key), [bead.key, told.key]);
  assert.deepEqual(held, [
    { key: draft.key, reason: 'still a draft' },
    { key: orphan.key, reason: 'waiting for com.cultureblocs.bead/elsewhere' },
  ]);
});

test('runSend uploads photos, posts beads then strands with spine:// items, and records String ids', async () => {
  const { loom, store } = await setup();
  const uri = await putPhoto(store, photo());
  const bead = await loom.mint({ note: 'with photo' });
  await loom.save(bead.key, { ...bead.body, media: [{ uri, mime: 'image/jpeg' }] });
  const strand = await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const s = fakeString();

  const results = await runSend({ store, client: s.client, now: () => 5 });
  assert.deepEqual(results.map((r) => r.status), ['sent', 'sent']);
  assert.ok(s.media[uri.split('/').pop()], 'the photo reached the String under the same name');
  assert.deepEqual(s.posted.map((p) => [p.dedupeKey, p.sourceApp]), [[`loom:${bead.rkey}`, 'loom'], [`loom:${strand.rkey}`, 'loom']]);
  assert.deepEqual(s.posted[1].body.items, [{ uri: `spine://records/${results[0].stringId}` }]);
  const sentBead = await store.getRecord(bead.key);
  assert.equal(sentBead.stringId, results[0].stringId);
  assert.equal(sentBead.sentAt, new Date(5).toISOString());
  assert.deepEqual((await store.getRecord(strand.key)).body.items, [{ uri: itemUri(bead.key) }], 'Loom keeps its local item uris');
});

test('sending again is harmless: nothing unsent, and a lost response is recovered by dedupe', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  assert.deepEqual(await runSend({ store, client: s.client }), []);

  const env = await store.getRecord(bead.key);
  const { stringId: _, sentAt: __, ...unsentAgain } = env;          // as if the response never arrived
  await store.putRecord(unsentAgain);
  const [again] = await runSend({ store, client: s.client });
  assert.equal(again.status, 'sent');
  assert.equal(again.stringId, env.stringId);
  assert.equal(s.records.length, 1);
});

test('a record the String rejects stays unsent with its problems; a photo missing locally fails that record only', async () => {
  const { loom, store } = await setup();
  const rejected = await loom.mint({ note: 'String says no' });
  const fine = await loom.mint({ note: 'fine' });
  const nophoto = await loom.mint({ note: 'lost photo' });
  await store.putRecord({ ...nophoto, body: { ...nophoto.body, media: [{ uri: `/media/${'a'.repeat(64)}.jpg` }] } });
  const s = fakeString({ reject: { [`loom:${rejected.rkey}`]: ['$.kind: unknown on this String'] } });
  const results = Object.fromEntries((await runSend({ store, client: s.client })).map((r) => [r.key, r]));
  assert.deepEqual(results[rejected.key], { key: rejected.key, status: 'invalid', problems: ['$.kind: unknown on this String'] });
  assert.equal(results[fine.key].status, 'sent');
  assert.equal(results[nophoto.key].status, 'failed');
  assert.match(results[nophoto.key].reason, /not in this browser/);
  assert.equal((await store.getRecord(rejected.key)).stringId, undefined);
});

test('a sent record comes back from the next import as unchanged, not as a conflict', async () => {
  const { loom, store } = await setup();
  const bead = await loom.mint({ note: 'a' });
  await loom.create(STRAND, strandBody([bead.key]), { origin: 'compose', state: 'kept' });
  const s = fakeString();
  await runSend({ store, client: s.client });
  const { runImport } = await import('../lib/importer.js');
  const { counts, conflicts } = await runImport({ store, registry: await registry(), client: s.client });
  assert.deepEqual(conflicts, []);
  assert.equal(counts.unchanged, 2);
  assert.equal(counts.add, 0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/sender.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/sender.js`

- [ ] **Step 3: Implement**

Create `app/lib/sender.js`:

```js
/* Manual send to the String (Phase 1; replaced by sync in Phase 2).
 *
 * Only Loom-made records that the String has not yet accepted are sent, and
 * only once finished: a draft strand stays home. Beads and annotations go
 * first; a strand waits until every item it points at is on the String, then
 * its loom:// items are rewritten to spine://records/<id>. Photos upload
 * before the record that uses them. Each record posts under
 * dedupeKey "loom:<rkey>", so a retry after a timeout cannot duplicate it.
 * Edits to records already on the String are not sent until Phase 2. */
import { contentHash } from '../vendor/strip.js';
import { isUnsent } from './day.js';
import { keyFromItemUri, spineUri } from './keys.js';
import { hashFromName, mediaNames } from './media.js';

const STRAND = 'com.cultureblocs.strand';

/* { ready: [envelope], held: [{ key, reason }] } — pure. */
export function planSend(records) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const unsent = records.filter(isUnsent).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const ready = [], held = [];
  const going = new Set();
  for (const r of unsent.filter((r) => r.type !== STRAND)) {
    if (r.state === 'draft') held.push({ key: r.key, reason: 'still a draft' });
    else { ready.push(r); going.add(r.key); }
  }
  for (const s of unsent.filter((r) => r.type === STRAND)) {
    if (s.state === 'draft') { held.push({ key: s.key, reason: 'still a draft' }); continue; }
    const waiting = (s.body.items || []).map((it) => keyFromItemUri(it.uri)).filter(Boolean)
      .filter((k) => !byKey.get(k)?.stringId && !going.has(k));
    if (waiting.length) held.push({ key: s.key, reason: `waiting for ${waiting.join(', ')}` });
    else ready.push(s);
  }
  return { ready, held };
}

export async function runSend({ store, client, now = () => Date.now(), onProgress = () => {} }) {
  const { ready, held } = planSend(await store.allRecords());
  const results = held.map((h) => ({ key: h.key, status: 'held', reason: h.reason }));
  for (const planned of ready) {
    const env = await store.getRecord(planned.key);   // fresh: an earlier send may have set a member's stringId
    const result = { key: env.key };
    try {
      for (const name of mediaNames(env.body)) {
        const row = await store.getBlob(hashFromName(name));
        if (!row) throw new Error(`photo ${name} is not in this browser`);
        const sent = await client.postMedia(row.blob);
        if (sent.uri.split('/').pop() !== name) throw new Error(`the String named photo ${name} ${sent.uri}`);
      }
      let body = env.body;
      if (env.type === STRAND) {
        const items = [];
        for (const it of body.items || []) {
          const key = keyFromItemUri(it.uri);
          if (!key) { items.push(it); continue; }
          const member = await store.getRecord(key);
          if (!member?.stringId) throw new Error(`item ${key} is not on the String`);
          items.push({ ...it, uri: spineUri(member.stringId) });
        }
        body = { ...body, items };
      }
      const [res] = await client.postRecords([{ dedupeKey: `loom:${env.rkey}`, type: env.type, sourceApp: 'loom',
        createdAt: env.createdAt, body }]);
      if (res.status === 'created' || res.status === 'duplicate') {
        // Record what the String now holds, as an import would, so the next
        // import sees this record as unchanged rather than changed on both sides.
        await store.putRecord({ ...env, stringId: res.id, sentAt: new Date(now()).toISOString(),
          stringHash: await contentHash(body), importedHash: await contentHash(env.body), importedState: env.state });
        Object.assign(result, { status: 'sent', stringId: res.id });
      } else {
        Object.assign(result, { status: 'invalid', problems: res.problems || [] });
      }
    } catch (e) {
      Object.assign(result, { status: 'failed', reason: e.message });
    }
    results.push(result);
    onProgress(result);
  }
  return results;
}
```

The hashes written after a successful send are what keep the next import from reporting every sent record as "changed on both sides". The last test in `sender.test.mjs` pins this.

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 48`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/sender.js app/test/sender.test.mjs
git commit -m "feat(phase1): manual send to the String — photos first, beads before strands, idempotent

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 9: Backup and restore

**Files:**
- Create: `app/test/backup.test.mjs`
- Create: `app/lib/backup.js`

**Interfaces:**
- Consumes: the store interface (Task 3); `openLoom` (Task 4); `putPhoto` (Task 6); `photo` (Task 6's fake String).
- Produces:
  - `BACKUP_TYPE = 'com.cultureblocs.loom.backup'`, `BACKUP_VERSION = 1`
  - `bytesToBase64`, `base64ToBytes`
  - `exportBackup(store, now?) => { $type, version, exportedAt, records, meta, blobs }` — `meta` excludes `stringToken`
  - `restoreBackup(store, doc) => { records, photos }` — replaces the store's contents but keeps this browser's token

- [ ] **Step 1: Write the tests**

Create `app/test/backup.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TYPE, base64ToBytes, bytesToBase64, exportBackup, restoreBackup } from '../lib/backup.js';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { putPhoto } from '../lib/media.js';
import { photo } from './fake-string.mjs';
import { registry, steppingNow } from './helpers.mjs';

test('base64 round-trips bytes larger than one chunk', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('backup then restore into an empty store gives back records, photos and settings — never the token', async () => {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(), newDeviceId: () => 'desk-1' });
  const uri = await putPhoto(store, photo('pixels'));
  const bead = await loom.mint({ note: 'keep me' });
  await loom.save(bead.key, { ...bead.body, media: [{ uri }] });
  await store.setMeta('stringUrl', 'http://localhost:8100');
  await store.setMeta('stringToken', 'secret');

  const doc = JSON.parse(JSON.stringify(await exportBackup(store, () => 9)));
  assert.equal(doc.$type, BACKUP_TYPE);
  assert.equal('stringToken' in doc.meta, false);

  const fresh = createMemStore();
  await fresh.setMeta('stringToken', 'this-browser');
  assert.deepEqual(await restoreBackup(fresh, doc), { records: 1, photos: 1 });
  assert.deepEqual(await fresh.allRecords(), await store.allRecords());
  const hash = uri.split('/').pop().slice(0, 64);
  assert.equal(await (await fresh.getBlob(hash)).blob.text(), 'pixels');
  assert.equal(await fresh.getMeta('stringUrl'), 'http://localhost:8100');
  assert.equal(await fresh.getMeta('deviceId'), 'desk-1');
  assert.equal(await fresh.getMeta('stringToken'), 'this-browser');
});

test('restore refuses anything that is not a Loom backup, and leaves the store alone', async () => {
  const store = createMemStore();
  await store.setMeta('deviceId', 'keep');
  await assert.rejects(restoreBackup(store, { $type: 'com.cultureblocs.easel.export', version: 1 }), /not a Loom backup/);
  await assert.rejects(restoreBackup(store, { $type: BACKUP_TYPE, version: 2, records: [] }), /unsupported backup version/);
  assert.equal(await store.getMeta('deviceId'), 'keep');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/backup.test.mjs`
Expected: FAIL, `Cannot find module …/app/lib/backup.js`

- [ ] **Step 3: Implement**

Create `app/lib/backup.js`:

```js
/* One-file backup of everything Loom holds: records, photos (base64) and
 * settings — except the String token, which does not belong in a file you
 * might copy anywhere. Restore replaces the store's contents. */

export const BACKUP_TYPE = 'com.cultureblocs.loom.backup';
export const BACKUP_VERSION = 1;
const NOT_BACKED_UP = ['stringToken'];

/* btoa needs a binary string; String.fromCharCode(...bytes) overflows the
 * argument stack on large arrays, so chunk it (as easel/lib/backup.js). */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function exportBackup(store, now = () => Date.now()) {
  const meta = await store.allMeta();
  for (const k of NOT_BACKED_UP) delete meta[k];
  const blobs = {};
  for (const hash of await store.blobHashes()) {
    const row = await store.getBlob(hash);
    blobs[hash] = { mime: row.mime, data: bytesToBase64(new Uint8Array(await row.blob.arrayBuffer())) };
  }
  return { $type: BACKUP_TYPE, version: BACKUP_VERSION, exportedAt: new Date(now()).toISOString(),
    records: await store.allRecords(), meta, blobs };
}

export async function restoreBackup(store, doc) {
  if (doc?.$type !== BACKUP_TYPE) throw new Error('not a Loom backup file');
  if (doc.version !== BACKUP_VERSION) throw new Error(`unsupported backup version: ${doc.version}`);
  if (!Array.isArray(doc.records)) throw new Error('backup has no records');
  const token = await store.getMeta('stringToken');
  await store.clear();
  for (const r of doc.records) await store.putRecord(r);
  for (const [hash, b] of Object.entries(doc.blobs || {})) {
    await store.putBlob({ hash, mime: b.mime, blob: new Blob([base64ToBytes(b.data)], { type: b.mime }) });
  }
  for (const [k, v] of Object.entries(doc.meta || {})) await store.setMeta(k, v);
  if (token !== undefined) await store.setMeta('stringToken', token);   // keep this browser's token
  return { records: doc.records.length, photos: Object.keys(doc.blobs || {}).length };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 51`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/lib/backup.js app/test/backup.test.mjs
git commit -m "feat(phase1): one-file backup and restore of everything in the browser, never the token

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 10: Views

**Files:**
- Create: `app/test/views.test.mjs`
- Create: `app/ui/html.js`, `app/ui/view-thread.js`, `app/ui/view-mint.js`, `app/ui/view-refs.js`, `app/ui/view-compose.js`, `app/ui/view-panel.js`

**Interfaces:**
- Consumes: `isUnsent` (Task 5); `nameFromUri`, `keyFromItemUri`, `itemUri` (Tasks 3 and 6); `anchoredText` (Task 5); `stripRef` (vendor).
- Produces:
  - `html.js`: `html` (a tagged template that escapes interpolations), `raw(s)`, `esc(v)`
  - `view-thread.js`: `KINDS`; `monthView(days, { month, today })`; `dayView(entries, { day, urls: Map, reminder })`; `backupReminder({ unsent, lastBackupAt, now }) => string|null`
  - `view-mint.js`: `DEFAULT_MASKS`; `mintView({ masks?, mask?, kind?, last? })`
  - `view-refs.js`: `REF_TYPES`; `publishHint(ref) => string`; `refsView(refs, text)`; `refFromFields(fields, previousRef?) => ref`
  - `view-compose.js`: `composeView({ record, body, problems, conflict, dayBeads, urls })`; `problemsView(problems)`; `bodyFromFields(type, prevBody, fields) => body`; `parseLinks(text)`; re-exports `itemUri`
  - `view-panel.js`: `panelView(state)`
  - **DOM hooks the controllers rely on:**
    - `data-action` on buttons and file inputs
    - `data-key` on Thread entries
    - `data-ref`, `data-item`, `data-bead` and `data-photo` on Compose rows
    - `data-hint="<i>"` on each ref's publish hint
    - `.problems-slot` around Compose's problem list
    - form field names `title`, `day`, `kind`, `place`, `text`, `links`, `alt-<i>`; ref row names `type`, `role`, `label`, `creator`, `creatorDid`, `date`, `did`, `externalIds`; panel names `stringUrl`, `stringToken`, `posture`

- [ ] **Step 1: Write the tests**

Create `app/test/views.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw } from '../ui/html.js';
import { backupReminder, dayView, monthView } from '../ui/view-thread.js';
import { mintView } from '../ui/view-mint.js';
import { publishHint, refFromFields, refsView } from '../ui/view-refs.js';
import { bodyFromFields, composeView, parseLinks } from '../ui/view-compose.js';
import { panelView } from '../ui/view-panel.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const bead = (key, extra = {}) => ({ key, type: B, rkey: key, sourceApp: 'loom', state: 'kept', createdAt: '2026-09-14T21:04:00Z',
  day: '2026-09-14', body: { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'a <b>note</b>' }, ...extra });

test('html escapes values but not nested html or raw()', () => {
  assert.equal(String(html`<p>${'<script>'}</p>`), '<p>&lt;script&gt;</p>');
  assert.equal(String(html`<p>${html`<b>${'&'}</b>`}${raw('<i>')}</p>`), '<p><b>&amp;</b><i></p>');
  assert.equal(esc(`"'`), '&quot;&#39;');
});

test('monthView lists the month and marks unsent days', () => {
  const out = String(monthView([{ day: '2026-09-14', count: 3, unsent: 1 }, { day: '2026-08-18', count: 222, unsent: 0 }],
    { month: '2026-09', today: '2026-09-14' }));
  assert.match(out, /href="#\/thread\/2026-09-14">2026-09-14 · today/);
  assert.match(out, /1 unsent/);
  assert.doesNotMatch(out, /222/);
});

test('dayView renders strands with members, proposals with keep/release, and escapes notes', () => {
  const p = bead(`${B}/p`, { state: 'proposal', sourceApp: 'scrobbler' });
  const s = { key: `${S}/s`, type: S, state: 'draft', sourceApp: 'loom', createdAt: '2026-09-14T22:00:00Z',
    body: { title: 'Sunday', narrative: 'It rained.', items: [] } };
  const out = String(dayView([{ kind: 'strand', record: s, members: [bead(`${B}/a`)] }, { kind: 'item', record: p }], { day: '2026-09-14' }));
  assert.match(out, /<a href="#\/thread\/2026-09">2026-09<\/a> \/ 2026-09-14/);
  assert.match(out, /Sunday/);
  assert.match(out, /draft/);
  assert.match(out, /a &lt;b&gt;note&lt;\/b&gt;/);
  assert.match(out, /data-action="keep"/);
  assert.match(out, /tell this/);
  assert.match(out, /has-machine/);
});

test('backup reminder appears only when unsent work is at risk', () => {
  const now = Date.parse('2026-09-15T00:00:00Z');
  assert.equal(backupReminder({ unsent: 0, lastBackupAt: null, now }), null);
  assert.equal(backupReminder({ unsent: 3, lastBackupAt: '2026-09-14T00:00:00Z', now }), null);
  assert.match(backupReminder({ unsent: 3, lastBackupAt: null, now }), /never backed up/);
  assert.match(backupReminder({ unsent: 25, lastBackupAt: '2026-09-14T00:00:00Z', now }), /25 records/);
  assert.match(backupReminder({ unsent: 1, lastBackupAt: '2026-09-01T00:00:00Z', now }), /14 days ago/);
});

test('mintView shows the chosen mask and the last mint', () => {
  const out = String(mintView({ mask: 'ART', last: bead(`${B}/x`) }));
  assert.match(out, /aria-checked="true" data-action="mask" data-mask="ART"/);
  assert.match(out, /minted visit at 21:04/);
});

test('publishHint explains what the strip would withhold', () => {
  assert.match(publishHint({ type: 'person', role: 'mention', descriptor: { label: 'J' } }), /stays local/);
  assert.match(publishHint({ type: 'work', role: 'subject', descriptor: { label: 'Dog Days', creator: 'Jane' } }), /creator stays local/);
  assert.match(publishHint({ type: 'person', role: 'mention', descriptor: { label: 'Ballard' },
    externalIds: [{ scheme: 'wikidata', id: 'Q190379' }, { scheme: 'email', id: 'x@y' }] }), /1 id stays local/);
  assert.equal(publishHint({ type: 'work', role: 'subject', descriptor: { label: 'Crash' }, externalIds: [{ scheme: 'isbn', id: '1' }] }), 'publishes as shown');
});

test('refFromFields reads a row, parses ids, keeps the anchor', () => {
  const ref = refFromFields({ type: ' person ', role: 'mention', label: 'Ursula K. Le Guin', creator: '', date: '',
    did: '', externalIds: 'viaf: 96999624\nnot-an-id\nwikidata:Q181659' }, { index: { byteStart: 0, byteEnd: 6 } });
  assert.deepEqual(ref, { type: 'person', role: 'mention', descriptor: { label: 'Ursula K. Le Guin' },
    externalIds: [{ scheme: 'viaf', id: '96999624' }, { scheme: 'wikidata', id: 'Q181659' }], index: { byteStart: 0, byteEnd: 6 } });
  assert.match(String(refsView([ref], 'Ursula wrote')), /anchored to “Ursula”/);
});

test('compose round-trips a strand and a bead through its fields', () => {
  assert.deepEqual(parseLinks('https://a.test | A | B\n\nhttps://b.test'), [{ uri: 'https://a.test', title: 'A | B' }, { uri: 'https://b.test' }]);
  const strand = bodyFromFields(S, { $type: S, createdAt: 'x', items: [] },
    { title: ' Sunday ', day: '2026-09-14', text: 'It rained.', place: 'Peckham', links: '' });
  assert.deepEqual(strand, { $type: S, createdAt: 'x', items: [], title: 'Sunday', day: '2026-09-14T00:00:00Z', narrative: 'It rained.', place: { name: 'Peckham' } });
  const b = bodyFromFields(B, { $type: B, kind: 'bloc', media: [{ uri: '/media/x.jpg', alt: 'old' }], subject: { uri: 'at://x' } },
    { kind: 'read', text: '', place: '', links: '', 'alt-0': 'new alt' });
  assert.deepEqual(b, { $type: B, kind: 'read', media: [{ uri: '/media/x.jpg', alt: 'new alt' }], subject: { uri: 'at://x' } });
  const out = String(composeView({ record: { type: S, state: 'draft', day: '2026-09-14', origin: 'compose' }, body: strand,
    problems: ['$.x: bad'], dayBeads: [bead(`${B}/a`)] }));
  assert.match(out, /save as told/);
  assert.match(out, /disabled/);
  assert.match(out, /\$\.x: bad/);
  assert.match(out, /include<\/button>/);
});

test('panelView shows counts and disables send when nothing is unsent', () => {
  const out = String(panelView({ unsent: 0, localChanges: 2, persisted: false }));
  assert.match(out, /data-action="send" disabled/);
  assert.match(out, /2 local changes/);
  assert.match(out, /not marked persistent/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/views.test.mjs`
Expected: FAIL, `Cannot find module …/app/ui/html.js`

- [ ] **Step 3: Implement**

Create `app/ui/html.js`:

```js
/* HTML by template literal, escaped by default. Views return strings built
 * with `html`; nested `html` results and raw() pass through unescaped. */

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Safe(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v === false || v == null ? '' : esc(v));

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Safe(out);
}
```

Create `app/ui/view-thread.js`:

```js
/* Thread: the month's days and a day's string. Pure; returns html. */
import { isUnsent } from '../lib/day.js';
import { nameFromUri } from '../lib/media.js';
import { html } from './html.js';

export const KINDS = ['bloc', 'visit', 'dwell', 'encounter', 'read', 'listen', 'watch', 'screening', 'performance', 'note'];

const hhmm = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : '');

export function monthView(days, { month, today }) {
  const inMonth = days.filter((d) => d.day.startsWith(month));
  const months = [...new Set(days.map((d) => d.day.slice(0, 7)))];
  return html`
    <nav class="months">${months.map((m) => html`<a href="#/thread/${m}" class="${m === month ? 'on' : ''}">${m}</a>`)}</nav>
    <ol class="days">
      ${inMonth.length ? inMonth.map((d) => html`
        <li><a href="#/thread/${d.day}">${d.day}${d.day === today ? ' · today' : ''}</a>
          <span class="count">${d.count}</span>${d.unsent ? html`<span class="chip unsent" title="${d.unsent} not yet sent to the String">${d.unsent} unsent</span>` : ''}</li>`)
      : html`<li class="empty">Nothing on the string in ${month}.</li>`}
    </ol>`;
}

function chips(r) {
  return html`${isUnsent(r) ? html`<span class="chip unsent">unsent</span>` : ''}${
    r.invalid?.length ? html`<span class="chip invalid" title="${r.invalid.join('\n')}">invalid</span>` : ''}${
    r.missing?.length ? html`<span class="chip missing" title="${r.missing.join('\n')}">photo missing</span>` : ''}${
    (r.body.tags || []).map((t) => html`<span class="chip">${t}</span>`)}`;
}

function photos(r, urls) {
  const imgs = (r.body.media || []).map((m) => {
    const url = urls.get(nameFromUri(m?.uri));
    return url ? html`<img src="${url}" alt="${m.alt || ''}">` : '';
  });
  return imgs.some(Boolean) ? html`<div class="thumbs">${imgs}</div>` : '';
}

function bead(r, urls) {
  const b = r.body, kind = b.kind || (r.type.endsWith('annotation') ? 'annotation' : 'note');
  const proposal = r.state === 'proposal';
  const title = b.subject?.name || b.work?.title || '';
  return html`
    <li class="stop${proposal ? ' machine' : ''}" data-key="${r.key}" style="--k:var(--${kind}, var(--bloc))">
      <time>${hhmm(r.createdAt)}</time><span class="bead"></span>
      <div class="kind">${kind}</div>
      ${title ? html`<div class="title">${title}</div>` : ''}
      <div class="meta">${r.sourceApp}</div>
      ${b.note ? html`<p class="note">${b.note}</p>` : ''}
      <div class="chips">${chips(r)}</div>
      ${photos(r, urls)}
      <div class="tools">
        <a href="#/compose/${r.key}">edit</a>
        ${r.type.endsWith('bead') ? html`<a href="#/compose/new?day=${r.day}&wrap=${r.key}">tell this</a>` : ''}
        ${proposal ? html`<button data-action="keep">keep</button><button data-action="release">release</button>` : ''}
      </div>
    </li>`;
}

const dayHeader = (day) => html`<h2 class="dayhead"><a href="#/thread/${day.slice(0, 7)}">${day.slice(0, 7)}</a> / ${day}</h2>`;

export function dayView(entries, { day, urls = new Map(), reminder = null }) {
  if (!entries.length) {
    return html`${dayHeader(day)}<p class="empty">Nothing on the string for ${day}.</p>
      <p><a href="#/compose/new?day=${day}">write an entry for this day</a></p>`;
  }
  const machine = entries.some((e) => e.record.state === 'proposal' || e.members?.some((m) => m.state === 'proposal'));
  return html`
    ${dayHeader(day)}
    ${reminder ? html`<p class="reminder">${reminder}</p>` : ''}
    <ol class="string${machine ? ' has-machine' : ''}">
      ${entries.map((e) => (e.kind === 'strand'
        ? html`<li class="strand" data-key="${e.record.key}">
            <header><a href="#/compose/${e.record.key}">${e.record.body.title || 'Untitled entry'}</a>
              ${e.record.state === 'draft' ? html`<span class="chip">draft</span>` : ''}${chips(e.record)}</header>
            ${e.record.body.narrative ? html`<p class="narrative">${e.record.body.narrative}</p>` : ''}
            <ol>${e.members.map((m) => bead(m, urls))}</ol>
          </li>`
        : bead(e.record, urls)))}
    </ol>
    <p><a href="#/compose/new?day=${day}">write an entry for this day</a></p>`;
}

/* A reminder when unsent work is piling up or the last backup is old. */
export function backupReminder({ unsent, lastBackupAt, now }) {
  if (!unsent) return null;
  const days = lastBackupAt ? (now - Date.parse(lastBackupAt)) / 86_400_000 : Infinity;
  if (unsent < 20 && days < 7) return null;
  return `${unsent} record${unsent === 1 ? '' : 's'} live only in this browser${
    Number.isFinite(days) ? `, last backup ${Math.floor(days)} days ago` : ', never backed up'} — send them to the String or back up.`;
}
```

Create `app/ui/view-mint.js`:

```js
/* Mint: the button. Pure; returns html. */
import { html } from './html.js';
import { KINDS } from './view-thread.js';

export const DEFAULT_MASKS = [{ n: 'OUT', c: '#EDEDED' }, { n: 'ART', c: '#D71921' }, { n: 'HOME', c: '#5A5A5A' }];

export function mintView({ masks = DEFAULT_MASKS, mask = masks[0]?.n, kind = 'bloc', last = null }) {
  return html`
    <div class="mint">
      <div class="masks" role="radiogroup" aria-label="mask">
        ${masks.map((m) => html`<button type="button" role="radio" aria-checked="${m.n === mask}" data-action="mask" data-mask="${m.n}"
            class="${m.n === mask ? 'on' : ''}" style="--mask:${m.c}">${m.n}</button>`)}
      </div>
      <label class="line">a line, if you want one <input name="note" maxlength="300" autocomplete="off"></label>
      <label class="kindpick">kind <select name="kind">${KINDS.map((k) => html`<option ${k === kind ? 'selected' : ''}>${k}</option>`)}</select></label>
      <button type="button" class="press" data-action="press" aria-label="mint a bead"><span></span></button>
      <p class="minted" aria-live="polite">${last ? html`minted ${last.body.kind} at ${last.createdAt.slice(11, 16)} · <a href="#/compose/${last.key}">add to it</a>` : ''}</p>
      <p class="posture-link"><a href="#/thread">thread</a></p>
    </div>`;
}
```

Create `app/ui/view-refs.js`:

```js
/* The refs editor: one row per ref, and what the strip would publish. Pure. */
import { stripRef } from '../vendor/strip.js';
import { anchoredText } from '../lib/anchors.js';
import { html } from './html.js';

export const REF_TYPES = ['work', 'person', 'event', 'venue', 'concept'];

/* What happens to this ref when its entry is published, in words. */
export function publishHint(ref) {
  const out = stripRef(ref);
  if (!out) {
    if (!ref?.descriptor?.label) return 'needs a label';
    return 'stays local: a person needs a DID or an authority id (wikidata, viaf, isni, orcid, musicbrainz, discogs, ipi)';
  }
  const notes = [];
  if (ref.descriptor?.creator && !out.descriptor.creator) notes.push('creator stays local until the work is identified');
  const dropped = (ref.externalIds || []).length - (out.externalIds || []).length;
  if (dropped > 0) notes.push(`${dropped} id${dropped === 1 ? '' : 's'} stay${dropped === 1 ? 's' : ''} local`);
  if (ref.did && !out.did) notes.push('the DID is not well-formed');
  return notes.length ? `publishes, but ${notes.join('; ')}` : 'publishes as shown';
}

const idsText = (ids) => (ids || []).map((e) => `${e.scheme}:${e.id}`).join('\n');

export function refsView(refs, text) {
  return html`
    <div class="refs">
      ${(refs || []).map((ref, i) => {
        const d = ref.descriptor || {};
        const covered = ref.index ? anchoredText(text || '', ref.index) : null;
        return html`
        <fieldset class="ref" data-ref="${i}">
          <div class="row">
            <label>type <input name="type" list="ref-types" value="${ref.type || ''}"></label>
            <label>role <select name="role">
              <option ${ref.role !== 'mention' ? 'selected' : ''}>subject</option>
              <option ${ref.role === 'mention' ? 'selected' : ''}>mention</option></select></label>
            <label>label <input name="label" value="${d.label || ''}"></label>
          </div>
          <div class="row">
            <label>creator <input name="creator" value="${d.creator || ''}"></label>
            <label>creator DID <input name="creatorDid" value="${d.creatorDid || ''}"></label>
            <label>date <input name="date" value="${d.date || ''}"></label>
            <label>DID <input name="did" value="${ref.did || ''}"></label>
          </div>
          <label>ids, one per line as scheme:id <textarea name="externalIds" rows="2">${idsText(ref.externalIds)}</textarea></label>
          <div class="row anchor">
            ${covered ? html`anchored to “${covered}” <button type="button" data-action="clear-anchor">clear anchor</button>`
              : html`<button type="button" data-action="anchor">anchor to selected text</button>`}
            <button type="button" data-action="remove-ref">remove</button>
          </div>
          <p class="hint" data-hint="${i}">${publishHint(ref)}</p>
        </fieldset>`;
      })}
      <datalist id="ref-types">${REF_TYPES.map((t) => html`<option value="${t}">`)}</datalist>
      <button type="button" data-action="add-ref">add a ref</button>
    </div>`;
}

/* Read one ref row's inputs back into a ref, keeping its anchor. */
export function refFromFields(fields, previous = {}) {
  const trim = (v) => String(v ?? '').trim();
  const ref = { type: trim(fields.type) || 'work', role: fields.role === 'mention' ? 'mention' : 'subject',
    descriptor: { label: trim(fields.label) } };
  for (const k of ['creator', 'creatorDid', 'date']) if (trim(fields[k])) ref.descriptor[k] = trim(fields[k]);
  if (trim(fields.did)) ref.did = trim(fields.did);
  const ids = String(fields.externalIds ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? { scheme: l.slice(0, i).trim(), id: l.slice(i + 1).trim() } : null;
  }).filter((e) => e && e.id);
  if (ids.length) ref.externalIds = ids;
  if (previous.index) ref.index = previous.index;
  return ref;
}
```

Create `app/ui/view-compose.js`:

```js
/* Compose: the editor for a strand (an entry) or a bead. Pure: html from the
 * editor state, and the reverse mapping from form fields to a record body. */
import { itemUri, keyFromItemUri } from '../lib/keys.js';
import { nameFromUri } from '../lib/media.js';
import { html } from './html.js';
import { KINDS } from './view-thread.js';
import { refsView } from './view-refs.js';

const STRAND = 'com.cultureblocs.strand';

const linksText = (links) => (links || []).map((l) => (l.title ? `${l.uri} | ${l.title}` : l.uri)).join('\n');

export function parseLinks(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [uri, ...title] = l.split('|');
    const link = { uri: uri.trim() };
    if (title.join('|').trim()) link.title = title.join('|').trim();
    return link;
  });
}

/* state: { record, body, problems, conflict, dayBeads, urls, saving } */
export function composeView(state) {
  const { record, body, problems = [], conflict = null, dayBeads = [], urls = new Map() } = state;
  const isStrand = record.type === STRAND;
  const text = isStrand ? body.narrative || '' : body.note || '';
  const included = new Set((body.items || []).map((it) => keyFromItemUri(it.uri)));
  return html`
    <form class="compose" data-type="${record.type}" onsubmit="return false">
      <header>
        <h2>${isStrand ? 'Entry' : 'Bead'} · ${record.day || ''}</h2>
        <span class="state chip">${record.state}</span>
        ${record.origin === 'mint' ? html`<span class="chip" title="minted ${record.createdAt}">mint fact</span>` : ''}
      </header>
      ${conflict ? html`<div class="conflict">Another tab saved this ${conflict.updatedAt}.
        <button type="button" data-action="take-theirs">use theirs</button>
        <button type="button" data-action="keep-mine">keep mine</button></div>` : ''}
      ${isStrand ? html`
        <label>title <input name="title" value="${body.title || ''}" maxlength="300"></label>
        <label>day <input type="date" name="day" value="${(body.day || '').slice(0, 10)}"></label>`
      : html`
        <label>kind <select name="kind">${KINDS.map((k) => html`<option ${k === body.kind ? 'selected' : ''}>${k}</option>`)}</select></label>`}
      <label>place <input name="place" value="${(isStrand ? body.place?.name : body.subject?.name) || ''}"></label>
      <label>${isStrand ? 'narrative' : 'note'}
        <textarea name="text" rows="${isStrand ? 14 : 5}">${text}</textarea></label>
      <label>links, one per line: url | label <textarea name="links" rows="2">${linksText(body.links)}</textarea></label>
      ${isStrand ? html`
        <fieldset class="items"><legend>beads in this entry</legend>
          <ol>${(body.items || []).map((it, i) => {
            const key = keyFromItemUri(it.uri);
            const bead = dayBeads.find((b) => b.key === key);
            return html`<li data-item="${i}">${bead ? `${bead.createdAt.slice(11, 16)} ${bead.body.kind} ${bead.body.note || ''}`.slice(0, 80) : it.uri}
              <button type="button" data-action="item-up">↑</button><button type="button" data-action="item-down">↓</button>
              <button type="button" data-action="item-remove">remove</button></li>`;
          })}</ol>
          <ul class="candidates">${dayBeads.filter((b) => !included.has(b.key)).map((b) => html`
            <li data-bead="${b.key}">${b.createdAt.slice(11, 16)} ${b.body.kind} ${(b.body.note || '').slice(0, 60)}
              ${b.state === 'proposal' ? html`<span class="chip">proposal</span>` : ''}
              <button type="button" data-action="item-add">${b.state === 'proposal' ? 'keep and include' : 'include'}</button></li>`)}</ul>
        </fieldset>`
      : html`
        <fieldset class="photos"><legend>photos</legend>
          <div class="thumbs">${(body.media || []).map((m, i) => html`
            <figure data-photo="${i}">${urls.get(nameFromUri(m.uri)) ? html`<img src="${urls.get(nameFromUri(m.uri))}" alt="">` : ''}
              <input name="alt-${i}" placeholder="what it shows" value="${m.alt || ''}">
              <button type="button" data-action="photo-remove">remove</button></figure>`)}</div>
          <input type="file" accept="image/*" multiple data-action="photo-add">
        </fieldset>`}
      <fieldset><legend>refs — what this is about</legend>${refsView(body.refs, text)}</fieldset>
      <div class="problems-slot">${problemsView(problems)}</div>
      <footer>
        <button type="button" class="primary" data-action="save" ${problems.length ? 'disabled' : ''}>save</button>
        ${isStrand && record.state === 'draft' ? html`<button type="button" data-action="finish" ${problems.length ? 'disabled' : ''}>save as told</button>` : ''}
        <button type="button" data-action="discard">discard changes</button>
        <a href="#/thread/${record.day || ''}">back to the day</a>
      </footer>
    </form>`;
}

export const problemsView = (problems) =>
  html`${problems.length ? html`<ul class="problems">${problems.map((p) => html`<li>${p}</li>`)}</ul>` : ''}`;

/* Form values -> a new body, from the previous body. Refs are handled by the
 * controller (they carry anchors), so they pass through here. */
export function bodyFromFields(type, prev, f) {
  const body = { ...prev };
  const set = (k, v) => { if (v) body[k] = v; else delete body[k]; };
  const text = String(f.text ?? '');
  const place = String(f.place ?? '').trim();
  set('links', parseLinks(f.links).length ? parseLinks(f.links) : null);
  if (type === STRAND) {
    set('title', String(f.title ?? '').trim());
    if (f.day) body.day = `${f.day}T00:00:00Z`;
    set('narrative', text);
    set('place', place ? { ...(prev.place || {}), name: place } : null);
  } else {
    if (f.kind) body.kind = f.kind;
    set('note', text);
    set('subject', place ? { ...(prev.subject || {}), name: place } : (prev.subject && !prev.subject.name ? prev.subject : null));
    if (Array.isArray(prev.media)) body.media = prev.media.map((m, i) => {
      const alt = String(f[`alt-${i}`] ?? m.alt ?? '').trim();
      const { alt: _, ...rest } = m;
      return alt ? { ...rest, alt } : rest;
    });
  }
  return body;
}

export { itemUri };
```

Create `app/ui/view-panel.js`:

```js
/* The String panel: settings, import, send, backup. Pure; returns html. */
import { html } from './html.js';

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : 'never');

export function panelView(s) {
  return html`
    <section class="panel">
      <h2>String</h2>
      <label>URL <input name="stringUrl" value="${s.stringUrl || 'http://localhost:8100'}"></label>
      <label>token <input name="stringToken" type="password" value="${s.stringToken || ''}" autocomplete="off"></label>
      <div class="row"><button type="button" data-action="check">check</button>
        <span class="status">${s.check || ''}</span></div>

      <h3>Import</h3>
      <p>Copies the String's records and photos into this browser. Re-run any time;
        records changed on both sides are left alone and listed.</p>
      <button type="button" data-action="import" ${s.busy ? 'disabled' : ''}>import</button>
      <span class="status">last import: ${when(s.lastImportAt)}</span>
      ${s.importResult ? html`<p class="result">${s.importResult}</p>` : ''}

      <h3>Send</h3>
      <p>${s.unsent} Loom-made record${s.unsent === 1 ? '' : 's'} not yet on the String.
        ${s.localChanges ? html`${s.localChanges} local change${s.localChanges === 1 ? '' : 's'} to records already there wait for sync (Phase 2).` : ''}</p>
      <button type="button" data-action="send" ${s.busy || !s.unsent ? 'disabled' : ''}>send</button>
      ${s.sendResults?.length ? html`<ul class="result">${s.sendResults.map((r) => html`<li>${r.status}: ${r.key}${r.reason ? ` — ${r.reason}` : ''}${r.problems ? ` — ${r.problems.join('; ')}` : ''}</li>`)}</ul>` : ''}

      <h3>Backup</h3>
      <p>Everything in this browser in one file (not the token). Last backup: ${when(s.lastBackupAt)}.</p>
      <button type="button" data-action="backup">download backup</button>
      <label class="file">restore from a backup <input type="file" accept="application/json" data-action="restore"></label>

      <h3>This browser</h3>
      <p>${s.persisted ? 'Storage is persistent.' : 'Storage is not marked persistent: the browser may clear it under pressure. Back up.'}</p>
      <label>posture <select name="posture">${['auto', 'desk', 'totem'].map((p) => html`<option ${p === (s.posture || 'auto') ? 'selected' : ''}>${p}</option>`)}</select></label>
    </section>`;
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 60`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/ui/html.js app/ui/view-*.js app/test/views.test.mjs
git commit -m "feat(phase1): pure, escaped views for thread, mint, compose, refs and the String panel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 11: Controllers

**Files:**
- Create: `app/test/controllers.test.mjs`
- Create: `app/ui/thread.js`, `app/ui/mint.js`, `app/ui/compose.js`, `app/ui/string-panel.js`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - **The `ctx` shape the shell (Task 12) builds:** `{ store, registry, loom, now(), fetch, broadcast(), setDirty(bool), persisted() => Promise<bool>, photoUrls(names) => Promise<Map name→url>, download(filename, text), applyPosture() }`
  - `mountThread(root, ctx, { period: '' | 'YYYY-MM' | 'YYYY-MM-DD' })`
  - `mountMint(root, ctx)`
  - `mountCompose(root, ctx, { key })`, and `newStrand(ctx, { day, wrap? }) => env` (a draft strand; wrapping a bead offers that bead's refs as mentions)
  - `mountPanel(root, ctx)`
  - Every `mount*` resolves to `{ render(), unmount() }`
  - **Compose behaviour:** typing updates `.problems-slot`, the Save and Finish buttons, and ref hints in place, with no re-render (so focus isn't stolen). Structural actions re-render. Every change autosaves a draft after 500 ms.

- [ ] **Step 1: Write the smoke tests**

Create `app/test/controllers.test.mjs`:

```js
/* Smoke tests for the ui controllers: each mounts against a minimal fake root
 * and a real in-memory Loom, renders, and handles its main action without
 * throwing. The DOM-level behaviour is covered by the end-to-end browser run. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { mountCompose, newStrand } from '../ui/compose.js';
import { mountMint } from '../ui/mint.js';
import { mountPanel } from '../ui/string-panel.js';
import { mountThread } from '../ui/thread.js';
import { registry, steppingNow } from './helpers.mjs';

function fakeRoot() {
  const listeners = {};
  return {
    innerHTML: '', textContent: '',
    addEventListener: (t, f) => { listeners[t] = f; },
    removeEventListener: (t) => { delete listeners[t]; },
    querySelector: () => null,
    querySelectorAll: () => [],
    fire: (t, target) => listeners[t]?.({ target }),
  };
}

const button = (action, data = {}, parents = {}) => ({
  dataset: { action, ...data },
  closest: (sel) => (sel === 'button[data-action]' ? button(action, data, parents) : parents[sel] ?? null),
  set textContent(_) {},
});

async function context() {
  const store = createMemStore();
  const reg = await registry();
  const now = steppingNow();
  const loom = await openLoom({ store, registry: reg, now, newDeviceId: () => 'desk-1' });
  return { store, registry: reg, loom, now, broadcast() {}, setDirty() {}, persisted: async () => false,
    photoUrls: async () => new Map(), download() {}, applyPosture() {}, fetch: async () => { throw new Error('offline'); } };
}

test('thread renders a month, a day, and keeps a proposal', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'hello' });
  await ctx.store.putRecord({ ...bead, key: 'com.cultureblocs.bead/p', rkey: 'p', state: 'proposal' });
  const month = fakeRoot();
  await mountThread(month, ctx, { period: '' });
  assert.match(month.innerHTML, /class="days"/);
  const day = fakeRoot();
  await mountThread(day, ctx, { period: bead.day });
  assert.match(day.innerHTML, /hello/);
  await day.fire('click', button('keep', {}, { '[data-key]': { dataset: { key: 'com.cultureblocs.bead/p' } } }));
  assert.equal((await ctx.store.getRecord('com.cultureblocs.bead/p')).state, 'kept');
});

test('mint mints on press', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountMint(root, ctx);
  await root.fire('click', button('press'));
  const [bead] = await ctx.store.allRecords();
  assert.equal(bead.body.provenance.app, 'loom');
  assert.match(root.innerHTML, /minted bloc/);
});

test('compose opens a new strand wrapping a bead and saves it', async () => {
  const ctx = await context();
  const bead = await ctx.loom.mint({ note: 'wrap me' });
  const strand = await newStrand(ctx, { day: bead.day, wrap: bead.key });
  assert.deepEqual(strand.body.items, [{ uri: `loom://${bead.key}` }]);
  const root = fakeRoot();
  await mountCompose(root, ctx, { key: strand.key });
  assert.match(root.innerHTML, /wrap me/);
  await root.fire('click', button('finish'));
  assert.equal((await ctx.store.getRecord(strand.key)).state, 'kept');
});

test('the string panel renders and reports an unreachable String', async () => {
  const ctx = await context();
  const root = fakeRoot();
  await mountPanel(root, ctx);
  assert.match(root.innerHTML, /0 Loom-made records/);
  await root.fire('click', button('check'));
  assert.match(root.innerHTML, /unreachable \(offline\)/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test app/test/controllers.test.mjs`
Expected: FAIL, `Cannot find module …/app/ui/compose.js`

- [ ] **Step 3: Implement**

Create `app/ui/thread.js`:

```js
/* Thread controller: month and day, keep and release. */
import { dayString, isUnsent, monthDays } from '../lib/day.js';
import { mediaNames } from '../lib/media.js';
import { backupReminder, dayView, monthView } from './view-thread.js';

export async function mountThread(root, ctx, { period }) {
  const today = new Date(ctx.now()).toISOString().slice(0, 10);
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(period || '');
  const armed = new Set();

  async function render() {
    const records = await ctx.store.allRecords();
    if (!isDay) {
      const days = monthDays(records);
      const month = period || days[0]?.day.slice(0, 7) || today.slice(0, 7);
      root.innerHTML = String(monthView(days, { month, today }));
      return;
    }
    const dayRecords = records.filter((r) => r.day === period);
    const entries = dayString(dayRecords, records);
    const names = [...dayRecords, ...entries.flatMap((e) => e.members || [])].flatMap((r) => mediaNames(r.body));
    const reminder = backupReminder({ unsent: records.filter(isUnsent).length,
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'), now: ctx.now() });
    root.innerHTML = String(dayView(entries, { day: period, urls: await ctx.photoUrls(names), reminder }));
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const key = button.closest('[data-key]')?.dataset.key;
    if (button.dataset.action === 'keep') {
      await ctx.loom.keep(key);
    } else if (button.dataset.action === 'release') {
      if (!armed.has(key)) {           // two presses: a released proposal is gone
        armed.add(key);
        button.textContent = 'release?';
        setTimeout(() => { armed.delete(key); button.textContent = 'release'; }, 4000);
        return;
      }
      await ctx.loom.release(key);
    } else return;
    ctx.broadcast();
    await render();
  }

  root.addEventListener('click', onClick);
  await render();
  return { render, unmount: () => root.removeEventListener('click', onClick) };
}
```

Create `app/ui/mint.js`:

```js
/* Mint controller: pick a mask, maybe a line, press. The bead is written
 * before the bloom plays; nothing here touches the network. */
import { DEFAULT_MASKS, mintView } from './view-mint.js';

export async function mountMint(root, ctx) {
  const masks = (await ctx.store.getMeta('masks')) || DEFAULT_MASKS;
  const state = { masks, mask: (await ctx.store.getMeta('mask')) || masks[0].n, kind: 'bloc', last: null };
  const render = () => { root.innerHTML = String(mintView(state)); };

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'mask') {
      state.mask = button.dataset.mask;
      await ctx.store.setMeta('mask', state.mask);
      render();
    } else if (button.dataset.action === 'press') {
      const note = root.querySelector('input[name="note"]')?.value || '';
      const kind = root.querySelector('select[name="kind"]')?.value || state.kind;
      state.kind = kind;
      state.last = await ctx.loom.mint({ mask: state.mask, note, kind });
      ctx.broadcast();
      render();
      root.querySelector('.press')?.classList.add('bloom');
    }
  }

  root.addEventListener('click', onClick);
  render();
  return { render, unmount: () => root.removeEventListener('click', onClick) };
}
```

Create `app/ui/compose.js`:

```js
/* Compose controller: edit a strand or a bead. Typing updates the problems
 * list and publish hints in place (a full re-render would steal focus);
 * structural actions re-render. Every change autosaves as a draft; Save goes
 * through the envelope's validation gate. */
import { reanchor, selectionToIndex } from '../lib/anchors.js';
import { Conflict, STRAND } from '../lib/envelope.js';
import { preparePhoto } from '../lib/images.js';
import { itemUri } from '../lib/keys.js';
import { mediaNames, putPhoto } from '../lib/media.js';
import { bodyFromFields, composeView, problemsView } from './view-compose.js';
import { publishHint, refFromFields } from './view-refs.js';

export async function newStrand(ctx, { day, wrap }) {
  const createdAt = new Date(ctx.now()).toISOString();
  const body = { $type: STRAND, createdAt, day: `${day || createdAt.slice(0, 10)}T00:00:00Z`, items: [] };
  if (wrap) {
    const bead = await ctx.store.getRecord(wrap);
    if (bead) {
      body.items.push({ uri: itemUri(bead.key) });
      // The bead's refs are offered as mentions; its subject is not necessarily the entry's.
      const refs = (bead.body.refs || []).map(({ index: _, ...r }) => ({ ...r, role: 'mention' }));
      if (refs.length) body.refs = refs;
    }
  }
  return ctx.loom.create(STRAND, body, { origin: 'compose', state: 'draft' });
}

const textField = (type) => (type === STRAND ? 'narrative' : 'note');

export async function mountCompose(root, ctx, { key }) {
  let record = await ctx.store.getRecord(key);
  if (!record) { root.textContent = `No record ${key}.`; return { unmount() {} }; }
  const draft = await ctx.loom.getDraft(key);
  const state = { record, body: structuredClone(draft?.body ?? record.body), conflict: null, dayBeads: [], urls: new Map() };
  let saveTimer = null;

  const text = () => state.body[textField(record.type)] || '';

  async function loadContext() {
    const all = await ctx.store.allRecords();
    state.dayBeads = all.filter((r) => r.day === record.day && r.type !== STRAND).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    state.urls = await ctx.photoUrls(mediaNames(state.body));
  }

  function problems() { return ctx.loom.validate(record.type, state.body); }

  async function render() {
    await loadContext();
    root.innerHTML = String(composeView({ ...state, record, problems: problems() }));
  }

  function refreshInPlace() {
    const list = problems();
    const slot = root.querySelector('.problems-slot');
    if (slot) slot.innerHTML = String(problemsView(list));
    root.querySelectorAll('button[data-action="save"], button[data-action="finish"]').forEach((b) => { b.disabled = list.length > 0; });
    (state.body.refs || []).forEach((ref, i) => {
      const hint = root.querySelector(`[data-hint="${i}"]`);
      if (hint) hint.textContent = publishHint(ref);
    });
  }

  function scheduleDraft() {
    ctx.setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await ctx.loom.saveDraft(record.key, state.body);
      ctx.setDirty(false);
    }, 500);
  }

  function readFields() {
    const f = {};
    root.querySelectorAll('form.compose > label > [name], form.compose [name^="alt-"]').forEach((el) => { f[el.name] = el.value; });
    return f;
  }

  function onInput(e) {
    if (e.target.type === 'file') return;
    const before = text();
    const next = bodyFromFields(record.type, state.body, readFields());
    const refs = [...root.querySelectorAll('fieldset.ref')].map((fs, i) => {
      const f = {};
      fs.querySelectorAll('[name]').forEach((el) => { f[el.name] = el.value; });
      return refFromFields(f, state.body.refs?.[i]);
    });
    const after = next[textField(record.type)] || '';
    const carried = after !== before ? reanchor(before, after, refs) : refs;
    if (carried.length) next.refs = carried; else delete next.refs;
    state.body = next;
    scheduleDraft();
    refreshInPlace();
  }

  async function save({ finish = false, expectUpdatedAt = record.updatedAt } = {}) {
    clearTimeout(saveTimer);
    try {
      record = await ctx.loom.save(record.key, state.body, { expectUpdatedAt });
      if (finish) record = await ctx.loom.finish(record.key);
      state.conflict = null;
      ctx.setDirty(false);
      ctx.broadcast();
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      state.conflict = e.current;
    }
    await render();
  }

  async function onClick(e) {
    const button = e.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const refIndex = Number(button.closest('[data-ref]')?.dataset.ref);
    const itemIndex = Number(button.closest('[data-item]')?.dataset.item);
    const items = state.body.items || [];
    if (action === 'save') return save();
    if (action === 'finish') return save({ finish: true });
    if (action === 'keep-mine') return save({ expectUpdatedAt: state.conflict.updatedAt });
    if (action === 'take-theirs') {
      record = state.conflict;
      state.body = structuredClone(record.body);
      state.conflict = null;
      await ctx.loom.discardDraft(record.key);
    } else if (action === 'discard') {
      await ctx.loom.discardDraft(record.key);
      record = await ctx.store.getRecord(record.key);
      state.body = structuredClone(record.body);
    } else if (action === 'add-ref') {
      state.body.refs = [...(state.body.refs || []), { type: 'work', role: 'subject', descriptor: { label: '' } }];
    } else if (action === 'remove-ref') {
      state.body.refs.splice(refIndex, 1);
      if (!state.body.refs.length) delete state.body.refs;
    } else if (action === 'anchor') {
      const area = root.querySelector('textarea[name="text"]');
      const index = area ? selectionToIndex(area.value, area.selectionStart, area.selectionEnd) : null;
      if (!index) return;
      state.body.refs[refIndex] = { ...state.body.refs[refIndex], index };
    } else if (action === 'clear-anchor') {
      const { index: _, ...rest } = state.body.refs[refIndex];
      state.body.refs[refIndex] = rest;
    } else if (action === 'item-up' && itemIndex > 0) {
      [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
    } else if (action === 'item-down' && itemIndex < items.length - 1) {
      [items[itemIndex + 1], items[itemIndex]] = [items[itemIndex], items[itemIndex + 1]];
    } else if (action === 'item-remove') {
      items.splice(itemIndex, 1);
    } else if (action === 'item-add') {
      const beadKey = button.closest('[data-bead]').dataset.bead;
      const bead = await ctx.store.getRecord(beadKey);
      if (bead?.state === 'proposal') await ctx.loom.keep(beadKey);
      state.body.items = [...items, { uri: itemUri(beadKey) }];
    } else if (action === 'photo-remove') {
      state.body.media.splice(Number(button.closest('[data-photo]').dataset.photo), 1);
      if (!state.body.media.length) delete state.body.media;
    } else return;
    scheduleDraft();
    await render();
  }

  async function onChange(e) {
    if (e.target.dataset?.action !== 'photo-add') return;
    for (const file of e.target.files) {
      const { blob, width, height } = await preparePhoto(file);
      const uri = await putPhoto(ctx.store, blob);
      state.body.media = [...(state.body.media || []), { uri, mime: blob.type, aspectRatio: { width, height } }];
    }
    scheduleDraft();
    await render();
  }

  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  await render();
  return {
    render,
    unmount() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
    },
  };
}
```

Create `app/ui/string-panel.js`:

```js
/* String panel controller: settings, check, import, send, backup, restore. */
import { contentHash } from '../vendor/strip.js';
import { exportBackup, restoreBackup } from '../lib/backup.js';
import { isUnsent } from '../lib/day.js';
import { runImport } from '../lib/importer.js';
import { runSend } from '../lib/sender.js';
import { stringClient } from '../lib/string-client.js';
import { panelView } from './view-panel.js';

async function localChangeCount(records) {
  let n = 0;
  for (const r of records) {
    if (!r.stringId) continue;
    if (r.sentAt ? r.updatedAt > r.sentAt
      : (await contentHash(r.body)) !== r.importedHash || r.state !== r.importedState) n += 1;
  }
  return n;
}

export async function mountPanel(root, ctx) {
  const s = { check: '', importResult: '', sendResults: [], busy: false };

  async function render() {
    const records = await ctx.store.allRecords();
    Object.assign(s, {
      stringUrl: await ctx.store.getMeta('stringUrl'),
      stringToken: await ctx.store.getMeta('stringToken'),
      lastImportAt: await ctx.store.getMeta('lastImportAt'),
      lastBackupAt: await ctx.store.getMeta('lastBackupAt'),
      posture: await ctx.store.getMeta('posture'),
      unsent: records.filter(isUnsent).length,
      localChanges: await localChangeCount(records),
      persisted: await ctx.persisted(),
    });
    root.innerHTML = String(panelView(s));
  }

  const client = () => stringClient(s.stringUrl || 'http://localhost:8100', s.stringToken, ctx.fetch);

  async function busy(fn) {
    s.busy = true;
    await render();
    try { await fn(); } finally { s.busy = false; await render(); }
  }

  async function onClick(e) {
    const action = e.target.closest?.('button[data-action]')?.dataset.action;
    if (action === 'check') {
      try { s.check = `a String, holding ${(await client().health()).length} record types`; }
      catch (err) { s.check = err.message; }
      await render();
    } else if (action === 'import') {
      await busy(async () => {
        try {
          const { counts, conflicts } = await runImport({ store: ctx.store, registry: ctx.registry, client: client(), now: ctx.now });
          s.importResult = `added ${counts.add}, updated ${counts.update}, unchanged ${counts.unchanged}, photos ${counts.photos}`
            + (counts.invalid ? `, ${counts.invalid} flagged invalid` : '')
            + (counts.missing ? `, ${counts.missing} photos missing` : '')
            + (conflicts.length ? ` — changed on both sides, left alone: ${conflicts.join(', ')}` : '');
        } catch (err) { s.importResult = err.message; }
        ctx.broadcast();
      });
    } else if (action === 'send') {
      await busy(async () => {
        try { s.sendResults = await runSend({ store: ctx.store, client: client(), now: ctx.now }); }
        catch (err) { s.sendResults = [{ key: '', status: 'failed', reason: err.message }]; }
        ctx.broadcast();
      });
    } else if (action === 'backup') {
      const doc = await exportBackup(ctx.store, ctx.now);
      ctx.download(`loom-backup-${doc.exportedAt.slice(0, 10)}.json`, JSON.stringify(doc));
      await ctx.store.setMeta('lastBackupAt', doc.exportedAt);
      await render();
    }
  }

  async function onChange(e) {
    const el = e.target;
    if (el.name === 'stringUrl' || el.name === 'stringToken' || el.name === 'posture') {
      await ctx.store.setMeta(el.name, el.value.trim());
      s[el.name] = el.value.trim();
      if (el.name === 'posture') ctx.applyPosture();
    } else if (el.dataset?.action === 'restore' && el.files?.[0]) {
      try {
        const { records, photos } = await restoreBackup(ctx.store, JSON.parse(await el.files[0].text()));
        s.importResult = `restored ${records} records and ${photos} photos`;
        ctx.broadcast();
      } catch (err) { s.importResult = err.message; }
      await render();
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  await render();
  return { render, unmount() { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); } };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 64`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app/ui/thread.js app/ui/mint.js app/ui/compose.js app/ui/string-panel.js app/test/controllers.test.mjs
git commit -m "feat(phase1): thread, mint, compose and String panel controllers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 12: Shell, posture, service worker, PWA

**Files:**
- Create: `app/index.html`, `app/loom.js`, `app/loom.css`, `app/sw.js`, `app/manifest.webmanifest`
- Copy: `app/icon-192.png`, `app/icon-512.png` from `../cultureblocs-string/pocket/`

**Interfaces:**
- Consumes: all controllers (Task 11), `openStore` (Task 3), `loadRegistry` (Task 1), `openLoom` (Task 4), `hashFromName` (Task 6).
- Produces:
  - **Routes:** `#/thread[/<YYYY-MM>|/<YYYY-MM-DD>]`, `#/mint`, `#/string`, `#/compose/<key>`, `#/compose/new?day=…&wrap=<key>`
  - **`body[data-posture]`:** `desk` or `totem`. The `meta` value `posture` is `auto`, `desk` or `totem`; `auto` means desk at ≥ 900px wide.
  - **Desk posture on compose routes:** Thread of that record's day in `#main`, Compose in `#side`.
  - **Service worker:** cache `loom-1`. A new version installs, waits, and is told `skipWaiting` only when no draft is pending. The page reloads on `controllerchange` only if a worker already controlled it.
  - `window.loom` is the `ctx`, for scripted checks.

- [ ] **Step 1: Copy the icons**

Run: `cp ../cultureblocs-string/pocket/icon-192.png ../cultureblocs-string/pocket/icon-512.png app/`

- [ ] **Step 2: Write the shell**

Create `app/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loom</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon-192.png">
  <meta name="theme-color" content="#1B1D22">
  <link rel="stylesheet" href="loom.css">
</head>
<body>
  <header class="bar">
    <a class="brand" href="#/thread">LOOM</a>
    <nav>
      <a href="#/thread" data-nav="thread">thread</a>
      <a href="#/mint" data-nav="mint">mint</a>
      <a href="#/string" data-nav="string">string</a>
    </nav>
    <span id="banner" class="banner" hidden></span>
  </header>
  <main id="panes">
    <section id="main" class="pane"></section>
    <aside id="side" class="pane"></aside>
  </main>
  <noscript>Loom needs JavaScript: it is the whole app.</noscript>
  <script type="module" src="loom.js"></script>
</body>
</html>
```

Create `app/loom.js`:

```js
/* The shell: open the store, route between surfaces, choose a posture,
 * keep tabs in step, and take service-worker updates only when no edit is
 * pending. */
import { openLoom } from './lib/envelope.js';
import { hashFromName } from './lib/media.js';
import { loadRegistry } from './lib/lexicons.js';
import { openStore } from './lib/store.js';
import { mountCompose, newStrand } from './ui/compose.js';
import { mountMint } from './ui/mint.js';
import { mountPanel } from './ui/string-panel.js';
import { mountThread } from './ui/thread.js';

const $ = (sel) => document.querySelector(sel);
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('loom') : null;
const urls = new Map();
let mounted = [];
let dirty = false;

async function boot() {
  const store = await openStore();
  const registry = await loadRegistry(async (p) => (await fetch(p)).json(), './vendor/lexicons/');
  const loom = await openLoom({ store, registry });

  const ctx = {
    store, registry, loom,
    now: () => Date.now(),
    fetch: (...a) => fetch(...a),
    broadcast: () => channel?.postMessage('changed'),
    setDirty: (d) => { dirty = d; },
    async persisted() { return (await navigator.storage?.persisted?.()) ?? false; },
    async photoUrls(names) {
      for (const name of names) {
        if (urls.has(name)) continue;
        const row = await store.getBlob(hashFromName(name));
        if (row) urls.set(name, URL.createObjectURL(row.blob));
      }
      return urls;
    },
    download(filename, text) {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    },
    applyPosture,
  };

  async function applyPosture() {
    const chosen = (await store.getMeta('posture')) || 'auto';
    const posture = chosen === 'auto' ? (matchMedia('(min-width: 900px)').matches ? 'desk' : 'totem') : chosen;
    document.body.dataset.posture = posture;
    return posture;
  }

  async function route() {
    for (const m of mounted) m.unmount?.();
    mounted = [];
    const posture = await applyPosture();
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [surface = '', ...rest] = path.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    const params = new URLSearchParams(query);
    const main = $('#main'), side = $('#side');
    main.innerHTML = side.innerHTML = '';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (surface || 'home')));
    document.body.dataset.surface = surface || 'home';

    if (!surface) {
      location.replace(posture === 'totem' ? '#/mint' : '#/thread');
      return;
    }
    if (surface === 'compose' && arg === 'new') {
      const strand = await newStrand(ctx, { day: params.get('day'), wrap: params.get('wrap') });
      location.replace(`#/compose/${strand.key}`);
      return;
    }
    if (surface === 'thread') mounted.push(await mountThread(main, ctx, { period: arg }));
    else if (surface === 'mint') mounted.push(await mountMint(main, ctx));
    else if (surface === 'string') mounted.push(await mountPanel(main, ctx));
    else if (surface === 'compose') {
      const record = await store.getRecord(arg);
      if (posture === 'desk' && record?.day) mounted.push(await mountThread(main, ctx, { period: record.day }));
      mounted.push(await mountCompose(posture === 'desk' ? side : main, ctx, { key: arg }));
    } else main.textContent = 'Nothing here.';
  }

  window.addEventListener('hashchange', route);
  matchMedia('(min-width: 900px)').addEventListener('change', route);
  channel?.addEventListener('message', () => {
    if (!dirty) mounted.forEach((m) => m.render?.());
  });

  if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
    if (!(await navigator.storage.persist())) {
      const banner = $('#banner');
      banner.textContent = 'This browser may clear Loom’s storage — back up from the string panel.';
      banner.hidden = false;
    }
  }

  await route();
  registerServiceWorker();
  window.loom = ctx;   // for scripted checks and the console
}

/* A new version is installed but waits; it takes over only when no edit is
 * pending, then the page reloads onto it. */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The first install claims this page too; only a replacement of an existing
  // worker is an update worth reloading for.
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reg = await navigator.serviceWorker.register('./sw.js');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  const offer = () => {
    if (!reg.waiting) return;
    const tryNow = () => (dirty ? setTimeout(tryNow, 1000) : reg.waiting?.postMessage('skipWaiting'));
    tryNow();
  };
  offer();
  reg.addEventListener('updatefound', () => {
    reg.installing?.addEventListener('statechange', (e) => { if (e.target.state === 'installed' && navigator.serviceWorker.controller) offer(); });
  });
}

boot().catch((err) => {
  document.getElementById('main').textContent = `Loom could not start: ${err.message}`;
  console.error(err);
});
```

Create `app/loom.css`:

```css
:root{
  --ink:#1B1D22; --faint:#8A857C; --line:#DDD6CA; --paper:#F7F4EE; --card:#FFFDF9; --card-edge:#E6DFD3;
  --visit:#2B4BC7; --dwell:#C7860F; --encounter:#B0326E; --screening:#6B3FA0; --performance:#A23B2A;
  --bloc:#4A4741; --read:#2E7A4F; --listen:#C74E2B; --watch:#0F6E6B; --note:#4A4741; --annotation:#1B1D22;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --serif: Charter, "Iowan Old Style", Georgia, serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 var(--serif)}
a{color:var(--visit)}
button{font:13px var(--mono);background:var(--card);border:1px solid var(--card-edge);border-radius:4px;padding:.25rem .6rem;cursor:pointer}
button.primary{background:var(--visit);border-color:var(--visit);color:#fff}
button:disabled{opacity:.45;cursor:not-allowed}
input,select,textarea{font:inherit;border:1px solid var(--line);border-radius:4px;padding:.3rem .45rem;background:var(--card);width:100%}
label{display:block;margin:.5rem 0;font:12px var(--mono);color:var(--faint)}
label > input,label > select,label > textarea{margin-top:.2rem;color:var(--ink);font:15px/1.5 var(--serif)}
.bar{display:flex;gap:1.2rem;align-items:center;padding:.7rem 1.2rem;border-bottom:1px solid var(--line)}
.brand{font:700 14px var(--mono);letter-spacing:.2em;color:var(--ink);text-decoration:none}
.bar nav a{font:13px var(--mono);margin-right:.8rem;text-decoration:none;color:var(--faint)}
.bar nav a.on{color:var(--ink);border-bottom:2px solid var(--ink)}
.banner{font:12px var(--mono);color:var(--encounter)}
#panes{display:grid;grid-template-columns:1fr;gap:0}
.pane{padding:1rem 1.2rem;min-width:0}
#side:empty{display:none}
body[data-posture="desk"] #panes:has(#side:not(:empty)){grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)}
body[data-posture="desk"] #side{border-left:1px solid var(--line)}
.chip{font:11px var(--mono);border:1px solid var(--card-edge);border-radius:10px;padding:.05rem .5rem;color:var(--faint);background:var(--card);margin-right:.3rem}
.chip.unsent{color:var(--dwell);border-color:var(--dwell)}
.chip.invalid,.chip.missing{color:var(--encounter);border-color:var(--encounter)}
.months a{font:12px var(--mono);margin-right:.6rem}
.months a.on{font-weight:700;color:var(--ink)}
.days{list-style:none;padding:0}
.days li{padding:.3rem 0;border-bottom:1px dotted var(--line)}
.days .count{font:12px var(--mono);color:var(--faint);margin:0 .5rem}
.empty{color:var(--faint)}
.reminder{font:13px var(--mono);color:var(--dwell);border:1px solid var(--dwell);padding:.4rem .6rem;border-radius:4px}
.string,.strand>ol{list-style:none;padding-left:1.4rem;border-left:2px solid var(--ink);margin-left:.5rem}
.string.has-machine{box-shadow:inset 6px 0 0 -4px transparent}
.stop{position:relative;padding:.3rem 0 .9rem .6rem}
.stop time{font:12px var(--mono);color:var(--faint);margin-right:.4rem}
.stop .bead{position:absolute;left:-1.95rem;top:.55rem;width:12px;height:12px;border-radius:50%;background:var(--k,#999)}
.stop.machine .bead{background:var(--paper);border:2.5px dotted var(--k,#999)}
.stop .kind{display:inline;font:12px var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--k)}
.stop.machine .kind::after{content:" · auto";color:var(--faint);text-transform:none;letter-spacing:0}
.stop .title{font-weight:700}
.stop .meta{font:11px var(--mono);color:var(--faint)}
.stop .note{margin:.2rem 0;white-space:pre-wrap}
.tools{font:12px var(--mono);display:flex;gap:.6rem;align-items:center}
.thumbs{display:flex;gap:.4rem;flex-wrap:wrap;margin:.3rem 0}
.thumbs img{height:96px;border-radius:3px}
.strand{margin:.6rem 0 1rem;padding:.6rem .8rem;background:var(--card);border:1px solid var(--card-edge);border-radius:6px}
.strand header a{font-weight:700;color:var(--ink)}
.strand .narrative{white-space:pre-wrap}
.mint{display:grid;justify-items:center;gap:.8rem;padding-top:6vh}
.masks{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center}
.masks button{border-radius:999px;border-color:var(--mask);color:var(--ink)}
.masks button.on{background:var(--mask);color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink);font-weight:700}
.mint .line,.mint .kindpick{width:min(24rem,90vw)}
.press{width:9rem;height:9rem;border-radius:50%;background:var(--ink);border:0;position:relative}
.press span{position:absolute;inset:25%;border-radius:50%;background:var(--paper);opacity:.15}
.press.bloom{animation:bloom .9s ease-out}
@keyframes bloom{0%{box-shadow:0 0 0 0 rgba(27,29,34,.5)}100%{box-shadow:0 0 0 3rem rgba(27,29,34,0)}}
@media (prefers-reduced-motion: reduce){.press.bloom{animation:none;outline:3px solid var(--visit)}}
.compose header{display:flex;gap:.6rem;align-items:baseline}
.compose h2{font-size:1.1rem;margin:.2rem 0}
.compose fieldset{border:1px solid var(--line);border-radius:6px;margin:.8rem 0;padding:.5rem .8rem}
.compose legend{font:12px var(--mono);color:var(--faint)}
.compose footer{display:flex;gap:.6rem;align-items:center;margin:1rem 0}
.compose .candidates{font-size:14px;color:var(--faint)}
.compose figure{margin:0;width:10rem}
.compose figure img{width:100%;border-radius:3px}
.ref{background:var(--paper)}
.ref .row{display:flex;gap:.6rem;flex-wrap:wrap}
.ref .row label{flex:1 1 9rem}
.ref .hint{font:12px var(--mono);color:var(--faint);margin:.2rem 0}
.problems{color:var(--encounter);font:13px var(--mono)}
.conflict{border:1px solid var(--encounter);padding:.5rem;border-radius:4px}
.panel{max-width:40rem}
.panel .row{display:flex;gap:.6rem;align-items:center}
.status,.result{font:12px var(--mono);color:var(--faint)}
body[data-posture="totem"] .posture-link{display:block}
.posture-link{display:none;font:12px var(--mono)}
.dayhead{font:13px var(--mono);color:var(--faint);margin:.2rem 0 1rem}
```

Create `app/sw.js`:

```js
/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-1';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js',
  './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/compose.js', './ui/html.js', './ui/mint.js', './ui/string-panel.js', './ui/thread.js',
  './ui/view-compose.js', './ui/view-mint.js', './ui/view-panel.js', './ui/view-refs.js', './ui/view-thread.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const lexicons = await (await fetch('./vendor/lexicons/index.json')).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)]);
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
```

Create `app/manifest.webmanifest`:

```json
{
  "name": "cultureblocs Loom",
  "short_name": "Loom",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#F7F4EE",
  "theme_color": "#1B1D22",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: Check that every shell module parses, and that the service worker caches every module**

Run: `for f in app/loom.js app/sw.js; do node --check "$f" || echo "BAD $f"; done; node -e 'const fs=require("fs");const sw=fs.readFileSync("app/sw.js","utf8");const want=["lib","ui","vendor"].flatMap(d=>fs.readdirSync("app/"+d).filter(f=>f.endsWith(".js")).map(f=>"./"+d+"/"+f));const miss=want.filter(f=>!sw.includes(`\x27${f}\x27`));console.log(miss.length?"MISSING from SHELL: "+miss.join(", "):"shell complete")'`
Expected: `shell complete`, and no `BAD` lines.

- [ ] **Step 4: Serve it and check it answers**

Run: `docker compose up -d && sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8108/ && curl -s http://localhost:8108/vendor/lexicons/index.json | head -c 60`
Expected: `200`, then the start of the lexicon file list.

- [ ] **Step 5: Run all tests**

Run: `node --test app/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# pass 64`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add app/index.html app/loom.js app/loom.css app/sw.js app/manifest.webmanifest app/icon-192.png app/icon-512.png
git commit -m "feat(phase1): the shell — routes, desk and totem posture, cross-tab refresh, offline PWA

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 13: Spec corrections, README, and the end-to-end run

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-loom-phase1-design.md`, `README.md`

Steps 3–5 drive a real browser. The controller runs them, with the Claude-in-Chrome tools and a throwaway String. **Never the real String on :8100.**

- [ ] **Step 1: Apply the spec corrections found while prototyping**

```diff
--- a/docs/superpowers/specs/2026-09-14-loom-phase1-design.md
+++ b/docs/superpowers/specs/2026-09-14-loom-phase1-design.md
@@ -1,6 +1,6 @@
 # Loom Phase 1 — local-only app: design
 
-Status: approved in brainstorming on 2026-09-14; awaiting spec review.
+Status: approved 2026-09-14. Corrected 2026-09-15 from the implementation prototype (see §11).
 Parent design: [`LOOM.md`](../../../LOOM.md) — §3 (shape), §4 (data model), §9 (referents), §10 Phase 1.
 Code lands in **this repository** under `app/`.
 
@@ -94,8 +94,9 @@
 deviceId    this browser's id (generated once, kept in meta)
 day         derived, for the index
 stringId    the String's record id, once imported or sent
-importedHash  sha256 of canonical body at import time (imported records only)
-importedState the String's state at import time (imported records only)
+stringHash    sha256 of the String's body as last imported or sent
+importedHash  sha256 of Loom's body as stored at that moment (differs for strands: items rewritten)
+importedState the String's state at that moment
 sentAt      when a Loom-made record was accepted by the String
 missing     [ media file names that could not be fetched ]   (optional)
 invalid     [ validator problems ]   (imported records that fail Loom's validator)
@@ -145,16 +146,19 @@
 
 **Mint.** Mask strip (default masks as Pocket's), optional one-line note,
 kind picker (default `bloc`), press. Writes a bead with `origin: "mint"`,
-`provenance: { app: "loom", mintedAt: <press> }`, tag = mask name, to
-IndexedDB before any animation; then Pocket's bloom. No network.
+`provenance: { app: "loom", device, mintedAt: <press> }`, tag = mask name, to
+IndexedDB before any animation; then a bloom (a CSS pulse; Pocket's dot
+matrix is not ported in Phase 1). No network.
 
 **Compose — strand.** Title, day, place name, links; narrative (plain
 textarea); items (the day's beads, tick to include, drag or arrows to
-order; proposals shown with keep-and-include); photos (pick or drop,
-resized, content-addressed); refs (below). Live problems list; **Save**
-disabled while any exist.
+order; proposals shown with keep-and-include); refs (below). Live
+problems list; **Save** (stays a draft) and **save as told** (kept, and so
+sendable) are disabled while any exist. Photos belong to beads: the
+`strand` lexicon has no media field.
 
-**Compose — bead.** Note, kind, place, photos, refs. Same editor, fewer fields.
+**Compose — bead.** Note, kind, place, links, photos (pick, resized to a
+2000px edge, content-addressed, with alt text), refs.
 
 **Refs editor.** One row per ref: type (`work`, `person`, `event`, `venue`,
 `concept`, or free text), role (`subject`/`mention`), label, creator,
@@ -182,7 +186,7 @@
    - *add* — no local record with that `stringId`;
    - *update* — unchanged locally (body still hashes to `importedHash` and
      state equals `importedState`) and the String's body or state differs;
-   - *unchanged* — the String's body hashes to `importedHash` and its state
+   - *unchanged* — the String's body hashes to `stringHash` and its state
      equals `importedState`;
    - *conflict* — changed on both sides (body or state); left alone and listed.
      Keeping or releasing an imported proposal in Loom is a local change.
@@ -201,9 +205,11 @@
    rewrite strand items `loom://…` → `spine://records/<stringId>`;
    `POST /records` with `dedupeKey: "loom:<rkey>"`, `sourceApp: "loom"`,
    `createdAt` and `body`. (Phase 1 creates no proposals, so no `state` is
-   sent; strands arrive as the String's default `draft`.)
-3. On `created` or `duplicate`, set `stringId` and `sentAt`. On `invalid`,
-   keep the record unsent and show the String's problems.
+   sent; the String stores its default, `kept`. Draft strands are not sent.)
+3. On `created` or `duplicate`, set `stringId` and `sentAt`, and the same
+   `stringHash` / `importedHash` / `importedState` an import would, so the
+   next import sees the record as unchanged. On `invalid`, keep the record
+   unsent and show the String's problems.
 
 Edits to records that already have a `stringId` — including keeping or
 releasing an imported proposal — are not sent in Phase 1; the panel counts
@@ -260,3 +266,19 @@
 - §3: port `:8108`, not `:8105`.
 - §10 Phase 1: add the one-way import and manual send, and that Phase 1 is
   desk-first on localhost.
+
+## 11 · Corrections from the prototype (2026-09-15)
+
+Found while building and running the Phase 1 prototype against a copy of
+the real String:
+
+- **Strands carry no photos.** The `strand` lexicon has no media field;
+  photos are edited on beads (§6).
+- **Two hashes, not one.** Import rewrites strand items, so detecting a
+  Loom edit and detecting a String change need different hashes
+  (`importedHash` for the local body, `stringHash` for the String's) (§5, §7).
+- **Send records its hashes.** Without them every record sent from Loom
+  came back from the next import as "changed on both sides" (§7).
+- **Sent strands are `kept` on the String**, its default; drafts stay home (§7).
+- **The first service-worker install must not reload the page** — only the
+  replacement of an existing worker is an update (§8).
```

- [ ] **Step 2: Say how to run it**

```diff
--- a/README.md
+++ b/README.md
@@ -12,7 +12,10 @@
 you run one — into a **personal sync server** in the sense
 [Groundmist](https://groundmist.xyz/) describes.
 
-**Status: design. No code yet.** The full argument, the review of the
+**Status: Phase 1 — local only.** Thread, Mint and Compose run in the
+browser with no server of their own; existing records arrive by a
+deliberate import from the String, and Loom-made ones reach it by a
+deliberate send, until Phase 2 sync. The full argument, the review of the
 String that motivated it, and the build order are in
 **[LOOM.md](LOOM.md)** — start there.
 
@@ -32,6 +35,21 @@
 can be *grown* into an entry at breakfast — the bead does not change,
 the strand wraps it.
 
+## Running it (Phase 1)
+
+    docker compose up -d          # http://localhost:8108
+
+Open **string** in the bar, point it at your String (`http://localhost:8100`),
+**check**, then **import**. Mint and write; **send** puts Loom-made records on
+the String; **download backup** keeps a copy of everything in this browser.
+Phase 1 is desk-first on `localhost`: a phone needs Loom served over HTTPS.
+
+    node --test app/test/*.test.mjs        # the app's tests, no dependencies
+    scripts/vendor-sdk.sh                  # refresh app/vendor from ../cultureblocs-string
+
+`app/test/store.html` (served at `/test/store.html`) runs the storage
+contract against the browser's real IndexedDB.
+
 ## Three decisions this repo is built on
 
 1. **Canonical data is local.** IndexedDB, keyed by lexicon NSID,
```

Commit:

```bash
git add docs/superpowers/specs/2026-09-14-loom-phase1-design.md README.md
git commit -m "docs(phase1): spec corrections from the prototype; how to run and test Loom

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

- [ ] **Step 3: Start a throwaway String from a copy of the real database**

```bash
E=$(mktemp -d)/e2e && mkdir -p "$E/media"
sqlite3 ../cultureblocs-string/data/string.db ".backup '$E/string.db'"
cp ../cultureblocs-string/data/media/* "$E/media/" 2>/dev/null || true
docker run -d --name loom-e2e-string -p 8199:8100 -v "$E":/data \
  -v "$PWD/../cultureblocs-string/lexicons":/lexicons:ro \
  -e STRING_DB=/data/string.db -e STRING_LEXICONS=/lexicons -e STRING_MEDIA=/data/media \
  cultureblocs-string-string:latest
sleep 3 && curl -s http://localhost:8199/health | head -c 40
```

Expected: `{"ok":true,"lexicons":[…`. The `sqlite3 .backup` only reads the real database.

- [ ] **Step 4: Browser checks** (controller; open http://localhost:8108 in a fresh Chrome tab)

1. `/test/store.html`: `window.storeContractResult` is `{ passed: 6, failed: 0 }`.
2. `#/string`: set the URL to `http://localhost:8199`. **check** says "a String, holding N record types". **import** adds every record the String holds and fetches its photos, with no conflicts.
3. `#/thread/<a day holding a strand with photos>`: the strand wraps its members, the images load, and proposals show **keep** and **release**.
4. `#/mint`: pick a mask, type a line, choose `visit`, press. A `kept` bead appears, with `provenance.app` `loom` and the mask as its tag.
5. **tell this** on that bead (desk posture): Compose opens beside the Thread with a draft strand wrapping it.
   - Type a narrative containing "Tate Modern", add a ref labelled `Tate Modern` of type `venue`, select "Tate Modern" and press **anchor**. The row says "anchored to “Tate Modern”".
   - Then insert words (including a multi-byte "—") before it. After **save as told**, the stored `index` still covers exactly "Tate Modern", and `getDraft(key)` is empty.
6. Compose the bead: add a photo larger than 2000px on its long edge. It is stored as `image/jpeg`, 2000px on the long edge, with `aspectRatio` and alt text.
7. Back up with `exportBackup(store)` via `import('/lib/backup.js')`. `store.clear()`, then `restoreBackup`: record and blob counts match, and the token is not in the file.
8. `#/string` **send**: both records are `sent`. Then `curl http://localhost:8199/records/<strand stringId>` shows `dedupeKey loom:<rkey>`, `items` as `spine://records/<bead stringId>`, and the anchored ref. The photo is served at `/media/<same name>`.
9. **import** again: `unchanged` equals the total, and there are **no conflicts**.
10. First visit with no service worker: the page does not reload itself on install (`performance.getEntriesByType('navigation')[0].type` is `navigate`).

- [ ] **Step 5: Clean up**

```bash
docker rm -f loom-e2e-string
```

Close the browser tab. The throwaway copy in `$E` can be deleted.
