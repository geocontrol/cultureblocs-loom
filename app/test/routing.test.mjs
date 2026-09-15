import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeSerializer } from '../lib/routing.js';

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
