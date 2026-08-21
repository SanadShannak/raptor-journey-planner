import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useLocale } from '../i18n';
import { paths } from './routes';

/**
 * Primary navigation.
 *
 * One `<nav>` for both layouts: a horizontal bar from `md` up, and a
 * disclosure panel below it. A disclosure, not a dialog — the panel sits in
 * normal document flow and pushes content down rather than overlaying it,
 * which is what lets it avoid owing a focus trap, `aria-modal`, an inert
 * background, and restore-on-close. It owes only Escape and close-on-navigate,
 * both of which are a few lines here.
 */
export function PrimaryNav() {
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
    { to: paths.plan, label: t(strings.nav.plan) },
    { to: paths.routes, label: t(strings.nav.routes) },
    { to: paths.stops, label: t(strings.nav.stops) },
    { to: paths.card, label: t(strings.nav.card) },
  ];

  /* `NavLink` sets aria-current="page" itself; do not hand-roll it. */
  const linkClass =
    'rounded-control text-on-chrome focus-visible:outline-on-chrome block px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-on-chrome aria-[current=page]:text-chrome';

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
      >
        {/* Hamburger and close share a box so the header does not reflow. */}
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

      <nav aria-label={t(strings.nav.primaryLabel)} className="contents">
        <ul className="hidden gap-1 md:flex">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <ul
          id={panelId}
          hidden={!open}
          className="bg-chrome border-chrome-border absolute inset-x-0 top-full z-10 flex flex-col gap-1 border-t p-3 md:hidden"
        >
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
