import { Notice } from '../components/StatusPanel';
import { useLocale } from '../i18n';
import type { Message } from '../i18n/dictionary';
import { requestAuth } from './authPrompt';
import { useSession } from './useSession';

/**
 * What a page that works for guests says to one, above the part an account
 * would change.
 *
 * Not a gate. `AccountGate` stands in for content nobody but an account holder
 * can have; this sits beside content a guest is already using — favourites
 * kept in the browser, the place where a wallet would be — and says what an
 * account would add, with both ways to get one unless `actions` is off (the
 * favourites page, where the header's own buttons are enough). An `info`
 * notice rather than a panel,
 * because nothing has gone wrong and nothing is being withheld.
 *
 * Says nothing while the session is still being checked, or when the account
 * service cannot be reached — offering a sign-in that would fail the same way
 * is worse than offering none — and nothing to somebody signed in.
 */
export function GuestNotice({
  message,
  actions = true,
}: {
  message: Message;
  /** Whether to offer the sign-up and log-in buttons under the message. */
  actions?: boolean | undefined;
}) {
  const { strings, t } = useLocale();
  const { signedIn, checking, unreachable } = useSession();

  if (signedIn || checking || unreachable) return null;

  return (
    <Notice tone="info">
      <p className="text-content">{t(message)}</p>
      {actions && (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => requestAuth('signUp')}
          className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 cursor-pointer px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.auth.signUp)}
        </button>
        <button
          type="button"
          onClick={() => requestAuth('logIn')}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.auth.logIn)}
        </button>
      </div>
      )}
    </Notice>
  );
}
