import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocale } from '../../i18n';
import { useReducedMotion } from '../../map/useReducedMotion';
import { endTour, getTourState, goToStep, subscribeToTour } from './tourStore';
import { TOURS, findTarget, isAvailable, type TourId } from './tours';

/**
 * Draws whichever tour is running. Mounted once, in the layout.
 */
export function TourHost() {
  const { active, step } = useSyncExternalStore(subscribeToTour, getTourState);
  if (active === null) return null;
  // Keyed so a replay of the same tour starts from a fresh dialog.
  return <TourDialog key={active} id={active} step={step} />;
}

/** Room left around the lit-up element, so its own border is not clipped. */
const PAD = 6;
/** Space between the lit-up element and the card. */
const GAP = 12;
/** Below this width the card sits along the bottom of the screen instead. */
const NARROW = '(max-width: 39.99rem)';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
  );
}

/**
 * One tour, one step at a time.
 *
 * A native modal `<dialog>`, like the sign-in and delete dialogs, and for the
 * same reasons: `showModal()` makes the page behind it inert, keeps focus
 * inside, and turns Escape into a `cancel` event — the three things a modal
 * owes a keyboard and a screen reader, without writing any of them by hand.
 *
 * The dialog is the whole viewport and transparent; its contents are the two
 * visible parts. The **spotlight** is a box over the element being explained,
 * whose enormous shadow is what dims everything else — so the element shows
 * through a hole rather than being lifted above a backdrop, which it could not
 * be: the modal sits in the top layer, above anything the page can stack. The
 * **card** carries the words and the controls beside it.
 *
 * Where the element is gets read every frame while the tour is open. It moves
 * — the page scrolls, a panel loads, the window turns — and listening for each
 * of those separately is more code than asking.
 */
