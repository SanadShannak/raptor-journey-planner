import { describe, expect, it } from 'vitest';
import { fromSearchParams, toSearchParams } from './searchParams';
import { DEFAULT_WALKING_PACE } from '../../config/journey';
import type { Place } from '../../types/place';
import type { JourneyFormValues } from './journeySearch';

/*
 * A search written into the address and read back out.
 *
 * The cases worth pinning are the ones a hand-edited or truncated URL produces:
 * a half-filled search must come back as nothing rather than as a form somebody
 * has to work out which half of.
 */

const place = (label: string, lat: number, lon: number): Place => ({
  key: label,
  lat,
  lon,
  label,
  context: 'Helsinki',
  kind: 'stop',
  stopId: 'HSL:1020444',
  stopCode: 'H0101',
  platform: '51',
  modes: [0],
});

const values: JourneyFormValues = {
  origin: place('Kamppi', 60.168995, 24.93088),
  destination: place('Pasila', 60.198817, 24.933197),
  date: '2026-09-10',
  time: '15:44',
  pace: 'calm',
};

describe('toSearchParams', () => {
  it('carries the two ends, the day, the time and the pace', () => {
    const params = toSearchParams(values);

    expect(params.get('from')).toBe('Kamppi');
    expect(params.get('fromLat')).toBe('60.168995');
    expect(params.get('to')).toBe('Pasila');
    expect(params.get('toLon')).toBe('24.933197');
    expect(params.get('date')).toBe('2026-09-10');
    expect(params.get('time')).toBe('15:44');
    expect(params.get('pace')).toBe('calm');
  });

  /*
   * Only what the search depends on. A context line, a stop code and a platform
   * are how a suggestion was *described* when it was picked, not part of the
   * question — and the address is long enough already.
   */
  it('leaves out everything the search does not depend on', () => {
    const keys = [...toSearchParams(values).keys()];

    expect(keys).toHaveLength(9);
    expect(keys).not.toContain('fromStop');
    expect(keys).not.toContain('fromContext');
  });

  it('writes nothing at all for a half-filled form', () => {
    expect([...toSearchParams({ ...values, origin: null }).keys()]).toEqual([]);
    expect([...toSearchParams({ ...values, destination: null }).keys()]).toEqual([]);
  });

  it('round-trips the search it wrote', () => {
    const back = fromSearchParams(toSearchParams(values), DEFAULT_WALKING_PACE)!;

    expect(back.date).toBe(values.date);
    expect(back.time).toBe(values.time);
    expect(back.pace).toBe(values.pace);
    expect(back.origin?.label).toBe('Kamppi');
    expect(back.origin?.lat).toBeCloseTo(60.168995, 6);
    expect(back.destination?.lon).toBeCloseTo(24.933197, 6);
  });

  /*
   * The planner sends coordinates for both ends and has never sent a stop id,
   * so nothing about the search changes — and calling a restored place a stop
   * when the feed was never asked would be inventing a fact.
   */
  it('brings a place back as a place, not as a stop it cannot vouch for', () => {
    const back = fromSearchParams(toSearchParams(values), DEFAULT_WALKING_PACE)!;

    expect(back.origin?.kind).toBe('place');
    expect(back.origin?.stopId).toBeNull();
  });
});

describe('fromSearchParams', () => {
  const asked = (over: Record<string, string> = {}) =>
    new URLSearchParams({
      from: 'Kamppi',
      fromLat: '60.169',
      fromLon: '24.931',
      to: 'Pasila',
      toLat: '60.199',
      toLon: '24.933',
      date: '2026-09-10',
      time: '15:44',
      pace: 'calm',
      ...over,
    });

  it('is nothing when there is nothing there', () => {
    expect(fromSearchParams(new URLSearchParams(), DEFAULT_WALKING_PACE)).toBeNull();
  });

  it.each([
    ['a missing end', { to: '' }],
    ['an unreadable coordinate', { fromLat: 'north' }],
    ['a coordinate off the globe', { fromLat: '910' }],
    ['a mangled date', { date: '10/09/2026' }],
    ['a mangled time', { time: '3pm' }],
  ])('is nothing for %s', (_why, over) => {
    expect(fromSearchParams(asked(over), DEFAULT_WALKING_PACE)).toBeNull();
  });

  /*
   * The one field worth keeping a search for. Pace changes only how fast the
   * walking is reckoned, never where or when — so an unrecognised one falls
   * back rather than throwing the journey away.
   */
  it('falls back on an unknown pace rather than losing the search', () => {
    const back = fromSearchParams(asked({ pace: 'sprinting' }), DEFAULT_WALKING_PACE);

    expect(back).not.toBeNull();
    expect(back?.pace).toBe(DEFAULT_WALKING_PACE);
  });

  it('keeps a label written in another script exactly as it was', () => {
    const back = fromSearchParams(asked({ from: 'الصويفية' }), DEFAULT_WALKING_PACE);

    expect(back?.origin?.label).toBe('الصويفية');
  });
});
