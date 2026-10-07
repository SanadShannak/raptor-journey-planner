import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { forgetCards } from '../features/card/cardsStore';
import { forgetFavourites } from '../features/favourites/favouritesStore';
import type { Account } from '../types/account';
import {
  checkSession,
  getSessionSnapshot,
  signIn,
  signOut,
  signUp,
  subscribeToSession,
  type SessionStatus,
} from './sessionStore';

/**
 * Asks once, on load, who is signed in.
 *
 * Mounted in the layout every page passes through — the same place
 * `useStartHealthCheck` and `useTrackNavigationDepth` are — so no page has to
 * remember, and the question is asked once per load rather than once per page
 * that happens to care about the answer.
 *
 * It has to be asked at all because the session is an HTTP-only cookie: the
 * browser will send it, but script cannot read it, so the only way to know
 * whether a returning visitor still has one is to make a request that uses it.
 */
export function useStartSessionCheck(): void {
  useEffect(() => {
    void checkSession();
    // Deliberately once. A route change is no reason to re-ask; an expired
    // cookie is reported by `sessionExpired` from whichever request met it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface SessionValue {
  status: SessionStatus;
  account: Account | null;
  /** The session could not be checked — a backend problem, not a signed-out visitor. */
  unreachable: boolean;
  /** True only once the server has actually confirmed an account. */
  signedIn: boolean;
  /**
   * True while the answer is still unknown.
   *
   * Every gate must branch on this *before* it branches on `signedIn`, or it
   * will show a sign-in prompt to somebody who is already signed in for as
   * long as the check takes.
   */
  checking: boolean;
  logIn: typeof signIn;
  register: typeof signUp;
  logOut: () => Promise<void>;
}

/**
 * The shared session, kept current.
 *
 * Subscribed rather than read, for the same reason the health store is: a
 * header words itself during render, and the session changes outside React —
 * from a dialog on another page, or from a request that met an expired cookie.
 */
export function useSession(): SessionValue {
  const session = useSyncExternalStore(subscribeToSession, getSessionSnapshot);

  /**
   * Signs out, and drops the data that belonged to the account.
   *
   * The two stores are cleared **here** rather than inside `signOut`, which
   * knows nothing about either, and rather than at each logout control, which
   * would be a thing to remember every time a second one appears. This is the
   * one way a component signs out, so it is the one place that needs to know.
   *
   * It matters because the stores outlive the pages that read them: a wallet
   * fetched once sits in module scope until something replaces it, and the
   * next account's wallet is fetched *after* its page mounts. Without this
   * there is a window in which somebody else's balance is in memory under a
   * new name — and the fix cannot live in the stores themselves, since they
   * already import the session store and would close a cycle.
   */
  const logOut = useCallback(async () => {
    await signOut();
    forgetFavourites();
    forgetCards();
  }, []);

  return {
    status: session.status,
    account: session.account,
    unreachable: session.unreachable,
    signedIn: session.status === 'signedIn',
    checking: session.status === 'checking',
    logIn: signIn,
    register: signUp,
    logOut,
  };
}
