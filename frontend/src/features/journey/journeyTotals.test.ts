import { describe, expect, it } from 'vitest';
import { journeyTotals } from './journeyTotals';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../../types/journey';

const anywhere: Stop = { id: '1', name: 'A', code: null, lat: 60, lon: 24 };

function walk(minutes: number, meters: number, wait = 0): WalkLeg {
  return {
    mode: 'WALK',
    waitDurationMinutes: wait,
    startDate: '2026-08-24',
    startTime: '18:00',
    endDate: '2026-08-24',
    endTime: '18:05',
    fromStop: anywhere,
    toStop: anywhere,
    shape: [
      [60, 24],
      [60, 24],
    ],
    walkDurationMinutes: minutes,
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

function ride(
  minutes: number,
  meters: number | null,
  wait = 0,
): TransitLeg {
  return {
    mode: 'TRANSIT',
    waitDurationMinutes: wait,
    startDate: '2026-08-24',
    startTime: '18:05',
    endDate: '2026-08-24',
    endTime: '18:20',
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
    transitDurationMinutes: minutes,
    transitDistanceMeters: meters,
    walkDurationMinutes: null,
    walkDistanceMeters: null,
  };
}

function journeyOf(legs: Journey['legs'], endDate = '2026-08-24'): Journey {
  return {
    startDate: '2026-08-24',
    startTime: '18:00',
    endDate,
    endTime: '19:00',
    totalDurationMinutes: 60,
    legs,
  };
}

describe('journeyTotals', () => {
  it('sums walking, waiting, and riding separately', () => {
    const totals = journeyTotals(
      journeyOf([walk(4, 300), ride(10, 2000, 6), walk(7, 550)]),
    );

    expect(totals.walkMinutes).toBe(11);
    expect(totals.walkMeters).toBe(850);
    expect(totals.waitMinutes).toBe(6);
    expect(totals.transitMinutes).toBe(10);
    expect(totals.transitMeters).toBe(2000);
  });

  // Changes, not rides: three vehicles means two changes.
  it('counts changes as one fewer than the rides', () => {
    expect(journeyTotals(journeyOf([walk(4, 300)])).transfers).toBe(0);
    expect(journeyTotals(journeyOf([ride(10, 100)])).transfers).toBe(0);
    expect(
      journeyTotals(journeyOf([ride(10, 100), ride(8, 90), ride(5, 80)]))
        .transfers,
    ).toBe(2);
  });

  /*
   * The rule worth a test. `transitDistanceMeters` is null feed-wide when
   * `shape_dist_traveled` is missing, so adding up whatever is present would
   * show a partial total as if it were the whole journey.
   */
  it('reports no riding distance at all when any leg lacks one', () => {
    const totals = journeyTotals(journeyOf([ride(10, 2000), ride(8, null)]));

    expect(totals.transitMeters).toBeNull();
    // The duration is still known, and is still worth showing.
    expect(totals.transitMinutes).toBe(18);
  });

  it('keeps the total when the null leg comes first', () => {
    expect(
      journeyTotals(journeyOf([ride(8, null), ride(10, 2000)])).transitMeters,
    ).toBeNull();
  });

  // The engine can legitimately answer with no transit at all.
  it('handles a walking-only journey', () => {
    const totals = journeyTotals(journeyOf([walk(35, 2600)]));

    expect(totals.rides).toHaveLength(0);
    expect(totals.transfers).toBe(0);
    expect(totals.transitMeters).toBe(0);
  });

  it('notices an arrival on a later service day', () => {
    expect(journeyTotals(journeyOf([ride(30, 100)])).crossesMidnight).toBe(false);
    expect(
      journeyTotals(journeyOf([ride(30, 100)], '2026-08-25')).crossesMidnight,
    ).toBe(true);
  });
});
