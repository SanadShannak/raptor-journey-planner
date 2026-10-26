import { useId, useState } from 'react';
import { messageForApiError, useLocale } from '../../i18n';
import { FAVOURITES_PER_KIND, type FavouriteDraft } from './favourite';
import { toggleFavourite } from './favouritesStore';
import { useFavouriteState, useLoadFavourites } from './useFavourites';

interface Props {
  /**
   * What pressing it would save, or null when there is nothing to save yet —
   * a journey form that is not filled in.
   */
  favourite: FavouriteDraft | null;
  /** Why it cannot be saved, when the caller knows better than this component. */
  unavailableReason?: string | undefined;
  size?: 'sm' | 'md';
}

/**
 * The star.
 *
 * One component in three places — a stop's header, a route's header, and the
 * planner's — because they are the same act and should look, sound, and sit
 * the same everywhere.
 *
 * **Never disabled, even when it cannot save.** A `disabled` button is
 * unfocusable and screen readers skip past it, so the one person who most needs
 * to know *why* the star is off would never find out. It stays focusable,
 * carries `aria-disabled`, and is described by the reason.
 *
 * When it cannot save, three things say so at once and none of them is colour:
 * the cursor turns to `not-allowed`, the star dims, and the reason appears on
 * hover or focus **immediately**. The tooltip is a CSS one rather than the
 * `title` attribute deliberately — a native tooltip waits about a second before
 * appearing, which is long enough for somebody to press the control again and
 * conclude it is simply broken.
 *
 * What the account changed: the press is now a **request**, so it can be in
 * flight and it can fail. Three things follow. It shows the answer it expects
 * **at once** — filled on a save, empty on a removal — and reports `aria-busy`
 * until the server agrees, because a star that waited a round trip to fill
 * read as a press that missed, and was pressed again. It can be refused by the server for reasons this component
 * cannot predict — the kind is full as counted on *another* device, the stop is
 * no longer in the dataset — so a failure is shown in the same bubble the other
 * refusals use rather than swallowed.
 *
 * It works for somebody who is not signed in, too: their favourites are kept
 * in this browser, through the same store. The only moment it holds back is
 * while the session is still being checked, when a press could land in the
 * wrong list.
 */
export function FavouriteButton({ favourite, unavailableReason, size = 'md' }: Props) {
  const { strings, t } = useLocale();
  const hintId = useId();

  /*
   * The star is often the first thing on a page to need the list — a stop page
   * carries one and never mounts the favourites page — so it loads it rather
   * than assuming somewhere else has.
   */
  useLoadFavourites();

  const { saved, blocked, waiting } = useFavouriteState(favourite);

  const [pending, setPending] = useState(false);
  /**
   * What the star is showing while a press is in flight: the state it will
   * have if the server agrees. Null the rest of the time, when the stored list
   * is the only authority.
   *
   * Held here rather than written into the store. A saved row needs the id
   * and default nickname the server assigns, and a guessed row without them
   * would be a favourite that could not be renamed or removed — see
   * `saveFavourite`. Only the star itself needs to look ahead.
   */
  const [expected, setExpected] = useState<boolean | null>(null);
  /** What the server said no to, already localised. Cleared by the next press. */
  const [failure, setFailure] = useState<string | null>(null);

  const nothingToSave = favourite === null;
  const off = nothingToSave || blocked || waiting;

  const reason = nothingToSave
    ? (unavailableReason ?? t(strings.favourites.needsSearch))
    : (failure ??
      (waiting
        ? t(strings.account.checking)
        : blocked
          ? t(strings.favourites.limitReached, { count: FAVOURITES_PER_KIND })
          : null));

  const shownSaved = expected ?? saved;
  const label = shownSaved ? t(strings.favourites.remove) : t(strings.favourites.add);
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  async function press() {
    if (favourite === null || pending) return;
    setFailure(null);

    if (off) return;

    setPending(true);
    setExpected(!saved);
    try {
      await toggleFavourite(favourite);
    } catch (error: unknown) {
      // Back to what the list says, which is what is actually true, with the
      // reason beside it — a star that quietly un-filled would look like a
      // second press rather than a refusal.
      setFailure(t(messageForApiError(error, strings)));
    } finally {
      setExpected(null);
      setPending(false);
    }
  }

  return (
    /*
     * `relative` so the bubble can hang off the control, and `group` so it can
     * react to the button's own hover and focus rather than needing script.
     */
    <span className="group relative flex flex-none">
      <button
        type="button"
        aria-pressed={shownSaved}
        aria-disabled={off || undefined}
        aria-busy={pending || undefined}
        aria-describedby={reason === null ? undefined : hintId}
        onClick={() => void press()}
        className={`rounded-control focus-visible:outline-brand-500 ${box} flex flex-none items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 ${
          off
            ? 'text-content-muted cursor-not-allowed opacity-50'
            : shownSaved
              ? 'text-accent-strong hover:bg-surface-muted cursor-pointer'
              : 'text-content-muted hover:text-accent-strong hover:bg-surface-muted cursor-pointer'
        } ${pending ? 'cursor-progress' : ''}`}
      >
        <span className="sr-only">{label}</span>
        {/*
          A star is not a directional icon, so it must not mirror in RTL —
          unlike the back chevrons, which do. Filled when saved, outlined when
          not: the shape carries the state as well as the colour does, which is
          what keeps it readable in greyscale and to a colour-blind reader.

          It fills the moment it is pressed and settles when the server
          answers; a refusal puts it back. The small pop on a fresh fill is
          the acknowledgement a tap otherwise lacks on a phone, where there is
          no hover to say the control was reached at all.
        */}
        <svg
          viewBox="0 0 20 20"
          width={size === 'sm' ? 16 : 18}
          height={size === 'sm' ? 16 : 18}
          fill={shownSaved ? 'currentColor' : 'none'}
          className={expected === true ? 'motion-safe:animate-star-pop' : undefined}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 2.6l2.3 4.66 5.15.75-3.73 3.63.88 5.13L10 14.35l-4.6 2.42.88-5.13L2.55 8.01l5.15-.75z" />
        </svg>
      </button>

      {reason !== null && (
        /*
          Hidden from the pointer so it can never sit between a cursor and the
          control it explains, and anchored to the end edge with logical
          positioning so it flips sides with the page's direction rather than
          hanging off the window in Arabic.

          A server refusal is announced as well as shown: it is the answer to a
          press, so a screen reader is told rather than left to go looking for a
          tooltip it has no reason to visit.
          When it shows depends on the pointer. With a mouse, it follows the
          hover and nothing else — it used to follow focus too, and a click
          leaves focus on the button, so the bubble stayed open after the
          cursor had moved on. A keyboard still gets it, through
          `:focus-visible`, which a click does not set. A touch screen has no
          hover at all, so there a tap — which focuses the button — is what
          opens it, and tapping elsewhere closes it.
        */
        <span
          id={hintId}
          role={failure === null ? 'tooltip' : 'alert'}
          className="bg-chrome text-on-chrome rounded-control pointer-events-none absolute top-full end-0 z-20 mt-1 hidden w-56 px-2.5 py-1.5 text-xs leading-snug shadow-card group-hover:block group-has-[:focus-visible]:block pointer-coarse:group-focus-within:block"
        >
          {reason}
        </span>
      )}
    </span>
  );
}
