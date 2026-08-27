import type { LngLatBoundsLike, LngLatLike } from 'maplibre-gl';
import type { Coordinates } from '../types/journey';

/**
 * The one conversion this port cannot get wrong.
 *
 * Every coordinate in this app — the API's, the geocoder's, the types in
 * `types/journey` — is `[latitude, longitude]`, which is the order people say
 * them in and the order Leaflet took. MapLibre takes `[longitude, latitude]`.
 *
 * Silently swapping them does not throw and does not draw nothing: it draws
 * *somewhere*, plausibly, in the wrong hemisphere. Helsinki at 60.17 N 24.94 E
 * reversed is a point in the Arabian Sea, and a map that has flown there looks
 * exactly like a map with a framing bug. So the swap happens here and only
 * here, and nothing else in `src/map` writes a raw pair.
 */
export function lngLat([lat, lon]: Coordinates): LngLatLike {
  return [lon, lat];
}

/** A `[[minLat, minLon], [maxLat, maxLon]]` box, as MapLibre wants it. */
export function lngLatBounds([[minLat, minLon], [maxLat, maxLon]]: [
  Coordinates,
  Coordinates,
]): LngLatBoundsLike {
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/** A path, as the GeoJSON coordinate array a line layer reads. */
export function lineCoordinates(path: readonly Coordinates[]): [number, number][] {
  return path.map(([lat, lon]) => [lon, lat]);
}
