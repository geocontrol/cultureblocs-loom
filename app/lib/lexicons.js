/* Build a LexiconRegistry from app/vendor/lexicons. The browser cannot list a
 * directory, so vendor-sdk.sh writes index.json; `readJson` is fetch in the
 * browser and fs in node. */
import { LexiconRegistry } from '../vendor/lexicon.js';

export async function loadRegistry(readJson, base = './vendor/lexicons/') {
  const files = await readJson(`${base}index.json`);
  const docs = await Promise.all(files.map((f) => readJson(base + f)));
  return new LexiconRegistry().load(docs);
}
