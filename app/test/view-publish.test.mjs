import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishView } from '../ui/view-publish.js';

const S = 'com.cultureblocs.strand';
const IDENTITIES = [{ name: 'personal', handle: 'someone.example', pds: 'https://bsky.social' }];

const strand = (extra = {}) => ({ key: `${S}/abc`, type: S, state: 'kept', stringId: 'sid-1',
  day: '2026-09-15', body: { $type: S, title: 'A day out', items: [] }, ...extra });

const view = (state) => String(publishView({ identities: IDENTITIES, ...state }));

test('a strand on the String offers publish, naming who it would speak as', () => {
  const html = view({ record: strand() });
  assert.match(html, /data-action="publish"/);
  assert.match(html, /someone\.example/);
  assert.ok(!html.includes('data-action="unpublish"'), 'nothing to withdraw yet');
});

test('a strand not yet on the String says to send it first, and offers no publish', () => {
  const html = view({ record: strand({ stringId: undefined }) });
  assert.match(html, /send it first/i);
  assert.ok(!html.includes('data-action="publish"'));
});

test('a published strand shows where it went, and offers republish and unpublish', () => {
  const html = view({ record: strand({ publishedUri: 'at://did:plc:x/com.cultureblocs.strand/s1' }) });
  assert.match(html, /at:\/\/did:plc:x\/com\.cultureblocs\.strand\/s1/);
  assert.match(html, /data-action="publish"/, 'republish is the same action');
  assert.match(html, /republish/);
  assert.match(html, /data-action="unpublish"/);
});

test('with no identity held, publishing is not offered and the reason says so', () => {
  const html = view({ record: strand(), identities: [] });
  assert.ok(!html.includes('data-action="publish"'));
  assert.match(html, /no identit/i);
});

test('more than one identity is a choice, with none silently assumed', () => {
  const html = view({ record: strand(),
    identities: [...IDENTITIES, { name: 'work', handle: 'work.example' }] });
  assert.match(html, /<select name="identity"/);
  assert.match(html, /work\.example/);
});

test('a single identity needs no picker', () => {
  assert.ok(!view({ record: strand() }).includes('<select name="identity"'));
});

test('while publishing, the buttons are disabled and the wait is explained', () => {
  const html = view({ record: strand(), busy: true });
  assert.match(html, /disabled/);
  assert.match(html, /publishing…/);
  assert.match(html, /photo|slow|minute|while/i, 'the person is told why this takes time');
});

test('a bead is not a publishing surface at all', () => {
  assert.equal(view({ record: { key: 'com.cultureblocs.bead/b1', type: 'com.cultureblocs.bead', stringId: 'sid-2' } }), '');
});

test('the public URI is escaped, not injected', () => {
  const html = view({ record: strand({ publishedUri: 'at://x/"><script>alert(1)</script>' }) });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;|&quot;/);
});

test('a String that could not be asked who it speaks as says so, and offers no publish', () => {
  const html = view({ record: strand(), identities: [], error: 'unreachable (offline)' });
  assert.ok(!html.includes('data-action="publish"'));
  assert.match(html, /unreachable \(offline\)/);
  assert.ok(!/no identit/i.test(html), 'an unreachable String is not the same as one holding none');
});
