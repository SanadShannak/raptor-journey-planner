import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDigitransitGeocoder } from './digitransit';

/*
 * The fixtures below are trimmed from real responses for `Lasipalatsi` and
 * `Pasila`, which is why the shapes are exactly this awkward: a platform-level
 * stop's id carries its code after a hash, a station's does not, and the modes
 * arrive under a doubly nested `addendum.GTFS` in OTP's vocabulary rather than
 * GTFS's.
 */
function feature(properties: Record<string, unknown>) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [24.937728, 60.170461] },
    properties,
  };
}

function respondWith(features: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: 'FeatureCollection', features })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const geocoder = createDigitransitGeocoder('test-key');

afterEach(() => vi.unstubAllGlobals());

describe('Digitransit stop ids', () => {
  /*
   * The bug this pins down: the id of a platform-level stop is
   * `GTFS:HSL:1020444#H0101`, and taking everything after the last colon left
   * `1020444#H0101` — which matches nothing in the compiled feed, so every
   * stop suggestion resolved to no stop at all.
   */
  it('drops the platform suffix from a stop id', async () => {
    respondWith([
      feature({
        id: 'GTFS:HSL:1020444#H0101',
        name: 'Lasipalatsi',
        layer: 'stop',
        addendum: { GTFS: { platform: '51', modes: ['TRAM'], code: 'H0101' } },
      }),
    ]);

    const [place] = await geocoder.search('Lasipalatsi');

    expect(place?.stopId).toBe('1020444');
  });

  it('reads a station id, which carries no suffix', async () => {
    respondWith([
      feature({
        id: 'GTFS:HSL:1000004',
        name: 'Pasila',
        layer: 'station',
        addendum: { GTFS: { modes: ['BUS', 'BUS-EXPRESS'] } },
      }),
    ]);

    const [place] = await geocoder.search('Pasila');

    expect(place?.stopId).toBe('1000004');
  });

  // An address has an id too, and it means nothing to a timetable.
  it('claims no stop id for a place that is not a stop', async () => {
    respondWith([
      feature({ id: 'node:1381017820', name: 'Lasipalatsi', layer: 'venue' }),
    ]);

    const [place] = await geocoder.search('Lasipalatsi');

    expect(place?.kind).toBe('place');
    expect(place?.stopId).toBeNull();
    expect(place?.modes).toBeNull();
  });
});

describe('Digitransit stop detail', () => {
  it('maps OTP mode names onto standard GTFS route types', async () => {
    respondWith([
      feature({
        id: 'GTFS:HSL:1',
        name: 'Rail',
        layer: 'stop',
        addendum: { GTFS: { modes: ['RAIL'], code: 'H0085', platform: '1' } },
      }),
      feature({
        id: 'GTFS:HSL:2',
        name: 'Metro',
        layer: 'stop',
        addendum: { GTFS: { modes: ['SUBWAY'] } },
      }),
      feature({
        id: 'GTFS:HSL:3',
        name: 'Tram',
        layer: 'stop',
        addendum: { GTFS: { modes: ['TRAM'] } },
      }),
      feature({
        id: 'GTFS:HSL:4',
        name: 'Ferry',
        layer: 'stop',
        addendum: { GTFS: { modes: ['FERRY'] } },
      }),
    ]);

    const places = await geocoder.search('anything');

    // 2 rail · 1 metro · 0 tram · 4 ferry
    expect(places.map((place) => place.modes)).toEqual([[2], [1], [0], [4]]);
  });

  /*
   * HSL sends `BUS-EXPRESS` alongside `BUS`. The qualifier describes the
   * service pattern, not the vehicle, so both are the same silhouette — and
   * the result must not be a bus icon listed twice.
   */
  it('reduces a qualified mode to its family and de-duplicates', async () => {
    respondWith([
      feature({
        id: 'GTFS:HSL:5',
        name: 'Pasilan asema',
        layer: 'stop',
        addendum: { GTFS: { modes: ['BUS', 'BUS-EXPRESS'], code: 'H2100' } },
      }),
    ]);

    const [place] = await geocoder.search('Pasilan asema');

    expect(place?.modes).toEqual([3]);
  });

  /*
   * Dropped rather than defaulted. A wrong icon is worse than a generic one:
   * telling someone a rail platform is a bus stop sends them to the wrong side
   * of the station.
   */
  it('drops a mode name it does not recognise', async () => {
    respondWith([
      feature({
        id: 'GTFS:HSL:6',
        name: 'Odd',
        layer: 'stop',
        addendum: { GTFS: { modes: ['HOVERCRAFT'] } },
      }),
    ]);

    const [place] = await geocoder.search('Odd');

    // Empty, not null: this *is* a stop, we just cannot say what calls there.
    expect(place?.modes).toEqual([]);
  });

  it('carries the stop code and platform for telling stops apart', async () => {
    respondWith([
      feature({
        id: 'GTFS:HSL:1174551#H0085',
        name: 'Pasila',
        layer: 'stop',
        addendum: { GTFS: { platform: '1', modes: ['RAIL'], code: 'H0085' } },
      }),
    ]);

    const [place] = await geocoder.search('Pasila');

    expect(place?.stopCode).toBe('H0085');
    expect(place?.platform).toBe('1');
  });

  it('survives a stop with no addendum at all', async () => {
    respondWith([
      feature({ id: 'GTFS:HSL:7', name: 'Bare', layer: 'stop' }),
    ]);

    const [place] = await geocoder.search('Bare');

    expect(place?.kind).toBe('stop');
    expect(place?.stopId).toBe('7');
    expect(place?.stopCode).toBeNull();
    expect(place?.platform).toBeNull();
    expect(place?.modes).toEqual([]);
  });
});

describe('Digitransit request', () => {
  /*
   * The service refuses a `size` below ten and silently substitutes its own
   * minimum, so asking for six returned ten. Asked for honestly and trimmed
   * here, which is the only way the caller's limit means anything.
   */
  it('asks for the minimum the service accepts and trims to the limit', async () => {
    const fetchMock = respondWith(
      Array.from({ length: 10 }, (_, index) =>
        feature({ id: `node:${index}`, name: `Result ${index}`, layer: 'venue' }),
      ),
    );

    const places = await geocoder.search('many', { limit: 3 });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('size')).toBe('10');
    expect(places).toHaveLength(3);
  });

  // Kept out of anything that logs URLs.
  it('sends the subscription key as a header, never in the query', async () => {
    const fetchMock = respondWith([]);

    await geocoder.search('anything');

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.search).not.toContain('test-key');

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)['digitransit-subscription-key'],
    ).toBe('test-key');
  });
});
