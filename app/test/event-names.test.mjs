import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutLabel, matches, summary } from '../lib/day.js';
import { beadFormView } from '../ui/view-bead.js';
import { bodyFromFields } from '../ui/view-form.js';

const B = 'com.cultureblocs.bead';
const EVENT = 'at://did:plc:l3726um33xesakwqhjkkpoet/community.lexicon.calendar.event/3mxbvhgf6zcin';
/* A bead as the "I saw" page wrote it before it named the film anywhere but the link. */
const older = (note) => ({ $type: B, kind: 'screening', createdAt: '2026-10-12T12:00:00.000Z',
  subject: { $type: 'com.cultureblocs.defs#strongRef', uri: EVENT, cid: 'bafy' },
  links: [{ uri: 'https://www.cultureblocs.com/events/london-film-festival/14th/', title: '14th' }],
  ...(note ? { note } : {}), provenance: { app: 'cultureblocs-went', mintedAt: '2026-10-12T21:00:00.000Z', timeAnchored: false } });
const newer = (note) => ({ ...older(note), refs: [{ type: 'work', role: 'subject', descriptor: { label: '14th', date: '2026' } }] });

test('a bead pointing at an event or film is listed by its name', () => {
  assert.equal(summary(B, older()), '14th');
  assert.equal(summary(B, older('Extraordinary')), '14th — Extraordinary');
  assert.equal(summary(B, newer('Extraordinary')), '14th — Extraordinary');
  assert.equal(aboutLabel(older()), '14th');
});

test('a bead about a place still reads as its note, as before', () => {
  const body = { $type: B, kind: 'visit', note: 'Busy', subject: { name: 'Tate Modern' } };
  assert.equal(summary(B, body), 'Busy');
  assert.equal(summary(B, { ...body, note: undefined }), 'Tate Modern');
});

test('the filter finds a bead by the film in its link', () => {
  assert.ok(matches({ type: B, body: older() }, { text: '14th' }));
});

test('the form names what the bead is about and does not offer to rename it as a place', () => {
  const out = String(beadFormView({ body: older('Extraordinary') }));
  assert.match(out, /<p class="about">[\s\S]*<strong>14th<\/strong>/);
  assert.doesNotMatch(out, /name="place"/);
  // Saving the form leaves the strongRef alone.
  const after = bodyFromFields(B, older('Extraordinary'), { kind: 'screening', text: 'Extraordinary', tags: '', links: 'https://www.cultureblocs.com/events/london-film-festival/14th/ | 14th' });
  assert.equal(after.subject.uri, EVENT);
});
