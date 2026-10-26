import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRegisteredHere, wasRegisteredHere } from './registeredHere';
import { signUp } from './sessionStore';

/*
 * Registering records the address, because it is the only moment this browser
 * knows an account is new: the first sign-in comes later, after the address is
 * confirmed, and is when a guest's favourites are handed over.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registering in this browser', () => {
  it('records the address, matched however it is cased', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: { email: 'New@Example.com', verificationRequired: true } }),
          { status: 201 },
        ),
      ),
    );

    await signUp({ name: 'New', email: 'New@Example.com', password: 'a long enough password' });

    expect(wasRegisteredHere('new@example.com')).toBe(true);
    expect(wasRegisteredHere('other@example.com')).toBe(false);

    forgetRegisteredHere();
    expect(wasRegisteredHere('new@example.com')).toBe(false);
  });

  it('records nothing when the registration is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ errorCode: 'EMAIL_IN_USE', error: 'In use.' }), {
          status: 400,
        }),
      ),
    );

    await signUp({ name: 'X', email: 'taken@example.com', password: 'a long enough password' }).catch(
      () => {},
    );

    expect(wasRegisteredHere('taken@example.com')).toBe(false);
  });
});
