import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getNetwork } from "../api/network";
import { formatClockTime, useLocale, LanguageToggle } from "../i18n";
import { useNetworkNow } from "../features/stops/useNetworkNow";
import { ThemeToggle } from "../theme";
import { AuthDialog, type AuthMode } from "./AuthDialog";
import { PrimaryNav } from "./PrimaryNav";
import { paths } from "./routes";
import { useBackendHealth } from "./useBackendHealth";

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
  const { locale, strings, t } = useLocale();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const { service, retry } = useBackendHealth();

  /*
   * The clock in the bar, and the only reason the header asks the API anything.
   *
   * Fetched here rather than handed down because the bar outlives every page:
   * a page that owned the answer would drop it on the way to the next one, and
   * the clock would blink out between navigations.
   */
  const [timezone, setTimezone] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const now = useNetworkNow(timezone);

  useEffect(() => {
    const controller = new AbortController();

    void getNetwork({ signal: controller.signal })
      .then((info) => {
        if (controller.signal.aborted) return;
        setTimezone(info.timezone);
        setNetwork(info.agencyName ?? info.network);
      })
      .catch(() => {
        /* No clock rather than a wrong one. The bar is otherwise unaffected. */
      });

    return () => controller.abort();
  }, []);

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
        {/*
          Brand and clock as one cell, not two.
          
          The bar is a three-column grid from `md` up so that the navigation is
          centred in the window; a fourth child would be a fourth column the
          template has no track for, and would wrap onto a second row. They
          belong together anyway — see the clock below.
        */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={paths.home}
            className="rounded-control focus-visible:outline-on-chrome flex items-center gap-2 text-base font-semibold tracking-tight whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {/*
            The same mark the favicon carries — a journey, two stops and the
            route between them — so the tab and the bar are recognisably one
            thing. Orange on the wine bar is the operator's own pairing, and is
            contrast-checked as `accent` on `chrome` rather than against the
            page behind it.
          */}
            <svg
              viewBox="0 0 48 48"
              width="22"
              height="22"
              fill="none"
              aria-hidden="true"
              className="text-accent flex-none"
            >
              <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
                <path
                  d="M15 17.5v6.2a4 4 0 0 0 4 4h10a4 4 0 0 1 4 4v2.8"
                  strokeDasharray="0.1 6.8"
                />
                <circle cx="15" cy="13" r="4.6" />
                <circle cx="33" cy="35" r="4.6" />
              </g>
            </svg>
            {t(strings.app.title)}
          </Link>

          {/*
          The network's clock, beside the brand rather than out at the trailing
          edge among the controls.

          It is not a control and it is the one thing on the bar nothing is
          pressed to reach, so it sat oddly in a run of buttons — and being
          text with no border of its own, it needed spacing invented to hold it
          apart from them. Next to the name of the place it is telling the time
          *of*, it needs none of that: the two read as one statement of where
          you are and when.

          The time is the **network's**, not the device's. Every departure in
          this app is network-local, so a bar showing the visitor's own
          afternoon would be the one clock on screen that disagrees with all
          the others.

          `tabular-nums` so the bar does not twitch as the digits change, and no
          live region: a clock that announced itself every minute would
          interrupt whatever a screen-reader user was actually reading.

          A separator, and a hairline before it, so the pairing reads as
          deliberate rather than as the title having run on.
        */}
          {now !== null && network !== null && (
            <>
              <span aria-hidden="true" className="bg-chrome-border h-5 w-px" />
              <p className="text-sm font-medium tabular-nums whitespace-nowrap">
                <span className="sr-only">
                  {t(strings.status.clockLabel, { network })}
                </span>
                <span aria-hidden="true">
                  {formatClockTime(now.time, locale)}
                </span>
              </p>
            </>
          )}
        </div>

        <PrimaryNav onAuth={setAuthMode} />

        {/* `ms-auto` handles the row layout and `justify-self-end` the grid
            one. Both are logical, so the group sits at the trailing edge —
            the left one in Arabic — without a second set of rules. */}
        <div className="ms-auto flex items-center gap-2 md:justify-self-end">
          {/*
            Settings live here from `md` up; below it they move into the
            navigation panel, which is the only place with room for them on a
            phone. Hiding rather than removing them from the tree keeps the
            component the same either way — only their address changes.
          */}
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <LanguageToggle />
          </div>

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
            onClick={() => setAuthMode("logIn")}
            className="rounded-control text-on-chrome focus-visible:outline-on-chrome hidden h-9 cursor-pointer items-center px-3 text-sm font-medium leading-none focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex"
          >
            {t(strings.auth.logIn)}
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("signUp")}
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
      {service === "down" && (
        <div
          role="alert"
          className="bg-surface border-danger text-danger flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-4 py-2 text-sm"
        >
          <span className="font-medium">
            {t(strings.status.backendUnreachable)}
          </span>
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
