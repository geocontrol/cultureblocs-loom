/* The shell's routing decisions, pure (no DOM) so node can test them.
 *
 * Routes overlap: a hashchange can start a new route while the
 * last is still awaiting a mount. Each begin() supersedes every earlier route;
 * a superseded route unmounts whatever it goes on to mount, and stops.
 *
 * Phase 1 addresses (bookmarks, an open tab from before the upgrade) are
 * redirected to the desk's nearest surface rather than landing on nothing. */
export function routeSerializer() {
  let latest = 0;
  return function begin() {
    const token = ++latest;
    return {
      get current() { return token === latest; },
      /* A surface this route just mounted: added to `mounted` if the route is
       * still current (true); otherwise unmounted at once (false). */
      keep(surface, mounted) {
        if (token === latest) { mounted.push(surface); return true; }
        surface?.unmount?.();
        return false;
      },
    };
  };
}

/* The desk's hash for a Phase 1 hash, or null if `hash` is not one:
 *   #/thread[/<period>]    -> #/day/<day> for a day, else #/
 *   #/mint                 -> #/new/bead
 *   #/compose/new?day=…    -> #/new/strand?day=…
 *   #/compose/<key>        -> #/edit/<key>
 *   #/string               -> #/settings */
export function phase1Redirect(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
  const [surface = '', ...rest] = path.split('/');
  const arg = rest.join('/');
  if (surface === 'thread') return /^\d{4}-\d{2}-\d{2}$/.test(arg) ? `#/day/${arg}` : '#/';
  if (surface === 'mint') return '#/new/bead';
  if (surface === 'string') return '#/settings';
  if (surface === 'compose' && arg === 'new') {
    const day = new URLSearchParams(query).get('day');
    return `#/new/strand${day ? `?day=${day}` : ''}`;
  }
  if (surface === 'compose' && arg) return `#/edit/${arg}`;
  return null;
}
