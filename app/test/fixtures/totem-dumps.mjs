/* Dumps in the format culturebloc-totem/README.md documents (115200 8-N-1).
 * NOW/EPOCH is the device's uptime counter in SECONDS and its power-session
 * epoch. Bead 3 is from an earlier epoch: its order is known, its wall clock
 * is not. */
export const CLEAN = [
  '---BEADS-BEGIN---',
  '---DEVICE bloc-7---',
  '---NOW 9000 EPOCH 3---',
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3}',
  '{"seq":2,"mask":"gig","r":200,"g":40,"b":90,"e":6100,"ep":3,'
    + '"mintId":"a1b2c3d4e5f60718293a4b5c6d7e8f90","with":{"id":"peer-9","mask":"punk"}}',
  '{"seq":3,"mask":"cinema","r":13,"g":217,"b":53,"e":120,"ep":2}',
  '---BEADS-END---',
  '',
].join('\n');

/* No ---BEADS-END---: the read stopped early. */
export const TRUNCATED = CLEAN.slice(0, CLEAN.indexOf('---BEADS-END---'));

/* One line is not JSON. It must be reported, never silently dropped. */
export const MALFORMED = CLEAN.replace(
  '{"seq":3,"mask":"cinema","r":13,"g":217,"b":53,"e":120,"ep":2}',
  '{"seq":3,"mask":"cinem',
);

/* A bead struck out on the device: let go, not kept. */
export const WITH_STRUCK = CLEAN.replace(
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3}',
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53,"e":5240,"ep":3,"struck":true}',
);

/* A device with no clock anchor at all. */
export const NO_ANCHOR = [
  '---BEADS-BEGIN---',
  '---DEVICE bloc-7---',
  '{"seq":1,"mask":"cinema","r":13,"g":217,"b":53}',
  '---BEADS-END---',
  '',
].join('\n');

export const WARDROBE = [
  '---MASKS-DUMP-BEGIN---',
  '{"name":"cinema","r":13,"g":217,"b":53}',
  '{"name":"gig","r":200,"g":40,"b":90}',
  '---MASKS-DUMP-END---',
  '',
].join('\n');

export const CLEAR_OK = '---CLEAR-OK 3---\n';
export const CLEAR_REFUSED = '---CLEAR-REFUSED have=4 want=3---\n';
