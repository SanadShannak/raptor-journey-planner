/**
 * Travel-card inquiry.
 *
 * ---------------------------------------------------------------------------
 * **The backend for this does not exist yet.** Everything below the boundary
 * is a stand-in, and it is deliberately shaped like the real thing so that
 * swapping it is one function body rather than a rewrite of the page:
 *
 * - it is async and can be aborted, like every other client here;
 * - it fails with `ApiError`, carrying a `code` the i18n layer already maps;
 * - "no such card" is an error code rather than a null, because that is how
 *   this API reports outcomes.
 *
 * When `GET /api/card/:number` lands, delete `STUB_CARDS` and the delay, and
 * put a `getJson` call in `lookupCard`. Nothing outside this file changes.
 * ---------------------------------------------------------------------------
 */

import { ApiError } from './errors';
import { digitsOf, formatCardNumber, isCompleteCardNumber } from '../features/card/cardNumber';
import type { TravelCard } from '../types/card';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/** The code a real backend would send for a number it does not hold. */
export const CARD_NOT_FOUND = 'CARD_NOT_FOUND';

/**
 * Cards this stand-in knows about, keyed by their digits.
 *
 * Three of them, chosen so every state the page has to render is reachable
 * without a backend: a healthy balance, an empty card, and one that has never
 * been used and so has no date to show.
 */
const STUB_CARDS: Record<string, Omit<TravelCard, 'number'>> = {
  '12345678901': { balance: 10.7, lastUsedDate: '2026-08-23' },
  '99999999999': { balance: 1.3, lastUsedDate: '2026-08-11' },
  '11111111111': { balance: 0, lastUsedDate: null },
};

/**
 * How long the stand-in pretends to take.
 *
 * Not realism for its own sake: a lookup that returns in the same frame as the
 * press means the loading state is never seen, and a state nobody has looked
 * at is a state nobody has designed. The real endpoint will not be instant
 * either.
 */
const STUB_DELAY_MS = 500;

/**
 * The balance on a card.
 *
 * @param cardNumber As typed — grouped or not; only the digits are read.
 */
export async function lookupCard(
  cardNumber: string,
  options: CallOptions = {},
): Promise<TravelCard> {
  if (!isCompleteCardNumber(cardNumber)) {
    throw new ApiError('malformed', 'Card number is not eleven digits.');
  }

  const digits = digitsOf(cardNumber);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, STUB_DELAY_MS);
    // Aborting has to actually stop the wait, or a page that has moved on
    // still resolves into state nobody is looking at any more.
    options.signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });

  const found = STUB_CARDS[digits];
  if (found === undefined) {
    throw new ApiError('http', 'Card not found.', {
      status: 404,
      code: CARD_NOT_FOUND,
    });
  }

  return { number: formatCardNumber(digits), ...found };
}
