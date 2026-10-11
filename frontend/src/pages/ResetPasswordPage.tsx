import { useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { INVALID_SUBMISSION, INVALID_TOKEN } from '../api/auth';
import { isApiError } from '../api/errors';
import { requestAuth, resetPasswordAndSignIn } from '../auth';
import { PendingLabel } from '../components/Pending';
import { PageContainer } from '../components/PageContainer';
import { pendingButtonClass } from '../components/pendingButtonClass';
import { messageForApiError, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { paths } from '../app/routes';

/** The server's own minimum, restated so the form can say so first. */
const PASSWORD_MINIMUM = 8;

/**
 * Where the link in a password-reset email lands: one field, a new password.
 *
 * The token stays in the address only until it is spent — read into state on
 * arrival, then cleared on success — so it neither survives in history nor
 * gets sent along by a page refresh after the fact. Saving the password also
 * signs the person in; the server ends every other session at the same time.
 *
 * A link that no longer works says so and offers the one useful next step:
 * asking for a new one, in the same dialog the sign-in form lives in.
 */
export default function ResetPasswordPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.verification.resetTitle));

  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; badLink: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const errorId = useId();

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
      setDone(true);
    } catch (error: unknown) {
      if (isApiError(error) && error.code === INVALID_SUBMISSION) {
        setFieldError(t(strings.auth.passwordTooShort));
      } else {
        setFailure({
          message: t(messageForApiError(error, strings)),
          badLink: isApiError(error) && error.code === INVALID_TOKEN,
        });
      }
    } finally {
      setPending(false);
    }
  }

  const askAgain = (
    <button
      type="button"
      onClick={() => requestAuth('forgot')}
      className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer self-start border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {t(strings.verification.requestNewLink)}
    </button>
  );

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(strings.verification.resetTitle)}
      </h1>

      {done ? (
        <div role="status" className="motion-safe:animate-content-in flex flex-col gap-3">
          <p className="font-medium">{t(strings.verification.resetDone)}</p>
          <p>
            <Link
              to={paths.home}
              className="text-brand-500 focus-visible:outline-brand-500 rounded-control underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.verification.goHome)}
            </Link>
          </p>
        </div>
      ) : token === '' ? (
        <div className="flex max-w-prose flex-col gap-3">
          <p className="text-content-muted">{t(strings.verification.missingToken)}</p>
          {askAgain}
        </div>
      ) : (
        <form
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="flex w-full max-w-sm flex-col gap-4"
        >
          <p className="text-content-muted">{t(strings.verification.resetIntro)}</p>

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

          <div aria-live="assertive" className="flex flex-col gap-3">
            {failure !== null && (
              <>
                <p className="rounded-card border-danger text-danger border px-3 py-2 text-sm">
                  {failure.message}
                  {failure.badLink && <> {t(strings.verification.resetInvalidHint)}</>}
                </p>
                {failure.badLink && askAgain}
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className={`rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${pendingButtonClass(pending)}`}
          >
            <PendingLabel pending={pending}>
              {t(pending ? strings.auth.submitting : strings.verification.submitReset)}
            </PendingLabel>
          </button>
        </form>
      )}
    </PageContainer>
  );
}
