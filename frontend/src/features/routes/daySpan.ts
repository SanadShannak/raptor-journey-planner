import type { VariantTrip } from '../../types/route';

/**
 * When the line's first and last vehicle of a day leave their origin.
 *
 * Distinct from the `firstDeparture`/`lastDeparture` a variant carries, and the
 * difference is the whole reason this exists: those are the pattern's span
 * across *every* service it runs, so they answer "how early does this line ever
 * start" rather than "when does it start on a Sunday". Beside a date, the
 * lifetime span reads as a claim about that date, and on a line whose weekend
 * service is shorter it is a wrong one.
 *
 * Measured at the **origin**, not at whichever stop happens to have a time. A
 * span read from the last stop would say a line runs until 21:48 when the last
 * vehicle you can actually board leaves at 21:09.
 *
 * And measured over one service day rather than one calendar date, which are
 * not the same set of trips near midnight — see the filter below.
 *
 * Null when the day has no trips, which is a real answer: a line does not run
 * every day, and saying so is better than a span of nothing.
 */
export interface DaySpan {
  first: string;
  last: string;
}

export function daySpan(trips: VariantTrip[], serviceDate: string): DaySpan | null {
  let first: string | null = null;
  let last: string | null = null;

  for (const trip of trips) {
    /*
     * This day's own service, and not the tail of the one before it. A board
     * for Thursday legitimately contains Wednesday's 24:10 running as 00:10,
     * and counting it makes a tram line that starts at 05:37 report itself as
     * running "from 12:10 AM" — which is true of the clock and false of the
     * line.
     */
    if (trip.serviceDate !== serviceDate) continue;

    /*
     * The trip's own first call rather than `calls[0]`. A short working joins
     * the line partway down, so its origin is a hole — and reading the hole as
     * "no time" would drop it from the span it belongs to.
     */
    const start = trip.calls.find((call) => call !== null);
    if (start === undefined || start === null) continue;

    // Compared as `date` then 24-hour `time`, which sorts lexically — the
    // reason every time on the wire is zero-padded and 24-hour.
    const stamp = `${start.date}T${start.time}`;
    if (first === null || stamp < first) first = stamp;
    if (last === null || stamp > last) last = stamp;
  }

  if (first === null || last === null) return null;
  return { first: first.slice(11), last: last.slice(11) };
}

/**
 * Where a variant sits relative to a day: running, finished, not yet started,
 * or in service without calling on this particular day.
 *
 * Answered from the variant's own service days rather than from a range, so a
 * variant that ran in August and runs again in October is correctly "not
 * running today" in September rather than "running" because the day falls
 * between its ends.
 *
 * `onOtherDays` is that same "not today" answer for a day that is neither
 * before the first service day nor after the last — a Sunday-only variant
 * checked on a Wednesday, say, or the September gap above. It has already
 * started and has not finished, so it is neither `upcoming` (which promises a
 * day that has not come yet) nor `past` — it runs, just not today.
 *
 * `unknown` is for a variant with no service days at all — the feed's calendar
 * has nothing to say about it, which is not the same as it having stopped.
 */
export type ServiceStanding = 'running' | 'past' | 'upcoming' | 'onOtherDays' | 'unknown';

export function standingOn(serviceDates: string[], day: string | null): ServiceStanding {
  if (serviceDates.length === 0) return 'unknown';
  if (day === null) return 'unknown';
  if (serviceDates.includes(day)) return 'running';

  const first = serviceDates[0];
  if (first !== undefined && day < first) return 'upcoming';

  const last = serviceDates[serviceDates.length - 1];
  if (last !== undefined && last < day) return 'past';

  // Within its own first-to-last span, but not one of its actual service
  // days — a rest day in an otherwise recurring pattern, or a genuine
  // seasonal gap. Either way it has already started and has not finished.
  return 'onOtherDays';
}

/** The two ends of a variant's service, for a "runs from … to …" line. */
export function serviceRange(
  serviceDates: string[],
): { from: string; to: string } | null {
  const from = serviceDates[0];
  const to = serviceDates[serviceDates.length - 1];
  if (from === undefined || to === undefined) return null;
  return { from, to };
}
