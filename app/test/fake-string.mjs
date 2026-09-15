// A fake String client for importer and sender tests: records and media held
// in memory, with the String's dedupe and naming behaviour.
import { mediaName, sha256Hex } from '../lib/media.js';

export function fakeString({ records = [], media = {}, failMedia = new Set(), reject = {} } = {}) {
  let n = 0;
  const posted = [];
  const client = {
    base: 'http://string.test',
    async health() { return ['com.cultureblocs.bead', 'com.cultureblocs.strand', 'com.cultureblocs.annotation'] ; },
    async listRecords(type) { return structuredClone(records.filter((r) => r.type === type)); },
    async getMedia(name) {
      if (failMedia.has(name) || !media[name]) throw new Error(`HTTP 404 for ${name}`);
      return media[name];
    },
    async postRecords(batch) {
      return batch.map((r) => {
        posted.push(structuredClone(r));
        if (reject[r.dedupeKey]) return { dedupeKey: r.dedupeKey, status: 'invalid', problems: reject[r.dedupeKey] };
        const existing = records.find((x) => x.dedupeKey === r.dedupeKey);
        if (existing) return { dedupeKey: r.dedupeKey, status: 'duplicate', id: existing.id };
        const id = `sid-${++n}`;
        records.push({ ...structuredClone(r), id, state: 'kept' });
        return { dedupeKey: r.dedupeKey, status: 'created', id };
      });
    },
    async postMedia(blob) {
      const name = mediaName(await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob.type);
      media[name] = blob;
      return { uri: `/media/${name}`, mime: blob.type, bytes: blob.size };
    },
  };
  return { client, records, media, posted };
}

export const photo = (text = 'jpeg-bytes', type = 'image/jpeg') => new Blob([text], { type });
