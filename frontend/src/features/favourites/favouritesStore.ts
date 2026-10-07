import {
  addSavedItem,
  getSavedItems,
  removeSavedItem,
  renameSavedItem,
  type SavedItems,
} from '../../api/savedItems';
import { ApiError, isApiError, isUnauthorized } from '../../api/errors';
import { sessionExpired } from '../../auth/sessionStore';
import {
  FAVOURITES_PER_KIND,
  identity,
  type Favourite,
  type FavouriteDraft,
  type FavouriteKind,
} from './favourite';

/**
 * Every saved favourite, for the whole app.
 *
 * A module-level store with a set of listeners, the same shape as
 * `backendHealth.ts` and `sessionStore.ts` — no state library, consistent with
 * everything else here. What changed with accounts is where the list lives:
 * it used to be read synchronously out of `localStorage` at import time, and
 * is now fetched, which is why this module has a status and an error where it
 * previously had neither. Every surface that reads it needs the three states
 * CLAUDE.md asks of any async surface, and they have to come from somewhere.
 *
 * The list is **not cached across sessions**. A favourite is now a row on an
 * account rather than a note on a device, so the device has no business
 * keeping a copy: a stale list would be wrong for anybody who signed in
 * elsewhere, and right only for the one case the server already answers
 * quickly.
 */

export type SavedStatus =
  /** Nobody has asked yet, or the account changed and the answer was dropped. */
  | 'idle'
  | 'loading'
  | 'ready'
  /** The request failed for a reason that was not an expired session. */
  | 'failed';

interface SavedState {
  status: SavedStatus;
  items: readonly Favourite[];
  /** Why the last load failed, for a surface that has to say so. */
  error: ApiError | null;
}

const EMPTY: SavedState = { status: 'idle', items: [], error: null };

let state: SavedState = EMPTY;

/** Distinguishes a load from a *later* one, so a stale answer cannot land. */
let requestId = 0;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Replaces the state and tells everyone.
 *
 * The object reference changes only here, which is what {@link getSavedState}
 * relies on: `useSyncExternalStore` compares snapshots by reference, so
 * returning a fresh object on every read would re-render forever.
 */
function commit(next: SavedState): void {
  state = next;
  announce();
}

export function subscribeToFavourites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The state as it stands. Returns the held object, never a fresh one. */
export function getSavedState(): SavedState {
  return state;
}

/**
 * The list as it stands.
 *
 * Kept as its own reader because most call sites want only the array, and
 * handing them the whole state object would make every one of them re-render
 * when the status changed underneath an unchanged list.
 */
export function getFavourites(): readonly Favourite[] {
  return state.items;
}

/* ------------------------------------------------------- the local ordering */

/**
 * The reader's own arrangement, for as long as the tab lives.
 *
 * **This is the one piece of local state the account could not take over, and
 * it is a limitation rather than a design.** The subdocuments carry no order
 * field, so `GET /api/user/saved-*` answers in insertion order and there is
 * nowhere to record that somebody dragged their third saved stop to the front.
 *
 * A module-level value rather than storage of any kind, which is the same
 * distinction `plannerMemory.ts` draws and for a weaker version of the same
 * reason: it survives every navigation inside the app, because the tab keeps
 * running the same JavaScript, and it does not survive a reload. Persisting it
 * would mean a device-local opinion about an account-held list — wrong on the
 * next machine, and silently diverging from whatever order a second tab had
 * settled on.
 *
 * It is applied to **every** server answer, not just the first. Each mutation
 * returns the whole user, so without this a rename would snap the row back to
 * insertion order and look like the drag had been undone by the rename.
 *
 * Adding an `order` field to the subdocuments, or accepting one on the rename
 * endpoint, is what it would take to make this durable.
 */
let preferredOrder: readonly string[] = [];

/**
 * Sorts a kind's rows by the local arrangement, keeping the rest as they came.
 *
 * Anything the reader has never moved has no entry, and sorts after everything
 * they have — so a newly saved favourite appears at the end of its row rather
 * than jumping into the middle of an arrangement somebody made on purpose.
 */
