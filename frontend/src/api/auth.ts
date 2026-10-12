/**
 * `/api/auth` — register, log in, log out, and who is signed in.
 *
 * The session is an **HTTP-only cookie** set by the server, so none of these
 * functions returns a token and none could: script cannot read the cookie. Log
 * in succeeds by virtue of `Set-Cookie` having arrived, and `getSession` is the
 * only way to find out whether one is still valid.
 *
 * This module also does the translating between the account endpoints' error
 * style and the rest of the app's. They answer `{ message }` or
 * express-validator's `{ errors: [...] }` with no stable `errorCode`, so each
 * call maps its own statuses onto the codes below — which `i18n/apiError.ts`
 * then turns into localised text, exactly as it does for the feed endpoints.
 * Mapping here rather than there is deliberate: a bare 400 means different
 * things on different endpoints, and only the caller knows which one it asked.
 */

import type { Account } from '../types/account';
import type { Locale } from '../i18n/dictionary';
import { getJson, postJson } from './client';
import { ApiError, isApiError } from './errors';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/** The email is already registered to somebody. */
export const EMAIL_IN_USE = 'EMAIL_IN_USE';

/**
 * The email and password do not go together.
 *
 * One code for "no such email" and "wrong password" on purpose, and the
 * dictionary gives it one message. Telling an unauthenticated caller which of
 * the two it got is an account-enumeration oracle: it answers "does this
 * person have an account here" to anybody willing to ask.
 */
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';

/** A field was rejected by the server's own validators. */
export const INVALID_SUBMISSION = 'INVALID_SUBMISSION';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  /** The language the verification email is written in. */
  locale?: Locale | undefined;
}

/**
 * The password matched, but the address has not been confirmed yet. Arrives
 * as the server's own code on a 403; the account cannot log in until the
 * emailed link is opened.
 */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/** The current password given to change-password did not match. */
export const INCORRECT_PASSWORD = 'INCORRECT_PASSWORD';

/** A reset or verification link that is wrong, used, or expired. */
export const INVALID_TOKEN = 'INVALID_TOKEN';

