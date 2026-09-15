// Shared test fixtures: a registry from the vendored lexicons, a memory store,
// and deterministic clocks.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAD, STRAND } from '../lib/envelope.js';
import { loadRegistry } from '../lib/lexicons.js';

export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readJson = async (path) => JSON.parse(readFileSync(join(APP, path), 'utf8'));

export const registry = () => loadRegistry(readJson, 'vendor/lexicons/');

/* A clock that advances 1 ms per call, starting at `start`. */
export function steppingNow(start = Date.parse('2026-09-15T09:00:00Z')) {
  let t = start;
  return () => (t += 1);
}

/* A bead and a strand made the way the desk makes them: whole, in one save. */
export const makeBead = (loom, body = {}, opts) => loom.createBead(loom.newKey(BEAD), { kind: 'bloc', ...body }, opts);
export const makeStrand = (loom, body = {}) => loom.createStrand(loom.newKey(STRAND), { day: '2026-09-15T00:00:00Z', items: [], ...body });
