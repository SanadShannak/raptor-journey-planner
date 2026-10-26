import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNetwork, getServiceArea } from './network';
import { isApiError } from './errors';

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const NETWORK = {
  network: 'hsl',
  timezone: 'Europe/Helsinki',
  language: 'fi',
  agencyName: 'Helsingin seudun liikenne',
  publisherName: 'Helsingin seudun liikenne',
  feedStartDate: '2026-08-14',
  feedEndDate: '2026-10-12',
  capabilities: { stopCode: true, platforms: true },
  modes: [0, 1, 2, 3, 4],
};

describe('getNetwork', () => {
  it('reads the identity, the clock, and what the feed supports', async () => {
    respondWith(NETWORK);

    const info = await getNetwork();

    expect(info.network).toBe('hsl');
    expect(info.timezone).toBe('Europe/Helsinki');
    expect(info.capabilities.stopCode).toBe(true);
  });

  /*
   * Every flag defaults to false, so no component has to ask whether it is
   * allowed to ask. A missing flag and a false one mean the same thing.
   */
  it('fills in every capability the response left out', async () => {
    respondWith({ timezone: 'Europe/Helsinki' });

    const { capabilities } = await getNetwork();

    expect(capabilities.wheelchairAccessibility).toBe(false);
    expect(capabilities.transitDistance).toBe(false);
  });

  /*
   * What *moves*, as opposed to which optional columns the feed supplied.
   * This is what lets a mode filter offer a fixed set of choices without
   * fetching every line in the network to work them out.
   */
  it('reads the modes this network runs', async () => {
    respondWith(NETWORK);
    expect((await getNetwork()).modes).toEqual([0, 1, 2, 3, 4]);
  });

  // A backend that predates the field says the same as a feed with no routes.
  it('has no modes when the response does not carry them', async () => {
    respondWith({ timezone: 'Europe/Helsinki' });
    expect((await getNetwork()).modes).toEqual([]);
  });

  it('drops anything in modes that is not a route type', async () => {
    respondWith({ timezone: 'Europe/Helsinki', modes: [3, 'bus', null, 0] });
    expect((await getNetwork()).modes).toEqual([3, 0]);
  });

  /*
   * The timezone is the one field nothing can work without: every date and
   * time in this API is expressed in it, and guessing would answer a Helsinki
   * timetable with the browser's city.
   */
  it('refuses a response that states no timezone', async () => {
    respondWith({ network: 'hsl' });

    const error = await getNetwork().catch((thrown: unknown) => thrown);

    expect(isApiError(error) && error.kind).toBe('malformed');
  });
});

describe('getServiceArea', () => {
  const ring = [
    [35.9, 31.9],
    [36.0, 31.9],
    [36.0, 32.0],
    [35.9, 31.9],
  ];
  const area = (coordinates: unknown) => ({
    type: 'Feature',
    properties: { stopCount: 1365 },
    geometry: { type: 'MultiPolygon', coordinates },
  });

  it('reads each area with its holes', async () => {
    respondWith(area([[ring, ring], [ring]]));

    const answer = await getServiceArea();

    expect(answer?.polygons).toHaveLength(2);
    expect(answer?.polygons[0]).toHaveLength(2);
  });

  it('has no area for a network with no served stops', async () => {
    respondWith({ type: 'Feature', properties: {}, geometry: null });

    expect(await getServiceArea()).toBeNull();
  });

  /*
   * A broken hole is dropped and its area kept; a broken outer ring takes its
   * area with it, because its holes would otherwise be drawn as the area.
   */
  it('drops a malformed ring rather than drawing it with a gap', async () => {
    const broken = [[35.9, 31.9], [36.0, null], [36.0, 32.0], [35.9, 31.9]];
    respondWith(area([[ring, broken], [broken, ring]]));

    const answer = await getServiceArea();

    expect(answer?.polygons).toEqual([[ring]]);
  });

  it('refuses something that is not a MultiPolygon', async () => {
    respondWith({ type: 'Feature', geometry: { type: 'Point', coordinates: [35.9, 31.9] } });

    await expect(getServiceArea()).rejects.toSatisfy(isApiError);
  });
});
