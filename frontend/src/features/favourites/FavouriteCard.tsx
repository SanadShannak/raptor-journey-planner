import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../i18n';
import type { Dictionary, Message } from '../../i18n/dictionary';
import { favouriteLabel, identity, type Favourite } from './favourite';
import { moveFavourite, removeFavourite, renameFavourite } from './favouritesStore';

/**
 * What the rename field suggests, which depends on what is being renamed.
 *
 * The card already knows — it is handed the favourite itself — so this is a
 * lookup rather than another prop. See the dictionary for why one phrasing
 * cannot serve a stop, a line and a saved journey at once.
 */
function renamePlaceholderFor(kind: Favourite['kind'], strings: Dictionary): Message {
  switch (kind) {
    case 'stop':
      return strings.favourites.renamePlaceholderStop;
    case 'route':
      return strings.favourites.renamePlaceholderRoute;
    case 'itinerary':
      return strings.favourites.renamePlaceholderItinerary;
  }
}

interface Props {
  favourite: Favourite;
  /** Where the card leads — a stop's page, a route's page, the planner. */
  to: string;
  /** The name it came with, shown whenever there is no nickname. */
  fallbackLabel: string;
  /** Under the name: a stop's code, a route's headsign. */
  subtitle: ReactNode;
  /** The badge or icon that identifies it at a glance. */
  emblem?: ReactNode | undefined;
  /** Live departures, or whatever this kind has to say for itself. */
  children?: ReactNode | undefined;
  /** Paging controls for {@link children}, drawn in the footer. */
  pager?: ReactNode | undefined;
  /** Focus lands here when the card is removed, so it is never lost to body. */
  onRemoved: () => void;
  /** True while this card is the one being dragged, so it can lift. */
  dragging: boolean;
  /**
   * Whether there is anywhere to go in each direction, so a held card can
   * point at the ways that are actually open to it.
   */
  canGoEarlier: boolean;
  canGoLater: boolean;
  /** Dimmed while some *other* card is being carried, so the held one leads. */
  someoneElseDragging: boolean;
  /** Hands the gesture to the row, which follows it from there. */
  onDragStart: () => void;
}

/**
 * Lines a run of text up with the text *inside* a bordered badge beside it.
 *
 * A stop's code sits in a bordered chip, so its glyphs start a border and a
 * padding in from the chip's own edge — seven pixels the plain name above it
 * did not have, which read as the code being indented under the name. Matching
 * the chip's geometry with a transparent border puts the two on one edge, and
 * gives the name's own focus ring the same shape as the chip while it is at it.
 */
export const TEXT_INSET = 'border border-transparent ';

const CONTROL =
  'pointer-events-auto relative rounded-control text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex h-7 w-7 flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-30';

/**
 * One saved thing, as a card in its category's row.
 *
 * **The whole card leads somewhere**, so the link is an overlay stretched
 * underneath the content rather than wrapped around the name — a button cannot
 * live inside an anchor, and the card carries several. The content is
 * `pointer-events-none` so presses fall through to the overlay, and each
 * control turns pointers back on for itself.
 *
 * **The name is the rename control.** Pressing it turns it into a field in
 * place; there is no pencil to find first.
 *
 * **Reordering is a drag**, which is the gesture the arrangement actually
 * wants — dropping the fifth card at the front is one movement rather than
 * four presses.
 *
 * Built on **pointer events rather than the drag-and-drop API**, because that
 * API is mouse-only: a phone never fires `dragstart` from a finger, so the
 * cards could not be rearranged on the device most likely to be holding them.
 * Pointer events cover a mouse, a finger and a stylus in one path.
 *
 * The drag starts from the **grip alone**, and that is the load-bearing part.
 * The grip opts out of the browser's own touch gestures so a drag on it is a
 * drag; everywhere else on the card keeps them, so a finger can still scroll
 * the row sideways and tap a card to open it. Taking those gestures from the
 * whole card would trade one interaction for two.
 *
 * A drag is not operable by keyboard at all, so the same move is on `Alt` with
 * the arrow keys and the row says so once. The arrows are read *visually*: in
 * Arabic the row runs the other way, so `ArrowRight` moves a card earlier,
 * which is what "earlier" looks like on that screen.
 */
