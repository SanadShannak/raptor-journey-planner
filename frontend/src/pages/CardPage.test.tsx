import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { checkSession, forgetSession } from '../auth';
import { forgetCards } from '../features/card/cardsStore';
import { LocaleProvider } from '../i18n';
import CardPage from './CardPage';

/*
 * The wallet as somebody uses it, over a stubbed `fetch` — so the client, the
 * store, the error mapping and the money are all really exercised, and only
 * the network is fake.
 *
 * The card below was copied from a live call against a running backend, which
 * is what makes a pass here mean the page agrees with the server rather than
 * with a guess about it.
 */
const CARD = {
  id: 'card-1',
  number: '12345-67890-1',
  nickname: 'Commute',
  cardType: 'Student',
  balance: 10.7,
  lastUsedDate: '2026-08-23',
  usages: [
    {
      date: '2026-08-23',
      time: '18:04',
      amount: 3.3,
      kind: 'fare',
      description: 'Bus 550',
    },
    {
      date: '2026-08-21',
      time: '09:12',
      amount: 20,
      kind: 'topUp',
      description: 'Ticket machine',
    },
  ],
};

const EMPTY_CARD = {
  id: 'card-2',
  number: '11111-11111-1',
  nickname: 'Spare',
  cardType: 'Standard',
  balance: 0,
  lastUsedDate: null,
  usages: [],
};

const ACCOUNT = { id: 'u1', name: 'Rider', email: 'rider@example.com' };

interface Stub {
  /** Whether `/api/auth/me` reports an account. */
  signedIn?: boolean;
  cards?: unknown[];
  /** Overrides for specific writes, keyed by the path they land on. */
  onWrite?: (path: string, method: string) => { body: unknown; status: number } | null;
}

function stubApi({ signedIn = true, cards = [CARD], onWrite }: Stub = {}) {
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? 'GET';

    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));

    if (path === '/api/auth/me') {
      return signedIn
        ? json({ data: { _id: ACCOUNT.id, name: ACCOUNT.name, email: ACCOUNT.email } })
        : json({ message: 'Not authorized. Please log in.' }, 401);
    }

    /*
     * The currency the balance is printed in. A dinar has three decimals,
     * which is where "10.700" comes from without anyone choosing it.
     */
    if (path === '/api/network') {
      return json({ timezone: 'Asia/Amman', currency: 'JOD' });
    }

    if (method !== 'GET') {
      const override = onWrite?.(path, method);
      if (override !== null && override !== undefined) {
        return json(override.body, override.status);
      }
    }

    if (path === '/api/cards' && method === 'GET') return json({ data: cards });

    return json({ message: 'Not stubbed' }, 500);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/*
 * The session and the wallet are module-level stores shared by every test in
 * this file, so both are emptied between them — the same rule `forgetPlanner`
 * follows.
 */
