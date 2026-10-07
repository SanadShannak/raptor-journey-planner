/**
 * What a reader may type into a money field.
 *
 * The rules are the server's, restated so the form can answer before a round
 * trip: `express-validator` wants `isFloat({ min: 0.01 })` and
 * `/^\d+(\.\d{1,3})?$/`, which together mean a plain non-negative decimal of at
 * most three places that comes to at least one hundredth.
 *
 * Restated rather than inferred from a rejection, for the same reason the card
 * number is checked locally: a short number is a question the backend would
 * refuse anyway, and answering it here means no request and no flash of a
 * pending state on the way to an error the form already knew about. The server
 * stays the authority — it runs the same rules on whatever arrives — so this
 * failing open costs a round trip rather than correctness.
 *
 * **Three decimal places, not two.** The limit belongs to the API rather than
 * to the currency: a euro has two and a dinar has three, and the server accepts
 * three on every network. A field that refused the third place would make fils
 * untypeable on an Amman feed.
 */

/** Accepts `12`, `12.3`, `12.345`. Rejects a sign, a comma, spaces, exponents. */
const SHAPE = /^\d+(\.\d{1,3})?$/;

/** The smallest amount the server will take. */
export const MINIMUM_AMOUNT = 0.01;

/** The most decimal places the server will take. */
export const AMOUNT_PLACES = 3;

/**
 * What is wrong with it, or null when nothing is.
 *
 * `'empty'` is kept apart from the rest because it deserves different words:
 * telling somebody their empty field is "not a valid amount" is a complaint
 * about work they have not started.
 */
export type AmountProblem = 'empty' | 'shape' | 'tooSmall';

export function amountProblem(input: string): AmountProblem | null {
  const trimmed = input.trim();
  if (trimmed === '') return 'empty';
  if (!SHAPE.test(trimmed)) return 'shape';
  if (Number(trimmed) < MINIMUM_AMOUNT) return 'tooSmall';
  return null;
}

/** Whether this is worth sending. */
export function isValidAmount(input: string): boolean {
  return amountProblem(input) === null;
}

/**
 * The amount as the server should see it.
 *
 * Only trimmed — deliberately not reformatted. The server's decimal-places
 * rule tests the string it receives, so normalising `2.5` to `2.500` here
 * would mean the rule no longer tests what the reader wrote, and a value this
 * function had quietly rounded could be rejected for a shape the reader never
 * typed.
 */
export function toAmountPayload(input: string): string {
  return input.trim();
}
