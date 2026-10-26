import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { en } from '../i18n/en';
import { GuestNotice } from './GuestNotice';
import { checkSession, forgetSession } from './sessionStore';

/* The notice a guest sees, with or without its two ways in. */

beforeEach(() => {
  forgetSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ errorCode: 'UNAUTHORIZED', error: 'No.' }), { status: 401 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function show(actions?: boolean) {
  render(
    <LocaleProvider>
      <GuestNotice message={en.favourites.guestNotice} actions={actions} />
    </LocaleProvider>,
  );
  await act(async () => {
    await checkSession();
  });
}

describe('the guest notice', () => {
  it('offers both ways in by default', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
  });

  it('says only its message when the buttons are turned off', async () => {
    await show(false);
    expect(screen.getByText(/kept in this browser only/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
