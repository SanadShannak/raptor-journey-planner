import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder, Place } from '../types/place';
import { withFeedStops } from './feedStops';

/*
 * The merge, not either source: Photon and the stop search each have tests of
 * their own. What can go silently wrong here is which suggestions survive,
 * in what order, under which name — and whether an outage of one source is
 * passed off as "nothing matches".
 */

function stop(id: string, name: string, lat: number, lon: number, ar?: string) {
  return {
    id,
    name,
    code: null,
    platform: null,
    lat,
    lon,
    description: null,
    fareZone: null,
    wheelchairAccessible: null,
    modes: [3],
    translations: ar === undefined ? {} : { ar },
  };
}

function place(label: string, overrides: Partial<Place> = {}): Place {
  return {
    key: label,
    lat: 31.9,
    lon: 35.9,
    label,
    context: null,
    kind: 'place',
    stopId: null,
    stopCode: null,
    platform: null,
    modes: null,
    ...overrides,
  };
}

/** The stop search answers from `/api/stops/search`; anything else is refused. */
function stopSearchAnswers(stops: unknown[] | 'down') {
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    if (!String(url).includes('/api/stops/search')) throw new Error('unexpected request');
    if (stops === 'down') return new Response('', { status: 500 });
    return new Response(JSON.stringify({ stops, total: stops.length, truncated: false }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function places(answer: Place[] | 'down'): Geocoder {
  return {
    id: 'photon',
    attribution: 'test',
    search: vi.fn(async () => {
      if (answer === 'down') throw new Error('Photon is down');
      return answer;
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('withFeedStops', () => {
  it('puts the feed’s stops first, as stops with their modes', async () => {
    stopSearchAnswers([stop('11920', 'Al Mahatta', 31.9617, 35.96)]);

    const found = await withFeedStops(places([place('Mahattat al Jufur')])).search('mahatta');

    expect(found.map((p) => p.label)).toEqual(['Al Mahatta', 'Mahattat al Jufur']);
    expect(found[0]).toMatchObject({ kind: 'stop', stopId: '11920', modes: [3] });
  });

  it('names a stop in the reader’s language, with the feed’s name beneath', async () => {
    stopSearchAnswers([stop('11920', 'Al Mahatta', 31.9617, 35.96, 'المحطة')]);

    const [inArabic] = await withFeedStops(places([])).search('المحطة', { language: 'ar' });
    expect(inArabic).toMatchObject({ label: 'المحطة', context: 'Al Mahatta' });

    const [inEnglish] = await withFeedStops(places([])).search('المحطة', { language: 'en' });
    expect(inEnglish).toMatchObject({ label: 'Al Mahatta', context: 'المحطة' });
  });

  it('keeps the feed’s name when the stop has none in the reader’s language', async () => {
    stopSearchAnswers([stop('12484', 'Al Jeish St.3', 31.9629, 35.9598)]);

    const [only] = await withFeedStops(places([])).search('jeish', { language: 'ar' });

    expect(only).toMatchObject({ label: 'Al Jeish St.3', context: null });
  });

  it('offers two same-named stops across one road as one', async () => {
    stopSearchAnswers([
      stop('1', 'Swaileh Terminal', 32.0210, 35.8424),
      stop('2', 'Swaileh Terminal', 32.0215, 35.8430),
      // Same name, other side of the city: a different place to a traveller.
      stop('3', 'Swaileh Terminal', 31.95, 35.93),
    ]);

    const found = await withFeedStops(places([])).search('swaileh');

    expect(found.map((p) => p.stopId)).toEqual(['1', '3']);
  });

  it('drops OpenStreetMap’s copy of a stop the feed already offered', async () => {
    stopSearchAnswers([stop('11920', 'Al Mahatta', 31.9617, 35.96)]);
    const osmStop = place('Al Mahatta bus stop', {
      kind: 'stop',
      lat: 31.9618,
      lon: 35.9601,
      modes: [],
    });

    const found = await withFeedStops(places([osmStop, place('Mahatta Street')])).search('mahatta');

    expect(found.map((p) => p.label)).toEqual(['Al Mahatta', 'Mahatta Street']);
  });

  it('gives stops three places when there are places to show, and more when not', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      stop(String(i), `Stop ${i}`, 31.9 + i * 0.05, 35.9),
    );

    stopSearchAnswers(many);
    const crowded = await withFeedStops(
      places([place('A'), place('B'), place('C'), place('D')]),
    ).search('stop');
    expect(crowded.filter((p) => p.kind === 'stop')).toHaveLength(3);
    expect(crowded).toHaveLength(6);

    stopSearchAnswers(many);
    const quiet = await withFeedStops(places([place('A')])).search('stop');
    expect(quiet.filter((p) => p.kind === 'stop')).toHaveLength(5);
  });

  it('shows one source’s answer when the other is down', async () => {
    stopSearchAnswers('down');
    expect(
      (await withFeedStops(places([place('Abdali')])).search('abdali')).map((p) => p.label),
    ).toEqual(['Abdali']);

    stopSearchAnswers([stop('1', 'Abdali', 31.96, 35.91)]);
    expect(
      (await withFeedStops(places('down')).search('abdali')).map((p) => p.label),
    ).toEqual(['Abdali']);
  });

  /*
   * The outage must not read as "nothing matches": with one source down, an
   * empty answer from the other says nothing about whether the place exists.
   */
  it('reports an outage, not an empty list, when nothing came back and a source failed', async () => {
    stopSearchAnswers([]);
    await expect(withFeedStops(places('down')).search('abdali')).rejects.toThrow();

    stopSearchAnswers('down');
    await expect(withFeedStops(places([])).search('abdali')).rejects.toThrow();
  });

  it('answers an honest nothing when both sources worked', async () => {
    stopSearchAnswers([]);
    expect(await withFeedStops(places([])).search('qqxzzv')).toEqual([]);
  });
});
