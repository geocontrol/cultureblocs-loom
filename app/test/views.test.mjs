import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw } from '../ui/html.js';
import { backupReminder, dayView, monthView } from '../ui/view-thread.js';
import { mintView } from '../ui/view-mint.js';
import { publishHint, refFromFields, refsView } from '../ui/view-refs.js';
import { bodyFromFields, composeView, parseLinks } from '../ui/view-compose.js';
import { panelView } from '../ui/view-panel.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const bead = (key, extra = {}) => ({ key, type: B, rkey: key, sourceApp: 'loom', state: 'kept', createdAt: '2026-09-14T21:04:00Z',
  day: '2026-09-14', body: { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'a <b>note</b>' }, ...extra });

test('html escapes values but not nested html or raw()', () => {
  assert.equal(String(html`<p>${'<script>'}</p>`), '<p>&lt;script&gt;</p>');
  assert.equal(String(html`<p>${html`<b>${'&'}</b>`}${raw('<i>')}</p>`), '<p><b>&amp;</b><i></p>');
  assert.equal(esc(`"'`), '&quot;&#39;');
});

test('monthView lists the month and marks unsent days', () => {
  const out = String(monthView([{ day: '2026-09-14', count: 3, unsent: 1 }, { day: '2026-08-18', count: 222, unsent: 0 }],
    { month: '2026-09', today: '2026-09-14' }));
  assert.match(out, /href="#\/thread\/2026-09-14">2026-09-14 · today/);
  assert.match(out, /1 unsent/);
  assert.doesNotMatch(out, /222/);
});

test('dayView renders strands with members, proposals with keep/release, and escapes notes', () => {
  const p = bead(`${B}/p`, { state: 'proposal', sourceApp: 'scrobbler' });
  const s = { key: `${S}/s`, type: S, state: 'draft', sourceApp: 'loom', createdAt: '2026-09-14T22:00:00Z',
    body: { title: 'Sunday', narrative: 'It rained.', items: [] } };
  const out = String(dayView([{ kind: 'strand', record: s, members: [bead(`${B}/a`)] }, { kind: 'item', record: p }], { day: '2026-09-14' }));
  assert.match(out, /<a href="#\/thread\/2026-09">2026-09<\/a> \/ 2026-09-14/);
  assert.match(out, /Sunday/);
  assert.match(out, /draft/);
  assert.match(out, /a &lt;b&gt;note&lt;\/b&gt;/);
  assert.match(out, /data-action="keep"/);
  assert.match(out, /tell this/);
  assert.match(out, /has-machine/);
});

test('backup reminder appears only when unsent work is at risk', () => {
  const now = Date.parse('2026-09-15T00:00:00Z');
  assert.equal(backupReminder({ unsent: 0, lastBackupAt: null, now }), null);
  assert.equal(backupReminder({ unsent: 3, lastBackupAt: '2026-09-14T00:00:00Z', now }), null);
  assert.match(backupReminder({ unsent: 3, lastBackupAt: null, now }), /never backed up/);
  assert.match(backupReminder({ unsent: 25, lastBackupAt: '2026-09-14T00:00:00Z', now }), /25 records/);
  assert.match(backupReminder({ unsent: 1, lastBackupAt: '2026-09-01T00:00:00Z', now }), /14 days ago/);
});

test('mintView shows the chosen mask and the last mint', () => {
  const out = String(mintView({ mask: 'ART', last: bead(`${B}/x`) }));
  assert.match(out, /aria-checked="true" data-action="mask" data-mask="ART"/);
  assert.match(out, /minted visit at 21:04/);
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

test('compose round-trips a strand and a bead through its fields', () => {
  assert.deepEqual(parseLinks('https://a.test | A | B\n\nhttps://b.test'), [{ uri: 'https://a.test', title: 'A | B' }, { uri: 'https://b.test' }]);
  const strand = bodyFromFields(S, { $type: S, createdAt: 'x', items: [] },
    { title: ' Sunday ', day: '2026-09-14', text: 'It rained.', place: 'Peckham', links: '' });
  assert.deepEqual(strand, { $type: S, createdAt: 'x', items: [], title: 'Sunday', day: '2026-09-14T00:00:00Z', narrative: 'It rained.', place: { name: 'Peckham' } });
  const b = bodyFromFields(B, { $type: B, kind: 'bloc', media: [{ uri: '/media/x.jpg', alt: 'old' }], subject: { uri: 'at://x' } },
    { kind: 'read', text: '', place: '', links: '', 'alt-0': 'new alt' });
  assert.deepEqual(b, { $type: B, kind: 'read', media: [{ uri: '/media/x.jpg', alt: 'new alt' }], subject: { uri: 'at://x' } });
  const out = String(composeView({ record: { type: S, state: 'draft', day: '2026-09-14', origin: 'compose' }, body: strand,
    problems: ['$.x: bad'], dayBeads: [bead(`${B}/a`)] }));
  assert.match(out, /save as told/);
  assert.match(out, /disabled/);
  assert.match(out, /\$\.x: bad/);
  assert.match(out, /include<\/button>/);
});

test('panelView shows counts and disables send when nothing is unsent', () => {
  const out = String(panelView({ unsent: 0, localChanges: 2, persisted: false }));
  assert.match(out, /data-action="send" disabled/);
  assert.match(out, /2 local changes/);
  assert.match(out, /not marked persistent/);
});
