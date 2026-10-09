import { type ReactNode } from 'react';
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
 * Stands in for a page that cannot work without an account, and offers the way in.
 *
 * **The ask is this panel, and the dialog opens only when it is pressed.** This
 * used to raise the sign-in modal the instant the session came back empty.
 * That was wrong in three ways at once, and they compounded: it took keyboard
 * focus out of a page the reader had only just opened, it covered the heading
 * and the explanation that said *why* an account was wanted — so the answer
 * arrived before the question — and because a native `<dialog>` has no entry
 * of its own, it did all of that between one frame and the next. Asking for
 * the wallet and being handed an unexplained password field reads as a wall,
 * not as a door.
 *
 * So the invitation is part of the page now. It says what the page is for,
 * offers both ways in, and mentions that nothing else in the app needs an
 * account — which is true, and is the difference between a gate and a dead
 * end. The dialog is still the one place credentials are typed; pressing a
 * button here is what opens it, and arriving by a press is what lets it
 * animate in from the control that was pressed rather than simply being there.
 *
 * Still not a redirect. The page keeps its own heading and explanation above
 * this, so somebody who signs in is still on the page they asked for and the
 * back button goes where they came from.
 *
 * Three states, not two. `checking` is its own: treating "the session has not
 * been confirmed yet" as "signed out" would show this to every returning
 * visitor for as long as `/api/auth/me` takes to answer, which is the single
 * most noticeable way a gate like this goes wrong. And a session that could
 * not be *checked* is kept apart from one that is absent, because offering a
 * sign-in form against a backend that is not answering sends somebody to a
 * form that will fail the same way.
 */
export function AccountGate({ reason, children }: Props) {
  const { strings, t } = useLocale();
  const { signedIn, checking, unreachable } = useSession();

  if (signedIn) return <>{children}</>;

  /*
   * A live region on the sentence, because it is the answer to a check the
   * page made on the reader's behalf and it resolves after the first paint.
   * On the paragraph rather than the box, so the controls beside it are not
   * announced with it and re-announced whenever anything here changes.
   *
   * Deliberately the same shape and ground as the panel it becomes, so the
   * answer arriving changes the words inside a box that was already there
   * rather than replacing one box with a different one.
   */
  if (checking) {
    return (
      <div className="rounded-card border-border bg-surface-raised motion-safe:animate-fade-in flex flex-col items-center gap-4 border px-6 py-10 text-center">
        <span
          className="border-brand-500 size-8 rounded-full border-2 border-e-transparent border-b-transparent border-s-transparent motion-safe:animate-spin"
          aria-hidden="true"
        />
        <p role="status" className="text-content-muted max-w-prose text-sm">
          {t(strings.account.checking)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border-border bg-surface-raised shadow-card motion-safe:animate-settle-in flex flex-col items-center gap-4 border px-6 py-10 text-center">
      {/*
        An account glyph rather than a padlock. Both would be understood, and
        only one of them is about the reader: a lock says the page is shut,
        while this says the page belongs to somebody. The wording underneath is
        doing the explaining either way, so the picture's whole job is tone.
      */}
      <span
        className="bg-brand-50 text-brand-700 flex size-14 flex-none items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8.5" r="3.75" />
          <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
        </svg>
      </span>

      <p role="status" className="text-content max-w-prose text-base">
        {t(unreachable ? strings.account.unreachable : reason)}
      </p>

      {/*
        Both ways in, side by side. The old panel offered only "Log in" because
        the dialog was already open behind it with its own switch between the
        two forms — so a second control here would have been a third route to
        the same place. Nothing is open now, and somebody who has never had an
        account should not have to find the switch inside a login form to
        discover they can make one.

        Offered only when signing in could actually work: against an
        unreachable backend the dialog fails the same way, so the panel says
        what happened and stops there.
      */}
      {!unreachable && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => requestAuth('logIn')}
              className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 cursor-pointer px-5 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.auth.logIn)}
            </button>
            <button
              type="button"
              onClick={() => requestAuth('signUp')}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-5 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.auth.signUp)}
            </button>
          </div>

          {/*
            What is *not* behind the account, which is most of the app. A gate
            with nothing else to say reads as the price of entry; this is the
            one line that makes it a choice.
          */}
          <p className="text-content-muted max-w-prose text-sm">
            {t(strings.account.restNeedsNoAccount)}
          </p>
        </>
      )}
    </div>
  );
}
