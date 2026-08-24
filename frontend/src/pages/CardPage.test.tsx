import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import CardPage from './CardPage';

/*
 * The page as somebody uses it. The card client is stubbed rather than
 * `fetch`, because there is no endpoint behind it yet — what is under test is
 * the form, the three states, and the money.
 */
vi.mock('../api/network', () => ({
  getNetwork: vi.fn(async () => ({ currency: 'JOD' })),
}));

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

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

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
    expect(screen.queryByText(/Card not found\./)).toBeNull();
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
