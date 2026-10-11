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
import { useNavigate } from 'react-router';
import { SCENES, captureScroll, restoreScroll, type SceneId } from './scenes';
import { TOURS, findTarget, type TourId } from './tours';

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
/** How long a step that has just opened something waits for it to appear. */
const SETTLE_MS = 2500;
/** How long one step's highlight takes to fade into the next. */
const FADE_MS = 220;
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
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  const steps = TOURS[id];
  const current = steps[step];

  /*
   * Steps found to have nothing to point at, which the tour has passed over.
   *
   * Found out by visiting them rather than predicted, because some steps'
   * elements only exist once an earlier step has done something — opened a
   * route, say — and judging them up front would skip exactly those. Until a
   * step is reached it is counted, so the total can only ever shrink, and
   * only by steps that genuinely had nothing to show.
   */
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  /*
   * And steps that plainly cannot appear: no element on the page now, and
   * nothing earlier in the tour that could bring one — no scene that opens
   * something. Those are left out of the count from the start, so it does not
   * shrink partway through for a step that was never going to show.
   */
  const shown = steps.flatMap((entry, index) => {
    if (skipped.has(index)) return [];
    const couldAppear =
      entry.target === null ||
      entry.scene !== undefined ||
      steps.slice(0, index).some((earlier) => earlier.scene !== undefined) ||
      findTarget(entry.target) !== null;
    // Steps already passed stay counted even once a scene has taken their
    // element off the page — they were shown.
    return couldAppear || index <= step ? [index] : [];
  });
  const position = shown.indexOf(step);
  const previous = shown.filter((index) => index < step).at(-1);
  const next = shown.find((index) => index > step);

  /** Which way the reader last moved, so a skipped step is passed in that direction. */
  const direction = useRef<1 | -1>(1);
  const go = (to: number) => {
    direction.current = to > step ? 1 : -1;
    goToStep(to);
  };

  /*
   * The scene in force, and until when a missing element is worth waiting
   * for. A scene that opened a page has started something that will draw a
   * moment later; without the wait, the step pointing at it would be judged
   * empty before it had arrived.
   */
  const scene = useRef<{ id: SceneId; undo: () => void } | null>(null);
  const settleUntil = useRef(0);

  /*
   * Opened from somewhere, and put back there. What the page looked like —
   * its scroll, and what had focus — is noted as the tour opens, and on the
   * way out any scene still in force is undone before the scroll is put back,
   * so the reader lands where they pressed "?" from, not wherever the last
   * step had taken them.
   */
  /*
   * Read during the first render, not in the effect: by the time an effect
   * runs a second time — which React's development mode does on purpose —
   * `showModal()` has already moved focus into the dialog, and the dialog is
   * not where anyone should be returned to.
   */
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [snapshot] = useState(captureScroll);
  useEffect(() => {
    return () => {
      scene.current?.undo();
      scene.current = null;
      // Focus last: going back a page moves focus to its heading on arrival,
      // so the opener is focused once the page is back, not before.
      restoreScroll(snapshot, () => opener?.focus({ preventScroll: true }));
    };
  }, [opener, snapshot]);

  /* Enters the step's scene, or leaves the last one, as the step changes. */
  useEffect(() => {
    const wanted = current?.scene ?? null;
    if ((scene.current?.id ?? null) === wanted) return;
    scene.current?.undo();
    scene.current = null;
    if (wanted !== null) scene.current = { id: wanted, undo: SCENES[wanted]({ navigate }) };
    settleUntil.current = performance.now() + SETTLE_MS;
  }, [current, navigate]);

  /** Whether the current step's element is missing, as of the last frame. */
  const [missing, setMissing] = useState(false);

  /*
   * A step with nothing to point at moves on by itself — after waiting out
   * any scene still settling — in the direction the reader was going, so
   * stepping back over a missing step does not bounce them forward again.
   * When there is nowhere left to go, the tour has simply run out.
   */
  useEffect(() => {
    if (current === undefined) {
      endTour();
      return;
    }
    if (!missing) return;

    const wait = Math.max(0, settleUntil.current - performance.now()) + 50;
    const timer = window.setTimeout(() => {
      if (current.target !== null && findTarget(current.target) !== null) return;
      const nowSkipped = new Set(skipped).add(step);
      setSkipped(nowSkipped);
      const ahead = steps.findIndex((_, index) => index > step && !nowSkipped.has(index));
      const behind = steps
        .map((_, index) => index)
        .filter((index) => index < step && !nowSkipped.has(index))
        .at(-1);
      const to = direction.current === -1 ? (behind ?? (ahead === -1 ? undefined : ahead)) : ahead === -1 ? undefined : ahead;
      if (to === undefined) endTour();
      else goToStep(to);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [missing, current, step, steps, skipped]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  /* Brings the element into view, and the step's heading into focus. */
  useEffect(() => {
    if (current === undefined) return;
    const target = current.target === null ? null : findTarget(current.target);
    if (target !== null) {
      const narrow = window.matchMedia(NARROW).matches;
      reveal(target, {
        smooth: !reduced,
        // On a phone the card covers the bottom of the screen; keep clear of it.
        reserveBottom: narrow ? (cardRef.current?.offsetHeight ?? 0) + GAP : 0,
      });
    }
    /*
     * Each step's heading takes focus, so a screen reader reads the step out
     * and a keyboard is already beside the buttons. `preventScroll`, because
     * the card is fixed and the scroll above is the one that matters.
     *
     * A frame later, because `showModal()` runs its own focusing on the way
     * open and would otherwise have the last word on the first step.
     */
    const frame = window.requestAnimationFrame(() =>
      headingRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [current, reduced]);

  const [spot, setSpot] = useState<Box | null>(null);
  /**
   * The previous step's spotlight, kept for as long as it takes to fade out.
   *
   * Steps change by fading, not sliding: the new hole fades in where it
   * belongs while the old one fades out where it was. A box gliding across
   * the screen between them read as the highlight travelling somewhere,
   * which is not what is happening — the tour is simply looking at
   * something else now.
   */
  const [leaving, setLeaving] = useState<{ key: number; box: Box | null; flush: boolean } | null>(
    null,
  );
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  /*
   * A step change, caught during render so the outgoing highlight is in
   * place on the very frame the new one appears. The new step's card is
   * placed from scratch rather than starting where the last one was.
   */
  const [lastStep, setLastStep] = useState(step);
  if (lastStep !== step) {
    setLastStep(step);
    if (!reduced) {
      setLeaving({ key: lastStep, box: spot, flush: steps[lastStep]?.flush === true });
    }
    setSpot(null);
    setCard(null);
  }
  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);
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
      const nextSpot =
        target === null ? null : spotFor(target, current?.flush === true, current?.fit === 'content');
      setSpot((was) => (sameBox(was, nextSpot) ? was : nextSpot));
      const isMissing = current?.target != null && target === null;
      setMissing((was) => (was === isMissing ? was : isMissing));

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

  if (current === undefined) {
    // Ending; see the effect above. Nothing worth a frame in between.
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
        The hole in the dimming, and the previous step's fading out under it.
        With nothing to point at — the welcome step — it collapses to a point
        in the middle of the screen, which leaves the whole page dimmed.
      */}
      {leaving !== null && (
        <Spotlight key={`out-${leaving.key}`} box={leaving.box} flush={leaving.flush} leaving />
      )}
      <Spotlight key={`in-${step}`} box={spot} flush={current.flush === true} />

      <div
        key={step}
        ref={cardRef}
        className={`bg-surface-raised text-content rounded-card border-border shadow-lifted fixed flex flex-col gap-2 border p-4 motion-safe:animate-tour-in ${
          narrow
            ? `inset-x-3 ${atTop ? 'top-3' : 'bottom-3'}`
            : 'w-[min(22rem,calc(100vw-1.5rem))]'
        }`}
        style={
          // Hidden, not removed, while its element is still on its way: the
          // card keeps focus and its place, and appears with what it is about.
          missing
            ? { visibility: 'hidden', top: 0, left: 0 }
            : narrow
              ? undefined
              : card === null
                ? { visibility: 'hidden', top: 0, left: 0 }
                : { top: card.top, left: card.left }
        }
      >
        <p className="text-content-muted text-xs font-medium tabular-nums">
          {t(strings.tour.stepOf, {
            current: position + 1,
            total: shown.length,
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
                onClick={() => go(previous)}
                className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t(strings.tour.back)}
              </button>
            )}
            <button
              type="button"
              onClick={() => (next === undefined ? endTour() : go(next))}
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

/**
 * One hole in the dimming.
 *
 * Fades rather than travels: each step's spotlight is its own element, keyed
 * to the step, so a new one fades in where it belongs while the last fades
 * out where it was. `flush` drops the rounding, for an element that is itself
 * square-cornered and edge-to-edge — the map.
 */
function Spotlight({ box, flush, leaving = false }: { box: Box | null; flush: boolean; leaving?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`shadow-spotlight pointer-events-none fixed ${flush ? '' : 'rounded-card'} ${
        leaving ? 'animate-tour-out' : 'motion-safe:animate-tour-in'
      }`}
      style={
        box === null
          ? { top: '50%', left: '50%', width: 0, height: 0 }
          : { top: box.top, left: box.left, width: box.width, height: box.height }
      }
    />
  );
}

/** Whether an element is a scroller — a pane with its own scrollbar. */
function scrolls(element: Element): boolean {
  const { overflowX, overflowY } = getComputedStyle(element);
  return /auto|scroll/.test(overflowX) || /auto|scroll/.test(overflowY);
}

/**
 * The box to light up for an element: its own rectangle, padded unless it is
 * flush, and **cut down to the part of it a scroller lets be seen.**
 *
 * The cut is what keeps a long list from lighting up the header above its
 * pane or the footer below it: the list runs on past its pane, hidden, and a
 * spotlight drawn round all of it would reveal space it does not occupy.
 *
 * Only scrollers cut it, not every `overflow: hidden`. A stop's name is a
 * button inside a box that hides overflow to truncate long names, and cutting
 * to that box took away the padding every other highlight has — the name sat
 * in a hole exactly its own size.
 *
 * `content` measures inside the element's padding, for a list whose own
 * padding is the space between it and its card: lit to the padding edge, the
 * highlight stood well clear of the first row it was pointing at.
 */
function spotFor(target: HTMLElement, flush: boolean, content: boolean): Box {
  const rect = target.getBoundingClientRect();
  const pad = flush ? 0 : PAD;
  const inset = content ? getComputedStyle(target) : null;
  let top = rect.top + (inset === null ? 0 : parseFloat(inset.paddingTop)) - pad;
  let left = rect.left + (inset === null ? 0 : parseFloat(inset.paddingLeft)) - pad;
  let bottom = rect.bottom - (inset === null ? 0 : parseFloat(inset.paddingBottom)) + pad;
  let right = rect.right - (inset === null ? 0 : parseFloat(inset.paddingRight)) + pad;

  for (let parent = target.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent === document.body || !scrolls(parent)) continue;
    const clip = parent.getBoundingClientRect();
    top = Math.max(top, clip.top);
    left = Math.max(left, clip.left);
    bottom = Math.min(bottom, clip.bottom);
    right = Math.min(right, clip.right);
  }
  top = Math.max(top, 0);
  left = Math.max(left, 0);
  bottom = Math.min(bottom, window.innerHeight);
  right = Math.min(right, window.innerWidth);

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top)),
  };
}

