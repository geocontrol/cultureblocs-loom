import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postureFor, routeSerializer } from '../lib/routing.js';

const surface = (name, log) => ({ name, unmount: () => log.push(`unmount ${name}`) });

test('a route overtaken by a newer one unmounts what it goes on to mount, and stops', () => {
  const begin = routeSerializer();
  const log = [];
  const mounted = [];
  const first = begin();                               // #/compose/x: thread mounted, compose still loading
  assert.equal(first.keep(surface('thread', log), mounted), true);
  const second = begin();                              // a hashchange arrives mid-mount
  assert.equal(first.current, false);
  assert.equal(second.current, true);
  assert.equal(first.keep(surface('compose', log), mounted), false);
  assert.deepEqual(log, ['unmount compose']);
  assert.equal(second.keep(surface('mint', log), mounted), true);
  assert.deepEqual(mounted.map((m) => m.name), ['thread', 'mint']);
});

test('posture follows the setting, and the viewport only when the setting is auto', () => {
  assert.equal(postureFor('auto', true), 'desk');
  assert.equal(postureFor(undefined, false), 'totem');
  assert.equal(postureFor('desk', false), 'desk');
  assert.equal(postureFor('totem', true), 'totem');
  // a resize re-routes only when this changes
  assert.equal(postureFor('desk', true) === postureFor('desk', false), true);
});
