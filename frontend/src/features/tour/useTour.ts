import { useEffect } from 'react';
import { hasSeenTour, getTourState, setTourPage, startTour } from './tourStore';
import { TOURS, findTarget, type TourId } from './tours';

/** How long a page is given to settle before its tour starts. */
const SETTLE_MS = 800;
/** How many times to look again for something to point at, before giving up. */
const ATTEMPTS = 6;

/**
 * Registers a page's tour, and starts it the first time somebody arrives.
 *
 * Called once by each page that has one. The registration is what the header's
 * replay button reads, so it can only offer a tour for the page actually on
 * screen.
 *
 * The first-visit start waits for the page to have something to point at:
 * most of these pages fill in after a fetch, and a tour that started over an
 * empty layout would skip straight past the parts it exists to explain. It
 * looks again a few times and then gives up **without** marking the tour
 * seen — a page that never finished loading has not been toured.
 *
 * It also stands aside when another dialog is already open. Somebody who
 * arrived through a link that opened the sign-in dialog is in the middle of
 * something, and a tour on top of it would be in the way.
 */
export function useTour(id: TourId): void {
  useEffect(() => {
    setTourPage(id);
    return () => setTourPage(null);
  }, [id]);

  useEffect(() => {
    if (hasSeenTour(id)) return;

    let attempts = 0;
    let timer = 0;

    const tryStart = () => {
      attempts += 1;
      if (getTourState().active !== null) return;

      const ready = TOURS[id].some(
        (step) => step.target !== null && findTarget(step.target) !== null,
      );
      const busy = document.querySelector('dialog[open]') !== null;

      if (ready && !busy) {
        startTour(id);
        return;
      }
      if (attempts < ATTEMPTS) timer = window.setTimeout(tryStart, SETTLE_MS);
    };

    timer = window.setTimeout(tryStart, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [id]);
}
