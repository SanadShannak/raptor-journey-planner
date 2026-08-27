import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/**
 * Moves focus to the main region when the page changes.
 *
 * A client-side navigation replaces the content but moves no focus and
 * announces nothing, so a screen-reader user hears silence and stays on the
 * link they just left, and a keyboard user carries on tabbing from wherever
 * they were in the old page.
 *
 * Focus is used rather than a live-region announcer because it does three
 * things the announcer cannot: it reads the new content, it resets the tab
 * position to the top of the page, and it serves sighted keyboard users too.
 * Frameworks ship announcers because they cannot guarantee a heading on every
 * page — here every page has exactly one `<h1>`, so the focus move is enough.
 * Doing both is the usual cause of a page being announced twice.
 *
 * `aria-live` stays reserved for async results within a page.
 *
 * It also puts the scroll back to the top, which is a separate question from
 * focus and answered separately below — a page can change subject without
 * changing path, and focus should not be yanked every time it does.
 */
export function useRouteFocus(target: RefObject<HTMLElement | null>): void {
  const { pathname, hash, search } = useLocation();
  const previousPathname = useRef<string | null>(null);
  const previousSubject = useRef<string | null>(null);

  useEffect(() => {
    // Not on first paint: focus belongs at the document start on arrival, and
    // moving it would skip the skip link.
    if (previousPathname.current === null) {
      previousPathname.current = pathname;
      return;
    }

    /*
     * Only a real page change. Search params change constantly — the planner
     * submitting, a search box typing — and pulling focus out of the control
     * someone is using is a worse bug than not moving it at all.
     */
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    // A fragment target is the visitor's own intent; let the browser honour it.
    if (hash) return;

    target.current?.focus({ preventScroll: true });

    /*
     * `auto`, not `smooth`. The reduced-motion block in index.css overrides
     * the CSS `scroll-behavior` property but has no effect on a behaviour
     * passed here in JavaScript.
     */
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash, target]);

  /*
   * The scroll goes back to the top for a new *subject*, which is not always a
   * new path.
   *
   * A line's page keeps its path when the direction is flipped: only
   * `?variant=` changes. But the stop list underneath is a different list of
   * different stops, and staying two thousand pixels down it lands the reader
   * in the middle of something they have not seen the start of — the same
   * complaint a new page would earn, arriving by a route the pathname check
   * above cannot see.
   *
   * **`trip` is deliberately not part of this.** Following a run scrolls the
   * page to wherever the vehicle is, on purpose, and resetting first would
   * fight the one scroll on this page that is meant to happen.
   */
  useEffect(() => {
    const subject = `${pathname}?${new URLSearchParams(search).get('variant') ?? ''}`;

    if (previousSubject.current === null) {
      previousSubject.current = subject;
      return;
    }
    if (previousSubject.current === subject) return;
    previousSubject.current = subject;

    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search, hash]);
}