function applyPreferredOrder(items: readonly Favourite[]): readonly Favourite[] {
  if (preferredOrder.length === 0) return items;

  const rank = new Map(preferredOrder.map((key, index) => [key, index]));
  const positionOf = (favourite: Favourite): number =>
    rank.get(identity(favourite)) ?? Number.MAX_SAFE_INTEGER;

  /*
   * Index as the tie-break, which keeps this a *stable* sort across engines
   * rather than relying on one. Two rows the reader has never moved must stay
   * in the order the server sent them.
   */
  return items
    .map((favourite, index) => ({ favourite, index, position: positionOf(favourite) }))
    .sort((a, b) => a.position - b.position || a.index - b.index)
    .map((entry) => entry.favourite);
}

/** Records the arrangement as it now stands, so the next answer can reproduce it. */
function rememberOrder(items: readonly Favourite[]): void {
  preferredOrder = items.map(identity);
}

/* ----------------------------------------------------------------- reading */

/**
 * The three lists, flattened into the one array the page draws from.
 *
 * Flat rather than grouped because `identity` is unique across kinds and the
 * page already filters by kind to lay out its rows — and because the drag
 * loop, the FLIP animation and the React keys all want one sequence.
 */
function flatten(items: SavedItems): readonly Favourite[] {
  return applyPreferredOrder([...items.stops, ...items.routes, ...items.itineraries]);
}

/**
 * Fetches the list, superseding any load already in flight.
 *
 * A 401 is **not** a failure to report: it means the session went away, which
 * the session store is told about so the whole app can stop claiming somebody
 * is signed in. The list goes back to idle rather than to failed, because
 * there is nothing wrong — there is simply nobody to have favourites.
 */
export async function loadFavourites(): Promise<void> {
  const id = ++requestId;
  commit({ status: 'loading', items: state.items, error: null });

  try {
    const items = await getSavedItems();
    if (id !== requestId) return;
    const ordered = flatten(items);
    rememberOrder(ordered);
    commit({ status: 'ready', items: ordered, error: null });
  } catch (error: unknown) {
    if (id !== requestId) return;

    if (isUnauthorized(error)) {
      sessionExpired();
      commit(EMPTY);
      return;
    }

    commit({
      status: 'failed',
      items: [],
      error: isApiError(error) ? error : null,
    });
  }
}

/**
 * Drops the list without asking for another.
 *
 * What signing out does. The next sign-in loads afresh, so one account's
 * favourites can never be shown under another's name — which is the failure
 * mode of keeping a list around "until it is replaced".
 */
export function forgetFavourites(): void {
  requestId += 1;
  preferredOrder = [];
  commit(EMPTY);
}

/* ---------------------------------------------------------------- queries */

export function isFavourite(key: string): boolean {
  return state.items.some((favourite) => identity(favourite) === key);
}

/** The saved row matching a content key, or null — what a rename needs an id from. */
export function findFavourite(key: string): Favourite | null {
  return state.items.find((favourite) => identity(favourite) === key) ?? null;
}

export function countOfKind(kind: FavouriteKind): number {
  return state.items.filter((favourite) => favourite.kind === kind).length;
}

/**
 * Whether another of this kind would fit.
 *
 * Advisory only. The server decides, with a 422, and it is the authority: this
 * count is read from a list that is always a little behind. It exists so the
 * star can explain itself *before* a press rather than only after one.
 */
export function hasRoomFor(kind: FavouriteKind): boolean {
  return countOfKind(kind) < FAVOURITES_PER_KIND;
}

/* ----------------------------------------------------------------- writes */

/**
 * Applies a mutation's response.
 *
 * Every write returns the whole user, so all three lists are replaced at once
 * — a rename cannot leave the other two kinds showing what they showed before.
 * The local arrangement is re-applied on the way in; see {@link preferredOrder}.
 */
function accept(items: SavedItems): void {
  requestId += 1;
  const ordered = flatten(items);
  // Re-recorded, like a load does, so the two paths cannot drift: whatever
  // position a newly saved favourite lands in is the one it keeps.
  rememberOrder(ordered);
  commit({ status: 'ready', items: ordered, error: null });
}

/**
 * Turns an expired session into one, and re-throws everything else.
 *
 * Shared by the three writes so none of them can forget: a cookie can lapse
 * between any two requests, and a store that kept reporting authorisation
 * errors on a page that still claimed somebody was signed in would be asking
 * the reader to work out what happened.
 */
function rethrow(error: unknown): never {
  if (isUnauthorized(error)) {
    sessionExpired();
    forgetFavourites();
  }
  throw error;
}

