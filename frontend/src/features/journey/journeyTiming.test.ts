import { describe, expect, it } from 'vitest';
import { legTimings, minutesBetween } from './journeyTiming';
import type { Journey, Stop, TransitLeg } from '../../types/journey';

const anywhere: Stop = { id: '1', name: 'A', code: null, lat: 60, lon: 24 };

/**
 * A ride whose reported duration is deliberately a lie.
 *
 * That is the whole subject: the backend rounds a duration to the nearest
 * minute but rounds an arrival up and a departure down, so the two numbers
 * answer different questions and disagree by up to two minutes. `reported` is
 * what the API says; the times are what it shows.
 */
function ride(
  start: string,
  end: string,
  reported: number,
  reportedWait = 0,
  dates: { start?: string; end?: string } = {},
): TransitLeg {
  return {
    mode: 'TRANSIT',
    waitDurationMinutes: reportedWait,
    startDate: dates.start ?? '2026-08-24',
    startTime: start,
    endDate: dates.end ?? dates.start ?? '2026-08-24',
    endTime: end,
    fromStop: anywhere,
    toStop: anywhere,
    shape: [
      [60, 24],
      [60, 24],
    ],
    routeShortName: '55',
    routeType: 3,
    lineId: 'bus-55',
    routeLongName: null,
    directionId: null,
    headsign: null,
    destination: null,
    intermediateStops: [],
    tripId: 't',
    transitDurationMinutes: reported,
    transitDistanceMeters: 1000,
    walkDurationMinutes: null,
    walkDistanceMeters: null,
  };
}

function journeyOf(legs: Journey['legs']): Journey {
  return {
    startDate: '2026-08-24',
    startTime: legs[0]?.startTime ?? '18:00',
    endDate: '2026-08-24',
    endTime: legs[legs.length - 1]?.endTime ?? '19:00',
    totalDurationMinutes: 999,
    legs,
  };
}

describe('minutesBetween', () => {
  it('counts the minutes between two moments', () => {
    const at = (time: string) => ({ date: '2026-08-24', time });
    expect(minutesBetween(at('18:00'), at('18:24'))).toBe(24);
    expect(minutesBetween(at('18:24'), at('18:24'))).toBe(0);
    // Backwards is negative rather than absolute; a caller decides what to do.
    expect(minutesBetween(at('18:24'), at('18:20'))).toBe(-4);
  });

  /*
   * An itinerary may legitimately cross midnight — the engine loads
   * yesterday, today and tomorrow — so the date is what carries the rollover
   * and the clock alone would read as minus twenty-three hours.
   */
  it('crosses midnight on the date, not the clock', () => {
    expect(
      minutesBetween(
        { date: '2026-08-24', time: '23:52' },
        { date: '2026-08-25', time: '00:07' },
      ),
    ).toBe(15);
  });

  // A daylight-saving boundary is a local-time problem; whole days are not.
  it('is unmoved by a daylight-saving boundary', () => {
    expect(
      minutesBetween(
        { date: '2026-10-24', time: '12:00' },
        { date: '2026-10-26', time: '12:00' },
      ),
    ).toBe(2880);
  });

  it('answers zero for a value it cannot read', () => {
    expect(minutesBetween({ date: '', time: '18:00' }, { date: '2026-08-24', time: '18:10' })).toBe(0);
    expect(minutesBetween({ date: '2026-08-24', time: 'noon' }, { date: '2026-08-24', time: '18:10' })).toBe(0);
  });
});

describe('legTimings', () => {
  it('measures a leg from its own two times, not its reported duration', () => {
    // Rounded outward at both ends: the ride is shown as ten minutes long.
    const [timing] = legTimings(journeyOf([ride('18:00', '18:10', 9)]));

    expect(timing?.minutes).toBe(10);
  });

  /*
   * The reported case. An arrival rounded up and a departure rounded down can
   * close a gap of nearly two minutes, so a wait of four is printed between
   * times two apart — which is what "wait 1 minute at 01:49, leave 01:49"
   * was, one minute at a time.
   */
  it('measures a wait from the two times it sits between', () => {
    const [, second] = legTimings(
      journeyOf([
        ride('01:30', '01:50', 20),
        ride('01:52', '02:10', 18, 4),
      ]),
    );

    // Not the reported 4.
    expect(second?.waitMinutes).toBe(2);
  });

  it('reports no wait when the rounding closed the gap', () => {
    const [, second] = legTimings(
      journeyOf([
        ride('01:30', '01:49', 19),
        ride('01:49', '02:10', 21, 1),
      ]),
    );

    expect(second?.waitMinutes).toBe(0);
  });

  /*
   * The awkward one. A ceiling can push an arrival *past* a floored
   * departure, so the two moments run backwards. The stop is drawn once, and
   * the leg has to be measured from the time that is actually on the page —
   * otherwise the wait vanishes but the ride keeps a minute the reader cannot
   * account for.
   */
  it('starts a leg where the previous one ended when the times run backwards', () => {
    const [, second] = legTimings(
      journeyOf([
        ride('01:30', '01:50', 20),
        ride('01:49', '02:10', 21, 1),
      ]),
    );

    expect(second?.waitMinutes).toBe(0);
    expect(second?.start).toEqual({ date: '2026-08-24', time: '01:50' });
    // 01:50 to 02:10, which is what the two nodes either side of it will say.
    expect(second?.minutes).toBe(20);
  });

  it('never reports a negative wait or a negative leg', () => {
    const timings = legTimings(
      journeyOf([
        ride('01:30', '01:50', 20),
        ride('01:45', '01:48', 3, 1),
      ]),
    );

    expect(timings.every((t) => t.waitMinutes >= 0 && t.minutes >= 0)).toBe(true);
  });

  /*
   * What the whole exercise is for: the parts tile the journey, so they add up
   * to the gap between its first time and its last.
   */
  it('tiles the journey exactly', () => {
    const journey = journeyOf([
      ride('18:00', '18:24', 23),
      ride('18:30', '18:50', 21, 6),
      ride('18:52', '19:05', 12, 2),
    ]);

    const total = legTimings(journey).reduce(
      (sum, timing) => sum + timing.minutes + timing.waitMinutes,
      0,
    );

    expect(total).toBe(
      minutesBetween(
        { date: journey.startDate, time: journey.startTime },
        { date: journey.endDate, time: journey.endTime },
      ),
    );
    expect(total).toBe(65);
  });

  it('carries a wait across midnight', () => {
    const [, second] = legTimings(
      journeyOf([
        ride('23:40', '23:52', 12),
        ride('00:07', '00:20', 13, 15, { start: '2026-08-25' }),
      ]),
    );

    expect(second?.waitMinutes).toBe(15);
  });
});
