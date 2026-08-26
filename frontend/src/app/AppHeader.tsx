import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, LanguageToggle } from '../i18n';
import { ThemeToggle } from '../theme';
import { AuthDialog, type AuthMode } from './AuthDialog';
import { PrimaryNav } from './PrimaryNav';
import { paths } from './routes';
import { useBackendHealth } from './useBackendHealth';

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
  const { service, retry } = useBackendHealth();

  return (
    <header className="bg-chrome text-on-chrome relative">
      {/*
        Full width, with gutters that grow with the viewport rather than a
        capped column — the bar is chrome, and chrome that stops short of the
        window edge reads as a panel sitting on the page instead of framing it.

        Three columns from `md` up, the outer two sharing the leftover space
        equally: that centres the navigation in the window itself rather than
        merely between its neighbours, which would drift as the brand and the
        account controls change width across languages.

        Below `md` it falls back to a row, because the middle cell collapses to
        a single toggle button and centring one button is not a layout.
      */}
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          to={paths.home}
          className="rounded-control focus-visible:outline-on-chrome text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.app.title)}
        </Link>

        <PrimaryNav onAuth={setAuthMode} />

        {/* `ms-auto` handles the row layout and `justify-self-end` the grid
            one. Both are logical, so the group sits at the trailing edge —
            the left one in Arabic — without a second set of rules. */}
        <div className="ms-auto flex items-center gap-2 md:justify-self-end">
          <ThemeToggle />
          <LanguageToggle />

          {/* A hairline between settings and account, so the bar reads as two
              groups rather than four unrelated controls. Below `md` the auth
              controls live in the navigation panel instead — the bar
              — the bar has no room, and hiding them outright would strand
              anyone on a phone with no way to reach an account. */}
          <span
            aria-hidden="true"
            className="bg-chrome-border mx-1 hidden h-5 w-px md:block"
          />

          <button
            type="button"
            onClick={() => setAuthMode('logIn')}
            className="rounded-control text-on-chrome focus-visible:outline-on-chrome hidden h-9 cursor-pointer items-center px-3 text-sm font-medium leading-none focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex"
          >
            {t(strings.auth.logIn)}
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('signUp')}
            className="rounded-control bg-on-chrome text-chrome focus-visible:outline-on-chrome hidden h-9 cursor-pointer items-center px-3 text-sm font-semibold leading-none focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex"
          >
            {t(strings.auth.signUp)}
          </button>
        </div>
      </div>

      {/*
        The routing service being down is stated once, here, rather than on
        whichever page happens to need it that day — a visitor browsing stops
        or a card balance never touches it, but the planner does, and finding
        out only by opening that one page meant the other three looked fine
        for a service that was not.

        On `surface` rather than `chrome`: `border-danger`/`text-danger` is
        verified against `surface` and `surface-raised` only, and a strip in
        the brand colour would need its own pairing invented for no reason
        when the page's own ground already has one that works.
      */}
      {service === 'down' && (
        <div
          role="alert"
          className="bg-surface border-danger text-danger flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-4 py-2 text-sm"
        >
          <span className="font-medium">{t(strings.status.backendUnreachable)}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.planner.retryConnection)}
          </button>
        </div>
      )}

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
