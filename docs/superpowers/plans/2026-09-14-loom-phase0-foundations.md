# Loom Phase 0 — Referents Delta on PR #1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish LOOM.md Phase 0 on top of PR #1 (`phase-0-foundations`). PR #1 already delivers the JS validator, the JS strip, record `state`, HLC stamps and `If-Match`. This plan adds what it lacks:
- the referent layer (R10);
- one canonical allowlist strip in place of three Python copies (R5);
- the `annotation.work.image` leak fix;
- the validator gaps that the refs lexicon depends on.

**Architecture:** Follows PR #1's conventions, not new ones:
- browser modules live in `sdk/js/`;
- shared fixtures are top-level JSON arrays in `tests/fixtures/<rule>-cases.json`;
- `tests/test_fixture_parity.py` is the Python half of each fixture suite;
- validator problem messages quote values the way Python's `repr()` does.

The strip moves out of `publisher.py` into `string/app/strip.py`, and `sdk/js/strip.js` is rewritten to match it.

**Tech Stack:** Python 3 + FastAPI + SQLite, pytest (existing). Node 22 `node:test`, plain ES modules. No new dependencies.

**Spec:** `/Users/marksimpkins/TPM/cultureblocs-loom/LOOM.md` — §2 (R5, R8, R10 and the note under the table), §9 (Referents; read §9.3 and §9.8 first), §10 Phase 0.

**Supersedes:** the earlier version of this file, which re-implemented PR #1's work from scratch. The user chose to build on PR #1 instead.

## Global Constraints

