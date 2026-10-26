import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { checkCardBalance } from '../../api/cards';
import { isApiError } from '../../api/errors';
import { BalanceCheck } from './BalanceCheck';

/*
 * A balance by number, for anybody. The contract is narrow on purpose — the
 * number and the balance, nothing about whose card it is — and the form has
 * to tell "no such card" from "too many tries" from "type the whole number".
 */

function serve(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkCardBalance', () => {
  it('asks by the digits alone, however the number was typed', async () => {
    const fetchMock = serve(200, { data: { number: '10000-00004-2', balance: 7.35 } });

    const answer = await checkCardBalance('10000 00004-2');

    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(
      '/api/cards/balance/10000000042',
    );
    expect(answer).toEqual({ number: '10000-00004-2', balance: 7.35 });
  });

  it('refuses a short number without asking', async () => {
    const fetchMock = serve(200, {});
    const error = await checkCardBalance('12345').catch((caught: unknown) => caught);

    expect(isApiError(error) && error.code).toBe('BAD_CARD_NUMBER');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an answer with no balance in it', async () => {
    serve(200, { data: { number: '10000-00004-2' } });
    const error = await checkCardBalance('10000000042').catch((caught: unknown) => caught);
    expect(isApiError(error) && error.kind).toBe('malformed');
  });
});

describe('the balance check', () => {
  const renderCheck = () =>
    render(
      <LocaleProvider>
        <BalanceCheck currency="JOD" />
      </LocaleProvider>,
    );

  const field = () => screen.getByRole('textbox', { name: 'Card number' }) as HTMLInputElement;
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Check balance' }));

  it('groups the number as it is typed', () => {
    renderCheck();
    fireEvent.change(field(), { target: { value: '10000000042' } });
    expect(field().value).toBe('10000-00004-2');
  });

  it('shows the balance in the network’s money, and says it in a sentence', async () => {
    serve(200, { data: { number: '10000-00004-2', balance: 7.35 } });
    renderCheck();

    fireEvent.change(field(), { target: { value: '10000000042' } });
    submit();

    expect(await screen.findByText(/Card 10000-00004-2 has .*7\.350/)).toBeTruthy();
  });

  it('asks for the whole number before sending anything', () => {
    const fetchMock = serve(200, {});
    renderCheck();

    fireEvent.change(field(), { target: { value: '12345' } });
    submit();

    expect(screen.getByText('Enter all eleven digits of the card number.')).toBeTruthy();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says when no card has that number, in the reader’s words rather than the API’s', async () => {
    serve(404, { errorCode: 'CARD_NOT_FOUND', error: 'Card does not exist.' });
    renderCheck();

    fireEvent.change(field(), { target: { value: '10000000043' } });
    submit();

    expect(
      await screen.findByText('No card has that number. Check the digits and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Card does not exist.')).toBeNull();
  });

  it('says to wait when the checks have been too many', async () => {
    serve(429, { errorCode: 'RATE_LIMITED', error: 'Too many balance checks.' });
    renderCheck();

    fireEvent.change(field(), { target: { value: '10000000042' } });
    submit();

    expect(await screen.findByText(/Wait a minute, then try again/)).toBeTruthy();
  });
});
