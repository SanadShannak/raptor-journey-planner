import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import CardPage from './CardPage';

/*
 * The page as somebody uses it, over a stubbed `fetch` — so the client, the
 * error mapping and the money are all really exercised, and only the network
 * is fake.
 *
 * The cards below are the ones seeded into the development database, so a
 * number that works here works when you try it by hand.
 */
const CARDS: Record<string, unknown> = {
  '12345678901': {
    number: '12345-67890-1',
    balance: 10.7,
    lastUsedDate: '2026-08-23',
    usages: [
      { date: '2026-08-23', time: '18:04', amount: 3.3, kind: 'fare', description: 'Bus 550' },
      {
        date: '2026-08-21',
        time: '09:12',
        amount: 20,
        kind: 'topUp',
        description: 'Ticket machine',
      },
    ],
  },
  '11111111111': {
    number: '11111-11111-1',
    balance: 0,
    lastUsedDate: null,
    usages: [],
  },
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;

      // The currency the balance is printed in. A dinar has three decimals,
      // which is where "10.700" comes from without anyone choosing it.
      if (path === '/api/network') {
        return new Response(
          JSON.stringify({ timezone: 'Asia/Amman', currency: 'JOD' }),
        );
      }

      const digits = path.replace('/api/card/', '');
      const card = CARDS[digits];

      return card === undefined
        ? new Response(
            JSON.stringify({ errorCode: 'CARD_NOT_FOUND', error: 'No card with that number.' }),
            { status: 404 },
          )
        : new Response(JSON.stringify(card));
    }),
  );
}

function show() {
  return render(
    <LocaleProvider>
      <CardPage />
    </LocaleProvider>,
  );
}

const field = () => screen.getByLabelText('Card number');
const submit = () => screen.getByRole('button', { name: /Check balance|Checking/ });

const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  stubApi();
});

afterEach(() => vi.unstubAllGlobals());

describe('CardPage', () => {
  /*
   * The groups are punctuation. Somebody reading digits off a card should not
   * have to type the dashes, and should not be able to break the field by
   * typing them either.
   */
  it('groups the number as it is typed', () => {
    show();

    type('12345');
    expect((field() as HTMLInputElement).value).toBe('12345');

    type('123456');
    expect((field() as HTMLInputElement).value).toBe('12345-6');

    type('12345678901');
    expect((field() as HTMLInputElement).value).toBe('12345-67890-1');
  });

  it('cannot be asked about until it is a whole number', () => {
    show();
    expect(submit()).toHaveProperty('disabled', true);

    type('12345678901');
    expect(submit()).toHaveProperty('disabled', false);
  });

  /*
   * In whatever the network charges in, and with the number of decimals that
   * currency has — three for a dinar. Hard-coding either would be wrong on
   * half the networks this app can load.
   */
  it('shows the balance in the network’s own money', async () => {
    show();

    type('12345678901');
    fireEvent.click(submit());

    expect(await screen.findByText('JOD 10.700')).toBeTruthy();
    expect(screen.getByText('12345-67890-1')).toBeTruthy();
  });

  // Zero is a balance, not a missing one, and it changes what you do next.
  it('says an empty card is empty rather than showing nothing', async () => {
    show();

    type('11111111111');
    fireEvent.click(submit());

    expect(await screen.findByText('JOD 0.000')).toBeTruthy();
    expect(screen.getByText(/This card is empty/)).toBeTruthy();
    expect(screen.getByText('Not used yet')).toBeTruthy();
  });

  /*
   * A number nobody holds is almost always a mistyped digit, so it gets its
   * own words — and never the API's, which are developer-facing English.
   */
  it('explains an unknown card without quoting the API', async () => {
    show();

    type('12345678900');
    fireEvent.click(submit());

    expect(await screen.findByText(/No card has that number/)).toBeTruthy();
    expect(screen.queryByText(/No card with that number\./)).toBeNull();
  });

  it('complains about an empty field differently from a short one', () => {
    show();

    // The button is disabled while incomplete, so the form is submitted
    // directly — which is what pressing Enter in the field does.
    fireEvent.submit(field());
    expect(screen.getByText('Enter the card number.')).toBeTruthy();

    type('12345');
    fireEvent.submit(field());
    expect(screen.getByText(/too short/)).toBeTruthy();
  });

  /*
   * Editing the number makes the answer above it stale at the moment of the
   * edit, not when a new one arrives.
   */
  it('drops the answer as soon as the number changes', async () => {
    show();

    type('12345678901');
    fireEvent.click(submit());
    expect(await screen.findByText('JOD 10.700')).toBeTruthy();

    type('1234567890');
    expect(screen.queryByText('JOD 10.700')).toBeNull();
  });
});

describe('activity', () => {
  /*
   * The balance answers "can I board"; the history answers "why is it that".
   * A charge nobody recognises is the reason anybody looks a card up twice.
   */
  it('lists what moved the balance, with where and when', async () => {
    show();

    type('12345678901');
    fireEvent.click(submit());

    expect(await screen.findByText('Bus 550')).toBeTruthy();
    expect(screen.getByText('Ticket machine')).toBeTruthy();
  });

  /*
   * `amount` is a magnitude and `kind` carries the direction, so the sign is
   * the page's to apply — and it goes through `Intl` rather than being glued
   * on, because a locale's minus is not always the ASCII hyphen.
   */
  it('signs a fare against a top-up', async () => {
    show();

    type('12345678901');
    fireEvent.click(submit());

    expect(await screen.findByText('-JOD 3.300')).toBeTruthy();
    expect(screen.getByText('+JOD 20.000')).toBeTruthy();
  });

  // Direction is never carried by colour alone.
  it('names the kind of each movement in words', async () => {
    show();

    type('12345678901');
    fireEvent.click(submit());

    await screen.findByText('Bus 550');
    expect(screen.getByText(/^Fare ·/)).toBeTruthy();
    expect(screen.getByText(/^Top-up ·/)).toBeTruthy();
  });

  /*
   * A card nobody has used and a card whose history was never kept look alike
   * from here, so it says "nothing recorded" rather than claiming it is unused.
   */
  it('says so when there is nothing recorded', async () => {
    show();

    type('11111111111');
    fireEvent.click(submit());

    expect(await screen.findByText(/Nothing recorded on this card yet/)).toBeTruthy();
  });
});
