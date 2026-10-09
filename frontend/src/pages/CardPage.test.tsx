import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { checkSession, forgetSession } from '../auth';
import { forgetAuthPrompt, getAuthPrompt } from '../auth/authPrompt';
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
  forgetAuthPrompt();
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
    // And offers both ways in, rather than only explaining.
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy();
    // Including what does not need an account, so the gate is not a dead end.
    expect(screen.getByText(/Everything else works without an account/)).toBeTruthy();
  });

  /*
   * **Nothing opens by itself.** Arriving without a session used to raise the
   * app's sign-in modal between one frame and the next, which took focus out
   * of a page the reader had only just opened and covered the explanation of
   * why an account was wanted. The invitation is the panel; the dialog is what
   * pressing it opens.
   *
   * Asserted on the store rather than on a rendered dialog because the dialog
   * is mounted by the header, which this page is rendered without — the store
   * is the whole seam between the two.
   */
  it('does not raise the sign-in dialog on its own', async () => {
    stubApi({ signedIn: false });
    await openWallet();

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(getAuthPrompt()).toBeNull();
  });

  it('raises the sign-in dialog when the panel is pressed', async () => {
    stubApi({ signedIn: false });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(getAuthPrompt()).toBe('logIn'));
  });

  /*
   * The second control asks for the other form, not the same one. Somebody
   * who has never had an account should not have to find the switch inside a
   * login form to discover they can make one.
   */
  it('raises the sign-up form from its own control', async () => {
    stubApi({ signedIn: false });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Sign up' }));
    await waitFor(() => expect(getAuthPrompt()).toBe('signUp'));
  });

  /*
   * "Checking" is its own state. Treating it as signed out would raise the
   * dialog in the face of every returning visitor for as long as
   * `/api/auth/me` takes — the most noticeable way a gate like this goes
   * wrong.
   */
  it('asks nobody to log in before the session is known', () => {
    stubApi();
    renderPage();

    expect(getAuthPrompt()).toBeNull();
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

  /*
   * **The money is the reason.** Deleting is irreversible and the balance goes
   * with it, so a card that still holds some cannot be thrown away — and the
   * control says why rather than being an unexplained dead press.
   */
  it('refuses to delete a card that still holds money, and says why', async () => {
    const fetchMock = stubApi();
    await openWallet();

    const button = await screen.findByRole('button', { name: 'Delete card' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // Never `disabled`: a disabled button is unfocusable and screen readers
    // skip it, so the reason would reach nobody.
    expect(button.hasAttribute('disabled')).toBe(false);

    const describedBy = button.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Spend or move the remaining balance before deleting this card.',
    );

    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);
  });

  /*
   * A card holds money and the deletion is not reversible, so the question is
   * a modal — unmissable, focus-trapping, not dismissed by the pointer
   * wandering off — and it **names the card**, because the page shows several
   * and "this card" is a question about whichever one the reader thinks is
   * selected.
   */
  it('asks in a modal that names the card, and deletes nothing yet', async () => {
    const fetchMock = stubApi({ cards: [EMPTY_CARD] });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete card' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete Spare?' })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  /*
   * **The guard item 9 asks for.** A session cookie says this browser was
   * signed in once; it says nothing about who is at the keyboard now. So the
   * password is confirmed *before* anything is deleted — the other order would
   * delete the card and then ask, which is not a confirmation.
   */
  it('deletes nothing when the password is wrong', async () => {
    const fetchMock = stubApi({
      cards: [EMPTY_CARD],
      onWrite: (path) =>
        path === '/api/auth/verify-password'
          ? { body: { message: 'Incorrect Password.' }, status: 401 }
          : null,
    });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete card' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Your password'), {
      target: { value: 'not-the-password' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete card' }));

    expect(
      await within(dialog).findByText('That email and password do not match an account.'),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);
    // Still there to correct, rather than closed on a failure.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('deletes it once the password is confirmed', async () => {
    const fetchMock = stubApi({
      cards: [EMPTY_CARD],
      onWrite: (path, method) => {
        if (path === '/api/auth/verify-password') {
          return { body: { data: ACCOUNT }, status: 200 };
        }
        return method === 'DELETE'
          ? { body: { message: 'Card Removed', id: EMPTY_CARD.id }, status: 200 }
          : null;
      },
    });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete card' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Your password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete card' }));

    expect(await screen.findByText(/No cards yet/)).toBeTruthy();

    /*
     * Only the password travels. The endpoint takes no email — the account is
     * the one the session cookie names — so there is nothing in this request
     * that could confirm against somebody else's.
     */
    const check = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/auth/verify-password'),
    );
    expect(check).toBeDefined();
    const sent = (check as [unknown, RequestInit])[1];
    expect(JSON.parse(sent.body as string)).toEqual({ password: 'password123' });
  });

  /*
   * The server decides, and this page is only ever as fresh as its last
   * response — so a refusal that arrives anyway is read and shown, rather than
   * being treated as impossible because the local check passed.
   */
  it('reports the server refusing a delete it thought was allowed', async () => {
    stubApi({
      cards: [EMPTY_CARD],
      onWrite: (path, method) => {
        if (path === '/api/auth/verify-password') {
          return { body: { data: ACCOUNT }, status: 200 };
        }
        return method === 'DELETE'
          ? { body: { message: 'Card still has a balance.' }, status: 409 }
          : null;
      },
    });
    await openWallet();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete card' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Your password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete card' }));

    expect(
      await within(dialog).findByText(/This card still has money on it/),
    ).toBeTruthy();
    // Never the server's own English.
    expect(screen.queryByText('Card still has a balance.')).toBeNull();
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

  /*
   * **Item 8.** An empty wallet opens the form, because the form is the only
   * thing on the page; once there are cards the list is what somebody came for
   * and the form folds away behind its own heading.
   */
  it('starts open on an empty wallet and folded once there are cards', async () => {
    stubApi({ cards: [] });
    await openWallet();

    expect(await screen.findByLabelText('Name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a card' }).getAttribute('aria-expanded')).toBe('true');

    vi.unstubAllGlobals();
    forgetCards();
    forgetSession();
    stubApi({ cards: [CARD] });
    await openWallet();

    const disclosure = (await screen.findAllByRole('button', { name: 'Add a card' })).at(-1);
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the form when its heading is pressed', async () => {
    stubApi({ cards: [CARD] });
    await openWallet();

    const disclosure = await screen.findByRole('button', { name: 'Add a card' });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Name')).toBeTruthy();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Add a card' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Commute' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    expect(
      await screen.findByText(/Another of your cards already has that name/),
    ).toBeTruthy();
  });
});

