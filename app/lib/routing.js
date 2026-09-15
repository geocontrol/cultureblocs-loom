/* The shell's routing decisions, pure (no DOM) so node can test them.
 *
 * Routes overlap: a hashchange or a resize can start a new route while the
 * last is still awaiting a mount. Each begin() supersedes every earlier route;
 * a superseded route unmounts whatever it goes on to mount, and stops. */
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

/* 'desk' or 'totem': the posture setting, or the viewport when it is auto. */
export const postureFor = (chosen, wide) => (!chosen || chosen === 'auto' ? (wide ? 'desk' : 'totem') : chosen);
