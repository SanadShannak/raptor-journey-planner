import type { WalkingPace } from '../../config/journey';
import type { Place } from '../../types/place';

/**
 * What the planner is being asked, as a value.
 *
 * The page owns it and the form renders it, which is why it lives in neither:
 * both need it, and a search is a thing in its own right — it is what goes
 * into the URL, what the engine is asked, and what the results on screen are
 * an answer to.
 */
export interface JourneyFormValues {
  origin: Place | null;
  destination: Place | null;
  date: string;
  time: string;
  pace: WalkingPace;
}

/** Complete enough to ask the engine about. */
export function isReady(values: JourneyFormValues): boolean {
  return (
    values.origin !== null &&
    values.destination !== null &&
    values.date !== '' &&
    values.time !== ''
  );
}

/**
 * What a search actually depends on, as a comparable string.
 *
 * Two callers ask slightly different questions of it: the form asks "has this
 * changed since I last searched", to avoid repeating itself, and the page asks
 * "do the results on screen still belong to what the form now says", to clear
 * them when they no longer do.
 *
 * Coordinates rather than labels, because coordinates are what is sent. Two
 * differently-worded suggestions for the same doorway are the same journey.
 */
export function searchSignature(values: JourneyFormValues): string {
  return [
    values.origin?.lat,
    values.origin?.lon,
    values.destination?.lat,
    values.destination?.lon,
    values.date,
    values.time,
    values.pace,
  ].join('|');
}
