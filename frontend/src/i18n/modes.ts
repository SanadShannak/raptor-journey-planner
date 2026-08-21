/**
 * Names for transit modes.
 *
 * Mode must always be conveyed as an icon *and* a text label, never colour
 * alone — that is what makes it readable to colour-blind users, in greyscale,
 * and by a screen reader.
 */

import type { GtfsRouteType } from '../types/journey';
import type { Dictionary } from './dictionary';

/**
 * One entry per standard GTFS `route_type`. Declared as a total `Record`, so
 * adding a mode to the union without translating it fails to compile.
 */
const MODE_KEYS: Record<GtfsRouteType, keyof Dictionary['modes']> = {
  0: 'tram',
  1: 'metro',
  2: 'rail',
  3: 'bus',
  4: 'ferry',
  5: 'cableTram',
  6: 'aerialLift',
  7: 'funicular',
  11: 'trolleybus',
  12: 'monorail',
};

/**
 * The localised name of a transit mode.
 *
 * The runtime fallback is not redundant with the total `Record`: the backend
 * passes the feed's `route_type` through, so switching networks could produce
 * a value outside the union the types optimistically assume.
 */
export function modeLabel(
  routeType: GtfsRouteType | number | null,
  strings: Dictionary,
): string {
  if (routeType === null) return strings.modes.unknown;
  const key = MODE_KEYS[routeType as GtfsRouteType];
  return key === undefined ? strings.modes.unknown : strings.modes[key];
}
