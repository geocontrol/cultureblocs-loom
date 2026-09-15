/* Ref anchors are UTF-8 byte offsets into the record's own text (LOOM.md §9.9).
 * A <textarea> reports selections in UTF-16 code units, and text changes as it
 * is edited, so the editor needs both conversions and a way to carry anchors
 * across an edit. Pure. */

const enc = new TextEncoder();
const dec = new TextDecoder();

const byteLength = (s) => enc.encode(s).length;

/* A textarea selection (UTF-16 offsets) as a byteSlice, or null if empty. */
export function selectionToIndex(text, selStart, selEnd) {
  if (!(selEnd > selStart)) return null;
  const start = byteLength(text.slice(0, selStart));
  return { byteStart: start, byteEnd: start + byteLength(text.slice(selStart, selEnd)) };
}

/* The text an index covers, or null if it is out of range. */
export function anchoredText(text, index) {
  const bytes = enc.encode(text);
  if (!index || index.byteStart < 0 || index.byteEnd > bytes.length || index.byteStart >= index.byteEnd) return null;
  return dec.decode(bytes.slice(index.byteStart, index.byteEnd));
}

/* Carry anchored refs from `before` to `after`: each anchor moves to the
 * single place its old text now appears; if it appears nowhere or more than
 * once, the anchor is dropped and the ref kept. Refs without an index pass
 * through untouched. Returns new ref objects; inputs are not mutated. */
export function reanchor(before, after, refs) {
  return (refs || []).map((ref) => {
    if (!ref?.index) return ref;
    const covered = anchoredText(before, ref.index);
    const { index, ...rest } = ref;
    if (!covered) return rest;
    const first = after.indexOf(covered);
    if (first === -1 || after.indexOf(covered, first + 1) !== -1) return rest;
    return { ...rest, index: selectionToIndex(after, first, first + covered.length) };
  });
}