- **Where:** worktree `/Users/marksimpkins/TPM/cultureblocs-string-phase0`, on branch `phase-0-foundations` (tracks `origin/phase-0-foundations`, which is PR #1). Every path below is relative to that root. **Never push** without the user's go-ahead: pushing updates an open PR.
- **Keep PR #1's work and its interfaces:**
  - `sdk/js/lexicon.js`'s `LexiconRegistry().load(docs)` and `repr()` message quoting;
  - `sdk/js/strip.js`'s `stripBead(body, { images })`, `stripStrand(body, items)`, `stripPublic`, `canonicalJSON` and `contentHash`, and its refusal of a body with no `$type`;
  - `Store.patch(rid, fields, *, expect_hlc, device, actor)`, `Store.STALE`, `POST /records/{id}/state`;
  - the `-`-separated HLC stamps.
- **No new dependencies.** Nothing in `sdk/js/*.js` may import `node:*`.
- **Parity:** every rule implemented in both languages is specified by a `tests/fixtures/<rule>-cases.json` array that both suites run. Add cases to the JSON, never to one side only.
- **`maxGraphemes` counts code points** in both languages.
- **Ref anchors are UTF-8 byte offsets** (`index.byteStart` / `index.byteEnd`, end exclusive), matching `app.bsky.richtext.facet#byteSlice`.
- **The bead/strand strip is an allowlist at every depth.**
  - A `type: person` ref publishes only with a `did` or at least one `externalId` that has both `scheme` and `id`.
  - An unknown `role` publishes as `mention`.
  - `matchConfidence` and `clusterHint` are never lexicon fields.
  - `strip_public` stays a deny list.
- **Commits:** Conventional Commits scoped `phase0`, each ending with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq
  ```
- **Test commands** (from the worktree root):
  - Python: `python3 -m pytest -q tests`
  - JS, shared only: `node --test sdk/js/test/*.test.mjs`
  - JS, everything: `node --test sdk/js/test/*.test.mjs easel/test/*.test.mjs web/test/*.test.mjs catalogue/test/*.test.mjs`
- **Applying diffs:** apply from the worktree root with `git apply` via a heredoc — `git apply <<'EOF'` … `EOF`, pasting the diff exactly. If a hunk does not apply, edit by hand to reach the `+` side. The diffs were generated against the tree as it stands at that step.

## Known interactions

- **`feature/rounds`** (local only, unmerged) adds `_refuse_if_seeded` to `string/app/publisher.py`, next to the `strip_public` this plan removes. Whichever merges second gets a small textual conflict: keep `_refuse_if_seeded`, drop `strip_public`. It is not in scope here.
- **Publish output changes (Task 4):**
  - `bead.work` and `annotation.work.image` stop publishing;
  - links publish `uri` and `title` only;
  - non-string tags drop.

  Already-published strands may show as drifted in `promote.py status`. That is correct, and belongs in the PR description.

## File map

| File | Task | Change |
|---|---|---|
| `string/app/lexicon.py`, `sdk/js/lexicon.js`, `tests/fixtures/lexicon-cases.json` | 1 | Integer `minimum`/`maximum`; full-match, ASCII-only datetime and DID checks; JS `repr()` handles apostrophes and control characters as Python does |
| `lexicons/com/cultureblocs/{defs,bead,strand,annotation}.json`, `tests/fixtures/lexicon-cases.json` | 2 | `#ref`, `#refDescriptor`, `#byteSlice`, `#presentation`; `refs`; bead `presentation`; `#workRef` deprecated and out of `bead.subject` |
| `string/app/refs.py`, `sdk/js/refs.js` (new), `tests/fixtures/refs-cases.json` (new), `sdk/js/test/refs.test.mjs` (new) | 3 | Anchor checks, `#workRef` → `#ref`, annotation mirroring |
| `tests/test_fixture_parity.py` | 3, 4 | Runs refs cases (3); runs strip cases against `strip.py`, including `fn: "ref"` (4) |
| `tests/conftest.py` (new), `tests/test_api_phase0.py`, `tests/test_api_refs.py` (new), `string/app/main.py` | 3 | Shared `client` fixture; refs checks on ingest and PATCH |
| `string/app/strip.py` (new), `sdk/js/strip.js`, `tests/fixtures/strip-cases.json`, `sdk/js/test/strip.test.mjs`, `tests/test_one_strip.py` (new), `string/app/publisher.py`, `scripts/promote.py`, `scripts/export_public.py`, `README.md` | 4 | One canonical strip |
| `scripts/migrate_refs.py`, `tests/test_migrate_refs.py` (new), `PROMOTER.md`, `APPVIEW.md` | 5 | Backfill and docs |

## Out of scope

- A `#strongRef` bead `subject` is still dropped at publish (existing behaviour).
- `X-HLC` observation, `?excludeDevice=`, `ETag` on GET, the HLC drift guard — Phase 2, where remote ops are applied.
- CORS, grants, service-auth, `POST /changes`, `/sync` — Phase 2.
- AppView grouping of refs.

---

### Task 0: Baseline

**Files:** none

- [ ] **Step 1: Confirm the worktree and baseline**

```bash
cd /Users/marksimpkins/TPM/cultureblocs-string-phase0
git status --short && git log --oneline -1
python3 -m pytest -q tests
node --test sdk/js/test/*.test.mjs easel/test/*.test.mjs web/test/*.test.mjs catalogue/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'
```

Expected: a clean tree at `d9da06f Phase 0: foundations for a local-first client`, `93 passed`, `# pass 158`, `# fail 0`.

---

### Task 1: Close the validator gaps refs depend on

`#byteSlice` needs integer `minimum`, which neither validator enforces. Python also accepts a datetime with a trailing newline, or written in Unicode digits; JavaScript does not, so the two already disagree. And JS `repr()` quotes `J's` differently from Python.

**Files:**
- Modify: `tests/fixtures/lexicon-cases.json`
- Modify: `string/app/lexicon.py`, `sdk/js/lexicon.js`

**Interfaces:**
- Produces two new problem messages in both languages, used by Task 2's cases: `"{path}: below minimum {n}"` and `"{path}: above maximum {n}"`. JS `repr(s)` equals Python `repr(s)` for strings containing `'`, `\`, `\n`, `\r`, `\t` or other control characters.

- [ ] **Step 1: Add the failing cases**

```diff
--- a/tests/fixtures/lexicon-cases.json
+++ b/tests/fixtures/lexicon-cases.json
@@ -342,5 +342,68 @@
     "problems": [
       "com.cultureblocs.defs is not a record lexicon"
     ]
+  },
+  {
+    "name": "a datetime with a trailing newline is not a datetime",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "2026-08-15T10:00:00Z\n",
+      "kind": "note"
+    },
+    "problems": [
+      "$.createdAt: not an ISO 8601 datetime: '2026-08-15T10:00:00Z\\n'"
+    ]
+  },
+  {
+    "name": "a datetime written in non-ASCII digits is not a datetime",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "٢٠٢٦-08-15T10:00:00Z",
+      "kind": "note"
+    },
+    "problems": [
+      "$.createdAt: not an ISO 8601 datetime: '٢٠٢٦-08-15T10:00:00Z'"
+    ]
+  },
+  {
+    "name": "a value holding an apostrophe is quoted the way Python quotes it",
+    "nsid": "com.cultureblocs.creative.work",
+    "body": {
+      "$type": "com.cultureblocs.creative.work",
+      "title": "Gasholder",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "credits": [
+        {
+          "name": "J",
+          "did": "J's"
+        }
+      ]
+    },
+    "problems": [
+      "$.credits[0].did: not a DID: \"J's\""
+    ]
+  },
+  {
+    "name": "integers respect minimum",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "kind": "note",
+      "images": [
+        {
+          "image": {},
+          "aspectRatio": {
+            "width": 0,
+            "height": 10
+          }
+        }
+      ]
+    },
+    "problems": [
+      "$.images[0].aspectRatio.width: below minimum 1"
+    ]
   }
 ]
```

- [ ] **Step 2: Run both suites to see them fail**

Run: `python3 -m pytest -q tests/test_fixture_parity.py 2>&1 | tail -1; node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected:
- Python `3 failed`: trailing newline, non-ASCII digits, minimum.
- node `# fail 3`: trailing newline (unescaped `\n`), apostrophe quoting, minimum. JS already rejects non-ASCII digits.

- [ ] **Step 3: Fix Python**

```diff
--- a/string/app/lexicon.py
+++ b/string/app/lexicon.py
@@ -2,8 +2,8 @@
 
 Validates record bodies against the subset of the atproto Lexicon language
 used by the com.cultureblocs.* schemas: object, string (datetime/uri/did
-formats, maxGraphemes, knownValues advisory), number, integer, boolean,
-ref, union, array.
+formats, maxGraphemes, knownValues advisory), number, integer (minimum,
+maximum), boolean, ref, union, array.
 
 Deliberately small. When promotion to a real PDS lands, the PDS performs
 authoritative validation; this keeps Tier 0 data honest in the meantime.
@@ -15,9 +15,9 @@
 from pathlib import Path
 
 DATETIME_RE = re.compile(
-    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$"
+    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})", re.ASCII
 )
-DID_RE = re.compile(r"^did:[a-z0-9]+:.+$")
+DID_RE = re.compile(r"did:[a-z0-9]+:.+", re.ASCII)
 
 
 class LexiconError(ValueError):
@@ -133,10 +133,10 @@
                 problems.append(f"{path}: expected string")
                 return False
             fmt = schema.get("format")
-            if fmt == "datetime" and not DATETIME_RE.match(value):
+            if fmt == "datetime" and not DATETIME_RE.fullmatch(value):
                 problems.append(f"{path}: not an ISO 8601 datetime: {value!r}")
                 return False
-            if fmt == "did" and not DID_RE.match(value):
+            if fmt == "did" and not DID_RE.fullmatch(value):
                 problems.append(f"{path}: not a DID: {value!r}")
                 return False
             maxg = schema.get("maxGraphemes")
@@ -150,6 +150,13 @@
             if not isinstance(value, int) or isinstance(value, bool):
                 problems.append(f"{path}: expected integer")
                 return False
+            lo, hi = schema.get("minimum"), schema.get("maximum")
+            if lo is not None and value < lo:
+                problems.append(f"{path}: below minimum {lo}")
+                return False
+            if hi is not None and value > hi:
+                problems.append(f"{path}: above maximum {hi}")
+                return False
             return True
 
         if t == "number":
```

- [ ] **Step 4: Fix JavaScript**

```diff
--- a/sdk/js/lexicon.js
+++ b/sdk/js/lexicon.js
@@ -151,6 +151,12 @@
       if (typeof value !== 'number' || !Number.isInteger(value)) {
         problems.push(`${path}: expected integer`); return false;
       }
+      if (schema.minimum !== undefined && value < schema.minimum) {
+        problems.push(`${path}: below minimum ${schema.minimum}`); return false;
+      }
+      if (schema.maximum !== undefined && value > schema.maximum) {
+        problems.push(`${path}: above maximum ${schema.maximum}`); return false;
+      }
       return true;
     }
 
@@ -186,9 +192,18 @@
 
 /* Python renders values in problem messages with repr(); the parity fixtures
  * compare messages verbatim, so reproduce repr() for the shapes that reach a
- * message: strings (single-quoted) and the list of union refs. */
+ * message: strings and the list of union refs. Like Python, a string holding
+ * a single quote and no double quote is wrapped in double quotes, and control
+ * characters are escaped. */
+const REPR_ESCAPES = { '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
+
 function repr(v) {
-  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
+  if (typeof v === 'string') {
+    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
+    const body = v.replace(/[\\\x00-\x1f\x7f]/g, (c) => REPR_ESCAPES[c]
+      ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
+    return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
+  }
   if (Array.isArray(v)) return `[${v.map(repr).join(', ')}]`;
   if (v === undefined || v === null) return 'None';
   return String(v);
```

- [ ] **Step 5: Run everything**

Run: `python3 -m pytest -q tests && node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `97 passed`, `# pass 48`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/lexicon-cases.json string/app/lexicon.py sdk/js/lexicon.js
git commit -m "fix(phase0): integer bounds and full-match datetimes in both validators

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 2: Refs and presentation in the lexicons (R10)

LOOM.md §9.3 and §9.5:
- `#workRef` is deprecated and leaves `bead.subject`;
- the existing `#externalId` is reused, with more `knownValues`;
- no `matchConfidence` or `clusterHint` is added.

Removing `#workRef` from the union means a place with a malformed DID no longer validates as a work. `#placeRef` still has no required fields, so PR #1's pinned "any object satisfies the subject union" case stays true; it is only renamed.

**Files:**
- Modify: `tests/fixtures/lexicon-cases.json`
- Modify: `lexicons/com/cultureblocs/defs.json`, `bead.json`, `strand.json`, `annotation.json`

**Interfaces:**
- Produces:
  - `com.cultureblocs.defs#ref` — `{ type (required), role (required), descriptor: #refDescriptor (required), did?, externalIds?: [#externalId] ≤20, index?: #byteSlice }`
  - `#refDescriptor` — `{ label (required, ≤500), creator? ≤300, creatorDid?: did, date? ≤100 }`
  - `#byteSlice` — `{ byteStart ≥0, byteEnd ≥0 }`, both required
  - `#presentation` — `{ format? ≤100, venueRef?: #ref, eventRef?: #ref }`
  - `refs` (≤50) on `bead`, `strand` and `annotation`; `presentation` on `bead`

- [ ] **Step 1: Update the cases first**

```diff
--- a/tests/fixtures/lexicon-cases.json
+++ b/tests/fixtures/lexicon-cases.json
@@ -171,7 +171,7 @@
       "subject": "Tate Modern"
     },
     "problems": [
-      "$.subject: does not match any union variant ['com.cultureblocs.defs#workRef', 'com.cultureblocs.defs#placeRef', 'com.cultureblocs.defs#strongRef']"
+      "$.subject: does not match any union variant ['com.cultureblocs.defs#placeRef', 'com.cultureblocs.defs#strongRef']"
     ]
   },
   {
@@ -313,7 +313,7 @@
     ]
   },
   {
-    "name": "any object satisfies the subject union: workRef and placeRef declare no required fields, so the first variant tried matches. Pinned because it is surprising, not because it is desirable — a bead can carry a subject that means nothing and still validate.",
+    "name": "any object satisfies the subject union: placeRef declares no required fields, so it matches. Pinned because it is surprising, not because it is desirable — a bead can carry a subject that means nothing and still validate.",
     "nsid": "com.cultureblocs.bead",
     "body": {
       "$type": "com.cultureblocs.bead",
@@ -405,5 +405,152 @@
     "problems": [
       "$.images[0].aspectRatio.width: below minimum 1"
     ]
+  },
+  {
+    "name": "a placeRef with a malformed DID no longer passes as a workRef",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "kind": "visit",
+      "subject": {
+        "did": "plc:abc",
+        "name": "Tate"
+      }
+    },
+    "problems": [
+      "$.subject: does not match any union variant ['com.cultureblocs.defs#placeRef', 'com.cultureblocs.defs#strongRef']"
+    ]
+  },
+  {
+    "name": "a bead with refs and a presentation validates; unknown id schemes are carried",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "kind": "read",
+      "note": "Pester, again.",
+      "refs": [
+        {
+          "type": "work",
+          "role": "subject",
+          "descriptor": {
+            "label": "The Expansion Project",
+            "creator": "Ben Pester"
+          },
+          "externalIds": [
+            {
+              "scheme": "wikidata",
+              "id": "Q000000"
+            },
+            {
+              "scheme": "somethingNew",
+              "id": "x"
+            }
+          ],
+          "index": {
+            "byteStart": 0,
+            "byteEnd": 6
+          }
+        }
+      ],
+      "presentation": {
+        "format": "hardback",
+        "venueRef": {
+          "type": "venue",
+          "role": "mention",
+          "descriptor": {
+            "label": "Review Bookshop"
+          }
+        }
+      }
+    },
+    "problems": []
+  },
+  {
+    "name": "a ref needs a descriptor",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "kind": "watch",
+      "refs": [
+        {
+          "type": "work",
+          "role": "subject"
+        }
+      ]
+    },
+    "problems": [
+      "$.refs[0].descriptor: required field missing"
+    ]
+  },
+  {
+    "name": "a descriptor needs a label",
+    "nsid": "com.cultureblocs.bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "kind": "watch",
+      "refs": [
+        {
+          "type": "work",
+          "role": "subject",
+          "descriptor": {
+            "creator": "Priest"
+          }
+        }
+      ]
+    },
+    "problems": [
+      "$.refs[0].descriptor.label: required field missing"
+    ]
+  },
+  {
+    "name": "a ref anchor cannot start before the text",
+    "nsid": "com.cultureblocs.strand",
+    "body": {
+      "$type": "com.cultureblocs.strand",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "items": [],
+      "narrative": "Ballard",
+      "refs": [
+        {
+          "type": "person",
+          "role": "mention",
+          "descriptor": {
+            "label": "J. G. Ballard"
+          },
+          "index": {
+            "byteStart": -1,
+            "byteEnd": 7
+          }
+        }
+      ]
+    },
+    "problems": [
+      "$.refs[0].index.byteStart: below minimum 0"
+    ]
+  },
+  {
+    "name": "an annotation carries refs beside its work",
+    "nsid": "com.cultureblocs.annotation",
+    "body": {
+      "$type": "com.cultureblocs.annotation",
+      "createdAt": "2026-08-15T10:00:00Z",
+      "work": {
+        "title": "Gasholder"
+      },
+      "refs": [
+        {
+          "type": "work",
+          "role": "subject",
+          "descriptor": {
+            "label": "Gasholder"
+          }
+        }
+      ]
+    },
+    "problems": []
   }
 ]
```

- [ ] **Step 2: Run to see them fail**

Run: `python3 -m pytest -q tests/test_fixture_parity.py 2>&1 | tail -1; node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# fail'`
Expected: `5 failed`; `# fail 5`. The failures are:
- the union message without `#workRef`;
- the malformed-DID place;
- a ref with no descriptor;
- a descriptor with no label;
- a negative `byteStart`.

- [ ] **Step 3: Change the lexicons**

```diff
--- a/lexicons/com/cultureblocs/defs.json
+++ b/lexicons/com/cultureblocs/defs.json
@@ -4,7 +4,7 @@
   "defs": {
     "workRef": {
       "type": "object",
-      "description": "Reference to an artwork/creative work. At least one resolvable ID or a descriptive fallback (title).",
+      "description": "DEPRECATED: use #ref with type 'work'. Reference to an artwork/creative work. At least one resolvable ID or a descriptive fallback (title). Readers map it to #ref as { type: work, role: subject, descriptor: { label: title, creator, creatorDid, date }, externalIds: [wikidata, linkedArt, accession] }.",
       "properties": {
         "wikidata": {
           "type": "string",
@@ -242,7 +242,12 @@
             "doi",
             "viaf",
             "discogs",
-            "rsl"
+            "rsl",
+            "isbn",
+            "olid",
+            "tmdb",
+            "linkedArt",
+            "accession"
           ]
         },
         "id": {
@@ -254,8 +259,71 @@
           "format": "uri",
           "description": "Resolvable URL for this identifier, where one exists."
         }
+      }
+    },
+    "ref": {
+      "type": "object",
+      "description": "What an entry is about, or reaches for, as data beside the text. Modelled on app.bsky.richtext.facet: the text is never rewritten, and `index` is a UTF-8 byte range into the record's own text (strand.narrative; bead.note; annotation.note). Identity is descriptor + did + externalIds. No AppView cluster id is ever part of a ref.",
+      "required": ["type", "role", "descriptor"],
+      "properties": {
+        "type": {
+          "type": "string",
+          "maxGraphemes": 32,
+          "knownValues": ["person", "work", "event", "venue", "concept"]
+        },
+        "role": {
+          "type": "string",
+          "maxGraphemes": 32,
+          "knownValues": ["subject", "mention"],
+          "description": "subject: what the record is about. mention: invoked, compared, gestured at. Readers treat any other value as mention."
+        },
+        "descriptor": { "type": "ref", "ref": "#refDescriptor" },
+        "did": {
+          "type": "string",
+          "format": "did",
+          "description": "DID of the referent itself (a person, a venue with an account). A work's maker goes in descriptor.creatorDid."
+        },
+        "externalIds": {
+          "type": "array",
+          "maxLength": 20,
+          "items": { "type": "ref", "ref": "#externalId" }
+        },
+        "index": { "type": "ref", "ref": "#byteSlice" }
       }
     },
+    "refDescriptor": {
+      "type": "object",
+      "description": "The portable description of a referent: enough to cluster on when no identifier exists. Deliberately has no free-text note.",
+      "required": ["label"],
+      "properties": {
+        "label": { "type": "string", "maxGraphemes": 500, "description": "Title of a work, name of a person, venue, event or concept." },
+        "creator": { "type": "string", "maxGraphemes": 300 },
+        "creatorDid": { "type": "string", "format": "did" },
+        "date": { "type": "string", "maxGraphemes": 100, "description": "Freeform, e.g. '1972' or 'c. 1889'." }
+      }
+    },
+    "byteSlice": {
+      "type": "object",
+      "description": "Same shape as app.bsky.richtext.facet#byteSlice: zero-indexed UTF-8 byte offsets, end exclusive. Text length limits elsewhere are in graphemes; these are bytes.",
+      "required": ["byteStart", "byteEnd"],
+      "properties": {
+        "byteStart": { "type": "integer", "minimum": 0 },
+        "byteEnd": { "type": "integer", "minimum": 0 }
+      }
+    },
+    "presentation": {
+      "type": "object",
+      "description": "How the work was encountered: the manifestation, as distinct from the work. Two beads can share a work ref and differ here.",
+      "properties": {
+        "format": {
+          "type": "string",
+          "maxGraphemes": 100,
+          "knownValues": ["IMAX 70mm", "70mm", "35mm", "digital", "streaming", "broadcast", "hardback", "paperback", "ebook", "audiobook", "vinyl", "live"]
+        },
+        "venueRef": { "type": "ref", "ref": "#ref", "description": "A reference to a venue, never a location: carries no coordinates." },
+        "eventRef": { "type": "ref", "ref": "#ref", "description": "The screening or performance attended." }
+      }
+    },
     "didRef": {
       "type": "object",
       "description": "A person or organisation by DID, with a descriptive fallback name.",
```

```diff
--- a/lexicons/com/cultureblocs/bead.json
+++ b/lexicons/com/cultureblocs/bead.json
@@ -36,16 +36,25 @@
           "subject": {
             "type": "union",
             "refs": [
-              "com.cultureblocs.defs#workRef",
               "com.cultureblocs.defs#placeRef",
               "com.cultureblocs.defs#strongRef"
             ],
-            "description": "What the bead is about: a work, a place, or a published record (event, exhibition)."
+            "description": "Where the bead happened, or the published record (event, exhibition) it belongs to. Works, people and concepts go in `refs`."
           },
           "note": {
             "type": "string",
             "maxGraphemes": 3000
           },
+          "refs": {
+            "type": "array",
+            "maxLength": 50,
+            "items": { "type": "ref", "ref": "com.cultureblocs.defs#ref" },
+            "description": "What this record is about (role subject) and what it reaches for (role mention). Anchors index into `note`."
+          },
+          "presentation": {
+            "type": "ref",
+            "ref": "com.cultureblocs.defs#presentation"
+          },
           "tags": {
             "type": "array",
             "maxLength": 8,
```

```diff
--- a/lexicons/com/cultureblocs/strand.json
+++ b/lexicons/com/cultureblocs/strand.json
@@ -25,6 +25,12 @@
             "type": "string",
             "maxGraphemes": 10000
           },
+          "refs": {
+            "type": "array",
+            "maxLength": 50,
+            "items": { "type": "ref", "ref": "com.cultureblocs.defs#ref" },
+            "description": "What this record is about (role subject) and what it reaches for (role mention). Anchors index into `narrative`."
+          },
           "items": {
             "type": "array",
             "maxLength": 200,
```

```diff
--- a/lexicons/com/cultureblocs/annotation.json
+++ b/lexicons/com/cultureblocs/annotation.json
@@ -25,6 +25,12 @@
             "type": "string",
             "maxGraphemes": 3000
           },
+          "refs": {
+            "type": "array",
+            "maxLength": 50,
+            "items": { "type": "ref", "ref": "com.cultureblocs.defs#ref" },
+            "description": "What this record is about (role subject) and what it reaches for (role mention). Anchors index into `note`."
+          },
           "media": {
             "type": "array",
             "maxLength": 10,
```

Check: `for f in lexicons/com/cultureblocs/{defs,bead,strand,annotation}.json; do python3 -m json.tool "$f" >/dev/null || echo "BAD $f"; done` — Expected: no output.

- [ ] **Step 4: Run everything**

Run: `python3 -m pytest -q tests && node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `103 passed`, `# pass 54`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add lexicons/com/cultureblocs tests/fixtures/lexicon-cases.json
git commit -m "feat(phase0): defs#ref, refs on bead/strand/annotation, bead presentation; deprecate workRef

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 3: Refs helpers, wired into ingest and PATCH

The lexicon cannot say "this `index` lies inside the note, on character boundaries". `refs.py` checks that. It also mirrors an annotation's required `work` into a subject ref while the AR gallery still writes `work`. PR #1's `client` fixture moves to `tests/conftest.py` so the new API tests can share it.

**Files:**
- Create: `tests/fixtures/refs-cases.json`, `sdk/js/test/refs.test.mjs`
- Modify: `tests/test_fixture_parity.py`
- Create: `string/app/refs.py`, `sdk/js/refs.js`
- Create: `tests/conftest.py`, `tests/test_api_refs.py`
- Modify: `tests/test_api_phase0.py`, `string/app/main.py`

**Interfaces:**
- Produces:
  - `refs.TEXT_FIELD`, `refs.ANNOTATION`
  - `refs.anchor_problems(nsid: str, body: dict) -> list[str]`
  - `refs.ref_from_work_ref(work: dict) -> dict`
  - `refs.mirror_annotation_work(nsid: str, body: dict) -> dict` — returns the **same object** when nothing is added, so callers compare by identity
  - JS exports `TEXT_FIELD`, `anchorProblems`, `refFromWorkRef`, `mirrorAnnotationWork`
  - Refs fixture entries: `{ name, fn: <python name>, args: [...], expected }`
  - pytest fixture `client` in `tests/conftest.py`

- [ ] **Step 1: Write the cases and both runners**

Create `tests/fixtures/refs-cases.json`:

```json
[
  {
    "name": "anchor inside ASCII note is sound",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.bead",
      {
        "note": "Saw Severance",
        "refs": [
          {
            "index": {
              "byteStart": 4,
              "byteEnd": 13
            }
          }
        ]
      }
    ],
    "expected": []
  },
  {
    "name": "anchor past the end of the note",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.bead",
      {
        "note": "Severance",
        "refs": [
          {
            "index": {
              "byteStart": 0,
              "byteEnd": 10
            }
          }
        ]
      }
    ],
    "expected": [
      "$.refs[0].index: 0..10 is outside note (9 bytes)"
    ]
  },
  {
    "name": "strands anchor into narrative, counted in bytes not characters",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.strand",
      {
        "narrative": "Amélie",
        "refs": [
          {
            "index": {
              "byteStart": 0,
              "byteEnd": 7
            }
          }
        ]
      }
    ],
    "expected": []
  },
  {
    "name": "byte offsets after an accent: 'Ritzy' is bytes 15..20, not characters 14..19",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.strand",
      {
        "narrative": "Amélie at the Ritzy",
        "refs": [
          {
            "index": {
              "byteStart": 15,
              "byteEnd": 20
            }
          }
        ]
      }
    ],
    "expected": []
  },
  {
    "name": "an offset inside a multi-byte character",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.strand",
      {
        "narrative": "Amélie",
        "refs": [
          {
            "index": {
              "byteStart": 0,
              "byteEnd": 3
            }
          }
        ]
      }
    ],
    "expected": [
      "$.refs[0].index: 0..3 splits a character in narrative"
    ]
  },
  {
    "name": "an anchor with no text to anchor into",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.bead",
      {
        "refs": [
          {
            "index": {
              "byteStart": 0,
              "byteEnd": 1
            }
          }
        ]
      }
    ],
    "expected": [
      "$.refs[0].index: 0..1 is outside note (0 bytes)"
    ]
  },
  {
    "name": "start after end",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.bead",
      {
        "note": "abcdef",
        "refs": [
          {
            "index": {
              "byteStart": 4,
              "byteEnd": 2
            }
          }
        ]
      }
    ],
    "expected": [
      "$.refs[0].index: 4..2 is outside note (6 bytes)"
    ]
  },
  {
    "name": "malformed index is left to the validator",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.bead",
      {
        "note": "abc",
        "refs": [
          {
            "index": {
              "byteStart": "0",
              "byteEnd": true
            }
          },
          "junk"
        ]
      }
    ],
    "expected": []
  },
  {
    "name": "presentation refs cannot anchor",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.bead",
      {
        "note": "x",
        "presentation": {
          "venueRef": {
            "index": {
              "byteStart": 0,
              "byteEnd": 1
            }
          }
        }
      }
    ],
    "expected": [
      "$.presentation.venueRef.index: presentation refs cannot anchor"
    ]
  },
  {
    "name": "records without text fields are ignored",
    "fn": "anchor_problems",
    "args": [
      "com.cultureblocs.venue.listing",
      {
        "refs": [
          {
            "index": {
              "byteStart": 5,
              "byteEnd": 9
            }
          }
        ]
      }
    ],
    "expected": []
  },
  {
    "name": "full workRef maps to a subject ref",
    "fn": "ref_from_work_ref",
    "args": [
      {
        "title": "Gasholder",
        "creator": "A. Painter",
        "creatorDid": "did:plc:painter",
        "date": "1972",
        "wikidata": "Q1892745",
        "linkedArt": "https://linked.art/object/1",
        "accession": {
          "institution": "did:plc:museum",
          "id": "T01234"
        },
        "image": {
          "uri": "http://brick:8100/media/x.jpg"
        }
      }
    ],
    "expected": {
      "type": "work",
      "role": "subject",
      "descriptor": {
        "label": "Gasholder",
        "creator": "A. Painter",
        "creatorDid": "did:plc:painter",
        "date": "1972"
      },
      "externalIds": [
        {
          "scheme": "wikidata",
          "id": "Q1892745"
        },
        {
          "scheme": "linkedArt",
          "id": "https://linked.art/object/1",
          "uri": "https://linked.art/object/1"
        },
        {
          "scheme": "accession",
          "id": "did:plc:museum/T01234"
        }
      ]
    }
  },
  {
    "name": "untitled workRef falls back to its QID, then a placeholder",
    "fn": "ref_from_work_ref",
    "args": [
      {
        "wikidata": "Q1"
      }
    ],
    "expected": {
      "type": "work",
      "role": "subject",
      "descriptor": {
        "label": "Q1"
      },
      "externalIds": [
        {
          "scheme": "wikidata",
          "id": "Q1"
        }
      ]
    }
  },
  {
    "name": "empty workRef",
    "fn": "ref_from_work_ref",
    "args": [
      {}
    ],
    "expected": {
      "type": "work",
      "role": "subject",
      "descriptor": {
        "label": "Untitled work"
      }
    }
  },
  {
    "name": "annotation work is mirrored into refs",
    "fn": "mirror_annotation_work",
    "args": [
      "com.cultureblocs.annotation",
      {
        "work": {
          "title": "Gasholder"
        },
        "refs": [
          {
            "type": "person",
            "role": "mention",
            "descriptor": {
              "label": "Turner"
            }
          }
        ]
      }
    ],
    "expected": {
      "work": {
        "title": "Gasholder"
      },
      "refs": [
        {
          "type": "person",
          "role": "mention",
          "descriptor": {
            "label": "Turner"
          }
        },
        {
          "type": "work",
          "role": "subject",
          "descriptor": {
            "label": "Gasholder"
          }
        }
      ]
    }
  },
  {
    "name": "an existing work subject ref is never replaced",
    "fn": "mirror_annotation_work",
    "args": [
      "com.cultureblocs.annotation",
      {
        "work": {
          "title": "Gasholder"
        },
        "refs": [
          {
            "type": "work",
            "role": "subject",
            "descriptor": {
              "label": "Gasholder No. 2"
            }
          }
        ]
      }
    ],
    "expected": {
      "work": {
        "title": "Gasholder"
      },
      "refs": [
        {
          "type": "work",
          "role": "subject",
          "descriptor": {
            "label": "Gasholder No. 2"
          }
        }
      ]
    }
  },
  {
    "name": "beads are not mirrored",
    "fn": "mirror_annotation_work",
    "args": [
      "com.cultureblocs.bead",
      {
        "work": {
          "title": "Gasholder"
        }
      }
    ],
    "expected": {
      "work": {
        "title": "Gasholder"
      }
    }
  }
]
```

Create `sdk/js/test/refs.test.mjs`:

```js
/* The shared refs fixture suite, run against sdk/js/refs.js.
 * Other half: tests/test_fixture_parity.py. `fn` names the Python function;
 * the JS export is its camelCase twin.
 *   node --test sdk/js/test/*.test.mjs                                    */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as refs from '../refs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cases = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/refs-cases.json'), 'utf8'));
const camel = (name) => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

for (const c of cases) {
  test(`refs fixture: ${c.name}`, () => {
    const fn = refs[camel(c.fn)];
    assert.equal(typeof fn, 'function', `sdk/js/refs.js has no export for ${c.fn}`);
    assert.deepEqual(fn(...c.args), c.expected);
  });
}

test('the fixture file is actually loaded', () => {
  assert.ok(cases.length >= 15, `expected the full fixture set, got ${cases.length}`);
});
```

Extend the Python parity suite:

```diff
--- a/tests/test_fixture_parity.py
+++ b/tests/test_fixture_parity.py
@@ -1,8 +1,8 @@
 """The shared fixture suites, run against the Python implementations.
 
 tests/fixtures/*.json are the contract between string/app/lexicon.py and
-sdk/js/lexicon.js, and between string/app/publisher.py's strip functions and
-sdk/js/strip.js. Both languages run these same cases: see
+sdk/js/lexicon.js, between string/app/publisher.py's strip functions and
+sdk/js/strip.js, and between string/app/refs.py and sdk/js/refs.js. Both languages run these same cases: see
 sdk/js/test/*.test.mjs for the other half.
 
 If you change a validator or a strip rule, change the fixture — and both
@@ -17,7 +17,7 @@
 ROOT = Path(__file__).resolve().parents[1]
 sys.path.insert(0, str(ROOT / "string"))
 from app.lexicon import LexiconRegistry  # noqa: E402
-from app import publisher  # noqa: E402
+from app import publisher, refs  # noqa: E402
 
 FIXTURES = ROOT / "tests" / "fixtures"
 
@@ -28,6 +28,7 @@
 
 LEXICON_CASES = load("lexicon-cases.json")
 STRIP_CASES = load("strip-cases.json")
+REFS_CASES = load("refs-cases.json")
 
 
 @pytest.fixture(scope="module")
@@ -55,6 +56,11 @@
     assert got == case["expected"]
 
 
+@pytest.mark.parametrize("case", REFS_CASES, ids=lambda c: c["name"][:60])
+def test_refs_fixture(case):
+    assert getattr(refs, case["fn"])(*case["args"]) == case["expected"]
+
+
 def test_strip_never_emits_a_private_key():
     """A blunt backstop over every bead/strand case: whatever the allow lists
     say, these keys must not appear anywhere in a published body. Cheap
```

- [ ] **Step 2: Run to see them fail**

Run: `python3 -m pytest -q tests/test_fixture_parity.py 2>&1 | tail -1; node --test sdk/js/test/refs.test.mjs 2>&1 | grep -m1 'Cannot find module'`
Expected: Python `1 error` (cannot import `refs` from `app`); node `Cannot find module …/sdk/js/refs.js`

- [ ] **Step 3: Implement both**

Create `string/app/refs.py`:

```python
"""Refs helpers that need more than the lexicon can say.

The validator checks a ref's shape; it cannot check that an `index` lands
inside the record's own text, on character boundaries. That lives here,
with the transitional #workRef -> #ref mapping.

Ported to sdk/js/refs.js; both run tests/fixtures/refs-cases.json.
"""
from __future__ import annotations

ANNOTATION = "com.cultureblocs.annotation"

# The text a record's ref anchors index into.
TEXT_FIELD = {
    "com.cultureblocs.strand": "narrative",
    "com.cultureblocs.bead": "note",
    ANNOTATION: "note",
}


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _on_boundary(data: bytes, pos: int) -> bool:
    """True unless `pos` falls inside a multi-byte UTF-8 sequence."""
    return pos == len(data) or (data[pos] & 0xC0) != 0x80


def anchor_problems(nsid: str, body: dict) -> list[str]:
    """Problems with ref anchors that the lexicon cannot express.

    Args:
        nsid: The record type.
        body: The record body.

    Returns:
        Problem strings in the validator's format; empty when anchors are sound.
    """
    field = TEXT_FIELD.get(nsid)
    if field is None:
        return []
    problems: list[str] = []
    text = body.get(field)
    data = text.encode("utf-8") if isinstance(text, str) else b""
    refs = body.get("refs")
    for i, ref in enumerate(refs if isinstance(refs, list) else []):
        idx = ref.get("index") if isinstance(ref, dict) else None
        if not isinstance(idx, dict):
            continue
        start, end = idx.get("byteStart"), idx.get("byteEnd")
        if not (_is_int(start) and _is_int(end)):
            continue  # shape errors are the validator's to report
        path = f"$.refs[{i}].index"
        if not 0 <= start <= end <= len(data):
            problems.append(f"{path}: {start}..{end} is outside {field} ({len(data)} bytes)")
        elif not (_on_boundary(data, start) and _on_boundary(data, end)):
            problems.append(f"{path}: {start}..{end} splits a character in {field}")
    presentation = body.get("presentation")
    if isinstance(presentation, dict):
        for key in ("venueRef", "eventRef"):
            ref = presentation.get(key)
            if isinstance(ref, dict) and "index" in ref:
                problems.append(f"$.presentation.{key}.index: presentation refs cannot anchor")
    return problems


def ref_from_work_ref(work: dict) -> dict:
    """Map a deprecated #workRef onto a #ref with role subject."""
    descriptor = {"label": work.get("title") or work.get("wikidata") or "Untitled work"}
    for key in ("creator", "creatorDid", "date"):
        if isinstance(work.get(key), str) and work[key]:
            descriptor[key] = work[key]
    ids = []
    if isinstance(work.get("wikidata"), str) and work["wikidata"]:
        ids.append({"scheme": "wikidata", "id": work["wikidata"]})
    if isinstance(work.get("linkedArt"), str) and work["linkedArt"]:
        ids.append({"scheme": "linkedArt", "id": work["linkedArt"], "uri": work["linkedArt"]})
    acc = work.get("accession")
    if isinstance(acc, dict) and isinstance(acc.get("institution"), str) \
            and isinstance(acc.get("id"), str):
        ids.append({"scheme": "accession", "id": f"{acc['institution']}/{acc['id']}"})
    ref = {"type": "work", "role": "subject", "descriptor": descriptor}
    if ids:
        ref["externalIds"] = ids
    return ref


def mirror_annotation_work(nsid: str, body: dict) -> dict:
    """Give an annotation's required `work` a matching subject ref.

    Transitional, while the AR gallery still writes `work`: an annotation
    with no work-subject ref gets one derived from `work`. An existing
    work-subject ref is never replaced. Returns a new dict when it adds one.
    """
    if nsid != ANNOTATION or not isinstance(body.get("work"), dict):
        return body
    refs = body.get("refs") if isinstance(body.get("refs"), list) else []
    if any(isinstance(r, dict) and r.get("type") == "work" and r.get("role") == "subject"
           for r in refs):
        return body
    return {**body, "refs": [*refs, ref_from_work_ref(body["work"])]}
```

Create `sdk/js/refs.js`:

```js
/* Refs helpers that need more than the lexicon can say — a port of
 * string/app/refs.py. The validator checks a ref's shape; it cannot check
 * that an `index` lands inside the record's own text, on character
 * boundaries. Both implementations run tests/fixtures/refs-cases.json.
 *
 * CANONICAL COPY. Apps carry copies; copy outward from here.
 */

const ANNOTATION = 'com.cultureblocs.annotation';

// The text a record's ref anchors index into.
export const TEXT_FIELD = {
  'com.cultureblocs.strand': 'narrative',
  'com.cultureblocs.bead': 'note',
  [ANNOTATION]: 'note',
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v !== '';
const encoder = new TextEncoder();

// True unless `pos` falls inside a multi-byte UTF-8 sequence.
const onBoundary = (data, pos) => pos === data.length || (data[pos] & 0xc0) !== 0x80;

/** Problems with ref anchors that the lexicon cannot express. */
export function anchorProblems(nsid, body) {
  const field = TEXT_FIELD[nsid];
  if (field === undefined) return [];
  const problems = [];
  const text = body[field];
  const data = typeof text === 'string' ? encoder.encode(text) : new Uint8Array();
  const refs = Array.isArray(body.refs) ? body.refs : [];
  refs.forEach((ref, i) => {
    const idx = isObject(ref) ? ref.index : undefined;
    if (!isObject(idx)) return;
    const { byteStart: start, byteEnd: end } = idx;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return; // the validator's to report
    const path = `$.refs[${i}].index`;
    if (!(start >= 0 && start <= end && end <= data.length)) {
      problems.push(`${path}: ${start}..${end} is outside ${field} (${data.length} bytes)`);
    } else if (!(onBoundary(data, start) && onBoundary(data, end))) {
      problems.push(`${path}: ${start}..${end} splits a character in ${field}`);
    }
  });
  if (isObject(body.presentation)) {
    for (const key of ['venueRef', 'eventRef']) {
      const ref = body.presentation[key];
      if (isObject(ref) && 'index' in ref) {
        problems.push(`$.presentation.${key}.index: presentation refs cannot anchor`);
      }
    }
  }
  return problems;
}

/** Map a deprecated #workRef onto a #ref with role subject. */
export function refFromWorkRef(work) {
  const descriptor = { label: work.title || work.wikidata || 'Untitled work' };
  for (const key of ['creator', 'creatorDid', 'date']) {
    if (nonEmpty(work[key])) descriptor[key] = work[key];
  }
  const ids = [];
  if (nonEmpty(work.wikidata)) ids.push({ scheme: 'wikidata', id: work.wikidata });
  if (nonEmpty(work.linkedArt)) ids.push({ scheme: 'linkedArt', id: work.linkedArt, uri: work.linkedArt });
  const acc = work.accession;
  if (isObject(acc) && typeof acc.institution === 'string' && typeof acc.id === 'string') {
    ids.push({ scheme: 'accession', id: `${acc.institution}/${acc.id}` });
  }
  const ref = { type: 'work', role: 'subject', descriptor };
  if (ids.length) ref.externalIds = ids;
  return ref;
}

/** Give an annotation's required `work` a matching subject ref (transitional). */
export function mirrorAnnotationWork(nsid, body) {
  if (nsid !== ANNOTATION || !isObject(body.work)) return body;
  const refs = Array.isArray(body.refs) ? body.refs : [];
  if (refs.some((r) => isObject(r) && r.type === 'work' && r.role === 'subject')) return body;
  return { ...body, refs: [...refs, refFromWorkRef(body.work)] };
}
```

Run: `python3 -m pytest -q tests && node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `119 passed`, `# pass 71`, `# fail 0`

- [ ] **Step 4: Share the client fixture and write the API tests**

Create `tests/conftest.py`:

```python
"""Shared pytest fixtures."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "string") not in sys.path:
    sys.path.insert(0, str(ROOT / "string"))


@pytest.fixture
def client(tmp_path, monkeypatch):
    """The String API on a fresh database, with the repo's lexicons and no token.

    string/app/main.py builds its Store at import time from the environment,
    so app.* is re-imported per test to pick up the temporary paths.
    """
    monkeypatch.setenv("STRING_DB", str(tmp_path / "string.db"))
    monkeypatch.setenv("STRING_LEXICONS", str(ROOT / "lexicons"))
    monkeypatch.delenv("STRING_TOKEN", raising=False)
    monkeypatch.delenv("SPINE_TOKEN", raising=False)
    for mod in [m for m in sys.modules if m.startswith("app.")]:
        del sys.modules[mod]
    from fastapi.testclient import TestClient
    import app.main as main
    return TestClient(main.app)
```

Remove the now-duplicate fixture from `tests/test_api_phase0.py`:

```diff
--- a/tests/test_api_phase0.py
+++ b/tests/test_api_phase0.py
@@ -2,27 +2,12 @@
 import sys
 from pathlib import Path
 
-import pytest
-
 ROOT = Path(__file__).resolve().parents[1]
 sys.path.insert(0, str(ROOT / "string"))
 
 BEAD = "com.cultureblocs.bead"
 
 
-@pytest.fixture
-def client(tmp_path, monkeypatch):
-    monkeypatch.setenv("STRING_DB", str(tmp_path / "string.db"))
-    monkeypatch.setenv("STRING_LEXICONS", str(ROOT / "lexicons"))
-    monkeypatch.delenv("STRING_TOKEN", raising=False)
-    monkeypatch.delenv("SPINE_TOKEN", raising=False)
-    for mod in [m for m in sys.modules if m.startswith("app.")]:
-        del sys.modules[mod]
-    from fastapi.testclient import TestClient
-    import app.main as main
-    return TestClient(main.app)
-
-
 def bead(note="a note"):
     return {"$type": BEAD, "createdAt": "2026-08-15T21:04:00Z", "kind": "listen", "note": note}
 
```

Create `tests/test_api_refs.py`:

```python
"""Ingest and PATCH run the refs checks the lexicon cannot express, and
mirror an annotation's `work` into a subject ref."""
T = "2026-08-15T21:04:00Z"


def ingest(client, rtype: str, body: dict, key: str = "k1") -> dict:
    res = client.post("/records", json={"records": [{
        "dedupeKey": key, "type": rtype, "sourceApp": "test", "createdAt": T,
        "body": {"$type": rtype, "createdAt": T, **body}}]})
    assert res.status_code == 200, res.text
    return res.json()["results"][0]


def test_annotation_work_is_mirrored_on_ingest(client):
    out = ingest(client, "com.cultureblocs.annotation", {"work": {"title": "Gasholder"}})
    assert out["status"] == "created", out
    stored = client.get(f"/records/{out['id']}").json()["body"]
    assert stored["refs"] == [
        {"type": "work", "role": "subject", "descriptor": {"label": "Gasholder"}}]


def test_anchor_outside_the_note_is_rejected(client):
    out = ingest(client, "com.cultureblocs.bead", {
        "kind": "watch", "note": "Severance",
        "refs": [{"type": "work", "role": "subject", "descriptor": {"label": "Severance"},
                  "index": {"byteStart": 0, "byteEnd": 99}}]})
    assert out["status"] == "invalid"
    assert out["problems"] == ["$.refs[0].index: 0..99 is outside note (9 bytes)"]


def test_patch_that_shortens_the_text_under_an_anchor_is_rejected(client):
    out = ingest(client, "com.cultureblocs.bead", {
        "kind": "watch", "note": "Saw Severance",
        "refs": [{"type": "work", "role": "subject", "descriptor": {"label": "Severance"},
                  "index": {"byteStart": 4, "byteEnd": 13}}]})
    res = client.patch(f"/records/{out['id']}", json={"fields": {"note": "Saw it"}})
    assert res.status_code == 422
    assert res.json()["detail"] == ["$.refs[0].index: 4..13 is outside note (6 bytes)"]


def test_patching_an_annotation_backfills_its_subject_ref(client):
    out = ingest(client, "com.cultureblocs.annotation", {
        "work": {"title": "Gasholder"},
        "refs": [{"type": "work", "role": "subject", "descriptor": {"label": "Gasholder"}}]})
    res = client.patch(f"/records/{out['id']}", json={"fields": {"refs": []}})
    assert res.status_code == 200, res.text
    assert res.json()["body"]["refs"] == [
        {"type": "work", "role": "subject", "descriptor": {"label": "Gasholder"}}]
```

Run: `python3 -m pytest -q tests/test_api_refs.py`
Expected: `4 failed` — no refs on the stored annotation, and the bad anchors accepted.

- [ ] **Step 5: Wire refs into the API**

```diff
--- a/string/app/main.py
+++ b/string/app/main.py
@@ -34,7 +34,7 @@
 from fastapi.responses import FileResponse
 from pydantic import BaseModel, Field
 
-from . import publisher
+from . import publisher, refs
 from .db import STATES, Store
 from .lexicon import LexiconRegistry
 
@@ -107,13 +107,15 @@
             results.append({"dedupeKey": rec.dedupeKey, "status": "invalid",
                             "problems": [f"unknown state: {rec.state}"]})
             continue
-        problems = registry.validate_record(rec.type, rec.body)
+        body = refs.mirror_annotation_work(rec.type, rec.body)
+        problems = (registry.validate_record(rec.type, body)
+                    + refs.anchor_problems(rec.type, body))
         if problems:
             results.append({"dedupeKey": rec.dedupeKey, "status": "invalid",
                             "problems": problems})
             continue
         rid, status = store.upsert(
-            rec.dedupeKey, rec.type, rec.sourceApp, rec.createdAt, rec.body,
+            rec.dedupeKey, rec.type, rec.sourceApp, rec.createdAt, body,
             state=rec.state, device=org.device, actor=org.actor)
         results.append({"dedupeKey": rec.dedupeKey, "status": status, "id": rid})
     return {"results": results}
@@ -149,12 +151,15 @@
     current = store.get(rid)
     if current is None:
         raise HTTPException(status_code=404, detail="not found")
-    merged = {**current["body"], **body.fields}
-    problems = registry.validate_record(current["type"], merged)
+    requested = {**current["body"], **body.fields}
+    merged = refs.mirror_annotation_work(current["type"], requested)
+    problems = (registry.validate_record(current["type"], merged)
+                + refs.anchor_problems(current["type"], merged))
     if problems:
         raise HTTPException(status_code=422, detail=problems)
+    fields = body.fields if merged is requested else {**body.fields, "refs": merged["refs"]}
     expect = (request.headers.get("if-match") or "").strip('"') or None
-    result = store.patch(rid, body.fields, expect_hlc=expect,
+    result = store.patch(rid, fields, expect_hlc=expect,
                          device=org.device, actor=org.actor)
     if result is store.STALE:
         raise HTTPException(status_code=412, detail={
```

The mirror result is compared by identity (`merged is requested`), not by value against the stored body. A PATCH that sets `refs: []` on an annotation must still get its subject ref back.

- [ ] **Step 6: Run everything**

Run: `python3 -m pytest -q tests && node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `123 passed`, `# pass 71`, `# fail 0`

- [ ] **Step 7: Commit**

```bash
git add string/app/refs.py sdk/js/refs.js sdk/js/test/refs.test.mjs tests/fixtures/refs-cases.json \
  tests/test_fixture_parity.py tests/conftest.py tests/test_api_phase0.py tests/test_api_refs.py string/app/main.py
git commit -m "feat(phase0): check ref anchors on write; mirror annotation work into refs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 4: One canonical strip (R5)

Today the bead/strand strip exists three times in Python (`publisher.py`, `scripts/promote.py`, `scripts/export_public.py`), plus PR #1's faithful JS port of that copy. All pass allowed fields through whole, so `annotation.work.image` — a local media URI — publishes.

This task:
- makes `string/app/strip.py` the only Python copy, an allowlist at every depth, with refs per LOOM.md §9.8;
- has all three callers import it;
- rewrites `sdk/js/strip.js` to match, keeping its public API.

Python and JS land together because they share `strip-cases.json`.

**Files:**
- Modify: `tests/fixtures/strip-cases.json`, `tests/test_fixture_parity.py`, `sdk/js/test/strip.test.mjs`
- Create: `tests/test_one_strip.py`
- Create: `string/app/strip.py`
- Modify: `string/app/publisher.py`, `scripts/promote.py`, `scripts/export_public.py`, `sdk/js/strip.js`, `README.md`

**Interfaces:**
- Produces:
  - `strip.strip_bead(body, images=None)`
  - `strip.strip_strand(body, items=None)` — the `items` key is omitted when `None`
  - `strip.strip_public(body)`
  - `strip.strip_ref(ref, anchored=True) -> dict | None`
  - `strip.strip_refs`, `strip_presentation`, `strip_work_ref`, `strip_links`, `strip_tags`, `strip_external_ids`
  - All Python strips raise `KeyError` on a body with no `$type`, as `sdk/js/strip.js` throws.
  - `publisher.strip_bead`, `publisher.strip_strand` and `publisher.strip_public` remain as re-exports.
  - JS adds `stripRef(ref, anchored = true)`, `stripRefs`, `stripPresentation`, `stripWorkRef`, `stripLinks`, `stripTags`, `stripExternalIds`; `stripStrand(body, items)` omits `items` when it is `null`.
  - Strip fixture entries gain `fn: "ref"` (the ref in `body`), and `"items": null` for the static-export strand.

- [ ] **Step 1: Add the cases and update both runners**

```diff
--- a/tests/fixtures/strip-cases.json
+++ b/tests/fixtures/strip-cases.json
@@ -346,6 +346,458 @@
       "$type": "com.cultureblocs.bead",
       "createdAt": "2026-08-15T21:04:00Z",
       "kind": "note"
+    }
+  },
+  {
+    "name": "bead: the undeclared `work` field no longer publishes",
+    "fn": "bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "watch",
+      "work": {
+        "title": "Severance"
+      }
+    },
+    "expected": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "watch"
+    }
+  },
+  {
+    "name": "bead: links and tags are stripped per item",
+    "fn": "bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "bloc",
+      "tags": [
+        "ok",
+        7,
+        ""
+      ],
+      "links": [
+        {
+          "uri": "https://example.org/show",
+          "title": "Show",
+          "trackingNote": "from J"
+        },
+        {
+          "title": "no uri"
+        }
+      ]
+    },
+    "expected": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "bloc",
+      "tags": [
+        "ok"
+      ],
+      "links": [
+        {
+          "uri": "https://example.org/show",
+          "title": "Show"
+        }
+      ]
+    }
+  },
+  {
+    "name": "annotation: work.image (a local media URI) never publishes",
+    "fn": "bead",
+    "body": {
+      "$type": "com.cultureblocs.annotation",
+      "createdAt": "2026-09-14T10:00:00Z",
+      "work": {
+        "title": "Gasholder",
+        "creator": "A. Painter",
+        "wikidata": "Q1892745",
+        "accession": {
+          "institution": "did:plc:museum",
+          "id": "T01234",
+          "shelf": "B3"
+        },
+        "image": {
+          "uri": "http://brick:8100/media/x.jpg"
+        }
+      },
+      "matchConfidence": "embedding",
+      "context": {
+        "uri": "spine://records/y"
+      }
+    },
+    "expected": {
+      "$type": "com.cultureblocs.annotation",
+      "createdAt": "2026-09-14T10:00:00Z",
+      "work": {
+        "title": "Gasholder",
+        "creator": "A. Painter",
+        "wikidata": "Q1892745",
+        "accession": {
+          "institution": "did:plc:museum",
+          "id": "T01234"
+        }
+      }
+    }
+  },
+  {
+    "name": "refs: resolver bookkeeping and unknown fields never publish, at any depth",
+    "fn": "bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "read",
+      "note": "Pester",
+      "refs": [
+        {
+          "type": "work",
+          "role": "subject",
+          "matchConfidence": 0.93,
+          "clusterHint": "c-81",
+          "descriptor": {
+            "label": "The Expansion Project",
+            "creator": "Ben Pester",
+            "note": "with J after hers"
+          },
+          "externalIds": [
+            {
+              "scheme": "wikidata",
+              "id": "Q000000",
+              "confidence": 1
+            },
+            {
+              "scheme": "isbn"
+            }
+          ],
+          "index": {
+            "byteStart": 0,
+            "byteEnd": 6,
+            "extra": true
+          }
+        }
+      ]
+    },
+    "expected": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "read",
+      "note": "Pester",
+      "refs": [
+        {
+          "type": "work",
+          "role": "subject",
+          "descriptor": {
+            "label": "The Expansion Project",
+            "creator": "Ben Pester"
+          },
+          "externalIds": [
+            {
+              "scheme": "wikidata",
+              "id": "Q000000"
+            }
+          ],
+          "index": {
+            "byteStart": 0,
+            "byteEnd": 6
+          }
+        }
+      ]
+    }
+  },
+  {
+    "name": "person ref with only a name never publishes",
+    "fn": "ref",
+    "body": {
+      "type": "person",
+      "role": "mention",
+      "descriptor": {
+        "label": "J"
+      }
+    },
+    "expected": null
+  },
+  {
+    "name": "person ref with a DID publishes",
+    "fn": "ref",
+    "body": {
+      "type": "person",
+      "role": "mention",
+      "descriptor": {
+        "label": "Ben Pester"
+      },
+      "did": "did:plc:pester"
+    },
+    "expected": {
+      "type": "person",
+      "role": "mention",
+      "descriptor": {
+        "label": "Ben Pester"
+      },
+      "did": "did:plc:pester"
+    }
+  },
+  {
+    "name": "person ref with an external id publishes",
+    "fn": "ref",
+    "body": {
+      "type": "person",
+      "role": "mention",
+      "descriptor": {
+        "label": "J. G. Ballard"
+      },
+      "externalIds": [
+        {
+          "scheme": "wikidata",
+          "id": "Q190379"
+        }
+      ]
+    },
+    "expected": {
+      "type": "person",
+      "role": "mention",
+      "descriptor": {
+        "label": "J. G. Ballard"
+      },
+      "externalIds": [
+        {
+          "scheme": "wikidata",
+          "id": "Q190379"
+        }
+      ]
+    }
+  },
+  {
+    "name": "person ref whose only external id is malformed never publishes",
+    "fn": "ref",
+    "body": {
+      "type": "person",
+      "role": "mention",
+      "descriptor": {
+        "label": "J"
+      },
+      "externalIds": [
+        {
+          "scheme": "wikidata"
+        }
+      ]
+    },
+    "expected": null
+  },
+  {
+    "name": "unknown role publishes as mention",
+    "fn": "ref",
+    "body": {
+      "type": "work",
+      "role": "influencedBy",
+      "descriptor": {
+        "label": "Crash"
+      }
+    },
+    "expected": {
+      "type": "work",
+      "role": "mention",
+      "descriptor": {
+        "label": "Crash"
+      }
     }
+  },
+  {
+    "name": "ref without a label never publishes",
+    "fn": "ref",
+    "body": {
+      "type": "work",
+      "role": "subject",
+      "descriptor": {
+        "creator": "Priest"
+      }
+    },
+    "expected": null
+  },
+  {
+    "name": "ref with a non-integer index publishes without it",
+    "fn": "ref",
+    "body": {
+      "type": "concept",
+      "role": "mention",
+      "descriptor": {
+        "label": "SF New Wave"
+      },
+      "index": {
+        "byteStart": true,
+        "byteEnd": 4
+      }
+    },
+    "expected": {
+      "type": "concept",
+      "role": "mention",
+      "descriptor": {
+        "label": "SF New Wave"
+      }
+    }
+  },
+  {
+    "name": "bead: presentation publishes; its refs lose any index, and bare-name people",
+    "fn": "bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "screening",
+      "presentation": {
+        "format": "IMAX 70mm",
+        "seat": "H12",
+        "venueRef": {
+          "type": "venue",
+          "role": "mention",
+          "descriptor": {
+            "label": "BFI IMAX"
+          },
+          "index": {
+            "byteStart": 0,
+            "byteEnd": 3
+          }
+        },
+        "eventRef": {
+          "type": "person",
+          "role": "mention",
+          "descriptor": {
+            "label": "J"
+          }
+        }
+      }
+    },
+    "expected": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "screening",
+      "presentation": {
+        "format": "IMAX 70mm",
+        "venueRef": {
+          "type": "venue",
+          "role": "mention",
+          "descriptor": {
+            "label": "BFI IMAX"
+          }
+        }
+      }
+    }
+  },
+  {
+    "name": "bead: an empty presentation, and refs that all drop, are omitted",
+    "fn": "bead",
+    "body": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "watch",
+      "presentation": {
+        "seat": "H12"
+      },
+      "refs": [
+        {
+          "type": "person",
+          "role": "subject",
+          "descriptor": {
+            "label": "J"
+          }
+        }
+      ]
+    },
+    "expected": {
+      "$type": "com.cultureblocs.bead",
+      "kind": "watch"
+    }
+  },
+  {
+    "name": "strand: place name, refs and published items",
+    "fn": "strand",
+    "body": {
+      "$type": "com.cultureblocs.strand",
+      "createdAt": "2026-09-14T22:00:00Z",
+      "title": "Sunday",
+      "narrative": "Ballard, again.",
+      "day": "2026-09-14T00:00:00Z",
+      "place": {
+        "name": "Peckham",
+        "geo": {
+          "lat": 51.47,
+          "lng": -0.07,
+          "precision": "1km"
+        }
+      },
+      "items": [
+        {
+          "uri": "spine://records/a"
+        }
+      ],
+      "refs": [
+        {
+          "type": "person",
+          "role": "mention",
+          "descriptor": {
+            "label": "J. G. Ballard"
+          },
+          "externalIds": [
+            {
+              "scheme": "wikidata",
+              "id": "Q190379"
+            }
+          ],
+          "index": {
+            "byteStart": 0,
+            "byteEnd": 7
+          }
+        }
+      ]
+    },
+    "items": [
+      {
+        "uri": "at://did:plc:me/com.cultureblocs.bead/a",
+        "cid": "bafy"
+      }
+    ],
+    "expected": {
+      "$type": "com.cultureblocs.strand",
+      "createdAt": "2026-09-14T22:00:00Z",
+      "title": "Sunday",
+      "narrative": "Ballard, again.",
+      "day": "2026-09-14T00:00:00Z",
+      "place": {
+        "name": "Peckham"
+      },
+      "refs": [
+        {
+          "type": "person",
+          "role": "mention",
+          "descriptor": {
+            "label": "J. G. Ballard"
+          },
+          "externalIds": [
+            {
+              "scheme": "wikidata",
+              "id": "Q190379"
+            }
+          ],
+          "index": {
+            "byteStart": 0,
+            "byteEnd": 7
+          }
+        }
+      ],
+      "items": [
+        {
+          "uri": "at://did:plc:me/com.cultureblocs.bead/a",
+          "cid": "bafy"
+        }
+      ]
+    }
+  },
+  {
+    "name": "strand: without items (static export) omits the field",
+    "fn": "strand",
+    "body": {
+      "$type": "com.cultureblocs.strand",
+      "title": "Sunday",
+      "items": [
+        {
+          "uri": "spine://records/a"
+        }
+      ]
+    },
+    "items": null,
+    "expected": {
+      "$type": "com.cultureblocs.strand",
+      "title": "Sunday"
+    }
   }
 ]
