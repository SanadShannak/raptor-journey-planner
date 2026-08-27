import { useMemo, useSyncExternalStore } from 'react';
import { identity, type Favourite, type FavouriteKind } from './favourite';
import {
  countOfKind,
  getFavourites,
  hasRoomFor,
  subscribeToFavourites,
} from './favouritesStore';

/**
 * The saved list, kept current.
 *
 * Subscribed rather than read, for the same reason the health store is: the
 * star has to word itself during render, and the list changes outside React —
 * from another tab, or from a row somewhere else on the page.
 */
export function useFavourites(): readonly Favourite[] {
  return useSyncExternalStore(subscribeToFavourites, getFavourites);
}

/** The saved list of one kind, in its own order. */
export function useFavouritesOfKind<K extends FavouriteKind>(
  kind: K,
): Extract<Favourite, { kind: K }>[] {
  const all = useFavourites();
  return useMemo(
    () => all.filter((favourite): favourite is Extract<Favourite, { kind: K }> =>
      favourite.kind === kind,
    ),
    [all, kind],
  );
}

/**
 * What one star needs to know.
 *
 * `full` is deliberately separate from `saved`: a star on something already
 * saved must stay pressable so it can be un-saved, even when its kind is at the
 * cap. Only an *unsaved* thing in a full kind is refused.
 */
export function useFavouriteState(favourite: Favourite | null): {
  saved: boolean;
  full: boolean;
  blocked: boolean;
} {
  const all = useFavourites();

  return useMemo(() => {
    if (favourite === null) return { saved: false, full: false, blocked: true };

    const key = identity(favourite);
    const saved = all.some((entry) => identity(entry) === key);
    const full = !hasRoomFor(favourite.kind);

    return { saved, full, blocked: !saved && full };
    // `all` is the snapshot; the helpers read the same module value.
  }, [all, favourite]);
}

/** How many of a kind are saved, and how many more will fit. */
export function useKindCount(kind: FavouriteKind): number {
  useFavourites();
  return countOfKind(kind);
}
