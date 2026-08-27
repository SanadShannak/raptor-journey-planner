import { useRef } from 'react';
import { Outlet, matchPath, useLocation } from 'react-router';
import { useLocale } from '../i18n';
import { AppHeader } from './AppHeader';
import { paths } from './routes';
import { useTrackNavigationDepth } from './useBackStack';
import { useStartHealthCheck } from './useBackendHealth';
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
  const { pathname } = useLocation();

  useRouteFocus(mainRef);

  /*
   * Some pages are a sidebar and a map, sized to the viewport so the map never
   * leaves the screen. A footer under one of those either steals height from
   * the map or hangs below the fold as a strip you have to scroll a full-height
   * layout to reach — and on a page whose own content scrolls inside its panes,
   * a page-level footer is a thing you find by accident.
   *
   * Matched against the *home* path for the planner, because that is where it
   * lives: `/plan` only redirects to it, so a page that never renders was the
   * one being tested. The stops and lines pages are matched by pattern, so an
   * index and a single subject are both covered without listing them twice.
   */
  /*
   * Counted here because every page passes through this layout, so no page has
   * to remember to. It is what lets a back control know whether there is an
   * entry of ours behind the current one.
   */
  useTrackNavigationDepth();

  /*
   * Started here for the same reason: the probe belongs to the app, not to
   * whichever page happens to render first, and the header right below reads
   * its answer regardless of which page that was.
   */
  useStartHealthCheck();

  const fullHeight =
    pathname === paths.home ||
    matchPath(paths.stops, pathname) !== null ||
    matchPath(paths.stopDetail, pathname) !== null ||
    matchPath(paths.routes, pathname) !== null ||
    matchPath(paths.routeDetail, pathname) !== null;

  /*
   * Two pages want the footer gone without wanting the fixed, viewport-locked
   * layout above. Favourites is laid out to be taken in at a glance — three
   * rows of cards that fit a laptop screen — and seventy pixels of footer under
   * it was the difference between fitting and not. The travel card is a short
   * form and its answer; a footer there was only ever padding.
   *
   * Kept separate from `fullHeight` on purpose: these pages still sit in normal
   * document flow, so a short window or a long list still scrolls rather than
   * being clipped by `overflow-hidden`.
   */
  const footerlessPage =
    pathname === paths.favourites || matchPath(paths.card, pathname) !== null;

  const showFooter = !fullHeight && !footerlessPage;

  return (
    <div
      /*
        Where the footer goes, so does the page's own scrollbar: the planner
        fills the viewport exactly and its panes scroll inside themselves, so
        anything that scrolls the *document* there is a few pixels of nothing
        under a layout that was supposed to end at the fold. Only from `lg`,
        where the two-pane layout applies — on a phone the planner stacks and
        the page has to scroll.
      */
      className={
        showFooter
          ? 'min-h-viewport flex flex-col'
          : 'min-h-viewport flex flex-col lg:fixed lg:inset-0 lg:overflow-hidden'
      }
    >
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
      {/*
        `lg:min-h-0` is the load-bearing half of this. A flex child refuses to
        shrink below its content by default, so without it the pane below can
        never be shorter than the itinerary inside it — which is exactly how a
        sidebar ends up taller than the screen with its own scrollbar never
        appearing, and the page scrolling instead.

        The shell above is pinned with `fixed inset-0` rather than sized to
        `100dvh`, because a height only *describes* the viewport: one
        descendant that refuses to shrink still pushes the document taller and
        the page grows a scrollbar. Out of flow, the document has nothing left
        to be pushed by, so the sidebar's own scrollbar is the only one that
        can appear.
      */}
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 focus:outline-none lg:flex lg:min-h-0 lg:flex-col"
      >
        <Outlet />
      </main>

      {showFooter && (
        <footer className="border-border text-content-muted border-t">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm">
            {t(strings.pages.home.title)}
          </div>
        </footer>
      )}
    </div>
  );
}
