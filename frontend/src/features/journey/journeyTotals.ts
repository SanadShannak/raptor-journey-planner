import type { Journey, TransitLeg } from '../../types/journey';
import { legTimings } from './journeyTiming';

/**
 * What an itinerary adds up to.
 *
 * The API reports each leg but never the journey's own arithmetic, so the
 * numbers a traveller actually compares — how far they are on their feet, how
 * long they stand at a stop — do not exist until something works them out.
 *
 * Kept as a pure function beside the components rather than inside one,
 * because two views need the same totals and because the null handling below
 * is the sort of rule that is easy to get quietly wrong.
 */
export interface JourneyTotals {
  /**
   * The whole journey, end to end.
   *
   * Summed from the parts rather than read off `totalDurationMinutes`, which
   * is rounded on its own and so need not equal the times printed either side
   * of it. Because every part below is measured between times the itinerary
   * shows, this is exactly the gap between its first and its last — the
   * arithmetic closes, which it could not do before.
   */
  totalMinutes: number;
  /** Vehicle changes, which is one fewer than the number of rides. */
  transfers: number;
  rides: TransitLeg[];
  walkMinutes: number;
  walkMeters: number;
  /** Time standing at a stop, which the API attributes to the leg it precedes. */
  waitMinutes: number;
  transitMinutes: number;
  /**
   * Null when *any* ridden leg has no distance.
   *
   * The field is null feed-wide when `shape_dist_traveled` is missing, so a
   * partial sum would be a smaller number presented as a complete one. No
   * answer is better than a confidently wrong one.
   */
  transitMeters: number | null;
  /** The arrival falls on a later service day than the departure. */
  crossesMidnight: boolean;
}

export function journeyTotals(journey: Journey): JourneyTotals {
  const rides: TransitLeg[] = [];
  let walkMinutes = 0;
  let walkMeters = 0;
  let waitMinutes = 0;
  let transitMinutes = 0;
  let transitMeters: number | null = 0;

  /*
   * Durations come from the clock, distances from the API. A distance has no
   * second reading to disagree with; a duration does, and the one the traveller
   * can check is the gap between the two times printed either side of it.
   */
  for (const { leg, minutes, waitMinutes: waited } of legTimings(journey)) {
    waitMinutes += waited;

    if (leg.mode === 'WALK') {
      walkMinutes += minutes;
      walkMeters += leg.walkDistanceMeters;
      continue;
    }

    rides.push(leg);
    transitMinutes += minutes;
    if (leg.transitDistanceMeters === null) {
      transitMeters = null;
    } else if (transitMeters !== null) {
      transitMeters += leg.transitDistanceMeters;
    }
  }

  return {
    totalMinutes: walkMinutes + waitMinutes + transitMinutes,
    transfers: Math.max(0, rides.length - 1),
    rides,
    walkMinutes,
    walkMeters,
    waitMinutes,
    transitMinutes,
    transitMeters,
    crossesMidnight: journey.endDate !== journey.startDate,
  };
}
