import { getSession, logIn as logInRequest, logOut as logOutRequest, register } from '../api/auth';
import type { LogInInput, RegisterInput } from '../api/auth';
import type { Account } from '../types/account';

/**
 * Who is signed in, for the whole app rather than one page of it.
 *
 * A module-level store with a set of listeners, the same shape as
 * `backendHealth.ts` and `navigationDepth.ts` — no state library, consistent
 * with everything else here. A context provider was the obvious alternative
 * and is the wrong tool for one specific reason: **the saved-item and wallet
 * stores have to be able to report an expired session, and they are not
 * React.** They are module-level stores whose requests can 401 at any moment,
 * because a JWT expires on its own schedule rather than when somebody is
 * looking. A plain function they can call is all that takes; a provider would
 * mean threading a dispatch out of React and into them.
 *
 * Nothing is persisted. The session is an HTTP-only cookie, so the browser
 * holds it and script cannot read it — which means "am I signed in" is only
 * ever answered by asking the server, and {@link checkSession} is that ask.
 * Mirroring it into `localStorage` would create a second answer free to
 * disagree with the cookie, and the disagreement would always resolve in
 * favour of the one the user can see and against the one that actually works.
 */

/**
 * `checking` is the state the app starts in and is **not** the same as
 * `signedOut`: a gate that treated it as such would flash a sign-in prompt at
 * every returning visitor for as long as `/api/auth/me` takes to answer.
 */
export type SessionStatus = 'checking' | 'signedIn' | 'signedOut';

interface Session {
  status: SessionStatus;
  account: Account | null;
  /**
   * True while the session could not be determined — the probe failed for a
   * reason that was not a 401.
   *
   * Kept apart from `signedOut` because they call for different words. A
   * visitor who is not signed in should be invited to; one whose session could
   * not be *checked* has a backend problem, and telling them to sign in sends
   * them to a form that will fail the same way.
   */
  unreachable: boolean;
}

const INITIAL: Session = { status: 'checking', account: null, unreachable: false };

let session: Session = INITIAL;

/** Distinguishes a check from a *later* one, so a stale answer cannot land. */
let requestId = 0;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Replaces the session and tells everyone.
 *
 * The object reference changes only here, which is what {@link getSession}
 * relies on: `useSyncExternalStore` compares snapshots by reference, so
 * building a fresh one on every read would re-render forever.
 */
function setSession(next: Session): void {
  session = next;
  announce();
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The session as it stands. Returns the held object, never a fresh one. */
export function getSessionSnapshot(): Session {
  return session;
}

/**
 * Asks the server who is signed in, superseding any check already in flight.
 *
 * Only ever resolves to `signedOut` on a genuine 401. A backend that is down
 * leaves the account in place and raises `unreachable` instead — signing
 * somebody out because the server hiccupped would throw away a session the
 * cookie still holds perfectly well, and they would find themselves logged out
 * for no reason they could see.
 */
export async function checkSession(): Promise<void> {
  const id = ++requestId;
  setSession({ ...session, status: session.account === null ? 'checking' : session.status });

  try {
    const account = await getSession();
    if (id !== requestId) return;
    setSession({
      status: account === null ? 'signedOut' : 'signedIn',
      account,
      unreachable: false,
    });
  } catch {
    if (id !== requestId) return;
    setSession({
      // Keep whoever was signed in; this says nothing about them.
      status: session.account === null ? 'signedOut' : 'signedIn',
      account: session.account,
      unreachable: true,
    });
  }
}

/**
 * Signs in and records who.
 *
 * Rejects with the `ApiError` the API module produced, so the form can map its
 * code to a message and mark the fields the server named. The store is only
 * touched on success: a failed attempt must not disturb a session that is
 * already valid, which is exactly what happens when somebody mistypes a
 * password in a second tab.
 */
export async function signIn(input: LogInInput): Promise<Account> {
  const account = await logInRequest(input);
  requestId += 1;
  setSession({ status: 'signedIn', account, unreachable: false });
  return account;
}

/** Creates an account; the server signs it in with the same response. */
export async function signUp(input: RegisterInput): Promise<Account> {
  const account = await register(input);
  requestId += 1;
  setSession({ status: 'signedIn', account, unreachable: false });
  return account;
}

/**
 * Signs out.
 *
 * The local state is cleared **first**, before the request is awaited, because
 * the press is about leaving rather than about the round trip: a reader who has
 * asked to sign out should not keep seeing their own name while a slow network
 * finishes. `logOut` never rejects, so there is no failure path that would need
 * the account put back.
 */
export async function signOut(): Promise<void> {
  requestId += 1;
  setSession({ status: 'signedOut', account: null, unreachable: false });
  await logOutRequest();
}

/**
 * A protected request came back 401, so the session is gone.
 *
 * Called by the data stores rather than by a component — this is the reason
 * this module is not a context provider. A cookie can expire between one
 * request and the next with nothing on screen having changed, and the honest
 * response is to stop claiming somebody is signed in rather than to let every
 * panel show its own authorisation error.
 *
 * A no-op when nobody was signed in, so a 401 from a request that was always
 * going to fail cannot announce a state change that did not happen.
 */
export function sessionExpired(): void {
  if (session.status === 'signedOut' && session.account === null) return;
  requestId += 1;
  setSession({ status: 'signedOut', account: null, unreachable: false });
}

/** For tests, which share one module across a file. */
export function forgetSession(): void {
  requestId += 1;
  session = INITIAL;
  announce();
}
