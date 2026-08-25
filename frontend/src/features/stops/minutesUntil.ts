/**
 * How far away a departure is, in whole minutes.
 *
 * Built from the string parts rather than from `Date`. `new Date('2026-08-24')`
 * parses as UTC midnight and lands on the previous day for anyone west of
 * Greenwich, and a `Date` built from the browser's zone would answer a question
 * about Helsinki with an answer about Toronto. Both sides of this comparison
 * are already wall-clock in the network's zone, so the arithmetic is plain
 * subtraction and no zone is involved at all.
 *
 * Both sides carry their own date, which is what makes an after-midnight
 * departure work: 00:10 tomorrow is twenty minutes after 23:50 tonight, not
 * fourteen hundred minutes before it.
 */

/** A moment as the API publishes one: a service date and a 24-hour clock. */
export interface NetworkMoment {
  date: string;
  time: string;
  /**
   * Seconds since that date's midnight, where the moment came from a clock
   * rather than from a timetable.
   *
   * Optional because a scheduled call has no seconds to give — the API
   * publishes whole minutes — and this interface describes both. Only a caller
   * placing something between two scheduled times needs it.
   */
  secondOfDay?: number;
}

const DAY_MINUTES = 1440;

/**
 * `YYYY-MM-DD` to a day number.
 *
 * A count of days since an arbitrary epoch, not a calendar date — only the
 * difference between two of them is ever read. `Date.UTC` is safe here because
 * both operands are built the same way, so the zone cancels out; it is used for
 * the leap-year rules rather than for any notion of an instant.
 */
function dayNumber(isoDate: string): number | null {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** `HH:mm` to minutes from that date's midnight. */
function minuteOfDay(clockTime: string): number | null {
  const parts = clockTime.split(':');
  if (parts.length < 2) return null;

  const [hours, minutes] = parts.map(Number);
  if (hours === undefined || minutes === undefined) return null;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

/**
 * Minutes from `now` until `at`. Negative once it has gone.
 *
 * Null when either moment cannot be read, which is the honest answer — a
 * caller then shows the clock time alone rather than a countdown it invented.
 */
export function minutesUntil(at: NetworkMoment, now: NetworkMoment): number | null {
  const atDay = dayNumber(at.date);
  const nowDay = dayNumber(now.date);
  const atMinute = minuteOfDay(at.time);
  const nowMinute = minuteOfDay(now.time);

  if (atDay === null || nowDay === null || atMinute === null || nowMinute === null) {
    return null;
  }

  return (atDay - nowDay) * DAY_MINUTES + (atMinute - nowMinute);
}
