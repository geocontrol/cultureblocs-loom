import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryList, monthGrid } from '../lib/day.js';
import { beadFormView } from '../ui/view-bead.js';
import { bodyFromFields, footerView, fromLocalInput, localInput, parseLinks, parseTags, provenanceView, readOnlyView } from '../ui/view-form.js';
import { conflictView, dayView, deleteView, deletedView, sendView, settingsView, topbarView } from '../ui/view-panels.js';
import { strandFormView } from '../ui/view-strand.js';
import { dayLabel, monthLabel, stringColumnView } from '../ui/view-string.js';

const B = 'com.cultureblocs.bead', S = 'com.cultureblocs.strand';
const bead = (key, extra = {}) => ({ key, type: B, rkey: key, sourceApp: 'loom', state: 'kept', createdAt: '2026-09-14T21:04:00Z',
  day: '2026-09-14', body: { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'a <b>note</b>' }, ...extra });
const strand = (key, extra = {}) => ({ key, type: S, rkey: key, sourceApp: 'loom', state: 'kept', createdAt: '2026-09-15T08:00:00Z',
  day: '2026-09-14', body: { $type: S, createdAt: '2026-09-15T08:00:00Z', day: '2026-09-14T00:00:00Z', title: 'Sunday', items: [] }, ...extra });
const column = (records, extra = {}) => String(stringColumnView({ month: '2026-09', selectedDay: '2026-09-14', today: '2026-09-15',
  weeks: monthGrid('2026-09', new Map([['2026-09-14', records.length]])), days: entryList(records), apps: ['loom', 'rounds'], ...extra }));

test('localInput and fromLocalInput round-trip a time through this browser’s zone, and refuse nonsense', () => {
  const iso = '2026-09-14T18:30:00.000Z';
  assert.equal(fromLocalInput(localInput(iso)), iso);
  assert.match(localInput(iso), /^2026-09-1[45]T\d\d:30$/);
  assert.equal(localInput('not a date'), '');
  assert.equal(fromLocalInput(''), null);
});

test('parseLinks and parseTags read their text fields', () => {
  assert.deepEqual(parseLinks(' https://a.test | A | b \n\nhttps://b.test'), [{ uri: 'https://a.test', title: 'A | b' }, { uri: 'https://b.test' }]);
  assert.deepEqual(parseTags(' jazz, live ,, ,emf '), ['jazz', 'live', 'emf']);
});

test('bodyFromFields writes a bead: kind, when, note, tags, place, alt text; empty fields are removed', () => {
  const prev = { $type: B, createdAt: '2026-09-14T21:04:00Z', kind: 'visit', note: 'old', tags: ['a'], subject: { name: 'Old place', geo: { lat: 1, lng: 2, precision: 'city' } },
    media: [{ uri: '/media/x.jpg', alt: 'old alt' }], links: [{ uri: 'https://x.test' }], provenance: { app: 'loom', mintedAt: '2026-09-14T21:04:00Z' } };
  const when = localInput('2026-09-13T10:00:00Z');
  const body = bodyFromFields(B, prev, { kind: 'listen', when, text: 'new note', tags: 'jazz, live', place: 'Café OTO', links: '', 'alt-0': ' red ' });
  assert.deepEqual(body, { $type: B, createdAt: '2026-09-13T10:00:00.000Z', kind: 'listen', note: 'new note', tags: ['jazz', 'live'],
    subject: { name: 'Café OTO', geo: { lat: 1, lng: 2, precision: 'city' } }, media: [{ uri: '/media/x.jpg', alt: 'red' }],
    provenance: { app: 'loom', mintedAt: '2026-09-14T21:04:00Z' } });
  const cleared = bodyFromFields(B, body, { kind: 'listen', when, text: '', tags: '', place: '', links: '', 'alt-0': '' });
  assert.deepEqual(Object.keys(cleared).sort(), ['$type', 'createdAt', 'kind', 'media', 'provenance', 'subject']);
  assert.deepEqual(cleared.subject, { geo: { lat: 1, lng: 2, precision: 'city' } }, 'a place without its name keeps its coordinates');
  const ref = { uri: 'at://did:plc:x/com.cultureblocs.event/1', cid: 'c' };
  assert.deepEqual(bodyFromFields(B, { ...prev, subject: ref }, { place: 'ignored' }).subject, ref, 'a record subject is not a place');
});