```

```diff
--- a/tests/test_fixture_parity.py
+++ b/tests/test_fixture_parity.py
@@ -1,8 +1,8 @@
 """The shared fixture suites, run against the Python implementations.
 
 tests/fixtures/*.json are the contract between string/app/lexicon.py and
-sdk/js/lexicon.js, between string/app/publisher.py's strip functions and
-sdk/js/strip.js, and between string/app/refs.py and sdk/js/refs.js. Both languages run these same cases: see
+sdk/js/lexicon.js, between string/app/strip.py and sdk/js/strip.js, and
+between string/app/refs.py and sdk/js/refs.js. Both languages run these same cases: see
 sdk/js/test/*.test.mjs for the other half.
 
 If you change a validator or a strip rule, change the fixture — and both
@@ -17,7 +17,7 @@
 ROOT = Path(__file__).resolve().parents[1]
 sys.path.insert(0, str(ROOT / "string"))
 from app.lexicon import LexiconRegistry  # noqa: E402
-from app import publisher, refs  # noqa: E402
+from app import refs, strip  # noqa: E402
 
 FIXTURES = ROOT / "tests" / "fixtures"
 
@@ -46,11 +46,13 @@
 @pytest.mark.parametrize("case", STRIP_CASES, ids=lambda c: c["name"][:60])
 def test_strip_fixture(case):
     if case["fn"] == "bead":
-        got = publisher.strip_bead(case["body"], images=case.get("images"))
+        got = strip.strip_bead(case["body"], images=case.get("images"))
     elif case["fn"] == "strand":
-        got = publisher.strip_strand(case["body"], case.get("items", []))
+        got = strip.strip_strand(case["body"], case.get("items", []))
     elif case["fn"] == "public":
-        got = publisher.strip_public(case["body"])
+        got = strip.strip_public(case["body"])
+    elif case["fn"] == "ref":
+        got = strip.strip_ref(case["body"])
     else:
         raise AssertionError(f"unknown strip fn: {case['fn']}")
     assert got == case["expected"]
```

```diff
--- a/sdk/js/test/strip.test.mjs
+++ b/sdk/js/test/strip.test.mjs
@@ -7,7 +7,7 @@
 import { readFileSync } from 'node:fs';
 import { join, dirname } from 'node:path';
 import { fileURLToPath } from 'node:url';
-import { stripBead, stripStrand, stripPublic, canonicalJSON, contentHash } from '../strip.js';
+import { stripBead, stripStrand, stripPublic, stripRef, canonicalJSON, contentHash } from '../strip.js';
 
 const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
 const cases = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/strip-cases.json'), 'utf8'));
@@ -16,8 +16,9 @@
   test(`strip fixture: ${c.name}`, () => {
     let got;
     if (c.fn === 'bead') got = stripBead(c.body, { images: c.images ?? null });
-    else if (c.fn === 'strand') got = stripStrand(c.body, c.items ?? []);
+    else if (c.fn === 'strand') got = stripStrand(c.body, 'items' in c ? c.items : []);
     else if (c.fn === 'public') got = stripPublic(c.body);
+    else if (c.fn === 'ref') got = stripRef(c.body);
     else assert.fail(`unknown strip fn: ${c.fn}`);
     assert.deepEqual(got, c.expected);
   });
```

Create `tests/test_one_strip.py`:

```python
"""There is one strip. The publisher and both scripts use strip.py's
functions rather than private copies that could drift (R5).