beforeEach(() => {
  forgetSession();
  forgetCards();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The list of cards, which is named so it can be told from the activity list.
 *
 * Scoping matters here because a card's nickname appears **twice** on purpose:
 * once as the row that opens it and once as the rename control in the panel.
 * An unscoped query for it is ambiguous, and that ambiguity is the page
 * working correctly rather than a fault to query around.
 */
const cardList = () => screen.findByRole('list', { name: 'My cards' });

/**
 * The page alone, with the session **not yet resolved**.
 *
 * `useStartSessionCheck` lives in `RootLayout`, which every page passes
 * through in the real app — so a page rendered on its own never learns who is
 * signed in and stays in the `checking` state. That is exactly the state one
 * test below is about, so it gets its own entry point rather than a flag.
 */
const renderPage = () =>
  render(
    <LocaleProvider>
      <CardPage />
    </LocaleProvider>,
  );

/**
 * The page with the session settled, which is how it is always reached.
 *
 * `checkSession` is driven by hand for the reason above, and wrapped in `act`
 * because it writes to a module-level store React is subscribed to — outside
 * it, the re-render would land after the assertion.
 */
async function openWallet() {
  const view = renderPage();
  await act(async () => {
    await checkSession();
  });
  return view;
}

describe('the wallet', () => {
  /*
   * The page is **not** behind a redirect: its heading and its explanation
   * still render, and only the part that genuinely cannot be shown is
   * replaced. That is what keeps the back button honest for somebody who
   * arrived here from a link.
   */
  it('keeps its own heading when nobody is signed in', async () => {
    stubApi({ signedIn: false });
    await openWallet();

    expect(
      await screen.findByText(/Log in to see your travel cards/),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    // And offers the way in, rather than only explaining.
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
  });

  /*
   * "Checking" is its own state. Treating it as signed out would flash a
   * sign-in prompt at every returning visitor for as long as `/api/auth/me`
   * takes — the most noticeable way a gate like this goes wrong.
   */
  it('does not ask anyone to log in before the session is known', () => {
    stubApi();
    renderPage();

    expect(screen.queryByText(/Log in to see your travel cards/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Checking your account');
  });

  it('lists the cards on the account with their balances', async () => {
    stubApi({ cards: [CARD, EMPTY_CARD] });
    await openWallet();

    const list = within(await cardList());
    expect(list.getByText('Commute')).toBeTruthy();
    expect(list.getByText('Spare')).toBeTruthy();
    // Three decimals, because the network charges in dinars — not a choice
    // made here.
    expect(list.getByText('JOD 10.700')).toBeTruthy();
  });

  it('says so when the account has no cards yet', async () => {
    stubApi({ cards: [] });
    await openWallet();

    expect(await screen.findByText(/No cards yet/)).toBeTruthy();
  });

  /* Opening the page on a card means the balance is readable without a press. */
  it('opens the first card without being asked', async () => {
    stubApi({ cards: [CARD, EMPTY_CARD] });
    await openWallet();

    const chosen = within(await cardList()).getByRole('button', { name: /Commute/ });
    expect(chosen.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Last used August 23, 2026')).toBeTruthy();
  });

  it('shows the card somebody picks instead', async () => {
    stubApi({ cards: [CARD, EMPTY_CARD] });
    await openWallet();

    fireEvent.click(within(await cardList()).getByRole('button', { name: /Spare/ }));

    // Zero is a balance, not a missing one, and it changes what to do next.
    expect(await screen.findByText(/This card is empty/)).toBeTruthy();
    expect(screen.getByText('Not used yet')).toBeTruthy();
  });

  it('offers the way to ask again when the wallet cannot be loaded', async () => {
    stubApi({ cards: [] });
    vi.mocked(fetch).mockImplementation((url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;
      if (path === '/api/auth/me') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { _id: 'u1', name: 'R', email: 'r@e.com' } })),
        );
      }
      if (path === '/api/network') {
        return Promise.resolve(new Response(JSON.stringify({ timezone: 'Asia/Amman' })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
      );
    });

    await openWallet();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The routing service ran into a problem');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
    // Never the server's own English.
    expect(screen.queryByText('boom')).toBeNull();
  });
});

describe('the money', () => {
  it('sends a top-up exactly as it was typed', async () => {
    const fetchMock = stubApi({
      onWrite: (path) =>
        path.endsWith('/top-up')
          ? { body: { data: { ...CARD, balance: 20.7 } }, status: 200 }
          : null,
    });
    await openWallet();

    fireEvent.change(await screen.findByLabelText('Top-up amount'), {
      target: { value: '10.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Top up' }));

    await waitFor(() => expect(screen.getAllByText('JOD 20.700').length).toBe(2));

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/top-up'),
    );
    expect(call).toBeDefined();
    /*
     * A string, and unnormalised. The server's decimal-places rule tests the
     * value it is given, so reformatting here would mean the rule no longer
     * tests what the reader wrote.
     */
    const sent = (call as [unknown, RequestInit])[1];
    expect(JSON.parse(sent.body as string)).toEqual({ amount: '10.000' });
  });

  /*
   * Refused locally, with no request: the server would reject it anyway, and
   * answering here means no round trip and no flash of a pending state on the
   * way to an error the form already knew about.
   */
  it('refuses an impossible amount without asking the server', async () => {
    const fetchMock = stubApi();
    await openWallet();

    fireEvent.change(await screen.findByLabelText('Fare amount'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pay fare' }));

    expect(await screen.findByText('That amount is too small.')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/fare')),
    ).toBe(false);
  });

  /*
   * The balance is read silently off a heading, so a top-up with no
   * announcement is a press with no confirmation for anybody using a screen
   * reader. Announced as a sentence rather than by making the panel a live
   * region: the panel is full of controls, and a region containing them
   * re-reads all of them on every change.
   */
  it('announces what the balance became', async () => {
    stubApi({
      onWrite: (path) =>
        path.endsWith('/top-up')
          ? { body: { data: { ...CARD, balance: 20.7 } }, status: 200 }
          : null,
    });
    await openWallet();

    fireEvent.change(await screen.findByLabelText('Top-up amount'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Top up' }));

    const announcement = await screen.findByText('Balance is now JOD 20.700.');
    expect(announcement.getAttribute('role')).toBe('status');
    // Announced only — the figure itself is already on screen in a size
    // nobody can miss, so a visible second copy would be repetition.
    expect(announcement.className).toContain('sr-only');
  });

  /*
   * A refused amount is reported **beside its own field, with what was typed
   * still there** — correcting one character must not mean typing it again.
   * The panel deliberately does not catch these for exactly that reason.
   */
  it('keeps the typed amount when the server refuses it', async () => {
    stubApi({
      onWrite: (path) =>
        path.endsWith('/fare')
          ? { body: { message: 'Insufficient balance' }, status: 400 }
          : null,
    });
    await openWallet();

    const field = await screen.findByLabelText('Fare amount');
    fireEvent.change(field, { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay fare' }));

    await screen.findByText(/There is not enough on this card/);
    expect((field as HTMLInputElement).value).toBe('9999');
  });

  /*
   * **The discrimination this page depends on.** Paying a fare fails two ways
   * with the same 400 and they need different words — a rejected *amount*
   * names fields, "Insufficient balance" names none.
   */
  it('tells a card with too little on it from a bad amount', async () => {
    stubApi({
      onWrite: (path) =>
        path.endsWith('/fare')
          ? { body: { message: 'Insufficient balance' }, status: 400 }
          : null,
    });
    await openWallet();

    fireEvent.change(await screen.findByLabelText('Fare amount'), {
      target: { value: '9999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pay fare' }));

    expect(
      await screen.findByText(/There is not enough on this card/),
    ).toBeTruthy();
    // Never the server's own English.
    expect(screen.queryByText('Insufficient balance')).toBeNull();
  });

  /* A card holds money, so losing one to a mis-aimed press asks first. */
  it('asks before deleting a card', async () => {
    const fetchMock = stubApi();
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete card' }));

    expect(screen.getByText('Delete this card?')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText('Delete this card?')).toBeNull();
  });

  it('deletes it once the question is answered', async () => {
    stubApi({
      onWrite: (_path, method) =>
        method === 'DELETE' ? { body: { message: 'Card Removed', id: CARD.id }, status: 200 } : null,
    });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/No cards yet/)).toBeTruthy();
  });
});

describe('issuing a card', () => {
  /*
   * The number is **minted by the server**, so the form collects only the two
   * things a person decides. The nickname is required here even though the API
   * documents it as optional: `POST /api/cards` runs `nickname.trim()` with no
   * validator in front of it, so a request without one is a 500.
   */
  it('never asks for a number, and insists on a name', async () => {
    const fetchMock = stubApi({ cards: [] });
    await openWallet();

    const form = (await screen.findByRole('button', { name: 'Add card' })).closest('form');
    expect(form).not.toBeNull();
    expect(within(form as HTMLElement).queryByLabelText(/number/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    expect(await screen.findByText('Give the card a name.')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'POST'),
    ).toBe(false);
  });

  it('adds the card the server issues, and opens it', async () => {
    stubApi({
      cards: [],
      onWrite: (path, method) =>
        path === '/api/cards' && method === 'POST'
          ? { body: { data: { ...CARD, nickname: 'Weekend' } }, status: 201 }
          : null,
    });
    await openWallet();

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Weekend' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    const chosen = within(await cardList()).getByRole('button', { name: /Weekend/ });
    expect(chosen.getAttribute('aria-current')).toBe('true');
    // The number came back from the server; nothing on this page chose it.
    expect(screen.getAllByText('12345-67890-1').length).toBeGreaterThan(0);
  });

  it('explains a refused name without quoting the API', async () => {
    stubApi({
      onWrite: (path, method) =>
        path === '/api/cards' && method === 'POST'
          ? {
              body: { message: 'Another card the user owns has the same nickname.' },
              status: 400,
            }
          : null,
    });
    await openWallet();

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Commute' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    expect(
      await screen.findByText(/Another of your cards already has that name/),
    ).toBeTruthy();
  });
});

describe('activity', () => {
  it('lists what moved the balance, with where and when', async () => {
    stubApi();
    await openWallet();

    expect(await screen.findByText('Bus 550')).toBeTruthy();
    expect(screen.getByText('Ticket machine')).toBeTruthy();
    /*
       The row says its kind, its day and its time, all through `Intl`. The
       time is matched loosely on purpose: `Intl` separates "6:04" from "PM"
       with U+202F, a narrow no-break space, and pinning that exact character
       would make the test about a formatting detail the platform owns.
    */
    expect(screen.getByText(/Fare · Aug 23 · 6:04/)).toBeTruthy();
  });

  /*
   * `amount` is a magnitude and `kind` carries the direction, so the sign is
   * built from the two — and through `Intl`, since a locale's minus is not
   * always the ASCII hyphen.
   */
  it('signs a fare against a top-up', async () => {
    stubApi();
    await openWallet();

    await screen.findByText('Bus 550');
    expect(screen.getByText(/^-JOD\s?3\.300$/)).toBeTruthy();
    expect(screen.getByText(/^\+JOD\s?20\.000$/)).toBeTruthy();
  });

  /* Direction is never carried by colour alone. */
  it('names the kind of each movement in words', async () => {
    stubApi();
    await openWallet();

    await screen.findByText('Bus 550');
    expect(screen.getByText(/^Fare ·/)).toBeTruthy();
    expect(screen.getByText(/^Top-up ·/)).toBeTruthy();
  });

  it('says so when there is nothing recorded', async () => {
    stubApi({ cards: [EMPTY_CARD] });
    await openWallet();

    expect(await screen.findByText(/Nothing recorded on this card yet/)).toBeTruthy();
  });
});
