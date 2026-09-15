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
