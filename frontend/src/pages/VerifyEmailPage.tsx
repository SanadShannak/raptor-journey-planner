import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { verifyEmail } from '../api/auth';
import { checkSession, useSession } from '../auth';
import { Spinner } from '../components/Pending';
import { PageContainer } from '../components/PageContainer';
import { messageForApiError, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { paths } from '../app/routes';

/**
 * Each token's one request, shared by every mount that asks.
 *
 * A token is spent by its first use, and React's development mode mounts this
 * page twice on purpose — so a request per mount would succeed and then fail,
 * and the page would announce an expired link to somebody whose address had
 * just been confirmed. Keyed by token so a *different* link still gets its
 * own request.
 */
const attempts = new Map<string, Promise<void>>();

type State =
  | { kind: 'missing' }
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'failed'; error: unknown };

/**
 * Where the link in a verification email lands.
 *
 * Confirms the address on arrival — opening the link *is* the confirmation,
 * so there is nothing to press — and works signed out, because the link is
 * as likely to be opened on the phone the email arrived on as on the computer
 * that signed up.
 */
export default function VerifyEmailPage() {
  const { strings, t } = useLocale();
  const { account, signedIn } = useSession();
  usePageTitle(t(strings.verification.verifyTitle));

  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get('token'));
  const [state, setState] = useState<State>(() =>
    token === null || token === '' ? { kind: 'missing' } : { kind: 'verifying' },
  );

  useEffect(() => {
    if (token === null || token === '') return;

    // Out of the address bar: a spent token has no business in history.
    setParams({}, { replace: true });

    let attempt = attempts.get(token);
    if (attempt === undefined) {
      attempt = verifyEmail(token);
      attempts.set(token, attempt);
    }

    let live = true;
    attempt.then(
      () => {
        /*
         * Asked again rather than assumed: the link may belong to a different
         * account from the one signed in on this device, and only the server
         * knows whose banner should go.
         */
        void checkSession();
        if (live) setState({ kind: 'verified' });
      },
      (error: unknown) => {
        if (live) setState({ kind: 'failed', error });
      },
    );
    return () => {
      live = false;
    };
    // The token is read once, on arrival; clearing it from the URL is not a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(strings.verification.verifyTitle)}
      </h1>

      <div role="status" className="flex max-w-prose flex-col gap-2">
        {state.kind === 'verifying' && (
          <p className="text-content-muted flex items-center gap-2">
            <Spinner />
            {t(strings.verification.verifying)}
          </p>
        )}

        {state.kind === 'verified' && (
          <div className="motion-safe:animate-content-in flex flex-col gap-1">
            <p className="font-medium">{t(strings.verification.verified)}</p>
            <p className="text-content-muted">{t(strings.verification.verifiedHint)}</p>
          </div>
        )}

        {/*
          A spent link opened by somebody already confirmed — the second click
          on the same email. The link failed, but there is nothing wrong.
        */}
        {state.kind === 'failed' && account?.emailVerified === true && (
          <p className="motion-safe:animate-content-in font-medium">
            {t(strings.verification.verified)}
          </p>
        )}

        {state.kind === 'failed' && account?.emailVerified !== true && (
          <div className="motion-safe:animate-content-in flex flex-col gap-1">
            <p className="text-danger font-medium">{t(messageForApiError(state.error, strings))}</p>
            <p className="text-content-muted">
              {t(
                signedIn
                  ? strings.verification.invalidVerifyHintSignedIn
                  : strings.verification.invalidVerifyHintSignedOut,
              )}
            </p>
          </div>
        )}

        {state.kind === 'missing' && (
          <p className="text-content-muted">{t(strings.verification.missingToken)}</p>
        )}
      </div>

      {state.kind !== 'verifying' && (
        <p>
          <Link
            to={paths.home}
            className="text-brand-500 focus-visible:outline-brand-500 rounded-control underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.verification.goHome)}
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
