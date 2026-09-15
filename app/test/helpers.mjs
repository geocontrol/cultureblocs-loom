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
