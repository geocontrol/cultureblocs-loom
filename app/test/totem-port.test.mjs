import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKERS } from '../lib/totem-protocol.js';
import { PortError, hasSerial, openPort } from '../lib/totem-port.js';
import { fakeSerial } from './fake-serial.mjs';
import { CLEAN } from './fixtures/totem-dumps.mjs';

const dumpOnD = (cmd) => (cmd.trim() === 'D' ? CLEAN : '');

test('send writes the command and readUntil returns everything up to the marker', async () => {
  const f = fakeSerial({ reply: dumpOnD });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  const text = await port.readUntil(MARKERS.beadsEnd);
  assert.deepEqual(f.written, ['D']);
  assert.match(text, /---BEADS-END---/);
  await port.close();
});

test('a reply split mid-line is reassembled', async () => {
  // A real port hands you bytes, not lines: 7 is deliberately awkward.
  const f = fakeSerial({ reply: dumpOnD, chunk: 7 });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  const text = await port.readUntil(MARKERS.beadsEnd);
  assert.match(text, /"mask":"cinema"/);
  assert.match(text, /---BEADS-END---/);
  await port.close();
});

test('a sleeping totem times out, and says so in words a person can act on', async () => {
  const f = fakeSerial({ neverAnswers: true });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  await assert.rejects(port.readUntil(MARKERS.beadsEnd, { timeoutMs: 20 }),
    (e) => e instanceof PortError && /didn’t answer|did not answer/.test(e.message));
  await port.close();
});

test('a port that disconnects mid-read fails rather than returning half a dump', async () => {
  const f = fakeSerial({ disconnect: true });
  const port = await openPort({ serial: f.serial });
  await port.send('D');
  await assert.rejects(port.readUntil(MARKERS.beadsEnd, { timeoutMs: 50 }),
    (e) => e instanceof PortError && /disconnect/.test(e.message));
});

test('hasSerial reports whether this browser can talk to a device at all', () => {
  assert.equal(hasSerial({}), false);
  assert.equal(hasSerial({ serial: {} }), true);
});
