import { useEffect, useState } from 'react';

/**
 * Whether the visitor has asked for less movement.
 *
 * The stylesheet already answers this for anything CSS drives, and that covers
 * every animation the app writes itself. A map is the exception: Leaflet runs
 * its own easing in JavaScript — the glide that continues after a drag, the
 * scale during a zoom, the flight between two views — and none of it is a CSS
 * transition that a media query can shorten.
 *
 * So the preference has to be readable from JavaScript too, and the map turns
 * those behaviours off at the source rather than trying to make them fast.
 *
 * Guarded the same way `systemTheme()` is, and for the same reason: jsdom
 * implements no `matchMedia`, and the honest default for a preference nobody
 * expressed is that it was not expressed.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function currentPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(currentPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