Checked by where each function is defined, not by identity: the `client`
fixture re-imports app.* per test, so the same function can exist as two
objects in one session."""
import importlib.util
import inspect
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))
from app import publisher  # noqa: E402

STRIP_PY = str(ROOT / "string" / "app" / "strip.py")


def defined_in_strip(fn) -> bool:
    return inspect.getsourcefile(fn) == STRIP_PY


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_publisher_uses_the_canonical_strip() -> None:
    assert defined_in_strip(publisher.strip_bead)
    assert defined_in_strip(publisher.strip_strand)
    assert defined_in_strip(publisher.strip_public)


def test_promote_uses_the_canonical_strip() -> None:
    promote = load_script("promote")
    assert defined_in_strip(promote.strip_bead)
    assert defined_in_strip(promote.strip_strand)


def test_static_export_is_the_canonical_strip_plus_media() -> None:
    export = load_script("export_public")
    assert defined_in_strip(export.strip_strand)
    body = {"$type": "com.cultureblocs.bead", "kind": "visit",
            "geo": {"lat": 1, "lng": 2, "precision": "exact"},
            "media": [{"uri": "/media/a.jpg", "alt": "A gasholder", "mime": "image/jpeg"}]}
    assert export.strip_item(body) == {
        "$type": "com.cultureblocs.bead", "kind": "visit",
        "media": [{"uri": "/media/a.jpg", "alt": "A gasholder"}]}
```

- [ ] **Step 2: Run to see them fail**

Run: `python3 -m pytest -q tests 2>&1 | tail -1; node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# fail'`
Expected: Python `1 error` (collection: cannot import `strip` from `app`); node `# fail 1` (`strip.js` has no `stripRef` export, so the whole file fails).

- [ ] **Step 3: Write the Python strip**

Create `string/app/strip.py`:

```python
"""The publish strip: the one canonical copy.

