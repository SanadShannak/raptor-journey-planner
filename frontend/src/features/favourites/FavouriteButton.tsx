import { useId, useState } from 'react';
import { messageForApiError, useLocale } from '../../i18n';
import { requestAuth } from '../../auth/authPrompt';
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
 * flight and it can fail. Three things follow. It reports `aria-busy` while
 * waiting, because a star that will not fill for a moment otherwise reads as a
 * press that missed. It can be refused by the server for reasons this component
 * cannot predict — the kind is full as counted on *another* device, the stop is
 * no longer in the dataset — so a failure is shown in the same bubble the other
 * refusals use rather than swallowed. And when nobody is signed in it opens the
 * sign-in dialog instead of explaining into a tooltip nobody asked to read: the
 * press was an intention to save, and the dialog is how that intention is met.
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

  const { saved, savedItem, blocked, needsAccount } = useFavouriteState(favourite);

  const [pending, setPending] = useState(false);
  /** What the server said no to, already localised. Cleared by the next press. */
  const [failure, setFailure] = useState<string | null>(null);

  const nothingToSave = favourite === null;
  /*
   * `needsAccount` is deliberately *not* an off state. The control works — it
   * opens the dialog — so dimming it and marking it `aria-disabled` would be
   * describing a refusal that does not happen.
   */
  const off = nothingToSave || (blocked && !needsAccount);

  const reason = nothingToSave
    ? (unavailableReason ?? t(strings.favourites.needsSearch))
    : (failure ??
      (needsAccount
        ? t(strings.account.saveNeedsAccount)
        : blocked
          ? t(strings.favourites.limitReached, { count: FAVOURITES_PER_KIND })
          : null));

  const label = saved ? t(strings.favourites.remove) : t(strings.favourites.add);
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  async function press() {
    if (favourite === null || pending) return;
    setFailure(null);

    /*
     * Not an error. Somebody pressing a star has said what they want; the
     * dialog is the next step towards it rather than a complaint about the
     * press. What they pressed is not saved for them afterwards — the star is
     * still there, filled in by whatever the list says once it loads.
     */
    if (needsAccount) {
      requestAuth('logIn');
      return;
    }

    if (off) return;

    setPending(true);
    try {
      await toggleFavourite(favourite);
    } catch (error: unknown) {
      setFailure(t(messageForApiError(error, strings)));
    } finally {
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
        aria-pressed={saved}
        aria-disabled={off || undefined}
        aria-busy={pending || undefined}
        aria-describedby={reason === null ? undefined : hintId}
        onClick={() => void press()}
        className={`rounded-control focus-visible:outline-brand-500 ${box} flex flex-none items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 ${
          off
            ? 'text-content-muted cursor-not-allowed opacity-50'
            : saved
              ? 'text-accent-strong hover:bg-surface-muted cursor-pointer'
              : 'text-content-muted hover:text-accent-strong hover:bg-surface-muted cursor-pointer'
        } ${pending ? 'opacity-70' : ''}`}
      >
        <span className="sr-only">{label}</span>
        {/*
          A star is not a directional icon, so it must not mirror in RTL —
          unlike the back chevrons, which do. Filled when saved, outlined when
          not: the shape carries the state as well as the colour does, which is
          what keeps it readable in greyscale and to a colour-blind reader.

          Its fill follows the *stored* row rather than an optimistic guess, so
          it fills when the save has actually happened. `aria-busy` and the
          dimming are what cover the wait.
        */}
        <svg
          viewBox="0 0 20 20"
          width={size === 'sm' ? 16 : 18}
          height={size === 'sm' ? 16 : 18}
          fill={savedItem !== null ? 'currentColor' : 'none'}
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
        */
        <span
          id={hintId}
          role={failure === null ? 'tooltip' : 'alert'}
          className="bg-chrome text-on-chrome rounded-control pointer-events-none absolute top-full end-0 z-20 mt-1 hidden w-56 px-2.5 py-1.5 text-xs leading-snug shadow-card group-focus-within:block group-hover:block"
        >
          {reason}
        </span>
      )}
    </span>
  );
}
