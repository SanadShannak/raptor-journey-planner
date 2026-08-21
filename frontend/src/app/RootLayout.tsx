import { useRef } from 'react';
import { Outlet } from 'react-router';
import { useLocale } from '../i18n';
import { AppHeader } from './AppHeader';
import { useRouteFocus } from './useRouteFocus';

/**
 * Wraps every page: skip link, header, `<main>`, footer.
 *
 * Renders no heading of its own. Each page owns exactly one `<h1>` as the
 * first thing inside `<main>`, which is what makes the focus move on
 * navigation announce something useful.
 */
export function RootLayout() {
  const { strings, t } = useLocale();
  const mainRef = useRef<HTMLElement>(null);

  useRouteFocus(mainRef);

  return (
    <div className="min-h-viewport flex flex-col">
      {/*
        First focusable element in the document. Hidden until focused, then
        visible — an invisible skip link is worse than none, because it traps
        the first Tab press on something nobody can see.
      */}
      <a
        href="#main-content"
        className="sr-only focus:rounded-control focus:bg-surface focus:text-content focus:outline-brand-500 focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:px-4 focus:py-2 focus:not-sr-only focus:outline-2 focus:outline-offset-2"
      >
        {t(strings.nav.skipToContent)}
      </a>

      <AppHeader />

      {/*
        `tabIndex={-1}` is load-bearing twice over: without it the skip link
        silently does nothing in several browsers, and the focus move on
        navigation has nowhere to land.
      */}
      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="border-border text-content-muted border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm">
          {t(strings.pages.home.title)}
        </div>
      </footer>
    </div>
  );
}