function TourDialog({ id, step }: { id: TourId; step: number }) {
  const { strings, t } = useLocale();
  const reduced = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  const steps = TOURS[id];
  const current = steps[step];

  /*
   * The steps that can be shown now, worked out on every render rather than
   * once at the start: the page keeps loading while the tour runs, and a step
   * whose element has arrived since should not be skipped for having been
   * late.
   */
  const available = steps.flatMap((entry, index) => (isAvailable(entry) ? [index] : []));
  const position = available.indexOf(step);
  const previous = available.filter((index) => index < step).at(-1);
  const next = available.find((index) => index > step);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  /*
   * A step that cannot be shown moves on by itself. Forward, to the next one
   * that can; and when there is none, the tour has simply run out.
   */
  const unavailable = current === undefined || !isAvailable(current);
  useEffect(() => {
    if (!unavailable) return;
    if (next === undefined) endTour();
    else goToStep(next);
  }, [unavailable, next]);

  /* Brings the element into view, and the step's heading into focus. */
  useEffect(() => {
    if (current === undefined) return;
    const target = current.target === null ? null : findTarget(current.target);
    if (target !== null) {
      const narrow = window.matchMedia(NARROW).matches;
      target.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        // On a phone the card covers the bottom of the screen, so the element
        // goes to the top rather than to the middle where the card would be.
        block: narrow ? 'start' : 'center',
        inline: 'nearest',
      });
    }
    /*
     * Each step's heading takes focus, so a screen reader reads the step out
     * and a keyboard is already beside the buttons. `preventScroll`, because
     * the card is fixed and the scroll above is the one that matters.
     */
    /*
     * A frame later, because `showModal()` runs its own focusing on the way
     * open and would otherwise have the last word on the first step.
     */
    const frame = window.requestAnimationFrame(() =>
      headingRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [current, reduced]);

  const [spot, setSpot] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const [narrow, setNarrow] = useState(false);
  /**
   * On a phone the card sits along the bottom — unless that is where the
   * element is. Something near the end of a page cannot be scrolled up to the
   * top, so the card moves to the top of the screen instead of covering it.
   */
  const [atTop, setAtTop] = useState(false);

  useLayoutEffect(() => {
    let frame = 0;

    const measure = () => {
      const isNarrow = window.matchMedia(NARROW).matches;
      setNarrow((was) => (was === isNarrow ? was : isNarrow));

      const target =
        current?.target == null ? null : findTarget(current.target);
      const rect = target?.getBoundingClientRect() ?? null;
      const nextSpot: Box | null =
        rect === null
          ? null
          : {
              top: Math.round(rect.top - PAD),
              left: Math.round(rect.left - PAD),
              width: Math.round(rect.width + PAD * 2),
              height: Math.round(rect.height + PAD * 2),
            };
      setSpot((was) => (sameBox(was, nextSpot) ? was : nextSpot));

      const cardBox = cardRef.current?.getBoundingClientRect();
      if (cardBox !== undefined && isNarrow) {
        const covered =
          nextSpot !== null &&
          nextSpot.top + nextSpot.height > window.innerHeight - cardBox.height - GAP &&
          nextSpot.top > cardBox.height + GAP;
        setAtTop((was) => (was === covered ? was : covered));
      }
      if (cardBox !== undefined && !isNarrow) {
        const nextCard = placeCard(nextSpot, cardBox.width, cardBox.height);
        setCard((was) =>
          was !== null && was.top === nextCard.top && was.left === nextCard.left
            ? was
            : nextCard,
        );
      }

      frame = window.requestAnimationFrame(measure);
    };

    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [current]);

  if (current === undefined || unavailable) {
    // Moving on; see the effect above. Nothing worth a frame in between.
    return <dialog ref={dialogRef} aria-hidden="true" className="hidden" />;
  }

  const last = next === undefined;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(event) => {
        // Escape. Handled here rather than left to the browser, so the store
        // hears about it and remembers the tour as seen.
        event.preventDefault();
        endTour();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-visible bg-transparent p-0 backdrop:bg-transparent"
    >
      {/*
        The hole in the dimming. With nothing to point at — the welcome step —
        it collapses to a point in the middle of the screen, which leaves the
        whole page dimmed and lets the next step's spotlight open out from
        there.
      */}
      <div
        aria-hidden="true"
        className="rounded-card shadow-spotlight pointer-events-none fixed motion-safe:transition-[top,left,width,height] motion-safe:duration-300 motion-safe:ease-out"
        style={
          spot === null
            ? { top: '50%', left: '50%', width: 0, height: 0 }
            : { top: spot.top, left: spot.left, width: spot.width, height: spot.height }
        }
      />

      <div
        ref={cardRef}
        className={`bg-surface-raised text-content rounded-card border-border shadow-lifted fixed flex flex-col gap-2 border p-4 motion-safe:animate-dialog-in ${
          narrow
            ? `inset-x-3 ${atTop ? 'top-3' : 'bottom-3'}`
            : 'w-[min(22rem,calc(100vw-1.5rem))] motion-safe:transition-[top,left] motion-safe:duration-300 motion-safe:ease-out'
        }`}
        style={
          narrow
            ? undefined
            : card === null
              ? { visibility: 'hidden', top: 0, left: 0 }
              : { top: card.top, left: card.left }
        }
      >
        <p className="text-content-muted text-xs font-medium tabular-nums">
          {t(strings.tour.stepOf, {
            current: position + 1,
            total: available.length,
          })}
        </p>
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="rounded-control focus-visible:outline-brand-500 text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(current.title(strings))}
        </h2>
        <p className="text-sm text-pretty">{t(current.body(strings))}</p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {/* Absent on the last step, where "Done" says the same thing. */}
          {last ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={endTour}
              className="rounded-control text-content-muted hover:text-content focus-visible:outline-brand-500 cursor-pointer px-1 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.tour.skip)}
            </button>
          )}

          <div className="flex items-center gap-2">
            {previous !== undefined && (
              <button
                type="button"
                onClick={() => goToStep(previous)}
                className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t(strings.tour.back)}
              </button>
            )}
            <button
              type="button"
              onClick={() => (next === undefined ? endTour() : goToStep(next))}
              className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 cursor-pointer px-4 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(last ? strings.tour.done : strings.tour.next)}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Where the card goes beside the lit-up element, on a screen wide enough to
 * have a beside.
 *
 * Below it if it fits, above it if that fits instead, and otherwise over the
 * bottom of the element — a tall map has no room on either side, and covering
 * its lower edge is better than pushing the card off the screen. Centred on
 * the element across, and kept inside the window either way.
 *
 * Physical coordinates, not logical: these come from `getBoundingClientRect`,
 * which measures from the left in both directions, so there is nothing here
 * for a right-to-left page to flip.
 */
function placeCard(spot: Box | null, width: number, height: number): { top: number; left: number } {
  const margin = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const clampLeft = (left: number) =>
    Math.min(Math.max(left, margin), viewportWidth - width - margin);

  if (spot === null) {
    return {
      top: Math.round((viewportHeight - height) / 2),
      left: Math.round(clampLeft((viewportWidth - width) / 2)),
    };
  }

  const left = Math.round(clampLeft(spot.left + spot.width / 2 - width / 2));
  const below = spot.top + spot.height + GAP;
  const above = spot.top - GAP - height;

  if (below + height <= viewportHeight - margin) return { top: Math.round(below), left };
  if (above >= margin) return { top: Math.round(above), left };
  return { top: Math.round(viewportHeight - height - margin), left };
}
