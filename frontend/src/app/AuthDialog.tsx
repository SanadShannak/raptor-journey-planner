import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { PendingLabel } from '../components/Pending';
import { pendingButtonClass } from '../components/pendingButtonClass';
import { isApiError } from '../api/errors';
import {
  EMAIL_NOT_VERIFIED,
  INVALID_SUBMISSION,
  requestPasswordReset,
  resendVerification,
} from '../api/auth';
import { Spinner } from '../components/Pending';
import { useSession } from '../auth';
import { messageForApiError, useLocale } from '../i18n';
import type { AuthMode } from '../auth/authPrompt';

interface Props {
  /** Which form to show. The header mounts this keyed on the mode, so
   * switching between them starts from empty fields rather than carrying the
   * other form's values and errors across. */
  mode: AuthMode;
  onChangeMode: (mode: AuthMode) => void;
  onClose: () => void;
}

/** What the server calls each field, so its complaints can be placed. */
const FIELDS = ['name', 'email', 'password'] as const;
type Field = (typeof FIELDS)[number];

/** The server's own minimum, restated so the form can say so first. */
const PASSWORD_MINIMUM = 8;

/**
 * Sign-in and registration, in a native `<dialog>`.
 *
 * `showModal()` gives focus trapping, Escape handling, and an inert background
 * without a focus-trap dependency. `<dialog>` sits exactly on the browser
 * baseline (Safari 15.4).
 *
 * A dialog rather than a page because signing in is never a *gate* here: the
 * planner, the stops, the lines and the timetables all work without an
 * account, so whatever the visitor was doing stays behind this and is still
 * there when they close it. Two pages do need an account now — the wallet and
 * the saved list — and they say so where their content would be rather than
 * sending anybody here; see `AccountGate`. Either way this dialog opens over
 * the page somebody is on, which is why it leaves no history entry.
 *
 * **It is only ever opened by a press.** Nothing raises it on arrival. A modal
 * that appears by itself takes keyboard focus out of the page the moment it
 * loads, which is both an interruption and a way to lose your place; one that
 * appears because a button was pressed is the expected consequence of pressing
 * it, and that is also what makes the entry animation worth having — it points
 * back at the control it came from.
 *
 * Validation happens twice on purpose, and the two are not redundant. The
 * checks here answer instantly and keep an obviously incomplete form from
 * costing a round trip. The server's are the authority — it owns the password
 * length, the name's character set, and the only real test of an email
 * address, which is whether anything is delivered to it — and its per-field
 * complaints are placed on the fields it names. What is never shown is its
 * *wording*: `fieldErrors` is read for which field, and the message comes from
 * the dictionary.
 */
