import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemStore } from '../lib/memstore.js';
import { storeContract } from './store-contract.js';

for (const [name, run] of Object.entries(storeContract)) {
  test(`memstore: ${name}`, () => run(createMemStore(), assert));
}
