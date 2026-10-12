import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { INVALID_SUBMISSION, INVALID_TOKEN, checkResetLink } from '../api/auth';
import { isApiError } from '../api/errors';
import { requestAuth, resetPasswordAndSignIn } from '../auth';
import { LinkPanel, Notice, PRIMARY_ACTION } from '../components/LinkPanel';
import { PendingLabel } from '../components/Pending';
import { pendingButtonClass } from '../components/pendingButtonClass';
import { messageForApiError, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { paths } from '../app/routes';

/** The server's own minimum, restated so the form can say so first. */
const PASSWORD_MINIMUM = 8;

type State =
  /** No token in the address at all. */
  | { kind: 'missing' }
  /** Asking the server whether the link still works. */
  | { kind: 'checking' }
  /** It does: the form. */
  | { kind: 'ready' }
  /** It does not — expired, used, or never valid. */
  | { kind: 'invalid' }
  /** The check itself failed (offline, server down): the form, with a warning. */
  | { kind: 'unchecked'; message: string }
  | { kind: 'done' };

/**
 * Where the link in a password-reset email lands: one field, a new password.
 *
 * **The link is checked the moment the page opens.** A reset link lives ten
 * minutes and works once, so an old one in an inbox is common — and the page
 * used to show the form regardless, saying the link had expired only after a
 * new password had been chosen and submitted. The check does not use the link
 * up; the reset itself still decides, and a link that runs out while the form
 * is open lands in the same "no longer works" state on submit.
 *
 * If the check cannot be made at all, the form is shown anyway with a note:
 * the server will still answer on submit, and blocking somebody from resetting
 * their password because a pre-check failed would be backwards.
 *
 * The token stays in the address until it is spent, then is cleared, so it
 * neither survives in history nor gets sent along by a refresh after the
 * fact. Saving the password also signs the person in; the server ends every
 * other session at the same time.
 */
export default function ResetPasswordPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.verification.resetTitle));

  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const [state, setState] = useState<State>(() =>
    token === '' ? { kind: 'missing' } : { kind: 'checking' },
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();

  useEffect(() => {
    if (token === '') return;
    const controller = new AbortController();
    checkResetLink(token, { signal: controller.signal }).then(
      () => setState({ kind: 'ready' }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          isApiError(error) && error.code === INVALID_TOKEN
            ? { kind: 'invalid' }
            : { kind: 'unchecked', message: t(messageForApiError(error, strings)) },
        );
      },
    );
    return () => controller.abort();
    // Checked once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setFailure(null);
    if (password.length < PASSWORD_MINIMUM) {
      setFieldError(
        t(password === '' ? strings.auth.passwordRequired : strings.auth.passwordTooShort),
      );
      return;
    }
    setFieldError(null);

    setPending(true);
    try {
      await resetPasswordAndSignIn(token, password);
      setParams({}, { replace: true });
      setState({ kind: 'done' });
    } catch (error: unknown) {
      if (isApiError(error) && error.code === INVALID_SUBMISSION) {
        setFieldError(t(strings.auth.passwordTooShort));
      } else if (isApiError(error) && error.code === INVALID_TOKEN) {
        // Ran out while the form was open: the same answer as on arrival.
        setState({ kind: 'invalid' });
      } else {
        setFailure(t(messageForApiError(error, strings)));
      }
    } finally {
      setPending(false);
    }
  }

  const askAgain = (
    <button type="button" onClick={() => requestAuth('forgot')} className={PRIMARY_ACTION}>
      {t(strings.verification.requestNewLink)}
    </button>
  );

  if (state.kind === 'checking') {
    return (
      <LinkPanel tone="pending" title={t(strings.verification.resetTitle)}>
        <p role="status" className="text-content-muted">
          {t(strings.verification.checkingLink)}
        </p>
      </LinkPanel>
    );
  }

  if (state.kind === 'done') {
    return (
      <LinkPanel tone="success" title={t(strings.verification.resetDoneTitle)}>
        <p role="status" className="text-content-muted motion-safe:animate-content-in">
          {t(strings.verification.resetDone)}
        </p>
        <Link to={paths.home} className={PRIMARY_ACTION}>
          {t(strings.verification.goHome)}
        </Link>
      </LinkPanel>
    );
  }

  if (state.kind === 'invalid' || state.kind === 'missing') {
    return (
      <LinkPanel
        tone="danger"
        title={t(
          state.kind === 'missing'
            ? strings.verification.missingTitle
            : strings.verification.linkExpiredTitle,
        )}
      >
        <div role="alert" className="w-full">
          <Notice tone="danger">
            <p className="font-medium">
              {t(
                state.kind === 'missing'
                  ? strings.verification.missingToken
                  : strings.verification.invalidLink,
              )}
            </p>
            <p className="text-content-muted">{t(strings.verification.resetInvalidHint)}</p>
          </Notice>
        </div>
        {askAgain}
      </LinkPanel>
    );
  }

  return (
    <LinkPanel tone="info" title={t(strings.verification.resetTitle)}>
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="flex w-full flex-col gap-4 text-start"
      >
        <p className="text-content-muted text-center">{t(strings.verification.resetIntro)}</p>

        {state.kind === 'unchecked' && (
          <Notice tone="info">
            <p>{state.message}</p>
          </Notice>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-password" className="text-sm font-medium">
            {t(strings.verification.newPassword)}
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={fieldError !== null}
            aria-describedby={fieldError === null ? undefined : errorId}
            className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          {fieldError !== null && (
            <p id={errorId} className="text-danger text-sm">
              {fieldError}
            </p>
          )}
        </div>

        <div aria-live="assertive">
          {failure !== null && (
            <Notice tone="danger">
              <p>{failure}</p>
            </Notice>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={`${PRIMARY_ACTION} w-full ${pendingButtonClass(pending)}`}
        >
          <PendingLabel pending={pending}>
            {t(pending ? strings.auth.submitting : strings.verification.submitReset)}
          </PendingLabel>
        </button>
      </form>
    </LinkPanel>
  );
}
