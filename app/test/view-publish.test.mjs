import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishView, counterView, destinationLabel, postLimit, postReady, syndicationNotice } from '../ui/view-publish.js';

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

test('the chosen identity keeps its selected option', () => {
  const html = view({ record: strand(),
    identities: [...IDENTITIES, { name: 'work', handle: 'work.example' }], identity: 'work' });
  assert.match(html, /<option value="work" selected>work\.example<\/option>/);
  assert.ok(!/<option value="personal"[^>]* selected/.test(html));
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

const BLUESKY = { name: 'bluesky', limits: { text: 300, images: 4, wants_link: false } };
const TINY = { name: 'tiny', limits: { text: 10, images: 1, wants_link: true } };

test('each unused destination is a checkbox, unticked by default, with no text box yet', () => {
  const html = view({ record: strand(), destinations: [BLUESKY] });
  assert.match(html, /type="checkbox" name="destination" value="bluesky"/);
  assert.match(html, /Bluesky/);
  assert.ok(!/checked/.test(html));
  assert.ok(!html.includes('name="postText"'), 'no text box until something is ticked');
});

test('ticking a destination shows the text box with its text and a counter', () => {
  const html = view({ record: strand(), destinations: [BLUESKY], ticked: ['bluesky'], postText: 'A day out' });
  assert.match(html, /value="bluesky" checked/);
  assert.match(html, /<textarea name="postText"[^>]*>A day out<\/textarea>/);
  assert.match(html, /9 \/ 300/);
});

test('the counter is sized from the smallest ticked destination, and over it publish is disabled', () => {
  const html = view({ record: strand(), destinations: [BLUESKY, TINY], ticked: ['bluesky', 'tiny'], postText: 'eleven char' });
  assert.match(html, /class="counter over">11 \/ 10/);
  assert.match(html, /data-action="publish" disabled/);
});

test('a cleared text box disables publish rather than posting nothing', () => {
  const html = view({ record: strand(), destinations: [BLUESKY], ticked: ['bluesky'], postText: '   ' });
  assert.match(html, /data-action="publish" disabled/);
});

test('a destination already used is a link to the post, not a checkbox', () => {
  const html = view({ record: strand({ publishedUri: 'at://x/s/1',
    syndications: [{ destination: 'bluesky', remoteUrl: 'https://bsky.app/profile/me/post/3p', postedAt: 't' }] }),
  destinations: [BLUESKY] });
  assert.match(html, /<a class="posted" href="https:\/\/bsky\.app\/profile\/me\/post\/3p"[^>]*>posted to Bluesky<\/a>/);
  assert.ok(!html.includes('value="bluesky"'), 'no second chance to double-post');
});

test('a non-http(s) remoteUrl is shown as a chip, not a link', () => {
  const html = view({ record: strand({ publishedUri: 'at://x/s/1',
    syndications: [{ destination: 'bluesky', remoteUrl: 'javascript:alert(1)', postedAt: 't' }] }),
  destinations: [BLUESKY] });
  assert.ok(!html.includes('<a'), 'no link for a non-http(s) URL');
  assert.match(html, /<span class="chip published">posted to Bluesky<\/span>/);
});

test('with no destinations on offer the block is exactly as before', () => {
  const html = view({ record: strand(), destinations: [] });
  assert.ok(!html.includes('name="destination"'));
  assert.ok(!html.includes('Also post to'));
});

test('the notice from the last publish is shown', () => {
  assert.match(view({ record: strand(), notice: 'posted to Bluesky' }), /role="status">posted to Bluesky/);
});

test('helpers: labels, limits, readiness, counter', () => {
  assert.equal(destinationLabel('bluesky'), 'Bluesky');
  assert.equal(postLimit([BLUESKY, TINY], []), null);
  assert.equal(postLimit([BLUESKY, TINY], ['bluesky']), 300);
  assert.equal(postLimit([BLUESKY, TINY], ['bluesky', 'tiny']), 10);
  assert.equal(postReady('', null), true, 'nothing ticked, nothing to check');
  assert.equal(postReady('', 300), false);
  assert.equal(postReady('🎭'.repeat(10), 10), true, 'code points, not UTF-16 units');
  assert.equal(postReady('🎭'.repeat(11), 10), false);
  assert.equal(String(counterView('🎭🎭', 300)), '<span class="counter">2 / 300</span>');
});

test('syndicationNotice says what happened to each destination', () => {
  assert.equal(syndicationNotice([]), '');
  assert.equal(syndicationNotice(undefined), '');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 0 }]), 'Posted to Bluesky.');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 1 }]),
    'Posted to Bluesky (1 image left out).');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 2 }]),
    'Posted to Bluesky (2 images left out).');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'already' }]),
    'Already posted to Bluesky, so not posted again.');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'failed', reason: 'bsky is down' }]),
    'Published, but Bluesky failed: bsky is down. It can be tried again.');
});

test('syndicationNotice appends a warning from a posted result', () => {
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 0,
    warning: 'the String could not record it' }]),
  'Posted to Bluesky, but the String could not record it.');
  assert.equal(syndicationNotice([{ destination: 'bluesky', status: 'posted', droppedImages: 2,
    warning: 'do not post it again' }]),
  'Posted to Bluesky (2 images left out), but do not post it again.');
});
