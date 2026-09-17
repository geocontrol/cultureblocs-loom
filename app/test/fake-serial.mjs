/* A fake navigator.serial. `reply(cmd)` decides what the device sends back;
 * `chunk` splits that reply into n-byte pieces to prove readUntil reassembles
 * lines split mid-stream, which is what a real port does. */
export function fakeSerial({ reply = () => '', chunk = 0, neverAnswers = false,
  disconnect = false } = {}) {
  const written = [];
  let emit = null;
  let finish = null;
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(c) {
      emit = (s) => c.enqueue(encoder.encode(s));
      finish = () => c.close();
    },
  });

  const writable = new WritableStream({
    write(bytes) {
      const cmd = new TextDecoder().decode(bytes);
      written.push(cmd);
      if (neverAnswers) return;
      if (disconnect) { finish(); return; }
      const text = reply(cmd);
      if (!text) return;
      if (!chunk) { emit(text); return; }
      for (let i = 0; i < text.length; i += chunk) emit(text.slice(i, i + chunk));
    },
  });

  const port = { readable, writable, async open() {}, async close() {} };
  return { serial: { requestPort: async () => port }, written };
}
