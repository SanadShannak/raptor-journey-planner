/*
 * The one place a time is rounded to a whole minute.
 *
 * Arrivals round up and departures round down, so a traveller is never told
 * they arrive earlier, or may leave later, than they really can. That is a
 * deliberate safety margin and it is why this takes a mode at all.
 *
 * It exists as its own function because two things need the *same* rounding:
 * the clock strings a client displays, and the durations published beside
 * them. While the strings were rounded here and the durations were rounded
 * separately from raw seconds, the two disagreed — an arrival pushed up and a
 * departure pushed down can close a gap by nearly two minutes, which is how a
 * response came to say "wait 4 minutes" between 01:50 and 01:52.
 *
 * Seconds arrive from the engine as an absolute count that already carries the
 * day offset, so a value may exceed a day or be negative. Both round correctly
 * here, and a difference between two rounded values needs no date arithmetic.
 */
function roundSecondsToMinute(totalSeconds, roundMode = "floor") {
  if (totalSeconds === null || totalSeconds === undefined) {
    return null;
  }

  return roundMode === "ceil"
    ? Math.ceil(totalSeconds / 60) * 60
    : Math.floor(totalSeconds / 60) * 60;
}

module.exports = roundSecondsToMinute;
