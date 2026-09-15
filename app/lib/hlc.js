/* Hybrid logical clock stamps in the String's format
 * (cultureblocs-string string/app/hlc.py):  <13-digit ms>-<5-digit counter>-<node>
 * Fixed-width, so plain string comparison is causal order in any language. */

const MAX_COUNTER = 99_999;
const NODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STAMP_RE = /^(\d{13})-(\d{5})-([A-Za-z0-9_-]{1,64})$/;

export function parseStamp(stamp) {
  const m = typeof stamp === 'string' ? STAMP_RE.exec(stamp) : null;
  if (!m) throw new Error(`not an HLC stamp: ${JSON.stringify(stamp)}`);
  return { ms: Number(m[1]), counter: Number(m[2]), node: m[3] };
}

const fmt = (ms, counter, node) =>
  `${String(ms).padStart(13, '0')}-${String(counter).padStart(5, '0')}-${node}`;

export function createClock(node, { now = () => Date.now(), last = null } = {}) {
  if (!NODE_RE.test(node)) throw new Error(`bad node id: ${JSON.stringify(node)}`);
  let ms = 0, counter = 0;
  const set = (m, c) => {
    if (c > MAX_COUNTER) { m += 1; c = 0; }       // spill, as the String does
    ms = m; counter = c;
    return fmt(ms, counter, node);
  };
  const clock = {
    /* A stamp for a local write, after every stamp issued or observed. */
    tick() {
      const t = now();
      return t > ms ? set(t, 0) : set(ms, counter + 1);
    },
    /* Merge a stamp from elsewhere (an imported record); returns a local stamp after both. */
    observe(stamp) {
      const r = parseStamp(stamp);
      const t = Math.max(now(), ms, r.ms);
      if (t === ms && t === r.ms) return set(t, Math.max(counter, r.counter) + 1);
      if (t === ms) return set(t, counter + 1);
      if (t === r.ms) return set(t, r.counter + 1);
      return set(t, 0);
    },
    get last() { return ms ? fmt(ms, counter, node) : null; },
  };
  if (last) clock.observe(last);
  return clock;
}
