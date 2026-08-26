import type { NetworkMoment } from '../stops/minutesUntil';
import type { TripCall, VariantTrip } from '../../types/route';

/**
 * Where each vehicle on a line has got to.
 *
 * This exists because of something the stop list was already telling the truth
 * about and could not explain. Read down a line at rush hour and the next
 * departure at each stop climbs — 15:44, 15:46, 15:47 — and then suddenly
 * *drops* to 15:41. Nothing is wrong: the later stops are being answered by a
 * vehicle that set off earlier and is already halfway down the line, while the
 * earlier ones are answered by the one behind it. Two vehicles, one line. The
 * times said so and only somebody who already knew would hear it.
 *
 * Drawing the vehicles is the explanation. Once you can see two circles on the
 * spine, a time that goes backwards between two stops stops being a glitch and
 * becomes the obvious consequence of where they are.
 *
 * Everything here is arithmetic on the day's timetable, which is already in
 * hand — no request, no live feed. It is **scheduled** position, not observed:
 * where the timetable says a vehicle should be, which is the only thing this
 * data can support and is worth being plain about in the interface.
 */

const SECONDS_PER_DAY = 86_400;

/**
 * `YYYY-MM-DD` to a day number.
 *
 * A count of days since an arbitrary epoch — only differences are ever read.
 * `Date.UTC` is used for its leap-year rules, not for any notion of an instant,
 * and is safe because every operand is built the same way so the zone cancels.
 * The same approach as `minutesUntil`, and for the same reasons.
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

/** `HH:mm` to seconds from that date's midnight. */
function secondOfDay(clockTime: string): number | null {
  const parts = clockTime.split(':');
  const [hours, minutes] = parts.map(Number);
  if (hours === undefined || minutes === undefined) return null;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 3600 + minutes * 60;
}

/**
 * A moment on one continuous scale, so two of them can simply be subtracted.
 *
 * Both sides are already wall clock in the network's zone, so no conversion is
 * involved — the day number is only there to keep 00:10 tomorrow *after* 23:50
 * tonight rather than fourteen hundred minutes before it.
 */
export function absoluteSeconds(date: string, time: string, extraSeconds = 0): number | null {
  const day = dayNumber(date);
  const withinDay = secondOfDay(time);
  if (day === null || withinDay === null) return null;
  return day * SECONDS_PER_DAY + withinDay + extraSeconds;
}

/** The clock, on the same scale as a scheduled call. */
export function nowSeconds(now: NetworkMoment): number | null {
  /*
   * `time` is whole minutes, so the seconds have to come from `secondOfDay`
   * rather than from it — and only the part past the minute, or the minute
   * would be counted twice.
   */
  const past = now.secondOfDay === undefined ? 0 : now.secondOfDay % 60;
  return absoluteSeconds(now.date, now.time, past);
}

/** Where a vehicle is, in terms of the pattern's own stop sequence. */
export interface VehicleProgress {
  /** The stop it is at, or the one it has most recently left. */
  fromSequence: number;
  /** The stop it is running towards. Null while it is standing at one. */
  toSequence: number | null;
  /**
   * How far along the leg from `fromSequence` to `toSequence`, 0 to 1.
   *
   * Zero while standing at a stop, which is what `toSequence: null` also says.
   */
  fraction: number;
  /** Standing at a stop rather than running between two. */
  atStop: boolean;
}

/** One vehicle: which trip it is running, and where it has got to. */
export interface Vehicle {
  trip: VariantTrip;
  progress: VehicleProgress;
}

interface Call {
  sequence: number;
  arrival: number;
  departure: number;
}

/**
 * The trip's calls as absolute seconds, holes removed.
 *
 * The holes are dropped **here and only here**. Everywhere else a `null` call
 * has to stay in place because the array is indexed by stop position; but a
 * vehicle running a trip that skips a stop simply drives past it, so for the
 * purpose of asking where it is, the schedule is the calls it actually makes.
 */
function timedCalls(trip: VariantTrip): Call[] {
  const calls: Call[] = [];

  trip.calls.forEach((call: TripCall | null, sequence: number) => {
    if (call === null) return;
    const arrival = absoluteSeconds(call.arrivalDate, call.arrivalTime);
    const departure = absoluteSeconds(call.date, call.time);
    if (arrival === null || departure === null) return;
    calls.push({ sequence, arrival, departure });
  });

  return calls;
}

/**
 * Where one trip's vehicle is at a given moment, or null when it is not out.
 *
 * Null before its first arrival and after its last departure, which are the two
 * states a line's own page has nothing to draw for: a vehicle that has not left
 * the depot is not on the line, and one that has finished is not either.
 */
export function progressOf(trip: VariantTrip, atSeconds: number): VehicleProgress | null {
  const calls = timedCalls(trip);
  const first = calls[0];
  const last = calls[calls.length - 1];
  if (first === undefined || last === undefined) return null;

  if (atSeconds < first.arrival || atSeconds > last.departure) return null;

  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index] as Call;

    // Standing at it: between pulling in and pulling out. On a feed with no
    // dwell those two are equal, so this is the instant of the call itself.
    if (atSeconds >= call.arrival && atSeconds <= call.departure) {
      return { fromSequence: call.sequence, toSequence: null, fraction: 0, atStop: true };
    }

    const next = calls[index + 1];
    if (next === undefined) break;

    if (atSeconds > call.departure && atSeconds < next.arrival) {
      const leg = next.arrival - call.departure;
      return {
        fromSequence: call.sequence,
        toSequence: next.sequence,
        /*
         * A zero-length leg would divide by zero. It means two stops share a
         * time, which a feed can carry, and the honest answer is "at the first
         * of them" rather than NaN.
         */
        fraction: leg <= 0 ? 0 : (atSeconds - call.departure) / leg,
        atStop: false,
      };
    }
  }

  return null;
}

/**
 * Every vehicle out on this pattern right now.
 *
 * Ordered by how far along they are, furthest first, so a caller drawing them
 * can rely on the order — and so the one nearest the end of the line is the one
 * a reader meets first coming down the list.
 */
export function activeVehicles(trips: VariantTrip[], atSeconds: number): Vehicle[] {
  const out: Vehicle[] = [];

  for (const trip of trips) {
    const progress = progressOf(trip, atSeconds);
    if (progress !== null) out.push({ trip, progress });
  }

  return out.sort(
    (a, b) =>
      b.progress.fromSequence - a.progress.fromSequence ||
      b.progress.fraction - a.progress.fraction,
  );
}
