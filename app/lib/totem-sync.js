/* One sync with the totem, shaped like runSend and runImport: the caller
 * supplies the store, the clock and the port, and gets back a report.
 *
 * The order matters. A pull stores every bead locally BEFORE the device is
 * cleared, so the durable step is IndexedDB rather than the network — which is
 * why Loom can clear the device before Send, where Studio had to push to the
 * String first. `problems` is what stands between a pull and a clear: if
 * anything could not be read or stored, the device keeps its beads. */
import { BEAD } from './envelope.js';
import { needsDay, toBeads } from './totem-beads.js';
import { MARKERS, parseClearReply, parseDump, parseWardrobe, wardrobePayload }
  from './totem-protocol.js';

const PULL_TIMEOUT = 8000;      // a dump of a few hundred beads, plus a sleepy device
const REPLY_TIMEOUT = 4000;

/* Store a parsed dump's beads as proposals. The one write path, shared by the
 * serial pull and the paste fallback, so the fallback cannot drift from the
 * real thing. Anything survivable becomes a `problems` entry, which the caller
 * must treat as "do not clear". */
export async function absorbDump({ store, loom, dump, syncWallClock, day, deviceLabel = '' }) {
  const problems = dump.unparsed.map((line) =>
    `a bead line could not be read, so the device has not been cleared: ${line.slice(0, 40)}…`);
  const known = new Set((await store.allRecords()).map((r) => r.dedupeKey).filter(Boolean));
  const added = [];
  let duplicate = 0;
  for (const bead of toBeads(dump, { syncWallClock, day, deviceLabel })) {
    if (known.has(bead.dedupeKey)) { duplicate += 1; continue; }
    try {
      const env = await loom.adoptBead(loom.newKey(BEAD), bead.body, { dedupeKey: bead.dedupeKey });
      added.push(env.key);
      known.add(bead.dedupeKey);
    } catch (err) {
      problems.push(`a bead from ${dump.deviceId || 'the totem'} was refused: ${err.message}`);
    }
  }
  return {
    deviceId: dump.deviceId,
    count: dump.beads.length + dump.unparsed.length,   // what the device holds
    added,
    duplicate,
    skipped: dump.beads.length - added.length - duplicate,
    problems,
    needsDay: needsDay(dump),
  };
}

/* The serial path: read the dump, then absorb it. Throws only when the dump
 * itself is unusable — a truncated read must never become a partial store. */
export async function runPull({ store, loom, port, now = () => Date.now(), day,
  deviceLabel = '' }) {
  await port.send('D');
  const text = await port.readUntil(MARKERS.beadsEnd, { timeoutMs: PULL_TIMEOUT });
  const dump = parseDump(text);                 // throws on a truncated dump
  return absorbDump({ store, loom, dump, syncWallClock: now(), day, deviceLabel });
}

/* Gated clear. `count` is what the device holds, from the pull that preceded
 * this — never a figure derived here, so a clear cannot be issued without a
 * pull behind it. */
export async function runClear({ port, count }) {
  await port.send(`C${count}`);
  // Both replies open AND close with `---`, so a single read stops on the
  // opening pair at position 0 and returns before the payload. Two reads:
  // the first consumes the opening dashes, the second carries through to the
  // closing pair. Newline-agnostic, unlike reading until `---\n`.
  const head = await port.readUntil('---', { timeoutMs: REPLY_TIMEOUT });
  const rest = await port.readUntil('---', { timeoutMs: REPLY_TIMEOUT });
  return parseClearReply(head + rest);
}

export async function readWardrobe({ port }) {
  await port.send('W');
  return parseWardrobe(await port.readUntil(MARKERS.masksEnd, { timeoutMs: REPLY_TIMEOUT }));
}

export async function writeWardrobe({ port, masks }) {
  await port.send('M');
  await port.send(wardrobePayload(masks));
  return port.readUntil(MARKERS.masksOk, { timeoutMs: REPLY_TIMEOUT });
}
