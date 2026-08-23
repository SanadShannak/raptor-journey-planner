import { describe, expect, it } from 'vitest';
import { journeyTotals } from './journeyTotals';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../../types/journey';

const anywhere: Stop = { id: '1', name: 'A', code: null, lat: 60, lon: 24 };

/*
 * The fixtures are built from clock times rather than from a duration passed
 * in, because that is what the totals are now measured from. A leg that claims
 * to last four minutes while its own two times are five apart is not a case
 * worth constructing here — it is the case `journeyTiming` exists to settle,
 * and it is tested there.
 */
function walk(start: string, end: string, meters: number): WalkLeg {
  return {
    mode: 'WALK',
    waitDurationMinutes: 0,
    startDate: '2026-08-24',
    startTime: start,
    endDate: '2026-08-24',
    endTime: end,
    fromStop: anywhere,
    toStop: anywhere,
    shape: [
      [60, 24],
      [60, 24],
    ],
    // Present because the contract has it; deliberately not what is summed.
    walkDurationMinutes: 999,
    walkDistanceMeters: meters,
    routeShortName: null,
    routeType: null,
    lineId: null,
    routeLongName: null,
    directionId: null,
    headsign: null,
    destination: null,
    intermediateStops: null,
    tripId: null,
    transitDurationMinutes: null,
    transitDistanceMeters: null,
  };
}

function ride(start: string, end: string, meters: number | null): TransitLeg {
  return {
    mode: 'TRANSIT',
    waitDurationMinutes: 0,
    startDate: '2026-08-24',
    startTime: start,
    endDate: '2026-08-24',
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
    transitDurationMinutes: 999,
    transitDistanceMeters: meters,
    walkDurationMinutes: null,
    walkDistanceMeters: null,
  };
}

function journeyOf(legs: Journey['legs'], endDate = '2026-08-24'): Journey {
  return {
    startDate: '2026-08-24',
    startTime: legs[0]?.startTime ?? '18:00',
    endDate,
    endTime: legs[legs.length - 1]?.endTime ?? '19:00',
    totalDurationMinutes: 999,
    legs,
  };
}

describe('journeyTotals', () => {
  it('sums walking, waiting, and riding separately', () => {
    const totals = journeyTotals(
      journeyOf([
        walk('18:00', '18:04', 300),
        // Six minutes stood at the stop before this one leaves.
        ride('18:10', '18:20', 2000),
        walk('18:20', '18:27', 550),
      ]),
    );

    expect(totals.walkMinutes).toBe(11);
    expect(totals.walkMeters).toBe(850);
    expect(totals.waitMinutes).toBe(6);
    expect(totals.transitMinutes).toBe(10);
    expect(totals.transitMeters).toBe(2000);
  });

  /*
   * What the derivation buys: the parts tile the journey, so they add up to
   * the span between its first time and its last. Nothing rounded on its own
   * can promise that.
   */
  it('adds up to the whole journey', () => {
    const totals = journeyTotals(
      journeyOf([
        walk('18:00', '18:04', 300),
        ride('18:10', '18:20', 2000),
        walk('18:20', '18:27', 550),
      ]),
    );

    expect(totals.totalMinutes).toBe(27);
    expect(totals.walkMinutes + totals.waitMinutes + totals.transitMinutes).toBe(
      totals.totalMinutes,
    );
  });

  // Changes, not rides: three vehicles means two changes.
  it('counts changes as one fewer than the rides', () => {
    expect(journeyTotals(journeyOf([walk('18:00', '18:04', 300)])).transfers).toBe(0);
    expect(journeyTotals(journeyOf([ride('18:00', '18:10', 100)])).transfers).toBe(0);
    expect(
      journeyTotals(
        journeyOf([
          ride('18:00', '18:10', 100),
          ride('18:12', '18:20', 90),
          ride('18:22', '18:27', 80),
        ]),
      ).transfers,
    ).toBe(2);
  });

  /*
   * The rule worth a test. `transitDistanceMeters` is null feed-wide when
   * `shape_dist_traveled` is missing, so adding up whatever is present would
   * show a partial total as if it were the whole journey.
   */
  it('reports no riding distance at all when any leg lacks one', () => {
    const totals = journeyTotals(
      journeyOf([ride('18:00', '18:10', 2000), ride('18:10', '18:18', null)]),
    );

    expect(totals.transitMeters).toBeNull();
    // The duration is still known, and is still worth showing.
    expect(totals.transitMinutes).toBe(18);
  });

  it('keeps the total when the null leg comes first', () => {
    expect(
      journeyTotals(
        journeyOf([ride('18:00', '18:08', null), ride('18:08', '18:18', 2000)]),
      ).transitMeters,
    ).toBeNull();
  });

  // The engine can legitimately answer with no transit at all.
  it('handles a walking-only journey', () => {
    const totals = journeyTotals(journeyOf([walk('18:00', '18:35', 2600)]));

    expect(totals.rides).toHaveLength(0);
    expect(totals.transfers).toBe(0);
    expect(totals.transitMeters).toBe(0);
    expect(totals.walkMinutes).toBe(35);
  });

  it('notices an arrival on a later service day', () => {
    expect(
      journeyTotals(journeyOf([ride('18:00', '18:30', 100)])).crossesMidnight,
    ).toBe(false);
    expect(
      journeyTotals(journeyOf([ride('18:00', '18:30', 100)], '2026-08-25'))
        .crossesMidnight,
    ).toBe(true);
  });
});
