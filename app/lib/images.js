/* Photo preparation for records (ported from cultureblocs-string easel/lib/image.js):
 * pure sizing math, and browser canvas rendering to a JPEG under the lexicon's
 * 2 MB image budget. */

export const MAX_EDGE = 2000;
export const MAX_BYTES = 2_000_000;

export function downscaleDims(w, h, maxEdge = MAX_EDGE) {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/* Browser-only. A File/Blob from an <input> or a drop -> { blob, width, height }. */
export async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const dims = downscaleDims(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, dims.width, dims.height);
  bitmap.close?.();
  let quality = 0.9;
  for (let i = 0; i < 6; i++) {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_BYTES) return { blob, ...dims };
    quality -= 0.12;
  }
  return { blob: await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.3)), ...dims };
}
