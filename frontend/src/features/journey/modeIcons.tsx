import type { GtfsRouteType } from '../../types/journey';
import { familyFor } from './modeVisuals';
import {
  SEATED_ICON_MARKUP,
  WALK_ICON_MARKUP,
  modeIconMarkup,
} from './modeIconMarkup';

/**
 * Drawn at a heavier weight than the interface icons around them.
 *
 * These sit inside filled bullets at small sizes, where a hairline stroke
 * disappears into the fill — and a rider identifies the vehicle before they
 * read the number, so the silhouette has to survive being small. Everything
 * else on the page keeps the lighter 1.75.
 *
 * ---------------------------------------------------------------------------
 * The silhouettes are kept as markup strings rather than as JSX.
 *
 * They have two renderers now. React draws them wherever the interface does,
 * and the map needs the same shapes as raw markup, because Leaflet builds a
 * custom marker from an HTML string and never from a React tree. Written twice
 * they would be two hand-copied sets of path data, free to drift the moment one
 * of them is adjusted — so they are written once here and both renderers read
 * the same constants.
 *
 * `dangerouslySetInnerHTML` is the price, and it is safe in the sense that
 * actually matters: every string involved is a literal in `modeIconMarkup.ts`,
 * and nothing from a feed, a URL, or a person ever reaches them.
 * ---------------------------------------------------------------------------
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function WalkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: WALK_ICON_MARKUP }}
    />
  );
}

export function SeatedIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      aria-hidden="true"
      className="flex-none"
      dangerouslySetInnerHTML={{ __html: SEATED_ICON_MARKUP }}
    />
  );
}

export function ModeIcon({
  routeType,
  size = 20,
}: {
  routeType: GtfsRouteType | number | null;
  size?: number;
}) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: modeIconMarkup(familyFor(routeType)) }}
    />
  );
}
