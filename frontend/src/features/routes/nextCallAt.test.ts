import { describe, expect, it } from 'vitest';
import { nextCallAt } from './nextCallAt';
import type { VariantTrip } from '../../types/route';

/*
 * Which vehicle is next at a given stop of a line.
 *
 * The two things a reader cannot check by eye: that the answer is not simply
 * the first trip in the list, and that a call after midnight is later than one
 * before it rather than fourteen hundred minutes earlier.
 */

const call = (date: string, time: string, arrivalTime = time) => ({
  date,
  time,
  arrivalDate: date,
  arrivalTime,
});

const trip = (calls: VariantTrip['calls'], headsign: string | null = 'Käpylä'): VariantTrip => ({
  tripId: `trip-${calls.map((entry) => entry?.time ?? 'x').join('-')}`,
  headsign,
  calls,
});

const NOW = { date: '2026-09-10', time: '15:44' };

describe('nextCallAt', () => {
  it('takes the earliest call that has not gone', () => {
    const trips = [
      trip([call('2026-09-10', '15:20'), call('2026-09-10', '15:30')]),
      trip([call('2026-09-10', '15:50'), call('2026-09-10', '16:00')]),
      trip([call('2026-09-10', '16:20'), call('2026-09-10', '16:30')]),
    ];

    const next = nextCallAt(trips, 0, NOW);

    expect(next?.call.time).toBe('15:50');
    expect(next?.minutes).toBe(6);
    expect(next?.sequence).toBe(0);
  });

  /*
   * The reason every trip is considered rather than the first one that has a
   * call. `trips` is ordered by each trip's *own* first departure, and a short
   * working joining the line halfway down can leave its origin later while
   * reaching a mid-route stop sooner.
   */
  it('is not fooled by the order the trips arrive in', () => {
    const trips = [
      // Leaves its origin first, but crawls: reaches stop 1 at 16:40.
      trip([call('2026-09-10', '15:50'), call('2026-09-10', '16:40')]),
      // Leaves later and gets there sooner.
      trip([call('2026-09-10', '16:00'), call('2026-09-10', '16:05')]),
    ];

    expect(nextCallAt(trips, 0, NOW)?.call.time).toBe('15:50');
    expect(nextCallAt(trips, 1, NOW)?.call.time).toBe('16:05');
  });

  it('reads a hole in a trip as that trip not calling there', () => {
    const trips = [
      trip([call('2026-09-10', '15:50'), null, call('2026-09-10', '16:10')]),
      trip([call('2026-09-10', '16:20'), call('2026-09-10', '16:25'), null]),
    ];

    expect(nextCallAt(trips, 1, NOW)?.call.time).toBe('16:25');
    expect(nextCallAt(trips, 2, NOW)?.call.time).toBe('16:10');
  });

  it('sees a call after midnight as later than one before it', () => {
    const trips = [
      trip([call('2026-09-11', '00:10')]),
      trip([call('2026-09-10', '23:50')]),
    ];

    const next = nextCallAt(trips, 0, { date: '2026-09-10', time: '23:40' });

    expect(next?.call.time).toBe('23:50');
    expect(next?.minutes).toBe(10);
  });

  /* The last vehicle has gone. Null, so a row can say so rather than invent. */
  it('answers null once everything has left', () => {
    const trips = [trip([call('2026-09-10', '05:20')]), trip([call('2026-09-10', '06:00')])];

    expect(nextCallAt(trips, 0, NOW)).toBeNull();
  });

  /*
   * No clock is a real state, not a missing value: on a day that is not today
   * the honest answer to "what leaves here" is the first departure of that day.
   */
  it('takes the first call of the day when there is no clock', () => {
    const trips = [
      trip([call('2026-11-01', '14:00')]),
      trip([call('2026-11-01', '05:12')]),
    ];

    const next = nextCallAt(trips, 0, null);

    expect(next?.call.time).toBe('05:12');
    expect(next?.minutes).toBeNull();
  });

  it('carries the trip’s own sign, so a row can say where it goes', () => {
    const trips = [trip([call('2026-09-10', '15:50')], 'Siuntio-Hanko')];

    expect(nextCallAt(trips, 0, NOW)?.headsign).toBe('Siuntio-Hanko');
  });

  it('drops a call whose time cannot be read rather than treating it as due', () => {
    const trips = [
      trip([{ date: '2026-09-10', time: 'soon', arrivalDate: '2026-09-10', arrivalTime: 'soon' }]),
      trip([call('2026-09-10', '15:50')]),
    ];

    expect(nextCallAt(trips, 0, NOW)?.call.time).toBe('15:50');
  });

  it('answers null for a stop no trip reaches', () => {
    expect(nextCallAt([trip([call('2026-09-10', '15:50')])], 4, NOW)).toBeNull();
    expect(nextCallAt([], 0, NOW)).toBeNull();
  });
});
