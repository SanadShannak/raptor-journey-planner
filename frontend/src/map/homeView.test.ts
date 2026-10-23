import { describe, expect, it } from 'vitest';
import { homeViewFor } from './homeView';
import { tileSourceFor } from './tileSource';
import { boundsForNetwork, countriesForNetwork } from '../config/geocoding';
import { DEFAULT_NETWORK } from '../config/network';

/*
 * Before `/api/network` answers, every per-network table falls back to the
 * network this build is for. The first paint used to land on Helsinki and then
 * jump; these pin that it no longer does, whichever table a page asks first.
 */
describe('before the network is known', () => {
  it('opens on the default network’s home view', () => {
    expect(homeViewFor(null, null)).toEqual(homeViewFor(DEFAULT_NETWORK, null));
  });

  it('opens on Amman on this branch', () => {
    const { center } = homeViewFor(null, null);
    expect(center[0]).toBeCloseTo(31.96, 1);
    expect(center[1]).toBeCloseTo(35.93, 1);
  });

  it('searches inside the default network', () => {
    expect(boundsForNetwork(null)).toEqual(boundsForNetwork(DEFAULT_NETWORK));
    expect(countriesForNetwork(null)).toEqual(['JO']);
  });

  it('draws the default network’s basemap', () => {
    expect(tileSourceFor(null)).toBe(tileSourceFor(DEFAULT_NETWORK));
  });

  it('still answers each network from its own entry once it is known', () => {
    expect(homeViewFor('hsl', null).center[0]).toBeCloseTo(60.17, 1);
    expect(countriesForNetwork('hsl')).toEqual(['FI']);
  });
});
