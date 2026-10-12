import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetSession } from '../../auth/sessionStore';
import { forgetCards, getWallet, loadCards, rename } from './cardsStore';

/*
 * A rename is drawn before the server answers, so the server's duplicate rule
 * is checked first: a name shown and then taken back is what this avoids.
 */

const card = (id: string, nickname: string) => ({
  id,
  number: `9246000000000${id}`,
  nickname,
  cardType: 'Standard',
  balance: 0,
  usages: [],
});

function serve(cards: unknown[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(new Response(JSON.stringify({ data: cards })));
    }
    const id = decodeURIComponent(url.split('/').at(-1) ?? '');
    const body = JSON.parse(String(init?.body)) as { nickname: string };
    return Promise.resolve(new Response(JSON.stringify({ data: card(id, body.nickname) }), { status: 201 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const names = () => getWallet().cards.map((entry) => entry.nickname);

beforeEach(() => {
  forgetCards();
  forgetSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renaming a card', () => {
  it('shows the new name before the server has answered', async () => {
    serve([card('1', 'Work'), card('2', 'Gym')]);
    await loadCards();

    const pending = rename('1', ' Office ');
    expect(names()).toEqual(['Office', 'Gym']);
    await pending;
    expect(names()).toEqual(['Office', 'Gym']);
  });

  it('refuses a name another card has, ignoring case, without sending it', async () => {
    const fetchMock = serve([card('1', 'Work'), card('2', 'Gym')]);
    await loadCards();
    fetchMock.mockClear();

    await expect(rename('1', 'gym')).rejects.toMatchObject({ code: 'DUPLICATE_CARD_NICKNAME' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(names()).toEqual(['Work', 'Gym']);
  });

  /* The server's collation ignores case but not accents. */
  it('lets a name differ from another only by an accent', async () => {
    serve([card('1', 'Work'), card('2', 'Gym')]);
    await loadCards();

    await expect(rename('1', 'Gým')).resolves.toBeUndefined();
  });

  it('puts the old name back when the server refuses anyway', async () => {
    const fetchMock = serve([card('1', 'Work')]);
    await loadCards();
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ errorCode: 'DUPLICATE_CARD_NICKNAME', error: 'x' }), {
          status: 400,
        }),
      ),
    );

    await expect(rename('1', 'Office')).rejects.toBeTruthy();
    expect(names()).toEqual(['Work']);
  });
});

describe('loading the wallet', () => {
  /*
   * An account with no cards must read as "no cards" while the page asks
   * again on a later visit, not as placeholders every time.
   */
  it('keeps the previous answer, an empty one included, while asking again', async () => {
    serve([]);
    await loadCards();
    expect(getWallet().answered).toBe(true);

    const again = loadCards();
    expect(getWallet().status).toBe('loading');
    expect(getWallet().answered).toBe(true);
    await again;
  });

  it('has no answer before the first load, nor after signing out', async () => {
    expect(getWallet().answered).toBe(false);
    serve([]);
    await loadCards();
    forgetCards();
    expect(getWallet().answered).toBe(false);
  });
});
