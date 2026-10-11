import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMAIL_IN_USE,
  EMAIL_NOT_VERIFIED,
  INVALID_CREDENTIALS,
  INVALID_SUBMISSION,
  INCORRECT_PASSWORD,
  INVALID_TOKEN,
  changePassword,
  getSession,
  logIn,
  logOut,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from './auth';
import { ApiError } from './errors';

function respondWith(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Copied from live calls against a running backend. */
const ACCOUNT = {
  id: '6ac6b429417f754fdb2af6b4',
  name: 'Verify User',
  email: 'verify@example.com',
};

/*
 * What those calls read as: they predate email verification, so they carry no
 * `emailVerified`, and an account the server says nothing about is treated as
 * verified rather than nagged about a link that was never sent.
 */
const READ = { ...ACCOUNT, emailVerified: true };

describe('logIn', () => {
  it('reads the account out of the data envelope', async () => {
    respondWith({ message: 'Login successful', data: ACCOUNT });
    await expect(logIn({ email: ACCOUNT.email, password: 'password123' })).resolves.toEqual(
      READ,
    );
  });

  /*
   * **The case this test exists for.** A rejected password comes back as
   * `{ message: "Incorrect Password." }` with status **200** and no
   * `Set-Cookie`. A caller trusting the status would show somebody a signed-in
   * app they are not signed in to, and the next protected call would 401 for
   * no visible reason. The absence of an account in the body is what actually
   * separates the two outcomes.
   */
  it('treats a 200 with no account as a failed sign-in', async () => {
    respondWith({ message: 'Incorrect Password.' }, 200);

    const error = await logIn({ email: ACCOUNT.email, password: 'wrong' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(INVALID_CREDENTIALS);
  });

  /*
   * A wrong email is a 401 and a wrong password a 404, and both resolve to the
   * same code with the same message. Telling an unauthenticated caller which
   * it got is an account-enumeration oracle.
   *
   * Both statuses are pinned because this endpoint has already moved once: a
   * rejected password answered 200 before it answered 404, so the set is
   * treated as something that can change rather than as a fact.
   */
  it.each([401, 404])('maps a %i to "those do not match"', async (status) => {
    respondWith({ message: 'Rejected' }, status);

    const error = await logIn({ email: 'nobody@example.com', password: 'x' }).catch(
      (e: unknown) => e,
    );
    expect((error as ApiError).code).toBe(INVALID_CREDENTIALS);
  });

  it('separates a rejected field from wrong credentials', async () => {
    respondWith(
      {
        errors: [
          { type: 'field', msg: 'Please enter a valid email address', path: 'email', location: 'body' },
        ],
      },
      400,
    );

    const error = await logIn({ email: 'nope', password: 'password123' }).catch(
      (e: unknown) => e,
    );
    expect((error as ApiError).code).toBe(INVALID_SUBMISSION);
    expect((error as ApiError).fieldErrors['email']).toBeDefined();
  });

  it('sends credentials, so the cookie the server sets is kept', async () => {
    const fetchMock = respondWith({ data: ACCOUNT });
    await logIn({ email: ACCOUNT.email, password: 'password123' });

    expect((fetchMock.mock.calls[0]![1] as RequestInit).credentials).toBe('include');
  });
});

describe('register', () => {
  /* Signing up does not sign in: the account waits for its emailed link. */
  it('returns where the confirmation link went, and no account', async () => {
    respondWith(
      {
        message: 'Check your email to confirm the address before logging in.',
        data: { email: ACCOUNT.email, verificationRequired: true },
      },
      201,
    );
    await expect(
      register({ name: ACCOUNT.name, email: ACCOUNT.email, password: 'password123' }),
    ).resolves.toEqual({ email: ACCOUNT.email });
  });

  /* A bare 400 on this endpoint means the address is taken. */
  it('turns a bare 400 into "that email is taken"', async () => {
    respondWith({ message: 'A user with this email already exists.' }, 400);

    const error = await register({
      name: 'Verify User',
      email: ACCOUNT.email,
      password: 'password123',
    }).catch((e: unknown) => e);

    expect((error as ApiError).code).toBe(EMAIL_IN_USE);
  });

  /*
   * The same status, with a field list, means something else entirely — and
   * every field the server complained about has to survive so the form can
   * mark it.
   */
  it('keeps every rejected field when the 400 is a validation failure', async () => {
    respondWith(
      {
        errors: [
          { type: 'field', msg: 'Please enter a valid email address', path: 'email', location: 'body' },
          { type: 'field', msg: 'Password must be at least 8 characters', path: 'password', location: 'body' },
          { type: 'field', msg: 'Name must be between 3 and 20 characters', path: 'name', location: 'body' },
        ],
      },
      400,
    );

    const error = await register({ name: 'a', email: 'nope', password: 'short' }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).code).toBe(INVALID_SUBMISSION);
    expect(Object.keys((error as ApiError).fieldErrors).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });
});

describe('logging in before confirming', () => {
  /*
   * A 403, and kept as the server's own code rather than folded into "those
   * do not match" — the password was right, and the reader needs to be told
   * to open the link, not to try again.
   */
  it('keeps "confirm your email first" apart from wrong credentials', async () => {
    respondWith(
      { errorCode: 'EMAIL_NOT_VERIFIED', error: 'Confirm your email address before logging in.' },
      403,
    );
    await expect(logIn({ email: ACCOUNT.email, password: 'password123' })).rejects.toMatchObject({
      code: EMAIL_NOT_VERIFIED,
    });
  });
});

describe('getSession', () => {
  /* `/api/auth/me` returns the whole Mongo document, with `_id` not `id`. */
  it('normalises the me-shaped response', async () => {
    respondWith({
      data: {
        _id: ACCOUNT.id,
        name: ACCOUNT.name,
        email: ACCOUNT.email,
        savedStops: [],
        savedRoutes: [],
        savedItineraries: [],
        createdAt: '2026-10-07T21:05:45.654Z',
        __v: 0,
      },
    });

    await expect(getSession()).resolves.toEqual(READ);
  });

  it('reads an unconfirmed address as unconfirmed', async () => {
    respondWith({ data: { ...ACCOUNT, emailVerified: false } });
    await expect(getSession()).resolves.toEqual({ ...ACCOUNT, emailVerified: false });
  });

  /*
   * Nobody signed in is the ordinary answer on a first visit, not a failure —
   * the same distinction `NO_ROUTE_FOUND` gets.
   */
  it('reads a 401 as "nobody is signed in" rather than rejecting', async () => {
    respondWith({ message: 'Not authorized. Please log in.' }, 401);
    await expect(getSession()).resolves.toBeNull();
  });

  /*
   * And the other half of that, which matters more: a backend that is down
   * must **not** be mistaken for a visitor who is signed out, or the app would
   * quietly drop somebody's session every time the server hiccupped.
   */
  it('still rejects when the failure is not a 401', async () => {
    respondWith({ message: 'Internal Server Error' }, 500);
    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a network failure rather than reporting signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('logOut', () => {
  /*
   * Never rejects. The app has already forgotten the account by the time this
   * settles, so a reader looking at a signed-out interface must not also be
   * told that signing out failed.
   */
  it('resolves even when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(logOut()).resolves.toBeUndefined();
  });
});

describe('password reset and email verification', () => {
  it('asks for a reset with the address and the reader\'s language', async () => {
    const fetchMock = respondWith({ message: 'If an account exists…' });
    await requestPasswordReset('someone@example.com', 'ar');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/auth/forgot-password');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'someone@example.com', locale: 'ar' });
  });

  it('signs in with the account a successful reset returns', async () => {
    respondWith({ message: 'Password reset', data: { ...ACCOUNT, emailVerified: true } });
    await expect(resetPassword('token', 'newpassword1')).resolves.toEqual(READ);
  });

  /* The two ways a reset is refused need different words: the link, or the password. */
  it('tells a dead link from a rejected password', async () => {
    respondWith({ errorCode: 'INVALID_TOKEN', error: 'expired' }, 400);
    await expect(resetPassword('old', 'newpassword1')).rejects.toMatchObject({ code: INVALID_TOKEN });

    respondWith(
      {
        errorCode: 'VALIDATION_FAILED',
        error: 'Some fields were rejected.',
        errors: [{ path: 'password', msg: 'Password must be at least 8 characters' }],
      },
      400,
    );
    await expect(resetPassword('token', 'short')).rejects.toMatchObject({ code: INVALID_SUBMISSION });
  });

  it('reads any refusal of a verification link as a dead link', async () => {
    respondWith({ errorCode: 'INVALID_TOKEN', error: 'expired' }, 400);
    await expect(verifyEmail('old')).rejects.toBeInstanceOf(ApiError);
    respondWith({ errorCode: 'INVALID_TOKEN', error: 'expired' }, 400);
    await expect(verifyEmail('old')).rejects.toMatchObject({ code: INVALID_TOKEN });
  });
});

describe('changePassword', () => {
  it('returns the account when the change goes through', async () => {
    respondWith({ message: 'Password changed', data: { ...ACCOUNT, emailVerified: true } });
    await expect(changePassword('oldpassword', 'newpassword1')).resolves.toEqual(READ);
  });

  /*
   * A wrong current password is a 400 with its own code — never a 401, which
   * everything else reads as the session being over, and which would sign
   * somebody out for a typo.
   */
  it('keeps a wrong current password apart from a too-short new one', async () => {
    respondWith(
      {
        errorCode: 'INCORRECT_PASSWORD',
        error: 'The current password is incorrect.',
        errors: [{ path: 'currentPassword', msg: 'Incorrect password' }],
      },
      400,
    );
    await expect(changePassword('wrong', 'newpassword1')).rejects.toMatchObject({
      code: INCORRECT_PASSWORD,
    });

    respondWith(
      {
        errorCode: 'VALIDATION_FAILED',
        error: 'Some fields were rejected.',
        errors: [{ path: 'newPassword', msg: 'Password must be at least 8 characters' }],
      },
      400,
    );
    await expect(changePassword('oldpassword', 'short')).rejects.toMatchObject({
      code: INVALID_SUBMISSION,
    });
  });
});
