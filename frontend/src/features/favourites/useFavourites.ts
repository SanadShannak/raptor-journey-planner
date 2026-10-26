import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSession } from '../../auth/useSession';
import { identity, type Favourite, type FavouriteDraft, type FavouriteKind } from './favourite';
import {
  countOfKind,
  forgetFavourites,
  getFavourites,
  getSavedState,
  hasRoomFor,
  loadFavourites,
  subscribeToFavourites,
} from './favouritesStore';

/**
 * Loads the list from wherever it lives — the account when somebody is signed
 * in, this browser when nobody is — and again whenever that changes.
 *
 * Mounted by whichever surface needs the list — the favourites page, and the
 * star's own hook — rather than once in the layout, because unlike the health
 * probe this is not something every page wants: a visitor reading a timetable
 * should not be fetching three lists they are not looking at.
 *
 * Keyed on the **account id**, not on `signedIn`. Signing out and straight
 * back in as somebody else is one transition the boolean cannot see, and the
 * consequence of missing it is the previous account's favourites sitting under
 * the new one's name until something else happened to refetch.
 *
 * Nothing is loaded while the session is still being checked: until it
 * answers, there is no telling which list is the right one, and showing the
 * browser's for a moment before an account's would be showing the wrong one.
 */
export function useLoadFavourites(): void {
  const { account, signedIn, checking } = useSession();
  const accountId = account?.id ?? null;

  useEffect(() => {
    if (checking) {
      forgetFavourites();
      return;
    }
    void loadFavourites();
  }, [accountId, signedIn, checking]);
}

/**
 * The saved list, kept current.
 *
 * Subscribed rather than read, for the same reason the health store is: the
 * star has to word itself during render, and the list changes outside React —
 * from a request that has just answered, or from a row somewhere else on the
 * page.
 */
export function useFavourites(): readonly Favourite[] {
  return useSyncExternalStore(subscribeToFavourites, getFavourites);
}

/**
 * The list *and* how it is doing.
 *
 * What a page drawing loading, empty and error states needs. Separate from
 * {@link useFavourites} so a component that only wants the array does not
 * re-render every time the status moves.
 */
export function useSavedState(): ReturnType<typeof getSavedState> {
  return useSyncExternalStore(subscribeToFavourites, getSavedState);
}

/** The saved list of one kind, in its own order. */
export function useFavouritesOfKind<K extends FavouriteKind>(
  kind: K,
): Extract<Favourite, { kind: K }>[] {
  const all = useFavourites();
  return useMemo(
    () =>
      all.filter(
        (favourite): favourite is Extract<Favourite, { kind: K }> =>
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
 *
 * Signed in or not makes no difference here — a guest's favourites are kept in
 * the browser — except while the session is still being checked, when there is
 * no telling yet which list a press would change, and the star waits.
 */
export function useFavouriteState(draft: FavouriteDraft | null): {
  saved: boolean;
  /** The stored row, when there is one — a rename or a removal needs its id. */
  savedItem: Favourite | null;
  full: boolean;
  /** The session is still being checked; the star waits rather than guessing. */
  waiting: boolean;
  blocked: boolean;
} {
  const all = useFavourites();
  const { checking } = useSession();

  return useMemo(() => {
    if (draft === null) {
      return { saved: false, savedItem: null, full: false, waiting: checking, blocked: true };
    }

    const key = identity(draft);
    const savedItem = all.find((entry) => identity(entry) === key) ?? null;
    const saved = savedItem !== null;
    const full = !hasRoomFor(draft.kind);

    return {
      saved,
      savedItem,
      full,
      waiting: checking,
      /*
       * Refused outright — unlike waiting, which is only "not yet". A star on
       * something already saved is never blocked: it can always be un-saved.
       */
      blocked: !saved && full,
    };
    // `all` is the snapshot; the helpers read the same module value.
  }, [all, draft, checking]);
}

/** How many of a kind are saved. */
export function useKindCount(kind: FavouriteKind): number {
  useFavourites();
  return countOfKind(kind);
}
