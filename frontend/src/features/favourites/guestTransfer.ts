import { addSavedItem, renameSavedItem } from '../../api/savedItems';
import { isApiError, isUnauthorized } from '../../api/errors';
import { forgetRegisteredHere, wasRegisteredHere } from '../../auth/registeredHere';
import { identity, type Favourite, type FavouriteDraft } from './favourite';
import { forgetGuestItem, readGuestFavourites } from './guestFavourites';

/**
 * Carries what a guest saved in this browser into the account registered here.
 *
 * Only that account, and only at its first sign-in here — the browser records
 * the address at registration (`registeredHere.ts`), and this compares. A
 * sign-in to any *other* account leaves the guest's favourites in the browser,
 * where they are back the moment that person signs out: they were somebody's
 * before that sign-in, and need not be that account's.
 *
 * One at a time, in the order they were saved, through the same endpoints the
 * star uses — so the server applies every rule it always does. Each one leaves
 * the browser once the account has an answer for it:
 *
 * - **saved**, then given its nickname if it had one;
 * - **already saved**, **over the limit**, or **not in this feed** — refusals
 *   that will not change by asking again, so it is dropped;
 *
 * and anything else — the network, the session ending — stops the transfer
 * with the rest still in the browser and the registration still recorded, so
 * the next load of the list tries again. Only when nothing is left is the
 * registration forgotten.
 *
 * A nickname the account refuses (one already in use) is let go rather than
 * holding up the favourite it belongs to: the favourite is the thing worth
 * keeping, and it arrives with no name, as a fresh save would.
 */

/** Refusals that asking again would only repeat. */
const FINAL = new Set(['ALREADY_SAVED', 'SAVED_LIMIT_REACHED', 'SAVED_ITEM_NOT_FOUND', 'INVALID_SUBMISSION']);

function toDraft(favourite: Favourite): FavouriteDraft {
  switch (favourite.kind) {
    case 'stop':
      return { kind: 'stop', stopId: favourite.stopId };
    case 'route':
      return { kind: 'route', lineId: favourite.lineId, patternId: favourite.patternId };
    case 'itinerary':
      return {
        kind: 'itinerary',
        origin: favourite.origin,
        destination: favourite.destination,
        pace: favourite.pace,
      };
  }
}

async function carry(favourite: Favourite): Promise<void> {
  const items = await addSavedItem(toDraft(favourite));
  if (favourite.nickname === null) return;

  const key = identity(favourite);
  const saved = [...items.stops, ...items.routes, ...items.itineraries].find(
    (item) => identity(item) === key,
  );
  if (saved === undefined) return;

  try {
    await renameSavedItem(saved.kind, saved.id, favourite.nickname);
  } catch (error: unknown) {
    const letGo =
      isApiError(error) &&
      (FINAL.has(error.code ?? '') || error.code === 'DUPLICATE_NICKNAME');
    if (!letGo) throw error;
  }
}

let inFlight: Promise<void> | null = null;

/**
 * Runs the transfer if `email` is the account registered here and the browser
 * has favourites to give it. Never rejects: a transfer that could not finish
 * leaves everything in place to try again, and the list it precedes still
 * loads.
 */
export function transferGuestFavourites(email: string): Promise<void> {
  if (!wasRegisteredHere(email)) return Promise.resolve();
  // Several surfaces load the list at once; they share one transfer.
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<void> {
  for (const favourite of readGuestFavourites()) {
    try {
      await carry(favourite);
    } catch (error: unknown) {
      const final = isApiError(error) && !isUnauthorized(error) && FINAL.has(error.code ?? '');
      if (!final) return;
    }
    forgetGuestItem(favourite);
  }
  forgetRegisteredHere();
}
