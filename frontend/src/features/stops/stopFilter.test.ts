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

const chosen = (...modes: GtfsRouteType[]) => new Set<GtfsRouteType>(modes);
const BUS = 3;
const TRAM = 0;

describe('passesModeFilter', () => {
  // An empty choice is "all", never "none".
  it('keeps everything when nothing is chosen', () => {
    expect(passesModeFilter(stop([BUS]), chosen())).toBe(true);
    expect(passesModeFilter(stop([]), chosen())).toBe(true);
  });

  it('keeps only stops served by a chosen mode', () => {
    expect(passesModeFilter(stop([BUS]), chosen(BUS))).toBe(true);
    expect(passesModeFilter(stop([BUS]), chosen(TRAM))).toBe(false);
  });

  // An interchange answers to either of the modes calling there.
  it('keeps an interchange matching any one chosen mode', () => {
    expect(passesModeFilter(stop([BUS, TRAM]), chosen(TRAM))).toBe(true);
    expect(passesModeFilter(stop([BUS, TRAM]), chosen(BUS, TRAM))).toBe(true);
  });

  /*
   * The bounding-box endpoint no longer returns these — nothing calls there,
   * so there is nothing to travel from — but the rule still has to be right.
   */
  it('drops a stop nothing serves once a mode is chosen', () => {
    expect(passesModeFilter(stop([]), chosen(BUS))).toBe(false);
  });
});
