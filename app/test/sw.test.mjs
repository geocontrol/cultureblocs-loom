/* The service worker must cache every module the app can import, or Loom
 * breaks offline the first time a new module is added and not listed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './helpers.mjs';

const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
const shell = JSON.parse(`[${/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);
const ROOT = ['./', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const modules = (dir) => readdirSync(join(APP, dir)).filter((f) => f.endsWith('.js')).map((f) => `./${dir}/${f}`);

test('SHELL lists exactly the root shell files and every module under lib, ui and vendor', () => {
  const expected = [...ROOT, ...modules('lib'), ...modules('ui'), ...modules('vendor')].sort();
  assert.deepEqual([...shell].sort(), expected);
});

test('the cache version is bumped and install bypasses the HTTP cache', () => {
  assert.match(sw, /const VERSION = 'loom-2';/);
  assert.match(sw, /cache: 'reload'/);
});
