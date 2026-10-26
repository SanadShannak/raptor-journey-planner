import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { en } from '../i18n/en';
import { GuestNotice } from './GuestNotice';
import { checkSession, forgetSession } from './sessionStore';
import { forgetAuthPrompt, getAuthPrompt } from './authPrompt';

/* The notice a guest sees, with or without its two ways in. */

beforeEach(() => {
  forgetSession();
  forgetAuthPrompt();
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
  it('offers both ways in by default, each opening its own form', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(getAuthPrompt()).toBe('logIn');

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(getAuthPrompt()).toBe('signUp');
  });

  it('says only its message when the buttons are turned off', async () => {
    await show(false);
    expect(screen.getByText(/kept in this browser only/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
