import { useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import {
  canGoBack,
  getDepth,
  popped,
  pushed,
  subscribeToDepth,
} from './navigationDepth';

/**
 * Keeps the count of in-app history entries current.
 *
 * Mounted once, in the layout every page shares, so nothing else has to
 * remember to do it.
 *
 * Keyed on `location.key` rather than on the path: a key is unique per history
 * entry, so the effect fires exactly once per navigation — including a
 * navigation from a page to itself, which a path would miss — and never on an
 * ordinary re-render, which is what a bare `navigationType` dependency would
 * have counted twice.
 */
export function useTrackNavigationDepth(): void {
  const location = useLocation();
  const kind = useNavigationType();

  useEffect(() => {
    if (kind === 'PUSH') pushed();
    else if (kind === 'POP') popped();
    // A replace swaps the top entry for another; the stack is no deeper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
}

/**
 * A back control that walks the stack.
 *
 * Steps back one entry whenever there is one of ours behind — however many
 * levels deep somebody has gone, and whatever the pages were — so pressing back
 * repeatedly unwinds the way they came rather than jumping to a section index
 * every time.
 *
 * `fallback` is where it goes when there is nothing behind: a link opened
 * cold, or the first page of the session. That is the only case a page has to
 * decide for itself, because it is the only one where "back" has no answer and
 * a sensible root has to be named instead.
 */
export function useGoBack(fallback: string): { go: () => void; stepping: boolean } {
  const navigate = useNavigate();
  /*
   * Subscribed rather than read, because the label is chosen during render and
   * the count moves in an effect one render later — read plainly, every control
   * would word itself for the page it has just left.
   */
  const stepping = useSyncExternalStore(subscribeToDepth, getDepth) > 0;

  return {
    stepping,
    go: () => {
      if (canGoBack()) void navigate(-1);
      else void navigate(fallback);
    },
  };
}
