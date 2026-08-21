import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, LanguageSwitcher } from '../i18n';
import { ThemeSwitcher } from '../theme';
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
 * `relative` because the mobile navigation panel positions itself against this
 * element rather than the viewport.
 */
export function AppHeader() {
  const { strings, t } = useLocale();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  const authButtonClass =
    'rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome cursor-pointer border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <header className="bg-chrome text-on-chrome relative">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <Link
          to={paths.home}
          className="rounded-control focus-visible:outline-on-chrome me-auto text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.pages.home.title)}
        </Link>

        <PrimaryNav />

        <div className="flex flex-wrap items-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <button
            type="button"
            className={authButtonClass}
            onClick={() => setAuthMode('logIn')}
          >
            {t(strings.auth.logIn)}
          </button>
          <button
            type="button"
            className={authButtonClass}
            onClick={() => setAuthMode('signUp')}
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
