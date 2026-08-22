import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, LanguageMenu } from '../i18n';
import { ThemeMenu } from '../theme';
import { AuthDialog, type AuthMode } from './AuthDialog';
import { PrimaryNav } from './PrimaryNav';
import { paths } from './routes';

/**
 * The wine app bar.
 *
 * `bg-chrome text-on-chrome` — brand where the eye lands first, while
 * itineraries and the map keep a calm neutral ground behind them. Everything
 * placed here is contrast-checked against `chrome`, not against `surface`.
 *
 * Laid out in three groups rather than one long row: identity, then
 * navigation, then account. Settings collapse into two icon menus so the bar
 * carries four controls instead of the seven it takes to spell them out, and
 * the two that people actually look for — log in and sign up — sit at the
 * trailing edge where they are conventional and easy to find.
 *
 * `relative` because the mobile navigation panel positions itself against this
 * element rather than the viewport.
 */
export function AppHeader() {
  const { strings, t } = useLocale();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  return (
    <header className="bg-chrome text-on-chrome relative">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          to={paths.home}
          className="rounded-control focus-visible:outline-on-chrome text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.app.title)}
        </Link>

        <PrimaryNav onAuth={setAuthMode} />

        {/* Pushes everything after it to the trailing edge, which flips with
            the document direction because it is a flex rule, not a float. */}
        <div className="ms-auto flex items-center gap-2">
          <ThemeMenu />
          <LanguageMenu />

          {/* A hairline between settings and account, so the bar reads as two
              groups rather than four unrelated controls. Below `md` the auth
              controls live in the navigation panel instead — the bar
              — the bar has no room, and hiding them outright would strand
              anyone on a phone with no way to reach an account. */}
          <span
            aria-hidden="true"
            className="bg-chrome-border mx-1 hidden h-6 w-px md:block"
          />

          <button
            type="button"
            onClick={() => setAuthMode('logIn')}
            className="rounded-control text-on-chrome focus-visible:outline-on-chrome hidden cursor-pointer px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 md:block"
          >
            {t(strings.auth.logIn)}
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('signUp')}
            className="rounded-control bg-on-chrome text-chrome focus-visible:outline-on-chrome hidden cursor-pointer px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 md:block"
          >
            {t(strings.auth.signUp)}
          </button>
        </div>
      </div>

      {authMode !== null && (
        <AuthDialog
          key={authMode}
          mode={authMode}
          onChangeMode={setAuthMode}
          onClose={() => setAuthMode(null)}
        />
      )}
    </header>
  );
}
