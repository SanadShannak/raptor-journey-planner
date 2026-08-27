import { isReady, type JourneyFormValues } from '../journey/journeySearch';
import type { ItineraryFavourite } from './favourite';

/**
 * The favourite a search would save, or null when it is not ready to be saved.
 *
 * Only the coordinates and the labels travel, exactly as `toSearchParams`
 * writes them — a place's context line, stop code and platform describe how a
 * suggestion was *chosen*, which is not part of the question being asked.
 *
 * `isReady` is the same test the submit button uses, so the star and the button
 * agree about what "filled in" means rather than each deciding for itself.
 */
export function favouriteForSearch(
  values: JourneyFormValues,
): ItineraryFavourite | null {
  const { origin, destination } = values;
  if (!isReady(values) || origin === null || destination === null) return null;

  return {
    kind: 'itinerary',
    nickname: null,
    origin: { label: origin.label, lat: origin.lat, lon: origin.lon },
    destination: {
      label: destination.label,
      lat: destination.lat,
      lon: destination.lon,
    },
    pace: values.pace,
  };
}
