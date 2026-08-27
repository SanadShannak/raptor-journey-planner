import {
  FAVOURITES_PER_KIND,
  identity,
  type Favourite,
  type FavouriteKind,
} from './favourite';
import {
  FAVOURITES_STORAGE_KEY,
  readFavourites,
  writeFavourites,
} from './favouritesStorage';

/**
 * Every saved favourite, for the whole app.
 *
 * A module-level store with a set of listeners, the same shape as
 * `backendHealth.ts` and `navigationDepth.ts` — no state library, consistent
 * with everything else here. It differs from `plannerMemory.ts` in the one way
 * that matters: this one *is* persisted, because a favourite that did not
 * survive a reload would not be a favourite.
 *
 * Order is the array's own order, and it is the reader's to change. New entries
 * are appended rather than unshifted, so saving something never disturbs an
 * arrangement somebody made on purpose.
 */

let items: readonly Favourite[] = readFavourites();

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Replaces the list, persists it, and tells everyone.
 *
 * The array reference changes only here, which is what
 * {@link getFavourites} relies on.
 */
function commit(next: readonly Favourite[]): void {
  items = next;
  writeFavourites(next);
  announce();
}

export function subscribeToFavourites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The list as it stands.
 *
 * **Returns the held array, never a fresh one.** `useSyncExternalStore`
 * compares snapshots by reference and re-renders when they differ, so building
 * a new array here — even an identical one — would re-render forever. Every
 * derived view (grouping, filtering) belongs in a `useMemo` at the call site,
 * not in this function.
 */
export function getFavourites(): readonly Favourite[] {
  return items;
}

export function isFavourite(key: string): boolean {
  return items.some((favourite) => identity(favourite) === key);
}

export function countOfKind(kind: FavouriteKind): number {
  return items.filter((favourite) => favourite.kind === kind).length;
}

/** Whether another of this kind would fit. */
export function hasRoomFor(kind: FavouriteKind): boolean {
  return countOfKind(kind) < FAVOURITES_PER_KIND;
}

/**
 * Saves one, unless it is already saved or its kind is full.
 *
 * Returns whether it was added, so a caller can explain a refusal rather than
 * appearing to do nothing. Saving something already saved is a no-op rather
 * than a duplicate or an error — pressing a full star twice is not a mistake
 * worth reporting.
 */
export function addFavourite(favourite: Favourite): boolean {
  if (isFavourite(identity(favourite))) return false;
  if (!hasRoomFor(favourite.kind)) return false;

  commit([...items, favourite]);
  return true;
}

export function removeFavourite(key: string): void {
  const next = items.filter((favourite) => identity(favourite) !== key);
  if (next.length === items.length) return;
  commit(next);
}

/** Adds it, or removes it if it is already there. Returns the new state. */
export function toggleFavourite(favourite: Favourite): boolean {
  const key = identity(favourite);
  if (isFavourite(key)) {
    removeFavourite(key);
    return false;
  }
  return addFavourite(favourite);
}

/**
 * Renames one, or clears the name back to the one it came with.
 *
 * A name of only spaces is stored as null rather than as whitespace, so an
 * emptied field reliably restores the original label instead of leaving a row
 * that looks untitled.
 */
export function renameFavourite(key: string, nickname: string): void {
  const trimmed = nickname.trim();
  const next = items.map((favourite) =>
    identity(favourite) === key
      ? { ...favourite, nickname: trimmed === '' ? null : trimmed }
      : favourite,
  );
  commit(next);
}

/**
 * Moves one up or down **within its own kind**.
 *
 * The groups are drawn separately, so a swap with the adjacent entry in the
 * flat array would look like nothing happening whenever the neighbour is of a
 * different kind. Both positions are found among that kind's own entries, then
 * translated back to the flat array.
 */
export function moveFavourite(key: string, direction: -1 | 1): void {
  const target = items.find((favourite) => identity(favourite) === key);
  if (target === undefined) return;

  const sameKind = items.filter((favourite) => favourite.kind === target.kind);
  const from = sameKind.indexOf(target);
  const to = from + direction;
  if (to < 0 || to >= sameKind.length) return;

  const partner = sameKind[to];
  if (partner === undefined) return;

  const fromFlat = items.indexOf(target);
  const toFlat = items.indexOf(partner);

  const next = [...items];
  next[fromFlat] = partner;
  next[toFlat] = target;
  commit(next);
}

/**
 * Keeps a stored copy in step with what the network now says.
 *
 * A stop gets renamed, a line's long name changes. The saved fields are a cache
 * so the row can paint before anything answers, and this is how that cache
 * heals: whatever a live response says wins. A no-op when nothing actually
 * differs, so it cannot loop a component that calls it from an effect.
 */
export function refreshFavourite(key: string, patch: Partial<Favourite>): void {
  const current = items.find((favourite) => identity(favourite) === key);
  if (current === undefined) return;

  const merged = { ...current, ...patch } as Favourite;

  // Identity must not move underneath a favourite — patching is for labels.
  if (identity(merged) !== key) return;

  /*
   * Key order is stable — `merged` is `current` spread first, and a patch only
   * ever carries keys `current` already has — so comparing the serialised form
   * is a sound "did anything actually move" test.
   */
  if (JSON.stringify(merged) === JSON.stringify(current)) return;

  commit(items.map((favourite) => (identity(favourite) === key ? merged : favourite)));
}

/**
 * Another tab changed the list.
 *
 * Favourites are durable and long-lived, so two open tabs disagreeing is a real
 * thing somebody would notice. The event fires only in the *other* tabs, so
 * this never fights the write that caused it.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== FAVOURITES_STORAGE_KEY) return;
    items = readFavourites();
    announce();
  });
}

/** For tests, which share one module across a file. */
export function forgetFavourites(): void {
  items = [];
  writeFavourites(items);
  announce();
}
