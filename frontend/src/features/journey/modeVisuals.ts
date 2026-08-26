import type { GtfsRouteType } from '../../types/journey';

/**
 * How each mode looks.
 *
 * One place, because a mode's colour and its icon have to agree wherever they
 * appear — a bullet in an itinerary, a stroke on the line diagram, a marker on
 * the map — and three copies of that mapping would drift.
 *
 * Colour never carries the meaning alone. Every mode also has a distinct
 * silhouette and a text label, so the information survives greyscale, colour
 * blindness, and a screen reader.
 */

/** Tailwind classes rather than raw values, so the tokens stay the source. */
export interface ModeVisual {
  /** Fill for a bullet, with `text-on-mode` on top. */
  fill: string;
  /** The same colour as text or an icon on a page surface. */
  ink: string;
  /** `stroke` for the line diagram. */
  stroke: string;
  /** Border for a card outlined in the mode's own colour, e.g. a follow banner. */
  border: string;
}

const VISUALS: Record<string, ModeVisual> = {
  bus: {
    fill: 'bg-mode-bus',
    ink: 'text-mode-bus',
    stroke: 'stroke-mode-bus',
    border: 'border-mode-bus',
  },
  tram: {
    fill: 'bg-mode-tram',
    ink: 'text-mode-tram',
    stroke: 'stroke-mode-tram',
    border: 'border-mode-tram',
  },
  metro: {
    fill: 'bg-mode-metro',
    ink: 'text-mode-metro',
    stroke: 'stroke-mode-metro',
    border: 'border-mode-metro',
  },
  train: {
    fill: 'bg-mode-train',
    ink: 'text-mode-train',
    stroke: 'stroke-mode-train',
    border: 'border-mode-train',
  },
  ferry: {
    fill: 'bg-mode-ferry',
    ink: 'text-mode-ferry',
    stroke: 'stroke-mode-ferry',
    border: 'border-mode-ferry',
  },
};

/**
 * GTFS `route_type` to a visual family.
 *
 * The rarer modes borrow the nearest familiar one rather than inventing a
 * sixth colour nobody would recognise: a funicular reads as a train, a
 * trolleybus as a bus. Anything unknown falls back to bus, which is what an
 * unfamiliar feed most likely is.
 */
export function familyFor(routeType: GtfsRouteType | number | null): string {
  switch (routeType) {
    case 0:
    case 5: // cable tram
      return 'tram';
    case 1:
      return 'metro';
    case 2:
    case 7: // funicular
    case 12: // monorail
      return 'train';
    case 4:
      return 'ferry';
    case 6: // aerial lift
      return 'ferry';
    default:
      return 'bus';
  }
}

export function modeVisual(routeType: GtfsRouteType | number | null): ModeVisual {
  return visualForFamily(familyFor(routeType));
}

/**
 * The same lookup for a family already resolved.
 *
 * The strip map carries families rather than route types — a drawn segment
 * knows it is "a tram" and has no reason to remember it was `route_type` 0 —
 * so it needs the mapping without going back through {@link familyFor}. Falls
 * back to bus for the same reason that function does.
 */
export function visualForFamily(family: string): ModeVisual {
  return VISUALS[family] ?? (VISUALS['bus'] as ModeVisual);
}

