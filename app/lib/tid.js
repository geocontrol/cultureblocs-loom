/* ATProto TIDs: 13 characters of base32-sortable, from 53 bits of
 * microseconds since the epoch and a 10-bit clock id. Lexically sortable, so
 * a record's rkey orders the way it was made. Monotonic within a generator:
 * two calls in the same microsecond (or a clock that steps back) still yield
 * increasing TIDs. */

const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
const TID_RE = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;

export function isTid(s) {
  return typeof s === 'string' && TID_RE.test(s);
}

function encode(n, length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ALPHABET[Number(n % 32n)] + out;
    n /= 32n;
  }
  return out;
}

/* nowMicros: () => bigint microseconds. clockId: 0..1023. */
export function tidGenerator({ nowMicros = () => BigInt(Date.now()) * 1000n, clockId } = {}) {
  const clock = BigInt(clockId ?? Math.floor(Math.random() * 1024));
  let last = 0n;
  return function tid() {
    let t = nowMicros();
    if (t <= last) t = last + 1n;
    last = t;
    return encode((t << 10n) | clock, 13);
  };
}
