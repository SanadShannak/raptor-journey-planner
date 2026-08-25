import { describe, expect, it } from 'vitest';
import { daySpan, serviceRange, standingOn } from './daySpan';
import type { VariantTrip } from '../../types/route';

const call = (date: string, time: string) => ({
  date,
  time,
  arrivalDate: date,
  arrivalTime: time,
});

const trip = (calls: VariantTrip['calls']): VariantTrip => ({
  tripId: 't',
  headsign: null,
  calls,
});

describe('daySpan', () => {
  /*
   * Read at the origin, not at whichever stop has a time. A span taken from the
   * last stop would say the line runs until 21:48 when the last vehicle a rider
   * can board leaves at 21:09.
   */
  it('spans the first and last departure from the origin', () => {
    const trips = [
      trip([call('2026-09-10', '05:37'), call('2026-09-10', '06:12')]),
      trip([call('2026-09-10', '21:09'), call('2026-09-10', '21:48')]),
    ];

    expect(daySpan(trips)).toEqual({ first: '05:37', last: '21:09' });
  });

  /* A short working joins the line partway down, so its origin is a hole —
     and reading the hole as "no time" would drop it from the span. */
  it('takes a short working’s own first call rather than the pattern’s', () => {
    const trips = [
      trip([call('2026-09-10', '06:00'), call('2026-09-10', '06:10')]),
      trip([null, call('2026-09-10', '22:30')]),
    ];

    expect(daySpan(trips)).toEqual({ first: '06:00', last: '22:30' });
  });

  it('reads a departure after midnight as the end of the day, not the start', () => {
    const trips = [
      trip([call('2026-09-11', '00:24')]),
      trip([call('2026-09-10', '05:37')]),
    ];

    expect(daySpan(trips)).toEqual({ first: '05:37', last: '00:24' });
  });

  /* A line does not run every day, and saying so beats a span of nothing. */
  it('answers null for a day with no trips', () => {
    expect(daySpan([])).toBeNull();
    expect(daySpan([trip([null, null])])).toBeNull();
  });
});

describe('standingOn', () => {
  const DATES = ['2026-08-31', '2026-09-01', '2026-09-02'];

  it('is running on a day it runs', () => {
    expect(standingOn(DATES, '2026-09-01')).toBe('running');
  });

  it('is past once its last day has gone', () => {
    expect(standingOn(DATES, '2026-09-20')).toBe('past');
  });

  it('is upcoming before its first day', () => {
    expect(standingOn(DATES, '2026-08-01')).toBe('upcoming');
  });

  /*
   * The reason this asks the days rather than a range. A seasonal variant that
   * ran in August and runs again in October is not running in September, and a
   * range would call it "running" because the day falls between its ends.
   */
  it('is not running in a gap between two seasons', () => {
    const seasonal = ['2026-08-10', '2026-08-11', '2026-10-05', '2026-10-06'];

    expect(standingOn(seasonal, '2026-09-10')).toBe('upcoming');
    expect(standingOn(seasonal, '2026-08-11')).toBe('running');
    expect(standingOn(seasonal, '2026-11-01')).toBe('past');
  });

  /* A variant the calendar says nothing about has not "stopped"; it is unknown. */
  it('is unknown with no service days, or with no day to judge against', () => {
    expect(standingOn([], '2026-09-10')).toBe('unknown');
    expect(standingOn(DATES, null)).toBe('unknown');
  });
});

describe('serviceRange', () => {
  it('is the two ends of the service', () => {
    expect(serviceRange(['2026-08-31', '2026-09-15', '2026-10-12'])).toEqual({
      from: '2026-08-31',
      to: '2026-10-12',
    });
  });

  it('collapses to one day for a variant that runs once', () => {
    expect(serviceRange(['2026-08-31'])).toEqual({
      from: '2026-08-31',
      to: '2026-08-31',
    });
  });

  it('is null with nothing to range over', () => {
    expect(serviceRange([])).toBeNull();
  });
});
