import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downscaleDims } from '../lib/images.js';

test('photos larger than the maximum edge scale down, keeping their shape', () => {
  assert.deepEqual(downscaleDims(4000, 3000), { width: 2000, height: 1500 });
  assert.deepEqual(downscaleDims(1200, 4800), { width: 500, height: 2000 });
  assert.deepEqual(downscaleDims(800, 600), { width: 800, height: 600 });
});
