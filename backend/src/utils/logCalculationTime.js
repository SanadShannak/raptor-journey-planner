/**
 * How long a request's own work took, in the engine's own words.
 *
 * `plannerApi.js` has always timed the RAPTOR call and printed
 * `[API]: Route Calculated in 12.34ms`. Every other endpoint does real work too
 * — walking a spatial grid, merging a service day's trips, scanning every
 * pattern of a line — and none of it was measured, so a slow page could only be
 * guessed at. This is that same measurement for the rest of them, in the same
 * format, so one log stream reads consistently.
 *
 * Deliberately measures the **calculation**, not the whole request: the work
 * between reading the query and having an answer to serialise. Time spent in
 * Express or in the socket is not what any of these handlers can do anything
 * about, and folding it in would make the numbers less useful, not more.
 *
 * Called only on a path that produced an answer. A rejected request did no
 * calculation, and timing the validation that refused it says nothing.
 *
 * @param {string} label What was worked out, e.g. `"Stop Board (1040124)"`.
 * @param {number} startedAt A `performance.now()` reading from before the work.
 */
function logCalculationTime(label, startedAt) {
  const elapsed = (performance.now() - startedAt).toFixed(2);
  console.log(`[API]: ${label} Calculated in ${elapsed}ms`);
}

module.exports = logCalculationTime;
