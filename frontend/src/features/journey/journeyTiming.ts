import type { Journey, JourneyLeg } from '../../types/journey';

/**
 * How long each part of a journey lasts, measured from the times the itinerary
 * actually shows.
 *
 * The API reports both a duration and a pair of clock times for every leg, and
 * they do not always agree — not because either is wrong, but because they are
 * rounded for different purposes. `formatDuration` rounds a duration to the
 * nearest minute, while `convertSecondsToTimeOfDay` rounds an arrival *up* and
 * a departure *down*, so that a traveller is never told they arrive earlier or
 * may leave later than the truth. Both are the right answer to their own
 * question. Together they can differ by up to two minutes:
 *
 *     arrive 01:49:10 → shown as 01:50   (ceiling)
 *     depart 01:52:50 → shown as 01:52   (floor)
 *     true wait 3m40s → reported as 4 minutes
 *
 * which puts "wait 4 minutes" between two times two minutes apart. The same
 * arithmetic runs the other way on a leg, where the ceiling and floor widen
 * the gap instead: "ride 9 min" printed between times ten minutes apart.
 *
 * A reader can check the clock. They cannot check a duration that was computed
 * from seconds they were never shown — so where the two disagree, the times
 * win, and every duration on the page is derived from them. **The API's times
 * are passed through untouched**; this changes only which of the two numbers
 * the interface repeats.
 *
 * The pleasant consequence is that the arithmetic closes. Legs and waits tile
 * the journey end to end, so the parts now add up to the whole exactly, which
 * they could not do while each was rounded on its own.
 */

/** A moment the API has already committed to: a service date and a wall clock. */
export interface Moment {
  date: string;
  time: string;
}

export interface LegTiming {
  leg: JourneyLeg;
  /**
   * Where the leg begins as the itinerary draws it.
   *
   * Its own departure, except where the rounding put that *before* the arrival
   * of the leg before it. There the two are drawn as a single moment, and this
   * is that moment — so the leg is measured from the time on the page rather
   * than from one that was never shown.
   */
  start: Moment;
  end: Moment;
  /** Minutes on foot or on board, as the two times above imply. */
  minutes: number;
  /** Minutes stood still before it. Never negative, and 0 collapses the stop. */
  waitMinutes: number;
}

/** Minutes since an arbitrary epoch, or null if the value is not readable. */
function absoluteMinutes({ date, time }: Moment): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})/.exec(time);
  if (!day || !clock) return null;

  /*
   * Built from parts and in UTC, which is the same reason `parseIsoDate`
   * exists: this only ever needs the number of days between two service dates,
   * and a local Date would fold an hour of daylight saving into that count.
   */
  const midnight = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  if (Number.isNaN(midnight)) return null;

  return midnight / 60_000 + Number(clock[1]) * 60 + Number(clock[2]);
}

/**
 * Whole minutes from one published moment to another.
 *
 * Zero when either cannot be read — the fields are guaranteed by the contract,
 * so an unreadable one is a broken response rather than a shorter journey.
 */
export function minutesBetween(from: Moment, to: Moment): number {
  const start = absoluteMinutes(from);
  const end = absoluteMinutes(to);
  if (start === null || end === null) return 0;
  return end - start;
}

export function legTimings(journey: Journey): LegTiming[] {
  return journey.legs.map((leg, index) => {
    const previous = journey.legs[index - 1];
    const departure: Moment = { date: leg.startDate, time: leg.startTime };
    const end: Moment = { date: leg.endDate, time: leg.endTime };

    const arrival: Moment | null =
      previous === undefined
        ? null
        : { date: previous.endDate, time: previous.endTime };

    const gap = arrival === null ? 0 : minutesBetween(arrival, departure);
    /*
     * A gap of zero or less means the rounding closed it: the two moments are
     * the same minute on the page, or the arrival was rounded past the
     * departure. Either way there is nothing to wait through, and the leg
     * starts where the one before it ended.
     */
    const start = arrival !== null && gap <= 0 ? arrival : departure;

    return {
      leg,
      start,
      end,
      minutes: Math.max(0, minutesBetween(start, end)),
      waitMinutes: Math.max(0, gap),
    };
  });
}
