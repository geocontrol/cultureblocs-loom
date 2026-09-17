/* The totem's serial protocol, as text. Pure: no serial, no DOM, no clock.
 *
 * 115200 8-N-1. The device answers `D` with a framed dump, `W` with its mask
 * wardrobe, `M` + lines + `.` with a count, and `C<n>` with a gated clear.
 * See culturebloc-totem/README.md for the command table.
 *
 * A truncated dump THROWS. Returning the beads that happened to arrive would
 * let a clear erase the ones that did not. */

export const MARKERS = {
  beadsBegin: '---BEADS-BEGIN---',
  beadsEnd: '---BEADS-END---',
  masksBegin: '---MASKS-DUMP-BEGIN---',
  masksEnd: '---MASKS-DUMP-END---',
  masksOk: '---MASKS-OK',
  clearOk: '---CLEAR-OK',
  clearRefused: '---CLEAR-REFUSED',
};

export class DumpError extends Error {}

/* The text between two markers, or a DumpError naming which one is missing. */
function framed(text, begin, end, what) {
  const s = String(text ?? '');
  if (s.indexOf(begin) === -1) throw new DumpError(`this is not a ${what}: no ${begin}`);
  const to = s.indexOf(end);
  if (to === -1) throw new DumpError(`the ${what} is truncated: no ${end}`);
  // The LAST begin before this end: a timed-out read leaves a stale header in
  // the port's carry-over buffer, and parsing `staleHeader + freshDump` would
  // take the stale clock and silently misdate every bead in the fresh one.
  const from = s.lastIndexOf(begin, to);
  if (from === -1) throw new DumpError(`this is not a ${what}: no ${begin} before ${end}`);
  return s.slice(from + begin.length, to);
}

const jsonLines = (body) => body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));

/* A `D` dump. `now` and `epoch` are the device's uptime counter in seconds and
 * its power-session epoch; both may be null on older firmware. `unparsed`
 * holds any bead line we could not read — the caller must not clear the
 * device while it is non-empty. */
export function parseDump(text) {
  const body = framed(text, MARKERS.beadsBegin, MARKERS.beadsEnd, 'bead dump');
  const device = /---DEVICE\s+(.+?)---/.exec(body);
  const now = /---NOW\s+(\d+)/.exec(body);
  const epoch = /EPOCH\s+(\d+)/.exec(body);
  const beads = [];
  const unparsed = [];
  for (const line of jsonLines(body)) {
    try {
      const o = JSON.parse(line);
      if (typeof o.seq !== 'number') throw new Error('a bead needs a seq');
      beads.push(o);
    } catch {
      unparsed.push(line);
    }
  }
  return {
    deviceId: device ? device[1] : null,
    now: now ? Number(now[1]) : null,
    epoch: epoch ? Number(epoch[1]) : null,
    beads,
    unparsed,
  };
}

/* A `W` dump. A mask line we cannot read is skipped: the wardrobe is
 * presentation, and one bad colour is not worth failing a sync for. */
export function parseWardrobe(text) {
  const body = framed(text, MARKERS.masksBegin, MARKERS.masksEnd, 'wardrobe dump');
  const out = [];
  for (const line of jsonLines(body)) {
    try {
      const m = JSON.parse(line);
      if (typeof m.name === 'string') out.push({ name: m.name, r: m.r | 0, g: m.g | 0, b: m.b | 0 });
    } catch { /* skipped on purpose */ }
  }
  return out;
}

/* The body sent after `M`: one `name|r|g|b` per line, then a lone dot. */
export function wardrobePayload(masks) {
  const lines = (masks || []).map((m) => `${m.name}|${m.r}|${m.g}|${m.b}`);
  return lines.length ? `${lines.join('\n')}\n.\n` : '.\n';
}

/* A `C<n>` reply. Refused means the device holds a different number of beads
 * than the caller counted — it gained one during the sync. */
export function parseClearReply(text) {
  const s = String(text ?? '');
  const refused = /---CLEAR-REFUSED\s+have=(\d+)\s+want=(\d+)---/.exec(s);
  if (refused) return { ok: false, have: Number(refused[1]), want: Number(refused[2]) };
  const ok = new RegExp(`${MARKERS.clearOk}\\s+(\\d+)---`).exec(s);
  if (ok) return { ok: true, cleared: Number(ok[1]) };
  throw new DumpError('the totem did not confirm the clear');
}
