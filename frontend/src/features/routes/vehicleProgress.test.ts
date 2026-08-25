import { describe, expect, it } from 'vitest';
import { activeVehicles, nowSeconds, progressOf } from './vehicleProgress';
import { nextCallAt } from './nextCallAt';
import type { VariantTrip } from '../../types/route';

/*
 * Where a vehicle is, from the timetable alone.
 *
 * The cases worth pinning are the ones a reader cannot check by eye: a vehicle
 * standing at a stop against one running between two, a leg that crosses
 * midnight, and the several-vehicles-at-once case that this whole feature
 * exists to explain.
 */

const call = (time: string, arrivalTime = time, date = '2026-09-10') => ({
  date,
  time,
  arrivalDate: date,
  arrivalTime,
});

const trip = (calls: VariantTrip['calls'], tripId = 't'): VariantTrip => ({
  tripId,
  serviceDate: '2026-09-10',
  headsign: 'Käpylä',
  calls,
});

/** 2026-09-10 at the given wall clock, as this module counts. */
const at = (time: string, seconds = 0) =>
  nowSeconds({ date: '2026-09-10', time, secondOfDay: seconds })!;

const NOW = { date: '2026-09-10', time: '15:44' };

describe('nowSeconds', () => {
  /* The minute comes from `time` and only the remainder from `secondOfDay`,
     or the minute would be counted twice. */
  it('adds the seconds past the minute, not the whole day twice', () => {
    const onTheMinute = nowSeconds({ date: '2026-09-10', time: '15:44', secondOfDay: 56_640 });
    const halfPast = nowSeconds({ date: '2026-09-10', time: '15:44', secondOfDay: 56_670 });

    expect(halfPast! - onTheMinute!).toBe(30);
  });

  it('works from a moment with no seconds at all', () => {
    expect(nowSeconds({ date: '2026-09-10', time: '15:44' })).toBe(
      nowSeconds({ date: '2026-09-10', time: '15:44', secondOfDay: 56_640 }),
    );
  });
});

describe('progressOf', () => {
  const RUN = trip([call('15:40'), call('15:44'), call('15:50')]);

  it('is nowhere before it sets off and after it finishes', () => {
    expect(progressOf(RUN, at('15:39'))).toBeNull();
    expect(progressOf(RUN, at('15:51'))).toBeNull();
  });

  it('stands at a stop at the moment it calls there', () => {
    expect(progressOf(RUN, at('15:44'))).toEqual({
      fromSequence: 1,
      toSequence: null,
      fraction: 0,
      atStop: true,
    });
  });

  it('runs between two stops, in proportion to the time between them', () => {
    // Three of the six minutes from 15:44 to 15:50.
    const half = progressOf(RUN, at('15:47'));

    expect(half?.fromSequence).toBe(1);
    expect(half?.toSequence).toBe(2);
    expect(half?.atStop).toBe(false);
    expect(half?.fraction).toBeCloseTo(0.5, 5);
  });

  /* Seconds are the whole reason the clock carries them: at minute resolution
     a vehicle jumps between six positions on this leg instead of gliding. */
  it('moves within the minute', () => {
    const early = progressOf(RUN, at('15:47', 15 * 60 + 47 * 3600 + 0));
    const late = progressOf(RUN, at('15:47', 47 * 3600 + 15 * 60 + 30));

    expect(late!.fraction).toBeGreaterThan(early!.fraction);
  });

  /* A dwell is a real state: pulled in, not yet pulled out. */
  it('stands at a stop for the whole of its dwell', () => {
    const dwelling = trip([call('06:00'), call('06:10', '06:08'), call('06:20')]);

    expect(progressOf(dwelling, at('06:09'))?.atStop).toBe(true);
    expect(progressOf(dwelling, at('06:09'))?.fromSequence).toBe(1);
    // A second past the departure and it is running again.
    expect(progressOf(dwelling, at('06:11'))?.atStop).toBe(false);
  });

  /*
   * A hole is dropped here and only here. Everywhere else `calls` is indexed by
   * stop position so a hole has to stay; but a vehicle running a trip that
   * skips a stop simply drives past it.
   */
  it('drives past a stop the trip does not call at', () => {
    const skipping = trip([call('15:40'), null, call('15:50')]);

    const running = progressOf(skipping, at('15:45'));
    expect(running?.fromSequence).toBe(0);
    expect(running?.toSequence).toBe(2);
  });

  it('crosses midnight without going backwards', () => {
    const late = trip([
      call('23:50'),
      call('00:10', '00:10', '2026-09-11'),
    ]);

    const before = progressOf(late, at('23:55'));
    expect(before?.fromSequence).toBe(0);
    expect(before?.fraction).toBeCloseTo(0.25, 5);

    // Ten past midnight is the next day, and the trip is at its last stop.
    const after = progressOf(late, nowSeconds({ date: '2026-09-11', time: '00:10' })!);
    expect(after?.atStop).toBe(true);
  });

  it('is nowhere for a trip with no readable calls', () => {
    expect(progressOf(trip([null, null]), at('15:44'))).toBeNull();
  });

  it('answers "at the first" rather than NaN when two stops share a time', () => {
    const instant = trip([call('15:40'), call('15:40'), call('15:50')]);

    expect(progressOf(instant, at('15:40'))?.fraction).toBe(0);
  });
});

