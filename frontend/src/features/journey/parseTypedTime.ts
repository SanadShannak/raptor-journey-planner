/**
 * Reads what someone types into the field.
 *
 * Accepts what people actually write: `9`, `9:5`, `0930`, `9.30`, and any of
 * those followed by am or pm. The strictness belongs at the boundary, not in
 * the person's fingers.
 *
 * `meridiems` are the locale's own words for the two halves of the day. The
 * field shows the time the way it is displayed, so in Arabic what comes back
 * is "4:54 م" — and without knowing that "م" means pm, the parser would read
 * a perfectly good afternoon as nine hours earlier. English am/pm is always
 * understood as well, since the digits are Latin either way and people type
 * what their keyboard is in.
 *
 * Returns 24-hour `HH:mm`, or null when it cannot be read as a time at all.
 */
export function parseTypedTime(
  input: string,
  meridiems?: { am: string; pm: string },
): string | null {
  let cleaned = input.trim().toLowerCase();
  if (cleaned === '') return null;

  if (meridiems !== undefined) {
    for (const [half, word] of [
      ['am', meridiems.am],
      ['pm', meridiems.pm],
    ] as const) {
      const token = word.trim().toLowerCase();
      // Skipped when the locale already writes them the way the matcher below
      // expects, so "pm" is never rewritten into itself.
      if (token === '' || token === half) continue;
      if (cleaned.endsWith(token)) {
        cleaned = `${cleaned.slice(0, -token.length).trim()} ${half}`;
        break;
      }
    }
  }

  const meridiem = /(^|\s|\d)(am|pm)\.?$/.exec(cleaned)?.[2] ?? null;
  const digits = cleaned.replace(/(am|pm)\.?$/, '').replace(/[^\d]/g, '');
  if (digits.length === 0 || digits.length > 4) return null;

  let hours: number;
  let minutes: number;
  if (digits.length <= 2) {
    hours = Number(digits);
    minutes = 0;
  } else {
    // "930" is 9:30, "0930" is 09:30 — the last two digits are always minutes.
    hours = Number(digits.slice(0, digits.length - 2));
    minutes = Number(digits.slice(-2));
  }

  if (meridiem !== null) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