/** The nearest ancestor that actually scrolls, or null for the page itself. */
function scroller(target: HTMLElement): HTMLElement | null {
  for (let parent = target.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) return null;
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }
  return null;
}

/**
 * Scrolls just enough to show an element, and no more.
 *
 * `scrollIntoView` was the first version, and it did two things wrong. It
 * centred whatever it was given, so a list of every route in the network was
 * scrolled to its middle — hundreds of rows down. And it scrolls every
 * ancestor it can, including ones marked `overflow: hidden`, which the
 * desktop layout uses to pin the page to the window; scrolling one of those
 * shifted the whole layout and left a scrollbar behind it.
 *
 * So this scrolls only the nearest real scroller — a pane with
 * `overflow: auto`, or the page — and only by the distance needed. Already in
 * view: nothing moves. Partly out: it moves until the element's edge clears
 * the margin. Taller than the space it has: its top is brought in, and the
 * rest is left for the reader to scroll to.
 */
function reveal(target: HTMLElement, { smooth, reserveBottom }: { smooth: boolean; reserveBottom: number }) {
  const margin = 16;
  const pane = scroller(target);
  const area = pane?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  const visibleTop = Math.max(area.top, 0) + margin;
  const visibleBottom = Math.min(area.bottom, window.innerHeight) - margin - reserveBottom;
  const rect = target.getBoundingClientRect();

  let delta = 0;
  if (rect.height > visibleBottom - visibleTop) {
    if (rect.top < visibleTop || rect.top > visibleBottom - 80) delta = rect.top - visibleTop;
  } else if (rect.top < visibleTop) {
    delta = rect.top - visibleTop;
  } else if (rect.bottom > visibleBottom) {
    delta = rect.bottom - visibleBottom;
  }
  if (Math.abs(delta) < 1) return;

  const options: ScrollToOptions = { top: delta, behavior: smooth ? 'smooth' : 'auto' };
  if (pane === null) window.scrollBy(options);
  else pane.scrollBy(options);
}
