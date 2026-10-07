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
 * Loads the list when there is an account to load it for, and drops it when
 * there is not.
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
 */
export function useLoadFavourites(): void {
  const { account, signedIn } = useSession();
  const accountId = account?.id ?? null;

  useEffect(() => {
    if (!signedIn || accountId === null) {
      forgetFavourites();
      return;
    }
    void loadFavourites();
  }, [accountId, signedIn]);
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
 * `needsAccount` joins them, because the commonest reason a star cannot act is
 * now that nobody is signed in — and that is a different sentence from "you
 * have five already". It is false while the session is still being checked, so
 * a star does not spend the first moment of every visit claiming an account is
 * needed and then change its mind.
 */
export function useFavouriteState(draft: FavouriteDraft | null): {
  saved: boolean;
  /** The stored row, when there is one — a rename or a removal needs its id. */
  savedItem: Favourite | null;
  full: boolean;
  needsAccount: boolean;
  blocked: boolean;
} {
  const all = useFavourites();
  const { signedIn, checking } = useSession();

  return useMemo(() => {
    const needsAccount = !signedIn && !checking;

    if (draft === null) {
      return {
        saved: false,
        savedItem: null,
        full: false,
        needsAccount,
        blocked: true,
      };
    }

    const key = identity(draft);
    const savedItem = all.find((entry) => identity(entry) === key) ?? null;
    const saved = savedItem !== null;
    const full = !hasRoomFor(draft.kind);

    return {
      saved,
      savedItem,
      full,
      needsAccount,
      /*
       * **The cap only, and deliberately not the session.**
       *
       * Folding "nobody is signed in" in here was a bug worth naming: while
       * the session is still being checked nobody *is* signed in yet, so the
       * star went off and — having no other reason to give — explained itself
       * with "you can save five of each", which is a different and false
       * statement. Needing an account is `needsAccount`, which the star
       * answers by opening the dialog rather than by refusing.
       *
       * Un-saving must also stay possible at the cap, so only a *new* one is
       * refused.
       */
      blocked: !saved && full,
    };
    // `all` is the snapshot; the helpers read the same module value.
  }, [all, draft, signedIn, checking]);
}

/** How many of a kind are saved. */
export function useKindCount(kind: FavouriteKind): number {
  useFavourites();
  return countOfKind(kind);
}
