/**
 * Travel-card inquiry.
 *
 * The only endpoint in this app backed by a database rather than by the
 * compiled feed, which is why it is the only one that can be unavailable on its
 * own — `CARD_STORE_UNAVAILABLE` is a real answer and means "this part is down",
 * not "your card is wrong".
 */

import { getJson } from './client';
import { ApiError } from './errors';
import { digitsOf, isCompleteCardNumber } from '../features/card/cardNumber';
import type { CardUsage, TravelCard } from '../types/card';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/** No card has that number — almost always a mistyped digit, not a fault. */
export const CARD_NOT_FOUND = 'CARD_NOT_FOUND';

/**
 * The balance on a card.
 *
 * @param cardNumber As typed — grouped or not. Only the digits identify a card;
 *   the `XXXXX-XXXXX-X` grouping is punctuation for reading it aloud.
 */
/** A movement of the balance, or null when it is too broken to draw a row. */
function toUsage(raw: unknown): CardUsage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const usage = raw as Record<string, unknown>;

  const amount = usage['amount'];
  const kind = usage['kind'];

  // A row with no amount or no direction says nothing; a row with no date can
  // still be shown, because the amount is the part being read.
  if (typeof amount !== 'number' || (kind !== 'fare' && kind !== 'topUp')) return null;

  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  return {
    date: text(usage['date']),
    time: text(usage['time']),
    amount,
    kind,
    description: text(usage['description']),
  };
}

export async function lookupCard(
  cardNumber: string,
  options: CallOptions = {},
): Promise<TravelCard> {
  /*
   * Checked here rather than sent. A short number is a question the backend
   * would refuse anyway, and answering it locally means no round trip and no
   * flash of a loading state on the way to an error the form already knew
   * about.
   */
  if (!isCompleteCardNumber(cardNumber)) {
    throw new ApiError('malformed', 'Card number is not eleven digits.');
  }

  const body = await getJson(`/api/card/${encodeURIComponent(digitsOf(cardNumber))}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const card = (typeof body === 'object' && body !== null ? body : {}) as Record<
    string,
    unknown
  >;

  const number = card['number'];
  const balance = card['balance'];

  /*
   * A balance is the whole answer, so a response without a readable one is not
   * a card with an unknown balance — it is a response this app cannot read, and
   * saying so is better than rendering a blank where a number belongs.
   */
  if (typeof number !== 'string' || typeof balance !== 'number') {
    throw new ApiError('malformed', 'Card response carried no balance.');
  }

  const usages = Array.isArray(card['usages']) ? card['usages'] : [];

  return {
    number,
    balance,
    lastUsedDate: typeof card['lastUsedDate'] === 'string' ? card['lastUsedDate'] : null,
    usages: usages.map(toUsage).filter((usage): usage is CardUsage => usage !== null),
  };
}
