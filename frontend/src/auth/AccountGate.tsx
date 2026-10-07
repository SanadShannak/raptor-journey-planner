import type { ReactNode } from 'react';
import { useLocale } from '../i18n';
import type { Message } from '../i18n/dictionary';
import { requestAuth } from './authPrompt';
import { useSession } from './useSession';

interface Props {
  /**
   * Why this particular part needs an account, in the page's own words.
   *
   * Passed in rather than written here because the answer differs: a wallet
   * holds money and saved journeys hold a list, and "sign in to continue" says
   * neither. The gate owns the shape of the panel; the page owns the sentence.
   */
  reason: Message;
  /** Shown once the server has confirmed an account. */
  children: ReactNode;
}

/**
 * Stands in for content that needs an account, without taking the page away.
 *
 * **Not a redirect.** Nothing in this app navigates somebody away from what
 * they asked for in order to collect credentials: the page, its heading and
 * its explanation all still render, and only the part that genuinely cannot be
 * shown is replaced. That keeps the back button honest — a visitor who lands
 * on the wallet from a link and signs in is still on the wallet — and it keeps
 * the sign-in dialog as the one way an account is ever asked for, over the top
 * of whatever was already there.
 *
 * Three states, not two. `checking` is its own: treating "the session has not
 * been confirmed yet" as "signed out" would flash a sign-in prompt at every
 * returning visitor for as long as `/api/auth/me` takes to answer, which is
 * the single most noticeable way this kind of gate goes wrong. And a session
 * that could not be *checked* is kept apart from one that is absent, because
 * inviting somebody to sign in against a backend that is not answering sends
 * them to a form that will fail the same way.
 */
export function AccountGate({ reason, children }: Props) {
  const { strings, t } = useLocale();
  const { signedIn, checking, unreachable } = useSession();

  if (signedIn) return <>{children}</>;

  /*
   * A live region, because this is the answer to a question the page asked on
   * the reader's behalf and it resolves after the first paint. `polite` so it
   * is read at the next pause rather than interrupting.
   */
  if (checking) {
    return (
      <p
        role="status"
        className="rounded-card border-border bg-surface-muted text-content-muted border px-3 py-2.5 text-sm"
      >
        {t(strings.account.checking)}
      </p>
    );
  }

  return (
    /*
      The live region is on the **sentence**, not on this box.
      
      The answer to an async check should be announced — but a live region
      containing controls announces the controls too, and re-announces them
      whenever anything inside changes. So the paragraph is the region and the
      buttons sit outside it, which is the whole point of the split.
    */
    <div className="rounded-card border-border bg-surface-raised flex flex-col items-start gap-3 border px-4 py-4">
      <p role="status" className="text-content max-w-prose text-sm">
        {t(unreachable ? strings.account.unreachable : reason)}
      </p>

      {/*
        Offered only when signing in could actually work. Against an
        unreachable backend the dialog would fail in exactly the same way, so
        the panel says what happened and stops there rather than handing over a
        control that cannot succeed.
      */}
      {!unreachable && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => requestAuth('logIn')}
            className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 cursor-pointer px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.auth.logIn)}
          </button>
          <button
            type="button"
            onClick={() => requestAuth('signUp')}
            className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.auth.signUp)}
          </button>
        </div>
      )}
    </div>
  );
}
