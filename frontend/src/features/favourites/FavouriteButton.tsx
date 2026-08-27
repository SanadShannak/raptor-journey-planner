import { useId } from 'react';
import { useLocale } from '../../i18n';
import { FAVOURITES_PER_KIND, type Favourite } from './favourite';
import { toggleFavourite } from './favouritesStore';
import { useFavouriteState } from './useFavourites';

interface Props {
  /**
   * What pressing it would save, or null when there is nothing to save yet —
   * a journey form that is not filled in.
   *
   * Built fresh by the caller on each render, which is why the hook below
   * depends on its *identity string* rather than the object.
   */
  favourite: Favourite | null;
  /** Why it cannot be saved, when the caller knows better than this component. */
  unavailableReason?: string | undefined;
  /** A larger target where the control stands alone rather than beside a title. */
  size?: 'sm' | 'md';
}

/**
 * The star.
 *
 * One component in three places — a stop's header, a route's header, and the
 * journey form — because they are the same act and should look and sound the
 * same everywhere.
 *
 * **Never disabled, even when it cannot save.** A `disabled` button is
 * unfocusable and screen readers skip past it, so the one person who most needs
 * to know *why* the star is off would never find out. It stays focusable,
 * carries `aria-disabled`, and points at a hint that says what is missing.
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
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-disabled={off || undefined}
        aria-describedby={reason === null ? undefined : hintId}
        onClick={() => {
          if (off || favourite === null) return;
          toggleFavourite(favourite);
        }}
        className={`rounded-control focus-visible:outline-brand-500 ${box} flex flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 ${
          off
            ? 'text-content-muted cursor-not-allowed opacity-60'
            : saved
              ? 'text-accent-strong hover:bg-surface-muted'
              : 'text-content-muted hover:text-accent-strong hover:bg-surface-muted'
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
        <span id={hintId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}
