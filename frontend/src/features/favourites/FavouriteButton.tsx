import { useId } from 'react';
import { useLocale } from '../../i18n';
import { FAVOURITES_PER_KIND, type Favourite } from './favourite';
import { toggleFavourite } from './favouritesStore';
import { useFavouriteState } from './useFavourites';

interface Props {
  /**
   * What pressing it would save, or null when there is nothing to save yet —
   * a journey form that is not filled in.
   */
  favourite: Favourite | null;
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
 */
export function FavouriteButton({ favourite, unavailableReason, size = 'md' }: Props) {
  const { strings, t } = useLocale();
  const hintId = useId();
  const { saved, blocked } = useFavouriteState(favourite);

  const nothingToSave = favourite === null;
  const off = nothingToSave || blocked;

  const reason = nothingToSave
    ? (unavailableReason ?? t(strings.favourites.needsSearch))
    : blocked
      ? t(strings.favourites.limitReached, { count: FAVOURITES_PER_KIND })
      : null;

  const label = saved ? t(strings.favourites.remove) : t(strings.favourites.add);
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

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
        aria-describedby={reason === null ? undefined : hintId}
        onClick={() => {
          if (off || favourite === null) return;
          toggleFavourite(favourite);
        }}
        className={`rounded-control focus-visible:outline-brand-500 ${box} flex flex-none items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 ${
          off
            ? 'text-content-muted cursor-not-allowed opacity-50'
            : saved
              ? 'text-accent-strong hover:bg-surface-muted cursor-pointer'
              : 'text-content-muted hover:text-accent-strong hover:bg-surface-muted cursor-pointer'
        }`}
      >
        <span className="sr-only">{label}</span>
        {/*
          A star is not a directional icon, so it must not mirror in RTL —
          unlike the back chevrons, which do. Filled when saved, outlined when
          not: the shape carries the state as well as the colour does, which is
          what keeps it readable in greyscale and to a colour-blind reader.
        */}
        <svg
          viewBox="0 0 20 20"
          width={size === 'sm' ? 16 : 18}
          height={size === 'sm' ? 16 : 18}
          fill={saved ? 'currentColor' : 'none'}
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
        */
        <span
          id={hintId}
          role="tooltip"
          className="bg-chrome text-on-chrome rounded-control pointer-events-none absolute top-full end-0 z-20 mt-1 hidden w-56 px-2.5 py-1.5 text-xs leading-snug shadow-card group-focus-within:block group-hover:block"
        >
          {reason}
        </span>
      )}
    </span>
  );
}