export function FavouriteCard({
  favourite,
  to,
  fallbackLabel,
  subtitle,
  emblem,
  children,
  pager,
  onRemoved,
  dragging,
  canGoEarlier,
  canGoLater,
  someoneElseDragging,
  onDragStart,
}: Props) {
  const { direction, strings, t } = useLocale();
  const key = identity(favourite);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(favourite.nickname ?? '');
  const fieldRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);

  /*
   * Whether *this* card is the one being carried. A ref rather than the
   * `dragging` prop, because the first `pointermove` can arrive before React
   * has re-rendered with it and the drag would drop its opening movement.
   */
  /**
   * Starts a drag, and hands it straight to the row.
   *
   * The card deliberately does not follow the gesture itself. Reordering
   * unmounts the card being dragged — it is the one thing on screen the drag
   * is guaranteed to disturb — so any listener it owned was torn down by its
   * own first success, and every movement after that was lost. The row is the
   * thing that survives a reorder, so the row is what listens.
   */
  function beginDrag(event: ReactPointerEvent): void {
    // A right-click is not a drag; a finger or a stylus has no button to press.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (editing) return;
    /*
     * Stops the press becoming a text selection or, on iOS, the long-press
     * callout — a finger held still on a handle is exactly the gesture those
     * two are looking for, and both would fight the drag it is actually
     * starting.
     */
    event.preventDefault();
    onDragStart();
  }

  const title = favouriteLabel(favourite, fallbackLabel);

  function commit() {
    renameFavourite(key, draft);
    setEditing(false);
    // Back to the name that opened the field, or focus falls to the body.
    nameRef.current?.focus();
  }

  function cancel() {
    setDraft(favourite.nickname ?? '');
    setEditing(false);
    nameRef.current?.focus();
  }

  return (
    <li
      data-favourite={key}
      /*
        Picked up, not switched off.
        
        This used to dim the card, which reads as "disabled" rather than "held"
        — and a thumb covers most of a card it is dragging, so the one part
        still visible was the part that had gone faint. It lifts instead: the
        shadow opens underneath it, it rises off the row, and it sits above its
        neighbours so it passes over them rather than through them. The *other*
        cards take the dimming, which is what makes the held one lead rather
        than merely differ.

        It lifts rather than grows. Scaling pushed the card past the edges of
        the row that holds it, and a row that scrolls sideways cannot let
        anything outside itself show — so the very border doing the signalling
        was the first thing clipped.

        The transition is squashed by the global `prefers-reduced-motion` rule,
        so the lift still happens for a reader who has asked for less movement —
        it simply arrives rather than eases.
      */
      className={`bg-surface-raised rounded-card relative flex w-80 flex-none flex-col border transition-[box-shadow,translate,border-color,opacity] duration-150 ${
        dragging
          ? 'border-brand-500 shadow-lifted z-10 -translate-y-1 cursor-grabbing'
          : someoneElseDragging
            ? 'border-border opacity-55'
            : 'border-border shadow-none'
      }`}
    >
      {/*
        Which ways this card can go, shown only while it is being held and only
        where there is somewhere to go — the first card offers no "earlier" and
        the last offers no "later", so the arrows are a statement about this
        card's position rather than decoration.

        Outside the card's own edges, in logical positions, so they sit where
        the card would travel and swap sides with the page's direction. They
        pulse rather than slide: the chevron already points, and an animation
        that also moved would be saying the same thing twice, in a direction it
        would then have to keep in step with RTL.
      */}
      {dragging && (
        <>
          {canGoEarlier && (
            <span
              aria-hidden="true"
              className="text-brand-500 drag-pulse pointer-events-none absolute top-1/2 -start-6 -translate-y-1/2"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
                <path d="M12 4l-6 6 6 6" />
              </svg>
            </span>
          )}
          {canGoLater && (
            <span
              aria-hidden="true"
              className="text-brand-500 drag-pulse pointer-events-none absolute top-1/2 -end-6 -translate-y-1/2"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
                <path d="M8 4l6 6-6 6" />
              </svg>
            </span>
          )}
        </>
      )}

      <Link
        to={to}
        /*
         * An anchor drags itself by default, and a link drag is what puts the
         * URL chip on the pointer. The card's own drag is the one wanted here.
         */
        draggable={false}
        onKeyDown={(event) => {
          if (!event.altKey) return;
          const earlier = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
          const later = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
          if (event.key !== earlier && event.key !== later) return;
          event.preventDefault();
          moveFavourite(key, event.key === earlier ? -1 : 1);
        }}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        className="rounded-card focus-visible:outline-brand-500 absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="sr-only">{t(strings.favourites.openNamed, { name: title })}</span>
      </Link>

      <div className="pointer-events-none relative flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start gap-2">
          {emblem}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {editing ? (
              <input
                ref={fieldRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                  }
                }}
                placeholder={t(renamePlaceholderFor(favourite.kind, strings))}
                aria-label={t(strings.favourites.rename)}
                className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 pointer-events-auto relative w-full border px-1.5 py-0.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1"
              />
            ) : (
              <button
                ref={nameRef}
                type="button"
                onClick={() => setEditing(true)}
                aria-label={t(strings.favourites.renameNamed, { name: title })}
                className={`rounded-control hover:decoration-content-muted focus-visible:outline-brand-500 pointer-events-auto relative cursor-text text-start text-sm font-medium underline decoration-transparent decoration-dotted underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${TEXT_INSET}`}
              >
                {/*
                  `unicode-bidi: plaintext` rather than `dir="auto"`, and the
                  difference is the whole point.

                  `dir` would flip the *box*, so a Latin name on an Arabic page
                  sat against the far edge of the card while the code badge
                  below stayed against the near one. Inheriting the page's
                  direction fixed that but broke the other end: an over-long
                  Latin name was then truncated at the RTL line's own end,
                  which is its left — so the ellipsis ate "Olympiaterminaali"
                  off the front and left "…Kallio - Kuusitie".

                  `plaintext` takes the paragraph direction from the content, so
                  the name is laid out and truncated as the left-to-right run it
                  is — ellipsis at its end rather than eating its front.

                  Naming both physical edges is the other half, and it is not
                  redundant with `text-start`. `start` resolves against the
                  *paragraph* direction, which plaintext has just handed to the
                  content — so a Latin name on an Arabic page aligned itself
                  left while its code badge stayed right, the two on opposite
                  edges of one card. It cuts both ways: an Arabic nickname on an
                  English page did the same thing mirrored. Pinning the box to
                  the page's own edge fixes both, and truncation is unaffected —
                  an over-long name fills the box either way.
                */}
                <span className="block truncate [unicode-bidi:plaintext] ltr:text-left rtl:text-right">
                  {title}
                </span>
              </button>
            )}

            {subtitle !== null && (
              /*
                The same inset as the name above it, so the two line up on what
                a reader actually sees.

                Aligning the name's glyphs with the *badge's glyphs* was the
                wrong pair: the badge is a bordered chip, so its border is its
                visible edge, and matching the text inside it left the chip
                itself hanging seven pixels out to the side. Both boxes carry
                the same geometry now, which puts the name's first letter and
                the chip's own edge on one line — and a plain-text subtitle on
                that line too, since it inherits the same inset from here rather
                than adding its own.
              */
              <div className="text-content-muted ms-px min-w-0  text-xs">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {children}

        <div className="border-border -mx-0.5 mt-auto flex items-center justify-between gap-1 border-t pt-1">
          {/* The pager belongs to the list above it, so it sits at the start. */}
          <div className="flex items-center gap-0.5">
            {/*
              The grip, which is both the sign that a card can be picked up and
              the only place a drag starts.

              `aria-hidden` still: a drag is a pointer gesture with no keyboard
              equivalent of its own, so a screen reader is pointed at the one
              that does work — `Alt` with the arrow keys, said once per row —
              rather than at a handle it cannot use.
            */}
            <span
              aria-hidden="true"
              onPointerDown={beginDrag}
              // A long press is a right-click on a touch screen. Nothing here
              // has a context menu worth offering, and the menu cancels the drag.
              onContextMenu={(event) => event.preventDefault()}
              /*
               * `pointer-events-auto` because the card's content sits inside a
               * layer that lets presses fall through to the stretched link
               * underneath it — which is right for everything that is only
               * being read, and wrong for the one part that has to be grabbed.
               * Without it the grip drew a `grab` cursor over a link that
               * quietly took every gesture aimed at it.
               *
               * `touch-none` only here. It tells the browser this handle's
               * gestures are ours, which is what makes a finger-drag a drag
               * rather than a scroll — and confining it to the handle is what
               * leaves the rest of the card able to scroll the row and open
               * itself.
               *
               * `select-none` and the callout suppression are what make a real
               * finger work: holding still on the handle is how a phone is
               * asked for a selection and a callout menu, and both arrive
               * exactly when a drag is being started.
               *
               * Wider than it looks. The dots are small, but the box around
               * them is the target — and a handle you have to hit precisely is
               * one nobody uses twice on a phone.
               */
              className={`pointer-events-auto relative flex h-8 w-10 flex-none cursor-grab touch-none select-none items-center justify-center [-webkit-touch-callout:none] active:cursor-grabbing ${
                dragging ? 'text-brand-500' : 'text-content-muted/70'
              }`}
            >
              <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="4" r="1.1" />
                <circle cx="7" cy="4" r="1.1" />
                <circle cx="3" cy="8" r="1.1" />
                <circle cx="7" cy="8" r="1.1" />
                <circle cx="3" cy="12" r="1.1" />
                <circle cx="7" cy="12" r="1.1" />
              </svg>
            </span>
            {pager}
          </div>

          <button
            type="button"
            onClick={() => {
              removeFavourite(key);
              onRemoved();
            }}
            className={`${CONTROL} hover:text-danger`}
          >
            <span className="sr-only">{t(strings.favourites.remove)}</span>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Steps a card's own departure list, three at a time.
 *
 * The card shows a glance, but the glance runs out — the next three at a stop
 * is often "nothing for twenty minutes, then three at once". These walk the
 * rest of what was already fetched, so paging costs no request at all, and
 * stop at the end rather than wrapping: there is nothing after the last one.
 */
export function DeparturePager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (next: number) => void;
}) {
  const { strings, t } = useLocale();
  if (pages <= 1) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className={CONTROL}
      >
        <span className="sr-only">{t(strings.favourites.showEarlier)}</span>
        {/* Along the list, so directional: mirrored in Arabic. */}
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
          <path d="M12 4l-6 6 6 6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages - 1}
        className={CONTROL}
      >
        <span className="sr-only">{t(strings.favourites.showMore)}</span>
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
          <path d="M8 4l6 6-6 6" />
        </svg>
      </button>
    </>
  );
}