/**
 * Saves one.
 *
 * Rejects with the API's `ApiError` so the caller can say *why* — already
 * saved, kind full, stop not in this dataset — rather than appearing to do
 * nothing. Nothing is written optimistically: the server assigns the id and
 * the default nickname, and a row drawn before it answered would have neither,
 * so it could not be renamed or removed until a refresh.
 */
export async function saveFavourite(draft: FavouriteDraft): Promise<void> {
  try {
    accept(await addSavedItem(draft));
  } catch (error: unknown) {
    rethrow(error);
  }
}

export async function removeFavourite(
  kind: FavouriteKind,
  itemId: string,
): Promise<void> {
  try {
    accept(await removeSavedItem(kind, itemId));
  } catch (error: unknown) {
    rethrow(error);
  }
}

/**
 * Saves it, or removes it if this exact thing is already saved.
 *
 * Returns what the star should now show, so a caller does not have to re-read
 * the store to find out whether its press added or removed.
 */
export async function toggleFavourite(draft: FavouriteDraft): Promise<boolean> {
  const existing = findFavourite(identity(draft));
  if (existing !== null) {
    await removeFavourite(existing.kind, existing.id);
    return false;
  }
  await saveFavourite(draft);
  return true;
}

/**
 * Renames one.
 *
 * There is no "clear the name back to the one it came with" any more: the
 * server supplies the default at the moment of saving and has no endpoint for
 * restoring it, so an empty field is refused rather than silently doing
 * something else. `renameSavedItem` is where that refusal lives.
 */
export async function renameFavourite(
  kind: FavouriteKind,
  itemId: string,
  nickname: string,
): Promise<void> {
  try {
    accept(await renameSavedItem(kind, itemId, nickname));
  } catch (error: unknown) {
    rethrow(error);
  }
}

/* --------------------------------------------------------------- ordering */

/**
 * Moves one up or down **within its own kind**.
 *
 * The groups are drawn separately, so a swap with the adjacent entry in the
 * flat array would look like nothing happening whenever the neighbour is of a
 * different kind. Both positions are found among that kind's own entries, then
 * translated back to the flat array.
 *
 * Local to the tab — see {@link preferredOrder}.
 */
export function moveFavourite(key: string, direction: -1 | 1): void {
  const target = state.items.find((favourite) => identity(favourite) === key);
  if (target === undefined) return;

  const sameKind = state.items.filter((favourite) => favourite.kind === target.kind);
  const from = sameKind.indexOf(target);
  const to = from + direction;
  if (to < 0 || to >= sameKind.length) return;

  const partner = sameKind[to];
  if (partner === undefined) return;

  const fromFlat = state.items.indexOf(target);
  const toFlat = state.items.indexOf(partner);

  const next = [...state.items];
  next[fromFlat] = partner;
  next[toFlat] = target;

  rememberOrder(next);
  commit({ ...state, items: next });
}

/**
 * Drops one favourite where another currently sits, within its own kind.
 *
 * What a drag actually asks for. {@link moveFavourite} steps one place at a
 * time, which is right for a keyboard and wrong for a pointer: dragging the
 * fifth card onto the first is one gesture, not four.
 *
 * The two are constrained the same way — a card only ever moves among its own
 * kind, because the kinds are drawn as separate rows and a card cannot be
 * dragged out of the row it lives in.
 */
export function reorderFavourite(key: string, targetKey: string): void {
  if (key === targetKey) return;

  const moving = state.items.find((favourite) => identity(favourite) === key);
  const target = state.items.find((favourite) => identity(favourite) === targetKey);
  if (moving === undefined || target === undefined) return;
  if (moving.kind !== target.kind) return;

  /*
   * The flat array holds every kind interleaved, so the reorder happens on
   * this kind's own sequence and is then written back into exactly the slots
   * that sequence occupied. Nothing of another kind moves.
   */
  const slots: number[] = [];
  const order: Favourite[] = [];
  state.items.forEach((favourite, index) => {
    if (favourite.kind !== moving.kind) return;
    slots.push(index);
    order.push(favourite);
  });

  const from = order.indexOf(moving);
  const to = order.indexOf(target);
  if (from === -1 || to === -1) return;

  order.splice(from, 1);
  order.splice(to, 0, moving);

  const next = [...state.items];
  slots.forEach((slot, position) => {
    const favourite = order[position];
    if (favourite !== undefined) next[slot] = favourite;
  });

  rememberOrder(next);
  commit({ ...state, items: next });
}
