import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { LanguageToggle, useLocale } from '../i18n';
import { ThemeToggle } from '../theme';
import { paths } from './routes';

interface Props {
  /**
   * Opens the auth dialog. The panel is the only place these controls exist on
   * a narrow screen, where the bar has no room to spell them out.
   */
  onAuth: (mode: 'logIn' | 'signUp') => void;
}

/**
 * Primary navigation.
 *
 * One `<nav>` for both layouts: a horizontal bar from `md` up, and a
 * disclosure panel below it. A disclosure, not a dialog — the panel sits in
 * normal document flow and pushes content down rather than overlaying it,
 * which is what lets it avoid owing a focus trap, `aria-modal`, an inert
 * background, and restore-on-close. It owes only Escape and close-on-navigate,
 * both of which are a few lines here.
 *
 * Rendered as a single element so the header can place it as one grid cell and
 * centre it between the brand and the account controls.
 */
export function PrimaryNav({ onAuth }: Props) {
  const { strings, t } = useLocale();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  /*
   * A navigation has happened, so the panel has served its purpose. Adjusted
   * during render rather than in an effect: an effect would paint the new page
   * with the panel still open and then re-render to close it. This also covers
   * navigations the panel did not cause, such as the back button.
   */
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Return focus to what opened it, or it lands back at the document top.
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const links = [
    { to: paths.home, label: t(strings.nav.plan) },
    { to: paths.routes, label: t(strings.nav.routes) },
    { to: paths.stops, label: t(strings.nav.stops) },
    { to: paths.card, label: t(strings.nav.card) },
    { to: paths.favourites, label: t(strings.nav.favourites) },
  ];

  /* `NavLink` sets aria-current="page" itself; do not hand-roll it. */
  const linkClass =
    'rounded-control text-on-chrome focus-visible:outline-on-chrome block px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-on-chrome aria-[current=page]:text-chrome';

  return (
    /*
     * `order-last` puts the toggle at the trailing edge of the bar on a phone
     * — past the clock, past everything else — rather than beside the brand
     * where it used to sit. `md:order-none` gives it back at the width where
     * the bar switches to a grid and this element stops being a flex item
     * that ordering would otherwise still apply to.
     */
    <nav
      aria-label={t(strings.nav.primaryLabel)}
      /*
       * `me-1` is optical, not arithmetic. The bar's gutter already puts this
       * the same 16px from the edge that the brand sits at, but the brand is
       * plain text and this is a bordered box — a border runs right up to the
       * inset where a glyph's own side bearing leaves air, so equal numbers
       * read as unequal. Four more pixels make the two look alike, which is
       * the thing actually being matched.
       *
       * Dropped at `md`, where this becomes the centred cell of a grid and a
       * trailing margin would push it off centre.
       */
      className="order-last me-1 md:order-none md:me-0"
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex h-9 cursor-pointer items-center gap-2 border px-3 text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
      >
        {/* Both icons occupy the same box so the header does not reflow. */}
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" />
          )}
        </svg>
        {open ? t(strings.nav.closeMenu) : t(strings.nav.openMenu)}
      </button>

      <ul className="hidden gap-1 md:flex">
        {links.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div
        id={panelId}
        hidden={!open}
        className="bg-chrome border-chrome-border absolute inset-x-0 top-full z-10 flex flex-col gap-1 border-t p-3 md:hidden"
      >
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <span aria-hidden="true" className="bg-chrome-border my-1 h-px w-full" />

        {/*
          Theme and language live in the bar from `md` up; below it this panel
          is their only address, since the bar itself has no room left once the
          clock, the toggle, and the account controls are all fighting for the
          same row.
        */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>

        <span aria-hidden="true" className="bg-chrome-border my-1 h-px w-full" />

        <button
          type="button"
          onClick={() => onAuth('logIn')}
          className={`${linkClass} cursor-pointer text-start`}
        >
          {t(strings.auth.logIn)}
        </button>
        <button
          type="button"
          onClick={() => onAuth('signUp')}
          className={`${linkClass} cursor-pointer text-start`}
        >
          {t(strings.auth.signUp)}
        </button>
      </div>
    </nav>
  );
}
