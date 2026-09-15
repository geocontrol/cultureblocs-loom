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
