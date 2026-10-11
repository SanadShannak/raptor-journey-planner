import { useState } from 'react';
import { resendVerification } from '../api/auth';
import { useSession } from '../auth';
import { Spinner } from '../components/Pending';
import { messageForApiError, useLocale } from '../i18n';
import { bannerDismissedFor, dismissBannerFor } from './verifyBannerMemory';

type Resend = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'failed'; message: string };

/**
 * Asks somebody signed in with an unconfirmed address to confirm it.
 *
 * A strip under the header rather than a dialog or a blocked feature: an
 * unconfirmed account can do everything, so this is a reminder, not a gate,
 * and it must not stand between anybody and the planner. It offers the one
 * thing worth offering — a fresh link, for when the first one expired or went
 * to spam — and a way to put it away for this visit.
 */
export function VerifyEmailBanner() {
  const { locale, strings, t } = useLocale();
  const { account, signedIn } = useSession();
  const [dismissed, setDismissed] = useState(bannerDismissedFor);
  const [resend, setResend] = useState<Resend>({ kind: 'idle' });

  if (!signedIn || account === null || account.emailVerified || dismissed === account.id) {
    return null;
  }

  async function sendAgain() {
    setResend({ kind: 'sending' });
    try {
      await resendVerification(locale);
      setResend({ kind: 'sent' });
    } catch (error: unknown) {
      setResend({ kind: 'failed', message: t(messageForApiError(error, strings)) });
    }
  }

  return (
    <div className="border-border bg-surface-muted border-b motion-safe:animate-fade-in">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 text-sm sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1">
          {t(strings.verification.bannerText, { email: account.email })}
        </p>

        {/* What happened to the last press, said where it was pressed. */}
        <p role="status" className="text-content-muted empty:hidden">
          {resend.kind === 'sent'
            ? t(strings.verification.bannerSent)
            : resend.kind === 'failed'
              ? resend.message
              : ''}
        </p>

        <div className="flex items-center gap-2">
          {resend.kind !== 'sent' && (
            <button
              type="button"
              onClick={() => void sendAgain()}
              disabled={resend.kind === 'sending'}
              aria-busy={resend.kind === 'sending' || undefined}
              className="rounded-control border-border-strong text-content hover:bg-surface focus-visible:outline-brand-500 inline-flex cursor-pointer items-center gap-2 border px-3 py-1 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"
            >
              {resend.kind === 'sending' && <Spinner />}
              {t(
                resend.kind === 'sending'
                  ? strings.verification.bannerSending
                  : strings.verification.bannerResend,
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              dismissBannerFor(account.id);
              setDismissed(account.id);
            }}
            className="rounded-control text-content-muted hover:text-content focus-visible:outline-brand-500 cursor-pointer p-1 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="sr-only">{t(strings.verification.bannerDismiss)}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
