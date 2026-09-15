import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phase1Redirect, routeSerializer } from '../lib/routing.js';

const surface = (name, log) => ({ name, unmount: () => log.push(`unmount ${name}`) });

test('a route overtaken by a newer one unmounts what it goes on to mount, and stops', () => {
  const begin = routeSerializer();
  const log = [];
  const mounted = [];
  const first = begin();                               // #/edit/x: day mounted, editor still loading
  assert.equal(first.keep(surface('day', log), mounted), true);
  const second = begin();                              // a hashchange arrives mid-mount
  assert.equal(first.current, false);
  assert.equal(second.current, true);
  assert.equal(first.keep(surface('editor', log), mounted), false);
  assert.deepEqual(log, ['unmount editor']);
  assert.equal(second.keep(surface('send', log), mounted), true);
  assert.deepEqual(mounted.map((m) => m.name), ['day', 'send']);
});

test('Phase 1 addresses redirect to the desk; desk addresses do not', () => {
  const key = 'com.cultureblocs.strand/3mvk';
  assert.equal(phase1Redirect('#/thread'), '#/');
  assert.equal(phase1Redirect('#/thread/2026-09-14'), '#/day/2026-09-14');
  assert.equal(phase1Redirect('#/thread/week'), '#/');
  assert.equal(phase1Redirect('#/mint'), '#/new/bead');
  assert.equal(phase1Redirect('#/compose/new?day=2026-09-14'), '#/new/strand?day=2026-09-14');
  assert.equal(phase1Redirect('#/compose/new'), '#/new/strand');
  assert.equal(phase1Redirect(`#/compose/${key}`), `#/edit/${key}`);
  assert.equal(phase1Redirect('#/string'), '#/settings');
  for (const hash of ['', '#/', '#/day/2026-09-14', `#/edit/${key}`, '#/new/bead', '#/send', '#/settings', '#/nowhere']) {
    assert.equal(phase1Redirect(hash), null, hash);
  }
});
