import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocale } from '../i18n';

export type AuthMode = 'logIn' | 'signUp';

interface Props {
  /** Which form to show. The header mounts this keyed on the mode, so
   * switching between them starts from empty fields rather than carrying the
   * other form's values and errors across. */
  mode: AuthMode;
  onChangeMode: (mode: AuthMode) => void;
  onClose: () => void;
}

/**
 * Sign-in and registration, in a native `<dialog>`.
 *
 * `showModal()` gives focus trapping, Escape handling, and an inert background
 * without a focus-trap dependency. `<dialog>` sits exactly on the browser
 * baseline (Safari 15.4).
 *
 * A dialog rather than a page because signing in is never required here:
 * whatever the visitor was doing stays behind it and is still there when they
 * close it. Nothing on the site is gated.
 *
 * The form is real — labelled inputs, autocomplete, validation, error text
 * tied to its field — so the eventual backend work is replacing one submit
 * handler. Only the submit is inert, and it says so plainly rather than
 * pretending to sign anyone in.
 */
export function AuthDialog({ mode, onChangeMode, onClose }: Props) {
  const { strings, t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const titleId = useId();
  const noticeId = useId();

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

  function validate(form: HTMLFormElement): Record<string, string> {
    const data = new FormData(form);
    const found: Record<string, string> = {};

    if (isSignUp && String(data.get('name') ?? '').trim() === '') {
      found['name'] = t(strings.auth.nameRequired);
    }

    const email = String(data.get('email') ?? '').trim();
    if (email === '') found['email'] = t(strings.auth.emailRequired);
    // Deliberately loose: the only authority on an address is delivery to it.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      found['email'] = t(strings.auth.emailInvalid);
    }

    const password = String(data.get('password') ?? '');
    if (password === '') found['password'] = t(strings.auth.passwordRequired);
    else if (isSignUp && password.length < 8) {
      found['password'] = t(strings.auth.passwordTooShort);
    }

    return found;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(event.currentTarget);
    setErrors(found);
    setSubmitted(Object.keys(found).length === 0);
  }

  const field = (
    name: 'name' | 'email' | 'password',
    type: string,
    autoComplete: string,
  ) => {
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
      className="rounded-card bg-surface text-content shadow-card border-border m-auto w-[min(28rem,calc(100vw-2rem))] border p-0 backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-6">
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

        {isSignUp && field('name', 'text', 'name')}
        {field('email', 'email', 'email')}
        {field(
          'password',
          'password',
          isSignUp ? 'new-password' : 'current-password',
        )}

        {/*
          Announced rather than silently appearing, because it is the answer to
          an action the visitor just took.
        */}
        <p aria-live="polite" id={noticeId} className="text-content-muted text-sm">
          {submitted ? t(strings.auth.unavailable) : ''}
        </p>

        <button
          type="submit"
          className="rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(isSignUp ? strings.auth.submitSignUp : strings.auth.submitLogIn)}
        </button>

        <button
          type="button"
          onClick={() => onChangeMode(isSignUp ? 'logIn' : 'signUp')}
          className="rounded-control text-brand-500 focus-visible:outline-brand-500 cursor-pointer text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(isSignUp ? strings.auth.switchToLogIn : strings.auth.switchToSignUp)}
        </button>
      </form>
    </dialog>
  );
}