test('bodyFromFields writes a strand: title, day, narrative, place, links', () => {
  const prev = { $type: S, createdAt: '2026-09-15T08:00:00Z', items: [{ uri: 'loom://b/1' }] };
  assert.deepEqual(bodyFromFields(S, prev, { title: ' Sunday ', day: '2026-09-14', text: 'We went', place: 'Tate', links: 'https://tate.test | Tate' }), {
    $type: S, createdAt: '2026-09-15T08:00:00Z', items: [{ uri: 'loom://b/1' }], title: 'Sunday', day: '2026-09-14T00:00:00Z',
    narrative: 'We went', place: { name: 'Tate' }, links: [{ uri: 'https://tate.test', title: 'Tate' }] });
});

test('the bead form shows every field, escapes content, and knows new from existing', () => {
  const r = bead(`${B}/a`, { stringId: 's1', body: { ...bead('x').body, tags: ['jazz'], subject: { name: 'Tate <Modern>' },
    geo: { lat: 51.5, lng: -0.1, precision: 'city' }, provenance: { app: 'rounds', mintedAt: '2026-09-14T21:04:00Z' } } });
  const out = String(beadFormView({ record: r, body: r.body, problems: [], dirtyDraft: true }));
  assert.match(out, /<h2>Bead<\/h2>/);
  assert.match(out, /<option selected>visit<\/option>/);
  assert.match(out, /name="when" value="2026-09-1\dT\d\d:04"/);
  assert.match(out, /a &lt;b&gt;note&lt;\/b&gt;/);
  assert.match(out, /value="jazz"/);
  assert.match(out, /Tate &lt;Modern&gt;/);
  assert.match(out, /coordinates 51.5, -0.1 \(city\)/);
  assert.match(out, /made in rounds · 2026-09-14 21:04 · on the String/);
  assert.match(out, /data-action="delete"/);
  assert.match(out, /discard changes/);
  const fresh = String(beadFormView({ record: null, body: { kind: 'bloc' }, problems: ['$.note: too long'] }));
  assert.match(fresh, /<h2>New bead<\/h2>/);
  assert.match(fresh, /made in Loom when you save it/);
  assert.doesNotMatch(fresh, /data-action="delete"/);
  assert.match(fresh, /data-action="save" disabled/);
  assert.match(fresh, /\$\.note: too long/);
  const odd = String(beadFormView({ record: null, body: { kind: 'x"><script>', tags: 'nope', media: {}, links: 'l', refs: 7 } }));
  assert.match(odd, /<option value="" selected>x&quot;&gt;&lt;script&gt;<\/option>/);
});

test('a proposal says saving keeps it', () => {
  const r = bead(`${B}/p`, { state: 'proposal' });
  assert.match(String(beadFormView({ record: r, body: r.body })), /proposal — saving keeps it/);
});

test('the strand form lists its beads in order with move and remove, and names items it cannot find', () => {
  const a = bead(`${B}/a`, { body: { ...bead('x').body, note: 'first bead' } });
  const s = strand(`${S}/s`, { body: { ...strand('x').body, narrative: 'We went', items: [{ uri: `loom://${B}/a` }, { uri: `loom://${B}/gone` }, { uri: 'spine://records/zz' }] } });
  const out = String(strandFormView({ record: s, body: s.body, members: new Map([[a.key, a]]) }));
  assert.match(out, /<h2>Strand<\/h2>/);
  assert.match(out, /value="Sunday"/);
  assert.match(out, /name="day" value="2026-09-14"/);
  assert.match(out, /2026-09-14 21:04 visit first bead/);
  assert.match(out, /com.cultureblocs.bead\/gone \(not in this browser\)/);
  assert.match(out, /spine:\/\/records\/zz/);
  assert.match(out, /data-item="0">[\s\S]*?data-action="item-up" aria-label="move up" disabled/);
  assert.match(out, /data-item="2">[\s\S]*?data-action="item-down" aria-label="move down" disabled/);
  assert.match(String(strandFormView({ record: null, body: { items: 'nope' } })), /No beads yet/);
});

test('provenance, footer and read-only views', () => {
  assert.match(String(provenanceView(bead('k', { body: {} }))), /made in loom · only in this browser/);
  assert.doesNotMatch(String(footerView({ record: null })), /discard/);
  assert.match(String(footerView({ record: null, dirtyDraft: true })), /discard this draft/);
  assert.match(String(readOnlyView({ type: 'com.cultureblocs.annotation', day: '2026-09-14', body: { note: '<x>' } })), /Annotations arrive from the AR app[\s\S]*&lt;x&gt;/);
});

