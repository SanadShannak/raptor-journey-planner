import { useEffect, useRef, type ReactNode } from 'react';
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
   * neither. The gate owns the shape; the page owns the sentence.
   */
  reason: Message;
  /** Shown once the server has confirmed an account. */
  children: ReactNode;
}

/**
 * Asks for an account, in the dialog, for a page that cannot work without one.
 *
 * **The ask is the modal.** Arriving at the wallet or the saved list without a
 * session opens the sign-in dialog over the page rather than replacing the
 * page's content with a panel about signing in — it is the one place in the
 * app that collects credentials, so a second, flatter version of it on two
 * pages was both a duplicate and easy to walk past.
 *
 * Still not a redirect. The page keeps its heading and its explanation behind
 * the dialog, so somebody who signs in is still on the page they asked for and
 * the back button goes where they came from. What is behind the dialog is kept
 * to a single line and the way to reopen it: the dialog can be dismissed, and
 * a blank page under it would leave nothing to press.
 *
 * Three states, not two. `checking` is its own: treating "the session has not
 * been confirmed yet" as "signed out" would open the dialog in the face of
 * every returning visitor for as long as `/api/auth/me` takes to answer, which
 * is the single most noticeable way a gate like this goes wrong. And a session
 * that could not be *checked* is kept apart from one that is absent, because
 * offering a sign-in form against a backend that is not answering sends
 * somebody to a form that will fail the same way.
 */
export function AccountGate({ reason, children }: Props) {
  const { strings, t } = useLocale();
  const { signedIn, checking, unreachable } = useSession();

  /**
   * Whether this visit has already raised the dialog.
   *
   * Opened **once**, not whenever signed-out is true. The dialog can be
   * dismissed — somebody may want to read the page's own explanation, or have
   * arrived by accident — and reopening it on the next render would be a
   * dialog that cannot be closed. Pressing the button below is how it comes
   * back.
   */
  const asked = useRef(false);

  useEffect(() => {
    if (signedIn || checking || unreachable) return;
    if (asked.current) return;
    asked.current = true;
    requestAuth('logIn');
  }, [signedIn, checking, unreachable]);

  if (signedIn) return <>{children}</>;

  /*
   * A live region on the sentence, because it is the answer to a check the
   * page made on the reader's behalf and it resolves after the first paint.
   * On the paragraph rather than the box, so the button beside it is not
   * announced with it and re-announced whenever anything here changes.
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
    <div className="rounded-card border-border bg-surface-raised flex flex-wrap items-center gap-x-4 gap-y-3 border px-4 py-4">
      <p role="status" className="text-content max-w-prose flex-1 text-sm">
        {t(unreachable ? strings.account.unreachable : reason)}
      </p>

      {/*
        One control, not two. The dialog is already open on arrival and offers
        both forms with a switch between them, so a second "Sign up" here would
        be a third route to the same place. Offered only when signing in could
        actually work: against an unreachable backend the dialog fails the same
        way, so the panel says what happened and stops there.
      */}
      {!unreachable && (
        <button
          type="button"
          onClick={() => requestAuth('logIn')}
          className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 flex-none cursor-pointer px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.auth.logIn)}
        </button>
      )}
    </div>
  );
}
