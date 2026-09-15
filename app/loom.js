/* The shell, while the desk is built (docs/superpowers/plans/2026-09-15-loom-desk-authoring.md):
 * Phase 1's Thread, Mint and Compose are retired and the desk's surfaces are
 * not mounted yet. It opens the store — so this browser's records are kept
 * as they are — and says so. The desk shell replaces this file. */
import { openStore } from './lib/store.js';

openStore().then(
  () => { document.getElementById('main').textContent = 'Loom is being rebuilt as a desk. Your records are safe in this browser.'; },
  (err) => { document.getElementById('main').textContent = `Loom could not start: ${err.message}`; },
);