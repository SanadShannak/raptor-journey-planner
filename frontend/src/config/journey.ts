/**
 * Domain constants that mirror values baked into the routing engine.
 */

/**
 * Walking pace the engine falls back to when `WALKING_SPEED_MPS` is omitted,
 * in metres per second (≈4.6 km/h).
 *
 * Mirrors the default parameter of `raptorEngine()` in
 * `backend/raptor-engines/raptorEngine.js`. It is duplicated here only so the
 * UI can show the user what they are about to change; if the engine's default
 * moves, this must move with it.
 *
 * The backend accepts any value greater than zero and applies no upper bound,
 * so the UI is responsible for keeping the input within a sensible range.
 */
export const DEFAULT_WALKING_SPEED_MPS = 1.27778;

/** The pace options offered in the form. */
export type WalkingPace = 'slow' | 'calm' | 'average' | 'fast';

/**
 * Paces offered to the traveller, in metres per second.
 *
 * Presented in km/h because that is how people think about walking, and sent
 * in m/s because that is what the engine takes. `average` is exactly the
 * engine's own default, so choosing it changes nothing — which is what makes
 * it the sensible starting selection.
 *
 * A fixed set rather than a free number: the backend enforces no upper bound,
 * so an open input would happily accept 400 m/s and return an itinerary that
 * has the traveller outrunning the trains.
 */
export const WALKING_PACES: Record<WalkingPace, number> = {
  slow: 2.5 / 3.6,
  calm: 3.5 / 3.6,
  average: DEFAULT_WALKING_SPEED_MPS,
  fast: 6 / 3.6,
};

/** The order they appear in the form, slowest first. */
export const WALKING_PACE_ORDER: readonly WalkingPace[] = [
  'slow',
  'calm',
  'average',
  'fast',
];

export const DEFAULT_WALKING_PACE: WalkingPace = 'average';

/** Narrows an unknown string, so a hand-edited URL cannot inject a pace. */
export function isWalkingPace(value: string | null): value is WalkingPace {
  return value !== null && value in WALKING_PACES;
}