describe('activity', () => {
  it('leads with the kind, and says where and when under it', async () => {
    stubApi();
    await openWallet();

    // The kind is the row's own line, not buried in the server's sentence.
    expect(await screen.findByText('Fare')).toBeTruthy();
    expect(screen.getByText('Top-up')).toBeTruthy();
    /*
       Where and when on one line. The time is matched loosely on purpose:
       `Intl` separates "6:04" from "PM" with U+202F, a narrow no-break space,
       and pinning that exact character would make the test about a formatting
       detail the platform owns.
    */
    /*
       Asserted on the row, not on one text node: the place name sits in its
       own `dir="auto"` span so a Latin name inside an Arabic line — or the
       reverse — is isolated and does not reorder the date after it. That
       nesting is correct and splits the sentence across elements.
    */
    const fareRow = screen.getByText('Bus 550').closest('li');
    expect(fareRow?.textContent).toContain('Aug 23');
    expect(fareRow?.textContent).toMatch(/6:04/);
    expect(screen.getByText('Ticket machine').closest('li')?.textContent).toContain(
      'Aug 21',
    );
  });

  /*
   * The server fills `description` with a restatement of the row —
   * "Deducted fare with amount EUR 2.800" beside a kind that says Fare and a
   * figure that says −€2.80. Shown as written, the amount appeared twice on
   * one line and crowded out the date.
   */
  it('drops a description that only restates the amount', async () => {
    stubApi({
      cards: [
        {
          ...CARD,
          usages: [
            {
              date: '2026-08-23',
              time: '18:04',
              amount: 2.8,
              kind: 'fare',
              description: 'Deducted fare with amount EUR 2.800',
            },
          ],
        },
      ],
    });
    await openWallet();

    await screen.findByText('Fare');
    expect(screen.queryByText(/Deducted fare with amount/)).toBeNull();
    // The date survives, which is what the sentence was crowding out.
    expect(screen.getByText(/Aug 23 · 6:04/)).toBeTruthy();
  });

  /*
   * `amount` is a magnitude and `kind` carries the direction, so the sign is
   * built from the two — and through `Intl`, since a locale's minus is not
   * always the ASCII hyphen.
   */
  it('signs a fare against a top-up', async () => {
    stubApi();
    await openWallet();

    await screen.findByText(/Bus 550/);
    expect(screen.getByText(/^-JOD\s?3\.300$/)).toBeTruthy();
    expect(screen.getByText(/^\+JOD\s?20\.000$/)).toBeTruthy();
  });

  /* Direction is never carried by colour alone. */
  it('names the kind of each movement in words', async () => {
    stubApi();
    await openWallet();

    await screen.findByText(/Bus 550/);
    expect(screen.getByText('Fare')).toBeTruthy();
    expect(screen.getByText('Top-up')).toBeTruthy();
  });

  it('says so when there is nothing recorded', async () => {
    stubApi({ cards: [EMPTY_CARD] });
    await openWallet();

    expect(await screen.findByText(/Nothing recorded on this card yet/)).toBeTruthy();
  });
});
