/* Web Serial, and the only impure module in the totem path.
 *
 * `serial` is injected exactly as stringClient takes a fetchImpl, so the tests
 * drive a fake and never need a device. Two realities the protocol table does
 * not mention live here: bytes arrive split mid-line, and a totem in deep
 * sleep never answers at all — which is the likeliest first experience, so its
 * message has to tell you to press a button rather than report a fault. */

export class PortError extends Error {}

/* Whether this browser can talk to a device. Firefox and Safari cannot. */
export const hasSerial = (nav = globalThis.navigator) => Boolean(nav && nav.serial);

export async function openPort({ serial = globalThis.navigator?.serial, baudRate = 115200 } = {}) {
  if (!serial) throw new PortError('this browser has no Web Serial');
  const port = await serial.requestPort();
  await port.open({ baudRate });
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const decoder = new TextDecoder();
  let buffer = '';

  /* reader.read() with a deadline. A timer left running would hold the process
   * open, so it is always cleared. */
  async function readChunk(ms) {
    let timer = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new PortError(
          'the totem didn’t answer — wake it with a button press and pull again')), ms); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    async send(cmd) {
      await writer.write(new TextEncoder().encode(cmd));
    },
    /* Everything received up to and including `marker`. Text already read past
     * a previous marker is kept, so two reads in a row do not lose bytes. */
    async readUntil(marker, { timeoutMs = 5000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const at = buffer.indexOf(marker);
        if (at !== -1) {
          const text = buffer.slice(0, at + marker.length);
          buffer = buffer.slice(at + marker.length);
          return text;
        }
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new PortError('the totem didn’t answer — wake it with a button press and pull again');
        }
        const { value, done } = await readChunk(left);
        if (done) throw new PortError('the totem disconnected part way through — nothing was saved');
        buffer += decoder.decode(value, { stream: true });
      }
    },
    async close() {
      try { reader.releaseLock(); writer.releaseLock(); } catch { /* already gone */ }
      try { await port.close(); } catch { /* already gone */ }
    },
  };
}
