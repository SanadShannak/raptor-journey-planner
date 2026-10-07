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
}

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

  return { id, name, email };
}

/** A 400 carrying field complaints is a validation failure, whatever else it is. */
function codeForSubmission(error: ApiError, fallback: string): string {
  return Object.keys(error.fieldErrors).length > 0 ? INVALID_SUBMISSION : fallback;
}

/**
 * Creates an account and signs it in.
 *
 * The server sets the session cookie on the 201, so there is no separate login
 * step — registering *is* signing in.
 */
export async function register(
  input: RegisterInput,
  options: CallOptions = {},
): Promise<Account> {
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

  const account = toAccount(body);
  if (account === null) {
    throw new ApiError('malformed', 'Register response carried no account.');
  }
  return account;
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
 * **Implemented over the login endpoint, because there is no other.** The API
 * has no "verify my password" route, so this signs in again as the same
 * account: a match resolves, a mismatch rejects with
 * {@link INVALID_CREDENTIALS} exactly as a failed sign-in does. Two
 * consequences are worth knowing. The server issues a fresh cookie on success,
 * which restarts the thirty-day expiry — harmless, and arguably right for
 * somebody who has just proved who they are. And a *failed* attempt leaves the
 * existing session untouched, because `logIn` here is the raw request rather
 * than `signIn`, so nothing is written to the session store either way.
 *
 * A dedicated endpoint would be better: it would not re-issue a cookie, and it
 * could be rate-limited separately from sign-in.
 *
 * @param email The signed-in account's own address, from the session — never
 *   typed by the person confirming, who is only asked for the password.
 */
export async function verifyPassword(
  email: string,
  password: string,
  options: CallOptions = {},
): Promise<void> {
  await logIn({ email, password }, options);
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
