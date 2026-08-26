import { useEffect, useState } from 'react';
import {
  centringScrollTop,
  documentOffsetTop,
  offsetWithin,
  scrollingAncestor,
} from './centreInPanel';

/** The keys that scroll a list, and therefore say the reader is driving. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/**
 * Keeps a followed vehicle in view, until the reader would rather it did not.
 *
 * Only while one run is being followed. With five vehicles on a line there is
 * no "the" vehicle to hold on screen, and a list that scrolled itself to one of
 * them would be taking a decision nobody asked it to.
 *
 * **It gives up the moment the reader scrolls.** Reading ahead down the line is
 * the obvious thing to do while following a run, and a list that hauls itself
 * back every ten seconds is unusable — worse than one that never moved.
 *
 * **And it is re-armed by a new subject, not by a return to nothing.** The
 * first version reset "the reader took over" only on the transition *out* of
 * following — so tracking one vehicle, scrolling away, and going straight to a
 * different one without ever landing on "no run" in between inherited the
 * earlier surrender and never scrolled at all. That gap is reachable: this
 * panel does not remount just because the trip being followed changes, so
 * `trackedTripId` is compared directly rather than inferred from an
 * active/inactive flip. A trip id changing to any other value — including back
 * to the same one after letting go — is what "a new subject" means here.
 *
 * Intent is read from `wheel`, `touchstart` and the keys that scroll, rather
 * than from scroll position. Position cannot tell our own smooth scroll from a
 * person's, and every attempt to do so with a flag is a race with the animation
 * it is trying to ignore.
 */
export function useFollowInView(
  trackedTripId: string | null,
): (node: HTMLElement | null) => void {
  /*
   * The node in state rather than in a ref. A ref read during render is a value
   * React has not been told about, so the effect below would keep whichever
   * node it first saw — and the whole point is that this one moves from row to
   * row as the vehicle advances.
   */
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [surrendered, setSurrendered] = useState(false);

  /*
   * A new trip is a new subject, however it was reached — a different vehicle,
   * the same one re-picked after letting go, or nothing at all changing about
   * *this* component while the id it was given moves on regardless. Adjusted
   * during render rather than in an effect: an effect would paint one frame
   * still surrendered and then re-render to correct it, and the correction is
   * not a synchronisation with anything — it is what the value *is* for the
   * new subject.
   */
  const [lastTripId, setLastTripId] = useState(trackedTripId);
  if (trackedTripId !== lastTripId) {
    setLastTripId(trackedTripId);
    setSurrendered(false);
  }

  const active = trackedTripId !== null;

  useEffect(() => {
    if (!active) return;

    const takeOver = () => setSurrendered(true);
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) takeOver();
    };

    window.addEventListener('wheel', takeOver, { passive: true });
    window.addEventListener('touchstart', takeOver, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', takeOver);
      window.removeEventListener('touchstart', takeOver);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  useEffect(() => {
    if (!active || surrendered || node === null) return;

    /*
     * The panel, where there is one. `scrollIntoView` would take the document
     * with it too, and on the wide layout that means sliding the whole
     * `fixed inset-0` shell down with no scrollbar to undo it — see
     * `centreInPanel`. So the wide layout scrolls only the panel it finds.
     *
     * Below the breakpoint the sidebar is not its own scrolling column — the
     * page itself is — so there is no panel to find, and centring falls back
     * to the window. It is still the reader's own gesture that gives this up,
     * the same wheel/touch/key listeners above, so a phone under someone's
     * thumb is asked to move once per run rather than fought over.
     */
    const box = scrollingAncestor(node);
    const height = node.getBoundingClientRect().height;

    if (box !== null) {
      box.scrollTo({
        /*
         * Centred rather than merely brought into view. The least a browser
         * can get away with is the badge just past the edge of the panel,
         * with none of the line ahead of it — and the stops either side are
         * the whole reason for following a run.
         *
         * An absolute target in the panel's own coordinates, so issuing it
         * while an earlier smooth scroll is still running retargets that
         * scroll instead of adding to wherever it had got to.
         */
        top: centringScrollTop(offsetWithin(node, box), height, box.clientHeight),
        behavior: 'smooth',
      });
      return;
    }

    window.scrollTo({
      // Same centring, in document coordinates instead of a panel's own.
      top: centringScrollTop(documentOffsetTop(node), height, window.innerHeight),
      behavior: 'smooth',
    });
  }, [active, surrendered, node]);

  return setNode;
}
