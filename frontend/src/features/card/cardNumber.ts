/**
 * The number printed on a travel card: `XXXXX-XXXXX-X`.
 *
 * Eleven digits in three groups. The groups are punctuation rather than
 * meaning — they exist so a human can read a long number back off a card
 * without losing their place — so everything here works on the digits and puts
 * the dashes back only for display.
 *
 * That distinction is what lets somebody paste `12345 67890 1`, or type it
 * with no dashes at all, and still be understood. A form that only accepts one
 * transcription of a number is a form that rejects people for punctuation.
 */

/** Digits per group, in order. */
const GROUPS = [5, 5, 1] as const;

export const CARD_NUMBER_LENGTH = GROUPS.reduce((sum, size) => sum + size, 0);

/** Just the digits, whatever separators or spaces came with them. */
export function digitsOf(input: string): string {
  return input.replace(/\D/g, '').slice(0, CARD_NUMBER_LENGTH);
}

/**
 * The digits, grouped for reading.
 *
 * Formats whatever it is given, complete or not, so it can run on every
 * keystroke: the dash appears as the fifth digit is typed rather than being
 * something the reader has to enter. A trailing dash is never added — it would
 * sit under the caret and be deleted by the next backspace, which makes the
 * field feel like it is fighting back.
 */
export function formatCardNumber(input: string): string {
  const digits = digitsOf(input);

  const parts: string[] = [];
  let at = 0;
  for (const size of GROUPS) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }

  return parts.join('-');
}

/** Whether this is a whole card number, and therefore worth asking about. */
export function isCompleteCardNumber(input: string): boolean {
  return digitsOf(input).length === CARD_NUMBER_LENGTH;
}

/**
 * What is wrong with it, or null when nothing is.
 *
 * `'empty'` is kept apart from `'incomplete'` because they deserve different
 * words: one is a field nobody has filled in, the other is a number somebody
 * is halfway through. Telling someone their empty field is "too short" is a
 * complaint about work they have not started.
 */
export type CardNumberProblem = 'empty' | 'incomplete';

export function cardNumberProblem(input: string): CardNumberProblem | null {
  const digits = digitsOf(input);
  if (digits.length === 0) return 'empty';
  if (digits.length < CARD_NUMBER_LENGTH) return 'incomplete';
  return null;
}