What may leave the String when a record is published. Allowlists all the
way down — a field not named here does not publish, at any depth, so a new
lexicon field stays private until someone decides otherwise and adds a
fixture saying so. Geo, provenance, local media and resolver bookkeeping
never leave.

Used by publisher.py, scripts/promote.py and scripts/export_public.py.
Ported to sdk/js/strip.js; both run tests/fixtures/strip-cases.json.
"""
from __future__ import annotations

ANNOTATION = "com.cultureblocs.annotation"
ROLES = ("subject", "mention")
BEAD_FIELDS = ("createdAt", "kind", "note")
STRAND_FIELDS = ("createdAt", "title", "narrative", "day")


def _str(v) -> bool:
    return isinstance(v, str) and v != ""


def _int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _pick(d: dict, keys: tuple[str, ...]) -> dict:
    return {k: d[k] for k in keys if _str(d.get(k))}


def _head(body: dict) -> dict:
    return {"$type": body["$type"]}   # KeyError, like sdk/js/strip.js, rather than an untyped record


def strip_links(links) -> list[dict]:
    """linkRefs: uri and title only."""
    return [_pick(link, ("uri", "title")) for link in (links if isinstance(links, list) else [])
            if isinstance(link, dict) and _str(link.get("uri"))]


def strip_tags(tags) -> list[str]:
    return [t for t in (tags if isinstance(tags, list) else []) if _str(t)]


def strip_external_ids(ids) -> list[dict]:
    """externalIds: scheme, id and uri; entries without scheme and id are dropped."""
    return [_pick(e, ("scheme", "id", "uri")) for e in (ids if isinstance(ids, list) else [])
            if isinstance(e, dict) and _str(e.get("scheme")) and _str(e.get("id"))]


def strip_ref(ref, anchored: bool = True) -> dict | None:
    """The public form of one #ref, or None if it must not publish.

    Args:
        ref: A ref as stored locally.
        anchored: False for refs that have no text to anchor into
            (presentation.venueRef / eventRef); their index is dropped.

    Returns:
        The stripped ref, or None when it lacks a type or label, or is a
        person ref with neither a DID nor an external id.
    """
    if not isinstance(ref, dict) or not _str(ref.get("type")):
        return None
    descriptor = ref.get("descriptor")
    if not isinstance(descriptor, dict) or not _str(descriptor.get("label")):
        return None
    out = {
        "type": ref["type"],
        "role": ref["role"] if ref.get("role") in ROLES else "mention",
        "descriptor": _pick(descriptor, ("label", "creator", "creatorDid", "date")),
    }
    if _str(ref.get("did")):
        out["did"] = ref["did"]
    ids = strip_external_ids(ref.get("externalIds"))
    if ids:
        out["externalIds"] = ids
    if ref["type"] == "person" and "did" not in out and not ids:
        return None  # a bare name may be a private individual
    index = ref.get("index")
    if anchored and isinstance(index, dict) \
            and _int(index.get("byteStart")) and _int(index.get("byteEnd")):
        out["index"] = {"byteStart": index["byteStart"], "byteEnd": index["byteEnd"]}
    return out


def strip_refs(refs) -> list[dict]:
    kept = (strip_ref(r) for r in (refs if isinstance(refs, list) else []))
    return [r for r in kept if r is not None]


def strip_presentation(presentation) -> dict | None:
    if not isinstance(presentation, dict):
        return None
    out = _pick(presentation, ("format",))
    for key in ("venueRef", "eventRef"):
        ref = strip_ref(presentation.get(key), anchored=False)
        if ref is not None:
            out[key] = ref
    return out or None


def strip_work_ref(work) -> dict | None:
    """Deprecated #workRef on annotations: identifiers and descriptors, never `image`."""
    if not isinstance(work, dict):
        return None
    out = _pick(work, ("title", "creator", "date", "wikidata", "linkedArt", "creatorDid"))
    accession = work.get("accession")
    if isinstance(accession, dict) and _str(accession.get("institution")) \
            and _str(accession.get("id")):
        out["accession"] = _pick(accession, ("institution", "id"))
    return out


