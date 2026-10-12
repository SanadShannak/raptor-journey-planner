import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { forgetSession } from '../auth';
import { LocaleProvider } from '../i18n';
import VerifyEmailPage from './VerifyEmailPage';

function stubApi(verify: { status: number; body: unknown }) {
  const fetchMock = vi.fn((url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    if (path === '/api/auth/verify-email') return json(verify.body, verify.status);
    if (path === '/api/auth/me') return json({ message: 'Not authorized.' }, 401);
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const verifyCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/auth/verify-email')).length;

function renderAt(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider>
          <VerifyEmailPage />
        </LocaleProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => forgetSession());
afterEach(() => vi.unstubAllGlobals());

describe('the email verification page', () => {
  /*
   * **The case this test exists for.** A token is spent by its first use, and
   * StrictMode mounts the page twice. A request per mount would confirm the
   * address and then report the very same link as expired.
   */
  it('spends the token once, even when mounted twice', async () => {
    const fetchMock = stubApi({ status: 200, body: { message: 'Email verified' } });
    renderAt('/verify-email?token=first-token');

    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeTruthy();
    // Signed out, the next step is logging in — not "go to the planner".
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(verifyCalls(fetchMock)).toBe(1);
  });

  it('says a used or expired link is no good, in the reader’s words', async () => {
    stubApi({ status: 400, body: { errorCode: 'INVALID_TOKEN', error: 'expired' } });
    renderAt('/verify-email?token=old-token');

    expect(await screen.findByText('This link has expired or was already used.')).toBeTruthy();
    expect(screen.queryByText('expired')).toBeNull();
  });

  it('asks for the link when there is no token at all', () => {
    const fetchMock = stubApi({ status: 200, body: {} });
    renderAt('/verify-email');

    expect(screen.getByText('This page needs the link from your email.')).toBeTruthy();
    expect(verifyCalls(fetchMock)).toBe(0);
  });
});