export function AuthDialog({ mode, onChangeMode, onClose }: Props) {
  const { locale, strings, t } = useLocale();
  const { logIn, register } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /**
   * The address a reset link was asked for, once it has been. The form is
   * then replaced by the same sentence whatever the server found — it never
   * says whether the address has an account.
   */
  const [sentTo, setSentTo] = useState<string | null>(null);
  /**
   * An address waiting to be confirmed: the one just signed up with, or the
   * one a log-in was refused for because it has not been confirmed yet.
   * Either way the dialog offers to send its link again.
   */
  const [awaiting, setAwaiting] = useState<{ email: string; justSignedUp: boolean } | null>(null);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const titleId = useId();

  /*
   * The one thing here that is genuine external synchronisation: a <dialog>
   * only becomes modal — trapping focus, inerting the background — when
   * showModal() is called on the element.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const isSignUp = mode === 'signUp';
  const isForgot = mode === 'forgot';

  function validate(data: FormData): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};

    if (isSignUp && String(data.get('name') ?? '').trim() === '') {
      found.name = t(strings.auth.nameRequired);
    }

    const email = String(data.get('email') ?? '').trim();
    if (email === '') found.email = t(strings.auth.emailRequired);
    // Deliberately loose: the only authority on an address is delivery to it.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      found.email = t(strings.auth.emailInvalid);
    }

    // The forgot-password form asks only for the address.
    if (isForgot) return found;

    const password = String(data.get('password') ?? '');
    if (password === '') found.password = t(strings.auth.passwordRequired);
    /*
     * Checked on both forms, not only on sign-up. The server's login validator
     * applies the same eight-character minimum, so a shorter password sent to
     * it comes back as a field complaint rather than as "those do not match" —
     * and a reader told their *correct* short password is invalid would have no
     * way to make sense of that. Saying it here keeps the two consistent.
     */
    else if (password.length < PASSWORD_MINIMUM) {
      found.password = t(strings.auth.passwordTooShort);
    }

    return found;
  }

  /**
   * Places the server's per-field complaints on this form's fields.
   *
   * Only the field *names* are used. The messages are the server's own English
   * and are never shown, so each one becomes this dictionary's message for
   * that field — which means the form says the same thing whether the
   * complaint came from here or from there.
   */
  function applyFieldErrors(fieldErrors: Readonly<Record<string, string>>): boolean {
    const found: Partial<Record<Field, string>> = {};

    for (const field of FIELDS) {
      if (fieldErrors[field] === undefined) continue;
      found[field] =
        field === 'name'
          ? t(strings.auth.nameInvalid)
          : field === 'email'
            ? t(strings.auth.emailInvalid)
            : t(strings.auth.passwordTooShort);
    }

    setErrors(found);
    return Object.keys(found).length > 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const data = new FormData(event.currentTarget);
    const found = validate(data);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;

    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    setPending(true);
    try {
      if (isForgot) {
        await requestPasswordReset(email, locale);
        setSentTo(email);
        return;
      }
      if (isSignUp) {
        /*
         * Signing up does not sign in: the account waits for its emailed
         * link. The form gives way to saying so, and the dialog stays open.
         */
        const pending = await register({
          name: String(data.get('name') ?? '').trim(),
          email,
          password,
          locale,
        });
        setAwaiting({ email: pending.email, justSignedUp: true });
        return;
      }
      await logIn({ email, password });
      /*
       * Closed on success and nothing else happens. The session store has
       * already recorded the account, every surface that cares is subscribed
       * to it, and the page behind the dialog is the one the visitor was on —
       * so there is nowhere to navigate and nothing to reload.
       */
      onClose();
    } catch (error: unknown) {
      /*
       * A field-level rejection is placed on its field; anything else is a
       * statement about the attempt as a whole and goes above the button,
       * where the eye is already looking after a press.
       */
      const placed =
        isApiError(error) && error.code === INVALID_SUBMISSION
          ? applyFieldErrors(error.fieldErrors)
          : false;

      if (!placed) setFailure(t(messageForApiError(error, strings)));
      // The password was right; only the confirmation is missing.
      if (isApiError(error) && error.code === EMAIL_NOT_VERIFIED) {
        setAwaiting({ email, justSignedUp: false });
        setResend('idle');
      }
    } finally {
      setPending(false);
    }
  }

  async function sendLinkAgain() {
    if (awaiting === null) return;
    setResend('sending');
    try {
      await resendVerification(awaiting.email, locale);
      setResend('sent');
    } catch (error: unknown) {
      setResend(t(messageForApiError(error, strings)));
    }
  }

  /** "Send a new link", and what happened to the last press. */
  const resendControl = (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {resend !== 'sent' && (
        <button
          type="button"
          onClick={() => void sendLinkAgain()}
          disabled={resend === 'sending'}
          aria-busy={resend === 'sending' || undefined}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 inline-flex cursor-pointer items-center gap-2 border px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"
        >
          {resend === 'sending' && <Spinner />}
          {t(resend === 'sending' ? strings.verification.resending : strings.verification.resend)}
        </button>
      )}
      <p role="status" className="text-content-muted empty:hidden">
        {resend === 'sent'
          ? t(strings.verification.resent)
          : resend === 'idle' || resend === 'sending'
            ? ''
            : resend}
      </p>
    </div>
  );

  const field = (name: Field, type: string, autoComplete: string) => {
    const errorId = `${name}-error`;
    const message = errors[name];
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={name} className="text-sm font-medium">
          {t(strings.auth[name])}
        </label>
        <input
          id={name}
          name={name}
          type={type}
          autoComplete={autoComplete}
          aria-invalid={message !== undefined}
          aria-describedby={message === undefined ? undefined : errorId}
          className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        {message !== undefined && (
          <p id={errorId} className="text-danger text-sm">
            {message}
          </p>
        )}
      </div>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      /*
       * `motion-safe:` on both halves, matching every other animation here. The
       * global reduced-motion rule already collapses the duration, and the
       * variant means the rule has nothing to collapse rather than something to
       * shorten.
       */
      className="rounded-card bg-surface text-content shadow-lifted border-border m-auto w-[min(28rem,calc(100vw-2rem))] border p-0 backdrop:bg-black/50 motion-safe:animate-dialog-in motion-safe:backdrop:animate-backdrop-in"
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="flex flex-col gap-4 p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold">
            {t(strings.auth[mode])}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control text-content-muted hover:text-content focus-visible:outline-brand-500 -m-1 cursor-pointer p-1 focus-visible:outline-2"
          >
            <span className="sr-only">{t(strings.auth.close)}</span>
            <svg
              viewBox="0 0 20 20"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {awaiting?.justSignedUp === true ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm leading-relaxed">
              {t(strings.auth.checkEmail, { email: awaiting.email })}
            </p>
            {resendControl}
          </div>
        ) : sentTo !== null ? (
          /*
            The answer to "forgot password", and the whole of it. A status so a
            screen reader hears it, since it replaces the form that had focus.
          */
          <p role="status" className="text-sm leading-relaxed">
            {t(strings.auth.forgotSent, { email: sentTo })}
          </p>
        ) : (
          <>
            {isForgot && (
              <p className="text-content-muted text-sm">{t(strings.auth.forgotIntro)}</p>
            )}
            {isSignUp && field('name', 'text', 'name')}
            {field('email', 'email', 'email')}
            {!isForgot &&
              field('password', 'password', isSignUp ? 'new-password' : 'current-password')}
            {/*
              Under the password field, where somebody who cannot remember it
              is already looking — and only on the log-in form.
            */}
            {mode === 'logIn' && (
              <button
                type="button"
                onClick={() => onChangeMode('forgot')}
                className="rounded-control text-brand-500 focus-visible:outline-brand-500 -mt-2 cursor-pointer self-start text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t(strings.auth.forgotLink)}
              </button>
            )}
          </>
        )}

        {/*
          Why the attempt did not work — a wrong password, an email already
          registered, a backend that is not answering. An `alert` because it is
          the answer to a press and it replaces the outcome somebody expected,
          and it sits directly above the button so it is where the eye already
          is.
        */}
        <div aria-live="assertive">
          {failure !== null && (
            <p className="rounded-card border-danger text-danger border px-3 py-2 text-sm">
              {failure}
            </p>
          )}
          {failure !== null && awaiting?.justSignedUp === false && (
            <div className="mt-3">{resendControl}</div>
          )}
        </div>

        {sentTo === null && awaiting?.justSignedUp !== true && (
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={`rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${pendingButtonClass(pending)}`}
        >
          <PendingLabel pending={pending}>
            {t(
              pending
                ? strings.auth.submitting
                : isForgot
                  ? strings.auth.submitForgot
                  : isSignUp
                    ? strings.auth.submitSignUp
                    : strings.auth.submitLogIn,
            )}
          </PendingLabel>
        </button>
        )}

        <button
          type="button"
          onClick={() => onChangeMode(mode === 'logIn' ? 'signUp' : 'logIn')}
          className="rounded-control text-brand-500 focus-visible:outline-brand-500 cursor-pointer text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(
            isForgot
              ? strings.auth.backToLogIn
              : isSignUp
                ? strings.auth.switchToLogIn
                : strings.auth.switchToSignUp,
          )}
        </button>
      </form>
    </dialog>
  );
}