def _common(body: dict, out: dict) -> dict:
    tags = strip_tags(body.get("tags"))
    if tags:
        out["tags"] = tags
    links = strip_links(body.get("links"))
    if links:
        out["links"] = links
    refs = strip_refs(body.get("refs"))
    if refs:
        out["refs"] = refs
    return out


def strip_bead(body: dict, images: list | None = None) -> dict:
    """Public subset of a bead or annotation.

    Local `media` refs never publish; if the caller has uploaded them, they
    arrive as `images` — imageRefs carrying the blob plus alt text and
    dimensions — and are attached as given.
    """
    out = _head(body)
    for k in BEAD_FIELDS:
        if k in body:
            out[k] = body[k]
    subject = body.get("subject")
    if isinstance(subject, dict) and _str(subject.get("name")):
        out["subject"] = {"name": subject["name"]}
    if body.get("$type") == ANNOTATION:
        work = strip_work_ref(body.get("work"))
        if work is not None:
            out["work"] = work
    presentation = strip_presentation(body.get("presentation"))
    if presentation is not None:
        out["presentation"] = presentation
    _common(body, out)
    if images:
        out["images"] = images
    return out


def strip_strand(body: dict, items: list[dict] | None = None) -> dict:
    """Public subset of a strand. `items` are the published strongRefs,
    filled in at publish time; omitted for targets that bundle items inline."""
    out = _head(body)
    for k in STRAND_FIELDS:
        if k in body:
            out[k] = body[k]
    place = body.get("place")
    if isinstance(place, dict) and _str(place.get("name")):
        out["place"] = {"name": place["name"]}
    _common(body, out)
    if items is not None:
        out["items"] = items
    return out


