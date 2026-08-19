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
