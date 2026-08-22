/**
 * Reads what someone types into the field.
 *
 * Accepts what people actually write: `9`, `9:5`, `0930`, `9.30`, and any of
 * those followed by am or pm. The strictness belongs at the boundary, not in
 * the person's fingers.
 *
 * Returns 24-hour `HH:mm`, or null when it cannot be read as a time at all.
 */
export function parseTypedTime(input: string): string | null {
  const cleaned = input.trim().toLowerCase();
  if (cleaned === '') return null;

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