def strip_public(body: dict) -> dict:
    """Records that are public by intent (creative claims, venue listings).

    These are written to be read by strangers, so the body publishes as
    authored — minus local-only machinery: provenance (device/app internals)
    and `media` refs that point at files on the author's own String. A venue's
    address and coordinates are the point of the record and stay.
    """
    return {k: v for k, v in body.items() if k not in ("provenance", "media")}
```

- [ ] **Step 4: Point the three Python callers at it**

```diff
--- a/string/app/publisher.py
+++ b/string/app/publisher.py
@@ -2,8 +2,7 @@
 
 The same Stage F pipeline as scripts/promote.py, running inside the
 service so the timeline can publish with one click using a held
-identity. Strip rules are identical: geo, provenance and media never
-leave; place names, notes, tags, links, works survive.
+identity. What may leave is decided in strip.py, the one canonical copy.
 """
 from __future__ import annotations
 
@@ -12,6 +11,8 @@
 import urllib.parse
 import urllib.request
 
+from .strip import strip_bead, strip_public, strip_strand  # noqa: F401 (re-exported)
+
 STRAND = "com.cultureblocs.strand"
 BEAD_TYPES = ("com.cultureblocs.bead", "com.cultureblocs.annotation")
 
@@ -39,34 +40,6 @@
         return json.loads(raw) if raw else {}
 
 
-def strip_bead(body: dict, *, images: list | None = None) -> dict:
-    """Public subset. Local `media` refs never publish; if the caller has
-    uploaded them, they arrive as `images` — imageRefs carrying the blob plus
-    the alt text and dimensions from the local record."""
-    out = {"$type": body["$type"]}
-    for k in ("createdAt", "kind", "note", "tags", "links", "work"):
-        if k in body:
-            out[k] = body[k]
-    subj = body.get("subject")
-    if isinstance(subj, dict) and subj.get("name"):
-        out["subject"] = {"name": subj["name"]}
-    if images:
-        out["images"] = images
-    return out
-
-
-def strip_strand(body: dict, items: list[dict]) -> dict:
-    out = {"$type": body["$type"]}
-    for k in ("createdAt", "title", "narrative", "day", "links"):
-        if k in body:
-            out[k] = body[k]
-    place = body.get("place")
-    if isinstance(place, dict) and place.get("name"):
-        out["place"] = {"name": place["name"]}
-    out["items"] = items
-    return out
-
-
 def content_hash(obj: dict) -> str:
     return hashlib.sha256(
         json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
@@ -152,17 +125,6 @@
 SELF_KEYED = ("com.cultureblocs.creative.profile", "com.cultureblocs.venue.profile")
 
 
-def strip_public(body: dict) -> dict:
-    """Records that are public by intent (creative claims, venue listings).
-
-    These are written to be read by strangers, so the body publishes as
-    authored — minus local-only machinery: provenance (device/app internals)
-    and `media` refs that point at files on the author's own String. A venue's
-    address and coordinates are the point of the record and stay.
-    """
-    return {k: v for k, v in body.items() if k not in ("provenance", "media")}
-
-
 def publish_record(store, record_id: str, identity: dict) -> dict:
     """Publish a single non-strand record under a held identity."""
     rec = store.get(record_id)
```

```diff
--- a/scripts/promote.py
+++ b/scripts/promote.py
@@ -39,6 +39,9 @@
 import urllib.request
 from pathlib import Path
 
+sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "string"))
+from app.strip import strip_bead, strip_strand  # noqa: E402  (the one canonical strip)
+
 STRAND = "com.cultureblocs.strand"
 BEAD_TYPES = ("com.cultureblocs.bead", "com.cultureblocs.annotation")
 
@@ -83,33 +86,6 @@
     return http(url, body=body, token=token)
 
 
-# ---------------- privacy strip ----------------
-def strip_bead(body: dict) -> dict:
-    """Public subset of a bead/annotation. Same discipline as the static
-    exporter: geo out, provenance out, media out (release one), device
-    internals out. Place names, notes, tags, links, works survive."""
-    out = {"$type": body["$type"]}
-    for k in ("createdAt", "kind", "note", "tags", "links", "work"):
-        if k in body:
-            out[k] = body[k]
-    subj = body.get("subject")
-    if isinstance(subj, dict) and subj.get("name"):
-        out["subject"] = {"name": subj["name"]}
-    return out
-
-
-def strip_strand(body: dict, items: list[dict]) -> dict:
-    out = {"$type": body["$type"]}
-    for k in ("createdAt", "title", "narrative", "day", "links"):
-        if k in body:
-            out[k] = body[k]
-    place = body.get("place")
-    if isinstance(place, dict) and place.get("name"):
-        out["place"] = {"name": place["name"]}
-    out["items"] = items                       # strongRefs, filled at publish
-    return out
-
-
 def content_hash(obj: dict) -> str:
     return hashlib.sha256(
         json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
```

```diff
--- a/scripts/export_public.py
+++ b/scripts/export_public.py
@@ -34,6 +34,9 @@
 from datetime import datetime, timezone
 from pathlib import Path
 
+sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "string"))
+from app.strip import strip_bead, strip_strand  # noqa: E402  (the one canonical strip)
+
 STRAND = "com.cultureblocs.strand"
 
 
@@ -46,29 +49,15 @@
 
 
 def strip_item(body: dict) -> dict:
-    """Public-safe subset of a bead/annotation body."""
-    out = {}
-    for k in ("$type", "createdAt", "kind", "note", "tags", "links", "work"):
-        if k in body:
-            out[k] = body[k]
-    subj = body.get("subject")
-    if isinstance(subj, dict) and subj.get("name"):
-        out["subject"] = {"name": subj["name"]}          # name yes, geo no
+    """The canonical bead strip, plus local media refs: this target is a
+    static site that copies the files alongside, not a PDS."""
+    out = strip_bead(body)
     if body.get("media"):
         out["media"] = [{"uri": m["uri"], **({"alt": m["alt"]} if m.get("alt") else {})}
                         for m in body["media"]]
     return out
 
 
-def strip_strand(body: dict) -> dict:
-    out = {k: body[k] for k in ("$type", "createdAt", "title", "narrative", "day", "links")
-           if k in body}
-    place = body.get("place")
-    if isinstance(place, dict) and place.get("name"):
-        out["place"] = {"name": place["name"]}
-    return out
-
-
 def main() -> None:
     p = argparse.ArgumentParser()
     p.add_argument("cmd", choices=["list", "export"])
```

- [ ] **Step 5: Rewrite the JS strip**

Replace `sdk/js/strip.js` with:

```js
/* The privacy strip — what leaves the machine when a record publishes.
 *
 * A port of string/app/strip.py, the canonical copy the String's publisher,
 * scripts/promote.py and scripts/export_public.py all use, so a client that
 * publishes directly (Pocket, Easel, Loom) and the String cannot disagree
 * about what is private. tests/fixtures/strip-cases.json is run by both
 * languages so they keep agreeing.
 *
 * Allow lists all the way down: a field not named here does not publish, at
 * any depth, so a new lexicon field stays private until someone decides
 * otherwise and adds a fixture saying so. Geo, provenance, device ids,
 * mintIds, local media refs and resolver bookkeeping never leave. A person
 * ref publishes only with a DID or an external identifier: a bare name may
 * be a private individual.
 *
 * CANONICAL COPY. Apps carry copies; copy outward from here.
 */

const ANNOTATION = 'com.cultureblocs.annotation';
const ROLES = ['subject', 'mention'];
const BEAD_KEEP = ['createdAt', 'kind', 'note'];
const STRAND_KEEP = ['createdAt', 'title', 'narrative', 'day'];

/* Local-only machinery on an otherwise public-by-intent record. `provenance`
 * is device and app internals; `media` points at files on the author's own
 * String, which no stranger can resolve. */
const LOCAL_ONLY = ['provenance', 'media'];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v !== '';
const list = (v) => (Array.isArray(v) ? v : []);

function pick(d, keys) {
  const out = {};
  for (const k of keys) if (str(d[k])) out[k] = d[k];
  return out;
}

function requireType(body) {
  if (!body || typeof body['$type'] !== 'string') {
    throw new Error('record body has no $type');   // Python raises KeyError here
  }
  return body['$type'];
}

/* linkRefs: uri and title only. */
export const stripLinks = (links) =>
  list(links).filter((l) => isObject(l) && str(l.uri)).map((l) => pick(l, ['uri', 'title']));

export const stripTags = (tags) => list(tags).filter(str);

/* externalIds: scheme, id and uri; entries without scheme and id are dropped. */
export const stripExternalIds = (ids) =>
  list(ids).filter((e) => isObject(e) && str(e.scheme) && str(e.id))
    .map((e) => pick(e, ['scheme', 'id', 'uri']));

/* The public form of one #ref, or null if it must not publish. `anchored` is
 * false for presentation refs, which have no text to anchor into. */
export function stripRef(ref, anchored = true) {
  if (!isObject(ref) || !str(ref.type)) return null;
  const descriptor = ref.descriptor;
  if (!isObject(descriptor) || !str(descriptor.label)) return null;
  const out = {
    type: ref.type,
    role: ROLES.includes(ref.role) ? ref.role : 'mention',
    descriptor: pick(descriptor, ['label', 'creator', 'creatorDid', 'date']),
  };
  if (str(ref.did)) out.did = ref.did;
  const ids = stripExternalIds(ref.externalIds);
  if (ids.length) out.externalIds = ids;
  if (ref.type === 'person' && !('did' in out) && !ids.length) return null;
  const index = ref.index;
  if (anchored && isObject(index) && Number.isInteger(index.byteStart) && Number.isInteger(index.byteEnd)) {
    out.index = { byteStart: index.byteStart, byteEnd: index.byteEnd };
  }
  return out;
}

export const stripRefs = (refs) => list(refs).map((r) => stripRef(r)).filter((r) => r !== null);

export function stripPresentation(presentation) {
  if (!isObject(presentation)) return null;
  const out = pick(presentation, ['format']);
  for (const key of ['venueRef', 'eventRef']) {
    const ref = stripRef(presentation[key], false);
    if (ref !== null) out[key] = ref;
  }
  return Object.keys(out).length ? out : null;
}

/* Deprecated #workRef on annotations: identifiers and descriptors, never `image`. */
export function stripWorkRef(work) {
  if (!isObject(work)) return null;
  const out = pick(work, ['title', 'creator', 'date', 'wikidata', 'linkedArt', 'creatorDid']);
  const acc = work.accession;
  if (isObject(acc) && str(acc.institution) && str(acc.id)) out.accession = pick(acc, ['institution', 'id']);
  return out;
}

function common(body, out) {
  const tags = stripTags(body.tags);
  if (tags.length) out.tags = tags;
  const links = stripLinks(body.links);
  if (links.length) out.links = links;
  const refs = stripRefs(body.refs);
  if (refs.length) out.refs = refs;
  return out;
}

/* A bead or annotation, as it publishes inside a strand.
 *
 * `subject` is reduced to its name and nothing else: the whole point is that
 * "Tate Modern" publishes while the coordinates that would place you in it
 * do not. A subject with no name drops entirely rather than publishing an
 * empty husk. `images` are imageRefs the caller has already uploaded. */
export function stripBead(body, { images = null } = {}) {
  const out = { $type: requireType(body) };
  for (const k of BEAD_KEEP) if (k in body) out[k] = body[k];
  if (isObject(body.subject) && str(body.subject.name)) out.subject = { name: body.subject.name };
  if (body.$type === ANNOTATION) {
    const work = stripWorkRef(body.work);
    if (work !== null) out.work = work;
  }
  const presentation = stripPresentation(body.presentation);
  if (presentation !== null) out.presentation = presentation;
  common(body, out);
  if (images && images.length) out.images = images;
  return out;
}

/* A strand. `items` are the at:// refs of the beads already published above
 * it — never the local spine:// uris, which is why they are passed in rather
 * than copied from the body. A target that bundles items inline (the static
 * export) passes null, and the field is omitted. */
export function stripStrand(body, items) {
  const out = { $type: requireType(body) };
  for (const k of STRAND_KEEP) if (k in body) out[k] = body[k];
  if (isObject(body.place) && str(body.place.name)) out.place = { name: body.place.name };
  common(body, out);
  if (items !== null && items !== undefined) out.items = items;
  return out;
}

/* Records that are public by intent — creative claims, venue listings,
 * calendar events. These are written to be read by strangers, so the body
 * publishes as authored, minus the local-only machinery.
 *
 * Note the asymmetry with stripBead: this is a DENY list, so a field added
 * to one of those lexicons publishes automatically. That is deliberate for
 * records whose purpose is to be read, and wrong for a diary bead — hence
 * the allow lists above. A venue's address and coordinates are the point of
 * the record and stay. */
export function stripPublic(body) {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!LOCAL_ONLY.includes(k)) out[k] = v;
  }
  return out;
}

/* The hash the String stores as publishedHash, and the shape Easel calls
 * canonicalJSON. Sorted keys, no whitespace — byte-identical to Python's
 * json.dumps(obj, sort_keys=True, separators=(",", ":")). */
export function canonicalJSON(obj) {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/* sha256 hex of the canonical form. Matches publisher.content_hash.
 * Async because WebCrypto is; Node's webcrypto satisfies the same call. */
export async function contentHash(obj) {
  const bytes = new TextEncoder().encode(canonicalJSON(obj));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 6: Say so in the README**

```diff
--- a/README.md
+++ b/README.md
@@ -119,9 +119,10 @@
     python scripts/promote.py publish <record-id> --identity venue   # listings, claims
     python scripts/promote.py status          # drift since publish
 
-What publishes: place names, notes, tags, links, works, kinds, times.
-What never leaves: geo coordinates, provenance, device ids, mintIds,
-and (release one) media. Full details in [PROMOTER.md](PROMOTER.md).
+What publishes: place names, notes, tags, links, kinds, times, and refs —
+what an entry is about. What never leaves: geo coordinates, provenance,
+device ids, mintIds, local media, and any person named only by name.
+Full details in [PROMOTER.md](PROMOTER.md).
 
 Published strands render anywhere via the embed component — live from
 a repo (`<cultureblocs-strands actor="handle">`) or from a baked export
@@ -186,10 +187,11 @@
     python -m pytest tests/
     node --test "sdk/js/test/*.test.mjs"     # and easel/, web/, catalogue/
 
-`tests/fixtures/lexicon-cases.json` and `strip-cases.json` are run by
-both languages. They are the contract between `string/app/lexicon.py`
-and `sdk/js/lexicon.js`, and between the publisher's strip and
-`sdk/js/strip.js` — change a rule and you change the fixture, and both
+`tests/fixtures/lexicon-cases.json`, `strip-cases.json` and
+`refs-cases.json` are run by both languages. They are the contract
+between `string/app/lexicon.py` and `sdk/js/lexicon.js`, between
+`string/app/strip.py` and `sdk/js/strip.js`, and between
+`string/app/refs.py` and `sdk/js/refs.js` — change a rule and you change the fixture, and both
 implementations tell you whether they still agree. The strip fixtures
 decide what leaves your machine; treat them as the tests to be most
 suspicious of.
```

- [ ] **Step 7: Run everything**

Run: `python3 -m pytest -q tests && node --test sdk/js/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `141 passed`, `# pass 86`, `# fail 0`

- [ ] **Step 8: Commit**

```bash
git add string/app/strip.py string/app/publisher.py scripts/promote.py scripts/export_public.py \
  sdk/js/strip.js sdk/js/test/strip.test.mjs tests/fixtures/strip-cases.json \
  tests/test_fixture_parity.py tests/test_one_strip.py README.md
git commit -m "fix(phase0): one allowlist strip for publisher, scripts and sdk/js; refs publish, work.image does not

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

---

### Task 5: Refs migration script and docs

**Files:**
- Create: `tests/test_migrate_refs.py`, `scripts/migrate_refs.py`
- Modify: `PROMOTER.md`, `APPVIEW.md`

**Interfaces:**
- Consumes: `refs.ANNOTATION` and `refs.mirror_annotation_work` (Task 3); PR #1's `Store(path)`, `Store.query(rtype=, limit=)` and `Store.patch(rid, fields)`.
- Produces: `migrate_refs.migrate(store) -> int` and `migrate_refs.main(db_path) -> None`.

- [ ] **Step 1: Write the test**

Create `tests/test_migrate_refs.py`:

```python
"""scripts/migrate_refs.py backfills annotation subject refs, once."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "string"))
from app.db import Store  # noqa: E402

