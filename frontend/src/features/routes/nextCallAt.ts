import type { NetworkMoment } from '../stops/minutesUntil';
import { minutesUntil } from '../stops/minutesUntil';
import type { TripCall, VariantTrip } from '../../types/route';

/**
 * The next vehicle to leave a given stop of a line.
 *
 * A whole service day is already in hand, so this is arithmetic rather than a
 * request — which is what lets the answer keep moving between clock ticks
 * without asking the backend anything.
 *
 * **Not simply the first trip's call.** `trips` is ordered by each trip's own
 * first departure, which is not the same order as the times at stop *k*: a
 * short working joining the line halfway down can leave its origin later than
 * an all-day trip and reach a mid-route stop sooner. So every trip is
 * considered and the earliest surviving call wins.
 *
 * `now` being null is a real and useful state rather than a missing value. On a
 * day that is not today there is no clock to measure against, and the honest
 * answer to "what leaves here" is the first departure of that day — which is
 * exactly what falls out of having nothing to compare against.
 */
export interface NextCall {
  call: TripCall;
  /** Which stop of the pattern this is, so a caller can key on it. */
  sequence: number;
  /** Where it is going, for a row that wants to say. Null when unsigned. */
  headsign: string | null;
  /**
   * Minutes from `now`, or null when there is no clock. Never negative — a
   * call already gone is not the next one.
   */
  minutes: number | null;
}

export function nextCallAt(
  trips: VariantTrip[],
  sequence: number,
  now: NetworkMoment | null,
): NextCall | null {
  let best: NextCall | null = null;

  for (const trip of trips) {
    const call = trip.calls[sequence];
    if (call === undefined || call === null) continue;

    let minutes: number | null = null;
    if (now !== null) {
      minutes = minutesUntil(call, now);
      /*
       * An unreadable time is dropped rather than treated as imminent. A null
       * from `minutesUntil` means one of the two moments could not be parsed,
       * and a row that cannot be placed in time has no business being the
       * answer to "what is next".
       */
      if (minutes === null || minutes < 0) continue;
    }

    if (best === null || isEarlier(call, best.call, minutes, best.minutes)) {
      best = { call, sequence, headsign: trip.headsign, minutes };
    }
  }

  return best;
}

/**
 * Which of two calls comes first.
 *
 * With a clock, the countdowns decide — they already account for a call falling
 * on the next date, which is the whole reason `minutesUntil` takes dates. With
 * no clock, the date and the 24-hour time compare lexically, which is why every
 * time on the wire is 24-hour and zero-padded.
 */
function isEarlier(
  call: TripCall,
  incumbent: TripCall,
  minutes: number | null,
  incumbentMinutes: number | null,
): boolean {
  if (minutes !== null && incumbentMinutes !== null) return minutes < incumbentMinutes;
  return `${call.date}T${call.time}` < `${incumbent.date}T${incumbent.time}`;
}