export interface LogInInput {
  email: string;
  password: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Reads an account out of a response, or null when there is not one in it.
 *
 * Both envelopes the server uses are accepted: register and login nest the
 * three fields under `data` with the id as `id`, while `/api/auth/me` returns
 * the whole Mongo document with the id as `_id`. Normalising here means
 * nothing downstream has to know which call it came from.
 */
function toAccount(body: unknown): Account | null {
  if (!isRecord(body)) return null;
  const data = isRecord(body['data']) ? body['data'] : null;
  if (data === null) return null;

  const id = data['id'] ?? data['_id'];
  const { name, email } = data;

  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string' || typeof email !== 'string') return null;

  // Missing on an older server, which never asked anybody to verify.
  return { id, name, email, emailVerified: data['emailVerified'] !== false };
}

/** A 400 carrying field complaints is a validation failure, whatever else it is. */
function codeForSubmission(error: ApiError, fallback: string): string {
  return Object.keys(error.fieldErrors).length > 0 ? INVALID_SUBMISSION : fallback;
}

/**
 * Creates an account and signs it in.
 *
 * **Registering does not sign in.** The account is pending until the link
 * emailed to the address is opened, and only then can it log in — so this
 * returns the address the link went to, for the form to say so, and no
 * account.
 */
export async function register(
  input: RegisterInput,
  options: CallOptions = {},
): Promise<{ email: string }> {
  let body: unknown;
  try {
    body = await postJson('/api/auth/register', {
      body: input,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400) {
      throw error.withCode(codeForSubmission(error, EMAIL_IN_USE));
    }
    throw error;
  }

  const data = isRecord(body) && isRecord(body['data']) ? body['data'] : null;
  const email = data?.['email'];
  if (typeof email !== 'string') {
    throw new ApiError('malformed', 'Register response carried no address.');
  }
  return { email };
}

/**
 * Signs in, or reports that the credentials do not match.
 *
 * Three statuses mean "those do not match", and the set has already changed
 * once: a rejected password answered **200** with no `Set-Cookie`, and now
 * answers 404. So the body is what is actually trusted — the absence of an
 * account in it is the thing that distinguishes a failure, whatever status
 * carried it — and the status list below only decides which *code* to attach.
 * A caller that trusted a 200 would have shown somebody a signed-in app they
 * were not signed in to, with the next protected call 401ing for no apparent
 * reason.
 *
 * A wrong email is a 401 and a wrong password a 404; both land on
 * {@link INVALID_CREDENTIALS}, because telling them apart is an
 * account-enumeration oracle.
 */
export async function logIn(
  input: LogInInput,
  options: CallOptions = {},
): Promise<Account> {
  let body: unknown;
  try {
    body = await postJson('/api/auth/login', {
      body: input,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (
      isApiError(error) &&
      (error.status === 400 || error.status === 401 || error.status === 404)
    ) {
      throw error.withCode(codeForSubmission(error, INVALID_CREDENTIALS));
    }
    throw error;
  }

  const account = toAccount(body);
  if (account === null) {
    // A success status with no account in it is a rejected credential, not a
    // broken server — which is how this endpoint once reported a wrong
    // password, and the reason the body rather than the status is the test.
    throw new ApiError('http', 'Login did not return an account.', {
      status: 200,
      code: INVALID_CREDENTIALS,
    });
  }
  return account;
}

/**
 * Confirms that the person at the keyboard knows the account's password.
 *
 * What guards a destructive act — deleting a card — from somebody who walked
 * up to an unattended screen. A session cookie says a browser was signed in
 * once; it says nothing about who is holding the device now.
 *
 * It takes **no email**, which is the point of having its own endpoint: the
 * account comes from the session cookie, so there is nothing here to aim at a
 * different account and nothing to re-issue. This used to go through
 * `/api/auth/login` as the same account, which worked but restarted the
 * thirty-day session on every confirmation and shared sign-in's rate limiting.
 *
 * The field is named `password`, which is what `verifyPasswordValidationRules`
 * validates — the controller currently destructures `enteredPassword`, so the
 * two disagree and nothing can satisfy both. Written against the validator,
 * because that is the half the request has to get past first.
 */
export async function verifyPassword(
  password: string,
  options: CallOptions = {},
): Promise<void> {
  try {
    await postJson('/api/auth/verify-password', {
      body: { password },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && (error.status === 400 || error.status === 401)) {
      /*
       * A 401 here is the wrong password, **not** an expired session —
       * `requireAuth` runs first and would have answered before the password
       * was ever compared. So this one must not be left for `isUnauthorized`
       * to read as a lapsed cookie and sign the reader out mid-confirmation.
       */
      throw error.withCode(codeForSubmission(error, INVALID_CREDENTIALS));
    }
    throw error;
  }
}

/**
 * Ends the session.
 *
 * Never rejects. The cookie it clears is the server's to clear, but the only
 * thing a failure here changes is that a stale cookie outlives the press —
 * and the app has already forgotten the account by then, so re-throwing would
 * leave somebody looking at a signed-out interface being told that signing out
 * failed. The session is also unauthenticated by design (the route has no
 * `requireAuth`), so there is no expiry case to report either.
 */
export async function logOut(options: CallOptions = {}): Promise<void> {
  try {
    await postJson('/api/auth/logout', {
      body: {},
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    /* Nothing a reader could act on. */
  }
}

/**
 * The account the cookie names, or null when there is no usable session.
 *
 * Null rather than a rejection for a 401, because "nobody is signed in" is the
 * ordinary answer on a first visit rather than a failure — it is the same
 * distinction `NO_ROUTE_FOUND` gets in `journey.ts`. Everything else still
 * rejects: a backend that is down must not be mistaken for a visitor who is
 * signed out, or the app would quietly drop somebody's session every time the
 * server hiccupped.
 */
export async function getSession(options: CallOptions = {}): Promise<Account | null> {
  let body: unknown;
  try {
    body = await getJson('/api/auth/me', {
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }

  return toAccount(body);
}

/**
 * Asks for a password-reset email.
 *
 * Resolves whether or not the address has an account — the server answers
 * the same either way, on purpose, so this cannot be used to find out who is
 * registered. Only a failure to reach the server, or a refusal for asking too
 * often, rejects.
 */
export async function requestPasswordReset(
  email: string,
  locale: Locale,
  options: CallOptions = {},
): Promise<void> {
  try {
    await postJson('/api/auth/forgot-password', {
      body: { email, locale },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400) {
      throw error.withCode(INVALID_SUBMISSION);
    }
    throw error;
  }
}

/**
 * Whether a reset link still works, asked when its page opens — so an expired
 * or already-used link says so straight away rather than after a password has
 * been typed. Does not use the link up.
 *
 * Resolves when it works; rejects with {@link INVALID_TOKEN} when it does not.
 */
export async function checkResetLink(token: string, options: CallOptions = {}): Promise<void> {
  try {
    await postJson('/api/auth/reset-password/check', {
      body: { token },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400) throw error.withCode(INVALID_TOKEN);
    throw error;
  }
}

/**
 * Sets a new password from the token in a reset link. The server signs the
 * person in with the same response, so this returns the account.
 *
 * A 400 is either the password (a field complaint) or the link itself
 * ({@link INVALID_TOKEN}: wrong, already used, or past its ten minutes).
 */
export async function resetPassword(
  token: string,
  password: string,
  options: CallOptions = {},
): Promise<Account> {
  let body: unknown;
  try {
    body = await postJson('/api/auth/reset-password', {
      body: { token, password },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400) {
      throw error.withCode(codeForSubmission(error, INVALID_TOKEN));
    }
    throw error;
  }

  const account = toAccount(body);
  if (account === null) {
    throw new ApiError('malformed', 'Reset response carried no account.');
  }
  return account;
}

/**
 * Confirms an address from the token in a verification link.
 *
 * Needs no session — the link is often opened on a different device from the
 * one that signed up. Any 400 means the link is no good ({@link INVALID_TOKEN}).
 */
export async function verifyEmail(token: string, options: CallOptions = {}): Promise<void> {
  try {
    await postJson('/api/auth/verify-email', {
      body: { token },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400) throw error.withCode(INVALID_TOKEN);
    throw error;
  }
}

/**
 * Sends a fresh confirmation link to an address with a pending account.
 *
 * Needs no session — nobody has one before confirming — and resolves the
 * same whatever the address, like asking for a password reset.
 */
export async function resendVerification(
  email: string,
  locale: Locale,
  options: CallOptions = {},
): Promise<void> {
  await postJson('/api/auth/verify-email/resend', {
    body: { email, locale },
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * Changes the signed-in account's password; the server keeps this device
 * signed in and ends every other session.
 *
 * A 400 is either the current password not matching ({@link INCORRECT_PASSWORD},
 * which arrives as the server's own code) or the new one being too short
 * ({@link INVALID_SUBMISSION}). The field complaint says which field.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  options: CallOptions = {},
): Promise<Account> {
  let body: unknown;
  try {
    body = await postJson('/api/auth/change-password', {
      body: { currentPassword, newPassword },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400 && error.code !== INCORRECT_PASSWORD) {
      throw error.withCode(INVALID_SUBMISSION);
    }
    throw error;
  }

  const account = toAccount(body);
  if (account === null) {
    throw new ApiError('malformed', 'Change-password response carried no account.');
  }
  return account;
}