spec = importlib.util.spec_from_file_location("migrate_refs", ROOT / "scripts/migrate_refs.py")
migrate_refs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migrate_refs)

T = "2026-09-14T10:00:00Z"


def test_backfills_annotations_once_and_leaves_beads_alone(tmp_path: Path) -> None:
    store = Store(str(tmp_path / "string.db"))
    ann, _ = store.upsert("a1", "com.cultureblocs.annotation", "ar", T,
                          {"createdAt": T, "work": {"title": "Gasholder", "wikidata": "Q1892745"}})
    bead, _ = store.upsert("b1", "com.cultureblocs.bead", "pocket", T,
                           {"createdAt": T, "kind": "watch", "work": {"title": "Severance"}})

    assert migrate_refs.migrate(store) == 1
    assert store.get(ann)["body"]["refs"] == [{
        "type": "work", "role": "subject", "descriptor": {"label": "Gasholder"},
        "externalIds": [{"scheme": "wikidata", "id": "Q1892745"}]}]
    assert "refs" not in store.get(bead)["body"]

    revision = store.get(ann)["revision"]
    assert migrate_refs.migrate(store) == 0
    assert store.get(ann)["revision"] == revision
```

- [ ] **Step 2: Run it to see it fail**

Run: `python3 -m pytest -q tests/test_migrate_refs.py`
Expected: `FileNotFoundError` for `scripts/migrate_refs.py`

- [ ] **Step 3: Write the script**

Create `scripts/migrate_refs.py`:

```python
#!/usr/bin/env python3
"""One-shot migration: give existing annotations a subject ref for their `work`.

New writes are mirrored at ingest (string/app/refs.py); this backfills
records written before refs existed. Beads need nothing: no bead carries
a #workRef subject, and the undeclared `bead.work` field is simply no
longer published.

Run with the stack STOPPED (or at least nothing writing):

    docker compose stop string
    python scripts/migrate_refs.py data/string.db
    docker compose up -d --build

Safe to re-run: a second pass finds nothing to change. A timestamped backup
copy of the database is written next to it before any change.
"""
from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "string"))
from app.db import Store  # noqa: E402
from app.refs import ANNOTATION, mirror_annotation_work  # noqa: E402


def migrate(store: Store) -> int:
    """Mirror `work` into `refs` on every annotation that lacks it. Returns the count changed."""
    changed = 0
    for rec in store.query(rtype=ANNOTATION, limit=1_000_000):
        mirrored = mirror_annotation_work(ANNOTATION, rec["body"])
        if mirrored is not rec["body"]:
            store.patch(rec["id"], {"refs": mirrored["refs"]})
            changed += 1
    return changed


def main(db_path: str) -> None:
    p = Path(db_path)
    if not p.exists():
        sys.exit(f"no database at {p}")
    backup = p.with_name(f"{p.stem}.pre-refs-{int(time.time())}{p.suffix}")
    shutil.copy2(p, backup)
    print(f"backup: {backup}")
    print(f"annotations given a subject ref: {migrate(Store(str(p)))}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: migrate_refs.py <path/to/string.db>")
    main(sys.argv[1])
```

- [ ] **Step 4: Update the docs**

```diff
--- a/PROMOTER.md
+++ b/PROMOTER.md
@@ -38,12 +38,20 @@
 
 ## What gets stripped
 
-Same discipline as the static exporter, applied for the open network:
-geo coordinates, all provenance (devices, mintIds, apps), and — release one
-only — media. Place names, notes, tags, links, works, kinds and times
-survive. The note text publishes exactly as written: selecting a strand is
-the act of consent.
+One strip, in `string/app/strip.py`, used by the publisher, this script
+and the static exporter, and mirrored for browser clients in
+`sdk/js/strip.js`. `tests/fixtures/strip-cases.json` is the specification
+both are tested against — read it for the exact rules.
 
+It is an allowlist at every depth: a field it does not name does not
+publish. Geo coordinates, all provenance (devices, mintIds, apps) and
+local media refs never leave; a work's local `image` never leaves. Place
+names, notes, tags, links, kinds and times survive, as do refs — minus
+resolver bookkeeping, and minus any person ref that has neither a DID nor
+an external identifier, because a bare name may be a private individual.
+The note text publishes exactly as written: selecting a strand is the act
+of consent.
+
 ## Known limitations (release one)
 
 - **Media now publishes**: at publish time, each bead's local photos are
```

```diff
--- a/APPVIEW.md
+++ b/APPVIEW.md
@@ -64,7 +64,11 @@
 ## What this is careful not to become
 
 - **No identity resolution beyond DIDs.** It does not join references to
-  names, emails or accounts elsewhere.
+  names, emails or accounts elsewhere. Published `refs` (LOOM.md §9) are
+  compatible with this: works, events, venues and concepts may be grouped
+  by descriptor and external identifiers, but a person ref only publishes
+  when it already carries a DID or a public identifier, so people are
+  never matched by name. The index does not group refs yet.
 - **No inference about non-publishers.** Someone who attended and
   published nothing is, correctly, invisible.
 - **Counts, not dossiers.** `/venue` returns how many people referenced
```

- [ ] **Step 5: Run every suite**

Run: `python3 -m pytest -q tests && node --test sdk/js/test/*.test.mjs easel/test/*.test.mjs web/test/*.test.mjs catalogue/test/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'`
Expected: `142 passed`, `# pass 200`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate_refs.py tests/test_migrate_refs.py PROMOTER.md APPVIEW.md
git commit -m "feat(phase0): migrate_refs backfill; document the strip and refs in the AppView

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GJ7rHU84WwdufvrwupMZaq"
```

Do **not** run the script against the real `data/string.db`, and do not push. Both wait for the user.