describe('activeVehicles', () => {
  /*
   * The case the feature exists for. Two vehicles are out at once, so the next
   * departure at a late stop belongs to the one ahead and reads *earlier* than
   * the next departure at a stop behind it. Nothing is wrong; it just needed
   * saying.
   */
  it('finds every vehicle out at once, furthest along first', () => {
    const ahead = trip([call('15:20'), call('15:38'), call('15:46')], 'ahead');
    const behind = trip([call('15:40'), call('15:50'), call('16:01')], 'behind');
    const finished = trip([call('14:00'), call('14:10'), call('14:21')], 'finished');
    const notYet = trip([call('17:00'), call('17:10'), call('17:21')], 'notYet');

    const out = activeVehicles([ahead, behind, finished, notYet], at('15:44'));

    expect(out.map((vehicle) => vehicle.trip.tripId)).toEqual(['ahead', 'behind']);
    expect(out[0]?.progress.fromSequence).toBe(1);
    expect(out[1]?.progress.fromSequence).toBe(0);
  });

  /*
   * The report this feature answers, written down as a test.
   *
   * With those same two vehicles out, the next departure at stop 2 is 15:46 and
   * at stop 1 it is 15:50 — so reading *down* the line the times go backwards.
   * That is correct and always was: stop 2 is being answered by the vehicle
   * ahead, stop 1 by the one behind it. Drawing both is what makes it legible.
   */
  it('is why a later stop can show an earlier time', () => {
    const ahead = trip([call('15:20'), call('15:38'), call('15:46')], 'ahead');
    const behind = trip([call('15:40'), call('15:50'), call('16:01')], 'behind');

    const nextAtStopOne = nextCallAt([ahead, behind], 1, NOW);
    const nextAtStopTwo = nextCallAt([ahead, behind], 2, NOW);

    expect(nextAtStopOne?.call.time).toBe('15:50');
    expect(nextAtStopTwo?.call.time).toBe('15:46');
    // Later stop, earlier time — and two vehicles on the line to explain it.
    expect(nextAtStopTwo!.call.time < nextAtStopOne!.call.time).toBe(true);
    expect(activeVehicles([ahead, behind], at('15:44'))).toHaveLength(2);
  });

  it('is empty when nothing is out', () => {
    expect(activeVehicles([trip([call('06:00'), call('06:10')])], at('15:44'))).toEqual([]);
    expect(activeVehicles([], at('15:44'))).toEqual([]);
  });
});
