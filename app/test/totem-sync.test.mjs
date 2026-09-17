import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAD, openLoom } from '../lib/envelope.js';
import { createMemStore } from '../lib/memstore.js';
import { absorbDump, readWardrobe, runClear, runPull, writeWardrobe } from '../lib/totem-sync.js';
import { parseDump } from '../lib/totem-protocol.js';
import { fakeSerial } from './fake-serial.mjs';
import { openPort } from '../lib/totem-port.js';
import { CLEAN, CLEAR_OK, CLEAR_REFUSED, MALFORMED, TRUNCATED, WARDROBE }
  from './fixtures/totem-dumps.mjs';
import { registry, steppingNow } from './helpers.mjs';

const SYNC = Date.parse('2026-09-17T12:00:00Z');

async function desk() {
  const store = createMemStore();
  const loom = await openLoom({ store, registry: await registry(), now: steppingNow(),
    newDeviceId: () => 'loom-test' });
  return { store, loom };
}

const portFor = (text) => openPort({ serial: fakeSerial({ reply: () => text }).serial });

test('a pull writes every kept bead as a proposal and reports what happened', async () => {
  const { store, loom } = await desk();
  const port = await portFor(CLEAN);

  const r = await runPull({ store, loom, port, now: () => SYNC, day: '2026-09-16' });

  assert.equal(r.deviceId, 'bloc-7');
  assert.equal(r.added.length, 3);
  assert.equal(r.duplicate, 0);
  assert.deepEqual(r.problems, []);
  const records = await store.allRecords();
  assert.equal(records.length, 3);
  assert.ok(records.every((x) => x.state === 'proposal' && x.origin === 'connector:totem'));
});

test('pulling the same dump twice adds nothing the second time', async () => {
  const { store, loom } = await desk();
  await runPull({ store, loom, port: await portFor(CLEAN), now: () => SYNC, day: '2026-09-16' });

  const again = await runPull({ store, loom, port: await portFor(CLEAN), now: () => SYNC, day: '2026-09-16' });

  assert.equal(again.added.length, 0);
  assert.equal(again.duplicate, 3);
  assert.equal((await store.allRecords()).length, 3);
});

test('a truncated dump writes nothing at all', async () => {
  const { store, loom } = await desk();
  // Modelled as a mid-transfer disconnect: the device sent the truncated text
  // and then the cable dropped, rather than merely going quiet forever (which
  // `portFor` alone cannot express — a plain reply never signals "no more is
  // coming", so `readUntil` would just wait out its 8s timeout instead of
  // surfacing the dump's own truncation).
  const port = await openPort({ serial: fakeSerial({ reply: () => TRUNCATED, disconnect: true }).serial });
  await assert.rejects(
    runPull({ store, loom, port, now: () => SYNC, day: '2026-09-16' }),
    /truncated/,
  );
  assert.deepEqual(await store.allRecords(), []);
});

test('an unparseable bead line lands the rest but reports a problem, which withholds the clear', async () => {
  const { store, loom } = await desk();
  const r = await runPull({ store, loom, port: await portFor(MALFORMED), now: () => SYNC, day: '2026-09-16' });

  assert.equal(r.added.length, 2);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /could not be read/);
});

test('the pull reports whether a date was needed, and the count the device holds', async () => {
  const { store, loom } = await desk();
  const r = await runPull({ store, loom, port: await portFor(CLEAN), now: () => SYNC, day: '2026-09-16' });
  assert.equal(r.needsDay, true, 'bead 3 is from an earlier epoch');
  assert.equal(r.count, 3, 'what the device holds — the clear is gated on this');
});

test('the clock is read once, so every bead in a dump shares one anchor', async () => {
  const { store, loom } = await desk();
  let calls = 0;
  await runPull({ store, loom, port: await portFor(CLEAN), day: '2026-09-16',
    now: () => { calls += 1; return SYNC; } });
  assert.equal(calls, 1);
});

test('a clear confirms how many went', async () => {
  const port = await portFor(CLEAR_OK);
  assert.deepEqual(await runClear({ port, count: 3 }), { ok: true, cleared: 3 });
});

test('a clear the device refuses reports both counts, so the mismatch is visible', async () => {
  const port = await portFor(CLEAR_REFUSED);
  assert.deepEqual(await runClear({ port, count: 3 }), { ok: false, have: 4, want: 3 });
});

test('the clear sends the count the device is asked to match', async () => {
  const f = fakeSerial({ reply: () => CLEAR_OK });
  const port = await openPort({ serial: f.serial });
  await runClear({ port, count: 7 });
  assert.equal(f.written.at(-1), 'C7');
});

test('the wardrobe reads back, and writes as pipe-delimited lines closed by a dot', async () => {
  const f = fakeSerial({ reply: (cmd) => (cmd.trim() === 'W' ? WARDROBE : '---MASKS-OK 1---\n') });
  const port = await openPort({ serial: f.serial });

  assert.deepEqual((await readWardrobe({ port })).map((m) => m.name), ['cinema', 'gig']);
  await writeWardrobe({ port, masks: [{ name: 'gallery', r: 1, g: 2, b: 3 }] });

  assert.equal(f.written.includes('M'), true);
  assert.equal(f.written.at(-1), 'gallery|1|2|3\n.\n');
});

test('a pasted dump stores through the same path as a pull', async () => {
  const { store, loom } = await desk();
  const r = await absorbDump({ store, loom, dump: parseDump(CLEAN),
    syncWallClock: SYNC, day: '2026-09-16' });
  assert.equal(r.added.length, 3);
  assert.ok((await store.allRecords()).every((x) => x.state === 'proposal'));
});
