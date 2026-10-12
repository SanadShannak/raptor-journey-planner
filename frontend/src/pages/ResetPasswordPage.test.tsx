import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { forgetSession } from '../auth';
import { LocaleProvider } from '../i18n';
import ResetPasswordPage from './ResetPasswordPage';

function stubCheck(check: { status: number; body: unknown }) {
  const fetchMock = vi.fn((url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    if (path === '/api/auth/reset-password/check') return json(check.body, check.status);
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider>
        <ResetPasswordPage />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => forgetSession());
afterEach(() => vi.unstubAllGlobals());

describe('the password reset page', () => {
  /*
   * The point of the check on arrival: an expired link says so before anybody
   * types a password, not after.
   */
  it('says an expired link has expired as soon as it opens, with no form', async () => {
    stubCheck({ status: 400, body: { errorCode: 'INVALID_TOKEN', error: 'expired' } });
    renderAt('/reset-password?token=old');

    expect(await screen.findByRole('heading', { name: 'This link no longer works' })).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send a new reset link' })).toBeTruthy();
  });

  it('shows the form when the link still works', async () => {
    stubCheck({ status: 200, body: { data: { valid: true } } });
    renderAt('/reset-password?token=fresh');

    expect(await screen.findByLabelText('New password')).toBeTruthy();
  });

  /* A failed pre-check must not stop somebody resetting their password. */
  it('still offers the form when the check itself cannot be made', async () => {
    stubCheck({ status: 500, body: { errorCode: 'INTERNAL_SERVER_ERROR', error: 'x' } });
    renderAt('/reset-password?token=fresh');

    expect(await screen.findByLabelText('New password')).toBeTruthy();
  });

  it('does not ask the server about a link with no token', () => {
    const fetchMock = stubCheck({ status: 200, body: {} });
    renderAt('/reset-password');

    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
