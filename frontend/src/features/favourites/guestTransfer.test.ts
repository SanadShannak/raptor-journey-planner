import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markRegisteredHere, wasRegisteredHere } from '../../auth/registeredHere';
import { addGuestItem, readGuestFavourites, renameGuestItem } from './guestFavourites';
import { transferGuestFavourites } from './guestTransfer';

/*
 * A guest's favourites go to the account registered in this browser, at its
 * first sign-in here, and to no other. The requests are the star's own, so
 * the server's rules apply; what is tested is which ones are made, and what is
 * left in the browser afterwards.
 */

const EMAIL = 'new@example.com';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Answers the account's save and rename endpoints. `refuse` maps a path
 * fragment to a status and error code, `failNetwork` makes a path throw.
 */
function serveAccount({
  refuse = {},
  failNetwork,
}: { refuse?: Record<string, [number, string]>; failNetwork?: string } = {}) {
  const calls: Call[] = [];
  const saved: Record<string, unknown>[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });

      if (failNetwork !== undefined && path.includes(failNetwork)) {
        throw new TypeError('Failed to fetch');
      }
      for (const [fragment, [status, code]] of Object.entries(refuse)) {
        if (path.includes(fragment) && method === 'POST') {
          return new Response(JSON.stringify({ errorCode: code, error: code }), { status });
        }
      }
      if (method === 'POST' && path.startsWith('/api/user/saved-stops/')) {
        saved.push({ _id: `srv-${saved.length}`, stopId: path.split('/').pop(), nickname: '' });
      }
      return new Response(JSON.stringify({ data: { savedStops: saved } }));
    }),
  );
  return calls;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function guestSaves(...stopIds: string[]) {
  for (const stopId of stopIds) await addGuestItem({ kind: 'stop', stopId });
}

describe('carrying a guest’s favourites into an account', () => {
  it('does nothing for an account that was not registered here', async () => {
    await guestSaves('1');
    const calls = serveAccount();

    await transferGuestFavourites('someone-else@example.com');

    expect(calls).toEqual([]);
    expect(readGuestFavourites()).toHaveLength(1);
  });

  it('saves each into the account registered here, then forgets them and the registration', async () => {
    await guestSaves('1', '2');
    markRegisteredHere('New@Example.com');
    const calls = serveAccount();

    await transferGuestFavourites(EMAIL);

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /api/user/saved-stops/1',
      'POST /api/user/saved-stops/2',
    ]);
    expect(readGuestFavourites()).toEqual([]);
    expect(wasRegisteredHere(EMAIL)).toBe(false);
  });

  it('carries a nickname across, by the id the account gave the favourite', async () => {
    await guestSaves('1');
    await renameGuestItem('stop', readGuestFavourites()[0]!.id, 'Home');
    markRegisteredHere(EMAIL);
    const calls = serveAccount();

    await transferGuestFavourites(EMAIL);

    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      path: '/api/user/saved-stops/srv-0',
      body: { nickname: 'Home' },
    });
  });

  /*
   * Already saved, over the limit, not in this feed: asking again would get
   * the same answer, so the favourite is let go rather than retried for ever.
   */
  it('lets go of what the account refuses for good, and carries on', async () => {
    await guestSaves('1', '2');
    markRegisteredHere(EMAIL);
    serveAccount({ refuse: { '/saved-stops/1': [400, 'ALREADY_SAVED'] } });

    await transferGuestFavourites(EMAIL);

    expect(readGuestFavourites()).toEqual([]);
    expect(wasRegisteredHere(EMAIL)).toBe(false);
  });

  /*
   * A network failure says nothing about the favourite, so it and everything
   * after it stay in the browser, with the registration, for the next load to
   * try again.
   */
  it('stops at a failure that might pass, keeping the rest to try again', async () => {
    await guestSaves('1', '2', '3');
    markRegisteredHere(EMAIL);
    serveAccount({ failNetwork: '/saved-stops/2' });

    await transferGuestFavourites(EMAIL);

    expect(readGuestFavourites().map((item) => item.kind === 'stop' && item.stopId)).toEqual([
      '2',
      '3',
    ]);
    expect(wasRegisteredHere(EMAIL)).toBe(true);
  });
});
