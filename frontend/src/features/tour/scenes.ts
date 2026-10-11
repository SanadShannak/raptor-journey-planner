import type { NavigateFunction } from 'react-router';
import { TOUR_PICK_CLOSE, TOUR_PICK_OPEN } from './events';

/**
 * Things the tour does to the page so a step can show what a press does,
 * rather than only describe it.
 *
 * Each scene acts and hands back the way to undo itself. The tour enters a
 * scene when a step that names it is reached, keeps it for as long as the
 * following steps name the same one, and undoes it when a step without it is
 * reached, the tour ends, or somebody steps back past it — so the visitor is
 * always returned to the page they started the tour from.
 *
 * Presses are real presses: a scene clicks the same element a person would,
 * so what the tour shows is exactly what pressing it does, and there is no
 * second code path to drift from the first. A press that navigates is undone
 * by going back one entry, which also leaves the in-app back stack as it was.
 */
export type SceneId = 'map-pick' | 'open-first-route' | 'open-first-stop' | 'open-add-card';

interface SceneContext {
  navigate: NavigateFunction;
}

type Undo = () => void;

const nothing: Undo = () => {};

export const SCENES: Record<SceneId, (context: SceneContext) => Undo> = {
  'map-pick': () => {
    window.dispatchEvent(new Event(TOUR_PICK_OPEN));
    return () => window.dispatchEvent(new Event(TOUR_PICK_CLOSE));
  },

  'open-first-route': ({ navigate }) =>
    pressToOpen(navigate, '[data-tour="routes-list"] li button'),

  'open-first-stop': ({ navigate }) =>
    pressToOpen(navigate, '[data-tour="stops-list"] li button'),

  /* A disclosure: open it if it is shut, and shut it again only if we opened it. */
  'open-add-card': () => {
    const toggle = document.querySelector<HTMLElement>(
      '[data-tour="card-add"] button[aria-expanded]',
    );
    if (toggle === null || toggle.getAttribute('aria-expanded') !== 'false') return nothing;
    toggle.click();
    return () => {
      if (toggle.isConnected && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
    };
  },
};

/**
 * Presses the first row of a list that opens somewhere, and undoes it by
 * going back — with the list's scroll position put back too, since the list
 * is drawn afresh when it is returned to.
 *
 * Does nothing when the list is not there: already looking at a route, say,
 * there is nothing to open and nothing to undo.
 */
function pressToOpen(navigate: NavigateFunction, selector: string): Undo {
  const row = document.querySelector<HTMLElement>(selector);
  if (row === null) return nothing;

  const before = window.location.href;
  const saved = captureScroll();
  row.click();

  return () => {
    // Only if the press actually went somewhere.
    if (window.location.href === before) return;
    void navigate(-1);
    restoreScroll(saved);
  };
}

/** Where the page and its scrolling side pane were. */
export interface ScrollSnapshot {
  /** The page it was taken on, so it is only ever put back on that page. */
  href: string;
  window: number;
  pane: number;
}

export function captureScroll(): ScrollSnapshot {
  return {
    href: window.location.href,
    window: window.scrollY,
    pane: document.querySelector<HTMLElement>('[data-pane]')?.scrollTop ?? 0,
  };
}

/**
 * Puts the scroll back, once there is something to scroll.
 *
 * A page returned to redraws, and its list may still be loading: setting a
 * scroll position on a pane shorter than it would be clamped and lost. So
 * this tries on every frame for a couple of seconds until the pane is tall
 * enough to hold the position, and then stops.
 */
export function restoreScroll(saved: ScrollSnapshot, then?: () => void): void {
  const until = performance.now() + 2500;

  const attempt = () => {
    // Going back is not instant: until the address is the one the snapshot
    // was taken on, the pane in the document is the page being left.
    if (window.location.href !== saved.href) {
      if (performance.now() < until) window.requestAnimationFrame(attempt);
      return;
    }
    const pane = document.querySelector<HTMLElement>('[data-pane]');
    const paneReady = saved.pane === 0 || (pane !== null && pane.scrollHeight - pane.clientHeight >= saved.pane);
    const pageReady =
      saved.window === 0 ||
      document.documentElement.scrollHeight - window.innerHeight >= saved.window;

    if (paneReady && pageReady) {
      if (pane !== null) pane.scrollTop = saved.pane;
      window.scrollTo({ top: saved.window, behavior: 'auto' });
      // After the page has finished arriving: going back renders the page and
      // then moves focus to its heading, and that has to happen first or it
      // would take focus straight back from whatever this hands it to.
      if (then !== undefined) window.setTimeout(then, 150);
      return;
    }
    if (performance.now() < until) window.requestAnimationFrame(attempt);
    else then?.();
  };

  window.requestAnimationFrame(attempt);
}
