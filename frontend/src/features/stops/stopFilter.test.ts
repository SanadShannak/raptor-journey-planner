import { describe, expect, it } from 'vitest';
import type { GtfsRouteType } from '../../types/journey';
import type { NetworkStop } from '../../types/stop';
import { passesModeFilter } from './stopFilter';

const stop = (modes: GtfsRouteType[]): NetworkStop => ({
  id: '1',
  name: 'Pasilan asema',
  code: 'H0101',
  platform: null,
  lat: 60.2,
  lon: 24.9,
  description: null,
  fareZone: null,
  wheelchairAccessible: null,
  modes,
});

const off = (...modes: GtfsRouteType[]) => new Set<GtfsRouteType>(modes);
const BUS = 3;
const TRAM = 0;

describe('passesModeFilter', () => {
  // Everything is on until something is switched off.
  it('keeps everything when nothing is switched off', () => {
    expect(passesModeFilter(stop([BUS]), off())).toBe(true);
    expect(passesModeFilter(stop([]), off())).toBe(true);
  });

  it('drops a stop whose only mode is switched off', () => {
    expect(passesModeFilter(stop([BUS]), off(BUS))).toBe(false);
  });

  /*
   * The case a naive `some(mode => off.has(mode))` gets backwards: an
   * interchange is still a tram stop after the buses are switched off.
   */
  it('keeps an interchange that still has a mode switched on', () => {
    expect(passesModeFilter(stop([BUS, TRAM]), off(BUS))).toBe(true);
    expect(passesModeFilter(stop([BUS, TRAM]), off(BUS, TRAM))).toBe(false);
  });

  /*
   * A stop nothing serves is not a stop of the kind being hidden — switching
   * off buses says nothing about it, so it stays.
   */
  it('keeps a stop nothing serves, whatever is switched off', () => {
    expect(passesModeFilter(stop([]), off(BUS))).toBe(true);
  });
});
