import {
  addCard,
  listCards,
  payFare,
  refreshCard,
  removeCard,
  renameCard,
  topUpCard,
  type AddCardInput,
} from '../../api/cards';
import { ApiError, isApiError, isUnauthorized } from '../../api/errors';
import { sessionExpired } from '../../auth/sessionStore';
import type { TravelCard } from '../../types/card';

/**
 * Every card on the account, for the whole app.
 *
 * A module-level store with a set of listeners, the same shape as
 * `favouritesStore.ts` and `sessionStore.ts` — no state library, consistent
 * with everything else here.
 *
 * **Nothing is kept on the device, and the balance is the reason.** The old
 * device-local version stored a number and a nickname and deliberately never a
 * balance, because a stored balance goes stale the moment it is spent with
 * nothing on screen to say so. The server now holds all three, which makes
 * that distinction moot and the local copy pointless: the balance has to be
 * fetched to be true, and once it is fetched there is nothing left worth
 * caching.
 */

export type WalletStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface WalletState {
  status: WalletStatus;
  cards: readonly TravelCard[];
  /** Why the last load failed, for a surface that has to say so. */
  error: ApiError | null;
}

const EMPTY: WalletState = { status: 'idle', cards: [], error: null };

let state: WalletState = EMPTY;

/** Distinguishes a load from a *later* one, so a stale answer cannot land. */
let requestId = 0;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Replaces the state and tells everyone.
 *
 * The object reference changes only here, which is what {@link getWallet}
 * relies on: `useSyncExternalStore` compares snapshots by reference, so
 * returning a fresh object on every read would re-render forever.
 */
function commit(next: WalletState): void {
  state = next;
  announce();
}

export function subscribeToCards(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The wallet as it stands. Returns the held object, never a fresh one. */
export function getWallet(): WalletState {
  return state;
}

/**
 * Turns an expired session into one, and re-throws everything else.
 *
 * Shared by every write so none of them can forget: a cookie can lapse between
 * any two requests, and a page that kept reporting authorisation errors while
 * still claiming somebody was signed in would be asking the reader to work out
 * what happened.
 */
function rethrow(error: unknown): never {
  if (isUnauthorized(error)) {
    sessionExpired();
    forgetCards();
  }
  throw error;
}

/**
 * Fetches the wallet, superseding any load already in flight.
 *
 * A 401 is **not** a failure to report: it means the session went away, which
 * the session store is told about so the whole app can stop claiming somebody
 * is signed in. The wallet goes back to idle rather than to failed, because
 * there is nothing wrong — there is simply nobody to have cards.
 */
export async function loadCards(): Promise<void> {
  const id = ++requestId;
  commit({ status: 'loading', cards: state.cards, error: null });

  try {
    const cards = await listCards();
    if (id !== requestId) return;
    commit({ status: 'ready', cards, error: null });
  } catch (error: unknown) {
    if (id !== requestId) return;

    if (isUnauthorized(error)) {
      sessionExpired();
      commit(EMPTY);
      return;
    }

    commit({ status: 'failed', cards: [], error: isApiError(error) ? error : null });
  }
}

/**
 * Drops the wallet without asking for another.
 *
 * What signing out does. Somebody else's balance must never appear under a new
 * name, which is the failure mode of keeping a list around "until it is
 * replaced".
 */
export function forgetCards(): void {
  requestId += 1;
  commit(EMPTY);
}

/**
 * Puts one card's new state into the list, in place.
 *
 * Every write except the add and the removal answers with the whole card, so
 * the list is patched rather than refetched: a top-up already knows the new
 * balance and the new history row, and asking for all five cards again to
 * learn what one of them just told us would be a round trip for nothing.
 *
 * **Position is preserved.** The server sorts by creation date, so replacing
 * in place matches the order a refetch would produce — while appending or
 * unshifting would move a card somebody is reading.
 */
function replace(card: TravelCard): void {
  requestId += 1;
  commit({
    status: 'ready',
    cards: state.cards.map((existing) => (existing.id === card.id ? card : existing)),
    error: null,
  });
}

/**
 * Issues a new card.
 *
 * Returned so the page can select it: the number is minted by the server, so
 * until this resolves there is nothing to select, and the card somebody just
 * created is the one they want to look at.
 *
 * Prepended rather than appended, matching the server's own newest-first sort
 * — so the list is in the same order it would be after a refetch.
 */
export async function createCard(input: AddCardInput): Promise<TravelCard> {
  try {
    const card = await addCard(input);
    requestId += 1;
    commit({ status: 'ready', cards: [card, ...state.cards], error: null });
    return card;
  } catch (error: unknown) {
    rethrow(error);
  }
}

export async function discardCard(id: string): Promise<void> {
  try {
    await removeCard(id);
    requestId += 1;
    commit({
      status: 'ready',
      cards: state.cards.filter((card) => card.id !== id),
      error: null,
    });
  } catch (error: unknown) {
    rethrow(error);
  }
}

export async function rename(id: string, nickname: string): Promise<void> {
  try {
    replace(await renameCard(id, nickname));
  } catch (error: unknown) {
    rethrow(error);
  }
}

/** Adds money. `amount` is the text the reader typed — see `topUpCard`. */
export async function topUp(id: string, amount: string): Promise<void> {
  try {
    replace(await topUpCard(id, amount));
  } catch (error: unknown) {
    rethrow(error);
  }
}

/** Spends from the card, as a gate would. */
export async function spend(id: string, amount: string): Promise<void> {
  try {
    replace(await payFare(id, amount));
  } catch (error: unknown) {
    rethrow(error);
  }
}

/**
 * Re-reads one card.
 *
 * By number rather than by id, because that is the endpoint the API offers for
 * a single card. The number comes from the card already in the list, so the
 * "you do not own this card" 401 that endpoint can also produce is
 * unreachable here.
 */
export async function refresh(number: string): Promise<void> {
  try {
    replace(await refreshCard(number));
  } catch (error: unknown) {
    rethrow(error);
  }
}
