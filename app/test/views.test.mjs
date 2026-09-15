import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw } from '../ui/html.js';
import { publishHint, refFromFields, refsView } from '../ui/view-refs.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './helpers.mjs';

test('html escapes values but not nested html or raw()', () => {
  assert.equal(String(html`<p>${'<script>'}</p>`), '<p>&lt;script&gt;</p>');
  assert.equal(String(html`<p>${html`<b>${'&'}</b>`}${raw('<i>')}</p>`), '<p><b>&amp;</b><i></p>');
  assert.equal(esc(`"'`), '&quot;&#39;');
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

test('refs render when an imported ref carries externalIds that are not a list', () => {
  assert.doesNotThrow(() => String(refsView([{ type: 'work', role: 'subject', descriptor: { label: 'X' }, externalIds: 'wikidata:Q1' }], 'X')));
  assert.doesNotThrow(() => String(refsView([{ type: 'work', role: 'subject', descriptor: { label: 'X' }, externalIds: [null, 7] }], 'X')));
  assert.doesNotThrow(() => String(refsView('not a list', 'X')));
});

test('the refs editor carries no inline styles or inline event handlers (the CSP forbids both)', () => {
  const out = String(refsView([{ type: 'work', role: 'subject', descriptor: { label: 'X' }, index: { byteStart: 0, byteEnd: 1 } }], 'X'));
  assert.doesNotMatch(out, /\sstyle=|\son[a-z]+=/);
});

test('index.html declares the content security policy', () => {
  const page = readFileSync(join(APP, 'index.html'), 'utf8');
  assert.match(page, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src \*; worker-src 'self'; manifest-src 'self'">/);
});