test('the String column: buttons, filter, calendar and rows with their markers', () => {
  const photo = bead(`${B}/p`, { body: { ...bead('x').body, media: [{ uri: '/media/a.jpg' }] }, missing: ['a.jpg'] });
  const proposal = bead(`${B}/q`, { state: 'proposal', sourceApp: 'rounds', stringId: 'q', createdAt: '2026-09-14T09:00:00Z' });
  const conflicted = bead(`${B}/c`, { conflict: { theirs: null }, problems: ['no'], createdAt: '2026-09-14T08:00:00Z' });
  const out = column([photo, proposal, conflicted], { pending: new Map([[photo.key, 'new'], [conflicted.key, 'edit']]),
    selectedKey: photo.key, filter: { text: 'x"y', kind: 'visit', app: 'rounds' }, drafts: new Set([proposal.key]) });
  assert.match(out, /href="#\/new\/bead"/);
  assert.match(out, /href="#\/new\/strand"/);
  assert.match(out, /value="x&quot;y"/);
  assert.match(out, /<option selected>visit<\/option>/);
  assert.match(out, /<option selected>rounds<\/option>/);
  assert.match(out, /September 2026/);
  assert.match(out, /<a href="#\/day\/2026-09-14" class="has on"/);
  assert.match(out, /class="today"/);
  assert.match(out, /Mon 14 Sep 2026/);
  assert.match(out, /class="row on" data-key="com.cultureblocs.bead\/p"/);
  assert.match(out, /mark photo[\s\S]*?mark pending">not sent[\s\S]*?mark missing/);
  assert.match(out, /data-key="com.cultureblocs.bead\/q"[\s\S]*?mark proposal[\s\S]*?mark draft">unsaved[\s\S]*?data-action="keep"[\s\S]*?data-action="release"/);
  assert.match(out, /data-key="com.cultureblocs.bead\/c"[\s\S]*?mark pending">changed[\s\S]*?mark conflict[\s\S]*?mark invalid/);
  assert.doesNotMatch(out, /data-action="tick"/);
});

test('tick boxes appear on bead rows only while a strand is open, checked for its items', () => {
  const a = bead(`${B}/a`), b = bead(`${B}/b`), s = strand(`${S}/s`);
  const out = column([a, b, s], { ticked: new Set([a.key]),
    drafts: new Set(), days: entryList([a, b, s], { drafts: [{ key: `${B}/new`, type: B, body: { note: 'half' }, at: 'x' }], today: '2026-09-14' }) });
  assert.match(out, /Tick beads/);
  assert.match(out, /data-key="com.cultureblocs.bead\/a"[^>]*>\s*<input type="checkbox" data-action="tick" aria-label="in this strand" checked>/);
  assert.match(out, /data-key="com.cultureblocs.bead\/b"[^>]*>\s*<input type="checkbox" data-action="tick" aria-label="in this strand" >/);
  assert.doesNotMatch(out, /data-key="com.cultureblocs.strand\/s"[^>]*>\s*<input/);
  assert.doesNotMatch(out, /data-key="com.cultureblocs.bead\/new"[^>]*>\s*<input/);
  assert.match(out, /data-key="com.cultureblocs.bead\/new"[\s\S]*?mark draft">draft/);
});

test('an imported kind cannot inject CSS: an unknown kind is coloured as bloc', () => {
  const evil = bead(`${B}/e`, { body: { kind: 'x);background:url(//evil.test/p' } });
  const out = column([evil, strand(`${S}/s`)]);
  assert.match(out, /data-kind="bloc"/);
  assert.match(out, /data-kind="strand"/);
  assert.doesNotMatch(out, /data-kind="x\)/);
});

test('an empty column says why', () => {
  assert.match(column([]), /Nothing on your String yet/);
  assert.match(column([], { filter: { text: 'x' } }), /Nothing matches the filter/);
});

test('month and day labels', () => {
  assert.equal(monthLabel('2026-01'), 'January 2026');
  assert.equal(dayLabel('2026-09-14'), 'Mon 14 Sep 2026');
  assert.equal(dayLabel('nonsense'), 'nonsense');
});

test('day view, delete confirmation and conflict view say what will happen', () => {
  const a = bead(`${B}/a`);
  assert.match(String(dayView({ day: '2026-09-14', records: [a] })), /21:04 visit — a &lt;b&gt;note[\s\S]*#\/new\/bead\?day=2026-09-14/);
  assert.match(String(dayView({ day: '2026-09-14' })), /Nothing on your String for this day/);
  const del = String(deleteView({ record: a, onString: true, strands: [strand(`${S}/s`)] }));
  assert.match(del, /Delete this bead — “a &lt;b&gt;note&lt;\/b&gt;”\?/);
  assert.match(del, /deleted from the String on the next Send/);
  assert.match(del, /taken out of 1 strand:[\s\S]*Sunday/);
  assert.match(String(deleteView({ record: { ...a, state: 'proposal' } })), /Delete this proposal[\s\S]*gone at once/);
  const long = { ...a, body: { ...a.body, note: 'word '.repeat(40) } };
  assert.match(String(deleteView({ record: long })), /“(word ){15}word…”/, 'a long note is cut to one line');
  assert.match(String(deletedView({ ...a, deleted: true })), /“a &lt;b&gt;note&lt;\/b&gt;” is deleted here[\s\S]*data-action="undo-delete"/);

  const fields = [{ field: 'note', mine: 'mine', theirs: '<theirs>' }, { field: 'tags', mine: undefined, theirs: ['x'] }];
  const both = String(conflictView({ fields }));
  assert.match(both, /<th scope="row">note<\/th><td><pre>mine<\/pre><\/td><td><pre>&lt;theirs&gt;<\/pre>/);
  assert.match(both, /<pre>—<\/pre>/);
  assert.match(both, /data-action="keep-mine">keep mine<[\s\S]*data-action="take-theirs">take the String’s</);
  assert.match(String(conflictView({ theirs: false })), /no longer has this record[\s\S]*keep mine \(send it again\)[\s\S]*let it go/);
  const gone = String(conflictView({ theirs: false, deleted: true }));
  assert.match(gone, /deleted it here too[\s\S]*let it go/);
  assert.doesNotMatch(gone, /take-theirs/);
  assert.match(String(conflictView({ fields, deleted: true })), /You deleted this here[\s\S]*delete it anyway/);
  assert.match(String(conflictView({ fields, armed: true })), /data-action="take-theirs">press again: yours is replaced</);
});

test('top bar: not connected, changes to send, in sync, sending', () => {
  assert.match(String(topbarView({})), /href="#\/settings">not connected/);
  assert.doesNotMatch(String(topbarView({})), /data-action="send"/);
  assert.match(String(topbarView({ connected: true, pending: 3 })), /3 changes to send[\s\S]*data-action="send" >send/);
  assert.match(String(topbarView({ connected: true, pending: 1 })), /1 change to send/);
  assert.match(String(topbarView({ connected: true })), /in sync[\s\S]*data-action="send" disabled/);
  assert.match(String(topbarView({ connected: true, pending: 2, busy: true })), /disabled>sending…/);
});

test('the Send page lists changes, deletes to undo, and the last results with reasons', () => {
  const lines = new Map([['k1', 'first <b>'], ['k2', 'second']]);
  const out = String(sendView({ connected: true, lines, changes: [{ key: 'k1', change: 'edit' }], deletes: [{ key: 'k2' }],
    results: [{ key: 'k1', op: 'patch', status: 'conflict', reason: 'changed on the String' }, { key: 'k2', op: 'post', status: 'invalid', problems: ['a', 'b'] }] }));
  assert.match(out, /edit — first &lt;b&gt;/);
  assert.match(out, /data-key="k2">second <button type="button" data-action="undo-delete">/);
  assert.match(out, /conflict \(edit\): first &lt;b&gt;<\/a> — changed on the String/);
  assert.match(out, /refused \(new\): second<\/a> — a; b/);
  assert.match(String(sendView({})), /settings<\/a> first/);
  assert.match(String(sendView({ connected: true })), /data-action="send" disabled/);
});

test('settings: restore cannot be confirmed while an import or send is running', () => {
  const s = { pendingRestore: { fileName: 'b.json', records: 1, unsent: 0, incoming: 1 } };
  assert.doesNotMatch(String(settingsView({ ...s, busy: false })), /data-action="restore-confirm" disabled/);
  assert.match(String(settingsView({ ...s, busy: true })), /data-action="restore-confirm" disabled/);
  assert.match(String(settingsView({ pending: 2 })), /2 changes not yet sent/);
});

test('no desk view carries an inline style or an inline event handler (the CSP forbids both)', () => {
  const a = bead(`${B}/a`), s = strand(`${S}/s`);
  const outs = [
    beadFormView({ record: a, body: a.body }), strandFormView({ record: s, body: s.body }), column([a, s], { ticked: new Set() }),
    dayView({ day: '2026-09-14', records: [a] }), deleteView({ record: a }), deletedView(a), conflictView({ fields: [{ field: 'note', mine: 1, theirs: 2 }] }),
    topbarView({ connected: true, pending: 1 }), sendView({ changes: [{ key: 'k', change: 'new' }] }), settingsView({}), readOnlyView(a),
  ].map(String);
  for (const out of outs) assert.doesNotMatch(out, /\sstyle=|\son[a-z]+=/);
});
