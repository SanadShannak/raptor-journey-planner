import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhotonGeocoder } from './photon';

/*
 * Shaped like Photon's real answers for `العبدلي`: the same name in Kuwait,
 * Saudi Arabia and Jordan, with Jordan's not first. That ordering is the whole
 * reason the country filter exists.
 */
function feature(name: string, countrycode: string | undefined, osmId: number) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [35.91, 31.96] },
    properties: {
      name,
      osm_id: osmId,
      osm_type: 'N',
      osm_value: 'suburb',
      ...(countrycode === undefined ? {} : { countrycode }),
    },
  };
}

function respondWith(features: unknown[]) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ type: 'FeatureCollection', features })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const urlOf = (call: unknown) => new URL(String(call));

afterEach(() => vi.unstubAllGlobals());

describe('Photon language', () => {
  /*
   * The regression: Photon answers `lang=ar` with a 400, and the form passes
   * the interface's locale, so every search in the Arabic interface failed.
   */
  it('leaves out a language Photon does not support', async () => {
    const fetchMock = respondWith([]);
    await createPhotonGeocoder().search('العبدلي', { language: 'ar' });
    expect(urlOf(fetchMock.mock.calls[0]?.[0]).searchParams.has('lang')).toBe(false);
  });

  it('passes a language Photon supports', async () => {
    const fetchMock = respondWith([]);
    await createPhotonGeocoder().search('Abdali', { language: 'en' });
    expect(urlOf(fetchMock.mock.calls[0]?.[0]).searchParams.get('lang')).toBe('en');
  });

  it('leaves out an unsupported language on reverse lookups too', async () => {
    const fetchMock = respondWith([]);
    await createPhotonGeocoder().reverse?.(31.96, 35.91, { language: 'ar' });
    expect(urlOf(fetchMock.mock.calls[0]?.[0]).searchParams.has('lang')).toBe(false);
  });
});

describe('Photon countries', () => {
  it('keeps only results in the network’s countries', async () => {
    respondWith([
      feature('العبدلي', 'KW', 1),
      feature('العبدلي', 'SA', 2),
      feature('العبدلي', 'JO', 3),
      feature('العبدلية', 'jo', 4),
    ]);
    const places = await createPhotonGeocoder({ countries: ['JO'] }).search('العبدلي');
    expect(places.map((place) => place.key)).toEqual(['N3', 'N4']);
  });

  it('drops a result that does not say which country it is in', async () => {
    respondWith([feature('Nowhere', undefined, 1), feature('Amman', 'JO', 2)]);
    const places = await createPhotonGeocoder({ countries: ['JO'] }).search('a');
    expect(places.map((place) => place.key)).toEqual(['N2']);
  });

  it('asks for more than it shows, then shows no more than asked', async () => {
    const fetchMock = respondWith(
      Array.from({ length: 30 }, (_, i) => feature(`Place ${i}`, 'JO', i)),
    );
    const places = await createPhotonGeocoder({ countries: ['JO'] }).search('place', {
      limit: 6,
    });
    expect(Number(urlOf(fetchMock.mock.calls[0]?.[0]).searchParams.get('limit'))).toBeGreaterThan(6);
    expect(places).toHaveLength(6);
  });

  it('filters nothing without countries', async () => {
    const fetchMock = respondWith([feature('Abdali', 'KW', 1), feature('Abdali', 'JO', 2)]);
    const places = await createPhotonGeocoder().search('Abdali', { limit: 6 });
    expect(urlOf(fetchMock.mock.calls[0]?.[0]).searchParams.get('limit')).toBe('6');
    expect(places).toHaveLength(2);
  });

  it('leaves a point over the border unnamed', async () => {
    respondWith([feature('ירושלים', 'IL', 1)]);
    const named = await createPhotonGeocoder({ countries: ['JO'] }).reverse?.(31.77, 35.21);
    expect(named).toBeNull();
  });

  it('names a point inside the country where it was pressed', async () => {
    respondWith([feature('العبدلي', 'JO', 1)]);
    const named = await createPhotonGeocoder({ countries: ['JO'] }).reverse?.(31.9612, 35.9101);
    expect(named).toMatchObject({ label: 'العبدلي', lat: 31.9612, lon: 35.9101 });
  });
});
