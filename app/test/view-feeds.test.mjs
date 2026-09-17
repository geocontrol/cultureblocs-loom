import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedsView } from '../ui/view-feeds.js';

const view = (s) => String(feedsView({ serial: true, ...s }));

test('a browser without Web Serial is offered the paste box instead of a connect button', () => {
  const html = view({ serial: false });
  assert.ok(!html.includes('data-action="connect"'));
  assert.match(html, /data-action="paste"/);
  assert.match(html, /Firefox|Safari|cannot talk/i);
});

test('before connecting, connect is the only device action', () => {
  const html = view({ connected: false });
  assert.match(html, /data-action="connect"/);
  assert.ok(!html.includes('data-action="pull"'));
  assert.ok(!html.includes('data-action="clear"'));
});

test('once connected, the totem can be pulled', () => {
  const html = view({ connected: true });
  assert.match(html, /data-action="pull"/);
});

test('a pull reports what arrived, and offers the clear (armed, not yet confirmed)', () => {
  const html = view({ connected: true,
    result: { deviceId: 'bloc-7', count: 3, added: ['a', 'b'], duplicate: 1, skipped: 0, problems: [] } });
  // The comma is load-bearing: "2 new," cannot match a wrongly pluralised
  // "2 news,", whereas a bare /2 new/ would pass on either.
  assert.match(html, /2 new,/);
  assert.match(html, /1 already here/);
  assert.match(html, /3 beads on the totem/);
  assert.match(html, /data-action="clear-arm"/);
  assert.ok(!html.includes('yes, erase the totem'), 'not confirmed yet');
});

test('once armed, the clear asks for a confirming click', () => {
  const html = view({ connected: true, confirmClear: true,
    result: { deviceId: 'bloc-7', count: 3, added: ['a', 'b'], duplicate: 1, skipped: 0, problems: [] } });
  assert.match(html, /data-action="clear"/);
  assert.match(html, /data-action="clear-cancel"/);
  assert.match(html, /yes, erase the totem/);
  assert.ok(!html.includes('data-action="clear-arm"'));
});

test('a pull with a problem withholds the clear and says why', () => {
  const html = view({ connected: true,
    result: { count: 3, added: ['a'], duplicate: 0, skipped: 0,
      problems: ['a bead line could not be read, so the device has not been cleared: {"seq…'] } });
  assert.ok(!html.includes('data-action="clear"'), 'never erase a bead nobody saw');
  assert.match(html, /could not be read/);
});

test('struck beads are reported as skipped, so the count is accounted for', () => {
  const html = view({ connected: true,
    result: { count: 3, added: ['a'], duplicate: 0, skipped: 2, problems: [] } });
  assert.match(html, /2 struck/);
});

test('the date is asked for only when a dump needed one', () => {
  assert.ok(!view({ connected: true, result: { count: 1, added: [], duplicate: 0, skipped: 0, problems: [] }, needsDay: false })
    .includes('name="day"'));
  assert.match(view({ connected: true, needsDay: true, day: '2026-09-16',
    result: { count: 1, added: [], duplicate: 0, skipped: 0, problems: [] } }), /name="day"/);
});

test('the device label is shown, and disagreeing with the device is warned about', () => {
  const agree = view({ connected: true, deviceId: 'bloc-7', deviceLabel: 'bloc-7' });
  assert.ok(!/warn/i.test(agree));
  const clash = view({ connected: true, deviceId: 'bloc-7', deviceLabel: 'bloc-9' });
  assert.match(clash, /bloc-7/);
  assert.match(clash, /duplicate|disagree/i);
});

test('the wardrobe is inert until a pull has read it', () => {
  assert.ok(!view({ connected: true, wardrobeArmed: false }).includes('data-action="wardrobe-save"'));
  assert.match(view({ connected: true, wardrobeArmed: true, masks: [{ name: 'cinema', r: 1, g: 2, b: 3 }] }),
    /data-action="wardrobe-save"/);
});

test('while busy, the device actions are disabled', () => {
  const html = view({ connected: true, busy: true });
  assert.match(html, /disabled/);
});

test('an error is shown, and device names are escaped rather than injected', () => {
  const html = view({ connected: true, error: 'the totem didn’t answer',
    deviceId: '<script>alert(1)</script>' });
  assert.match(html, /didn’t answer/);
  assert.ok(!html.includes('<script>'));
});

test('every device-supplied string reaches the markup escaped', () => {
  const bad = '"><script>alert(1)</script>';
  const html = view({ connected: true, deviceId: bad, deviceLabel: 'other',
    wardrobeArmed: true, masks: [{ name: bad, r: 1, g: 2, b: 3 }],
    result: { count: 1, added: [], duplicate: 0, skipped: 0, problems: [bad] } });
  assert.ok(!html.includes('<script>'));
  // the device hint, the clash warning, the mask name and the problem line
  assert.ok(html.split('&lt;script&gt;').length - 1 >= 3);
});

test('a result missing fields renders instead of taking the surface down', () => {
  assert.doesNotThrow(() => view({ connected: true, result: { count: 3, added: ['a'] } }));
  assert.doesNotThrow(() => view({ connected: true, result: {} }));
});
