import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { verifyEmail } from '../api/auth';
import { requestAuth, useSession } from '../auth';
import { StatusPanel, Notice, PRIMARY_ACTION } from '../components/StatusPanel';
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
 * so there is nothing to press — and then offers to log in. It does not sign
 * anybody in itself: the server never turns a confirmation link into a
 * session, so that a link somebody else sees is never a way into the account.
 */
export default function VerifyEmailPage() {
  const { strings, t } = useLocale();
  const { signedIn } = useSession();
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

  /*
    A spent link opened by somebody already signed in — usually the second
    click on the same email. Signed in means confirmed, so it is the same
    success as a link that has just worked.
  */
  const confirmed = state.kind === 'verified' || (state.kind === 'failed' && signedIn);

  return (
    <StatusPanel
      tone={
        state.kind === 'verifying'
          ? 'pending'
          : confirmed
            ? 'success'
            : 'danger'
      }
      title={t(
        state.kind === 'verifying'
          ? strings.verification.verifyTitle
          : confirmed
            ? strings.verification.verifiedTitle
            : state.kind === 'missing'
              ? strings.verification.missingTitle
              : strings.verification.linkExpiredTitle,
      )}
    >
      <div role="status" className="flex w-full flex-col items-center gap-3">
        {state.kind === 'verifying' && (
          <p className="text-content-muted">{t(strings.verification.verifying)}</p>
        )}

        {/*
          Confirmed, and what comes next depends on whether this browser is
          signed in. Somebody who confirmed and then logged in — on this page,
          from the button below — is told they are all set, not to log in.
        */}
        {confirmed && (
          <p className="text-content-muted motion-safe:animate-content-in">
            {t(
              signedIn
                ? strings.verification.verifiedSignedInHint
                : strings.verification.verifiedHint,
            )}
          </p>
        )}

        {state.kind === 'failed' && !signedIn && (
          <Notice tone="danger">
            <p className="font-medium">{t(messageForApiError(state.error, strings))}</p>
            <p className="text-content-muted">{t(strings.verification.invalidVerifyHint)}</p>
          </Notice>
        )}

        {state.kind === 'missing' && (
          <Notice tone="danger">
            <p>{t(strings.verification.missingToken)}</p>
          </Notice>
        )}
      </div>

      {/*
        The next step. Signed out, that is logging in — which is also where a
        new link is offered if this one failed. Signed in, it is the planner.
      */}
      {state.kind !== 'verifying' && !signedIn && (
        <button type="button" onClick={() => requestAuth('logIn')} className={PRIMARY_ACTION}>
          {t(strings.verification.logIn)}
        </button>
      )}

      {state.kind !== 'verifying' && signedIn && (
        <Link to={paths.home} className={PRIMARY_ACTION}>
          {t(strings.verification.goHome)}
        </Link>
      )}
    </StatusPanel>
  );
}
