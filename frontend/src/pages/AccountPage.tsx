import { useId, useState, type FormEvent } from 'react';
import {
  INCORRECT_PASSWORD,
  changePassword,
  requestPasswordReset,
  resendVerification,
} from '../api/auth';
import { isApiError } from '../api/errors';
import { AccountGate, useSession } from '../auth';
import { PendingLabel, Spinner } from '../components/Pending';
import { PageContainer } from '../components/PageContainer';
import { pendingButtonClass } from '../components/pendingButtonClass';
import { messageForApiError, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';

/** The server's own minimum, restated so the form can say so first. */
const PASSWORD_MINIMUM = 8;

/**
 * The signed-in account: who it is, whether its address is confirmed, and
 * its password.
 *
 * Everything an account can change about itself lives here rather than in
 * the sign-in dialog, which is for getting in. Two ways to a new password sit
 * side by side, because they answer different situations: changing it while
 * the current one is known, and having a reset link emailed when it is not —
 * the same link "forgot password" sends, offered without signing out first.
 */
export default function AccountPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.accountPage.title));

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">{t(strings.accountPage.title)}</h1>
      <AccountGate reason={strings.accountPage.needsAccount}>
        <div className="flex max-w-xl flex-col gap-6">
          <Details />
          <ChangePassword />
        </div>
      </AccountGate>
    </PageContainer>
  );
}

const SECTION =
  'rounded-card border-border bg-surface-raised flex flex-col gap-4 border p-5 motion-safe:animate-content-in';

function Details() {
  const { locale, strings, t } = useLocale();
  const { account } = useSession();
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | string>('idle');

  if (account === null) return null;

  async function sendAgain() {
    setResend('sending');
    try {
      await resendVerification(locale);
      setResend('sent');
    } catch (error: unknown) {
      setResend(t(messageForApiError(error, strings)));
    }
  }

  return (
    <section aria-labelledby="account-details" className={SECTION}>
      <h2 id="account-details" className="text-lg font-semibold">
        {t(strings.accountPage.details)}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-content-muted">{t(strings.accountPage.name)}</dt>
        <dd className="[unicode-bidi:plaintext] ltr:text-left rtl:text-right">{account.name}</dd>
        <dt className="text-content-muted">{t(strings.accountPage.email)}</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* An address reads the same way round in every language. */}
          <span dir="ltr">{account.email}</span>
          {/* Said in words as well as colour, so it reads in greyscale. */}
          <span
            className={`rounded-control border px-1.5 py-0.5 text-xs font-medium ${
              account.emailVerified ? 'border-success text-success' : 'border-border-strong text-content-muted'
            }`}
          >
            {t(account.emailVerified ? strings.accountPage.verified : strings.accountPage.notVerified)}
          </span>
        </dd>
      </dl>

      {!account.emailVerified && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {resend !== 'sent' && (
            <button
              type="button"
              onClick={() => void sendAgain()}
              disabled={resend === 'sending'}
              aria-busy={resend === 'sending' || undefined}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 inline-flex cursor-pointer items-center gap-2 border px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"
            >
              {resend === 'sending' && <Spinner />}
              {t(resend === 'sending' ? strings.verification.bannerSending : strings.verification.bannerResend)}
            </button>
          )}
          <p role="status" className="text-content-muted empty:hidden">
            {resend === 'sent'
              ? t(strings.verification.bannerSent)
              : resend === 'idle' || resend === 'sending'
                ? ''
                : resend}
          </p>
        </div>
      )}
    </section>
  );
}

type Field = 'currentPassword' | 'newPassword';

function ChangePassword() {
  const { locale, strings, t } = useLocale();
  const { account } = useSession();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [reset, setReset] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const formId = useId();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');

    const found: Partial<Record<Field, string>> = {};
    if (currentPassword === '') found.currentPassword = t(strings.auth.passwordRequired);
    if (newPassword.length < PASSWORD_MINIMUM) {
      found.newPassword = t(newPassword === '' ? strings.auth.passwordRequired : strings.auth.passwordTooShort);
    }
    setErrors(found);
    setFailure(null);
    setDone(false);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await changePassword(currentPassword, newPassword);
      form.reset();
      setDone(true);
    } catch (error: unknown) {
      if (isApiError(error) && error.code === INCORRECT_PASSWORD) {
        setErrors({ currentPassword: t(strings.accountPage.wrongCurrent) });
      } else if (isApiError(error) && error.fieldErrors['newPassword'] !== undefined) {
        setErrors({ newPassword: t(strings.auth.passwordTooShort) });
      } else {
        setFailure(t(messageForApiError(error, strings)));
      }
    } finally {
      setPending(false);
    }
  }

  async function emailResetLink() {
    if (account === null) return;
    setReset('sending');
    try {
      await requestPasswordReset(account.email, locale);
      setReset('sent');
    } catch (error: unknown) {
      setReset(t(messageForApiError(error, strings)));
    }
  }

  const field = (name: Field, label: string, autoComplete: string) => {
    const id = `${formId}-${name}`;
    const message = errors[name];
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          name={name}
          type="password"
          autoComplete={autoComplete}
          aria-invalid={message !== undefined}
          aria-describedby={message === undefined ? undefined : `${id}-error`}
          className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        {message !== undefined && (
          <p id={`${id}-error`} className="text-danger text-sm">
            {message}
          </p>
        )}
      </div>
    );
  };

  return (
    <section aria-labelledby="account-password" className={SECTION}>
      <h2 id="account-password" className="text-lg font-semibold">
        {t(strings.accountPage.changePassword)}
      </h2>

      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        {/* For password managers: which account these passwords belong to. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={account?.email ?? ''}
          readOnly
          hidden
        />
        {field('currentPassword', t(strings.accountPage.currentPassword), 'current-password')}
        {field('newPassword', t(strings.accountPage.newPassword), 'new-password')}

        <div aria-live="polite">
          {done && <p className="text-sm font-medium">{t(strings.accountPage.changed)}</p>}
          {failure !== null && (
            <p className="rounded-card border-danger text-danger border px-3 py-2 text-sm">{failure}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={`rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer self-start px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${pendingButtonClass(pending)}`}
        >
          <PendingLabel pending={pending}>
            {t(pending ? strings.auth.submitting : strings.accountPage.submitChange)}
          </PendingLabel>
        </button>
      </form>

      {/* The way in for somebody who does not know the current password. */}
      <div className="border-border flex flex-col gap-2 border-t pt-4 text-sm">
        <p className="text-content-muted">{t(strings.accountPage.forgotPrompt)}</p>
        {reset !== 'sent' && (
          <button
            type="button"
            onClick={() => void emailResetLink()}
            disabled={reset === 'sending'}
            aria-busy={reset === 'sending' || undefined}
            className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 inline-flex cursor-pointer items-center gap-2 self-start border px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"
          >
            {reset === 'sending' && <Spinner />}
            {t(strings.accountPage.sendResetLink)}
          </button>
        )}
        <p role="status" className="empty:hidden">
          {reset === 'sent' && account !== null
            ? t(strings.accountPage.resetSent, { email: account.email })
            : reset === 'idle' || reset === 'sending'
              ? ''
              : reset}
        </p>
      </div>
    </section>
  );
}
