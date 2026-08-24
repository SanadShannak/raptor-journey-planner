import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNetwork } from './network';
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
