/**
 * Message resolution and locale-aware value formatting.
 *
 * All of this is built on the platform's `Intl` APIs. No i18n library is used:
 * `Intl.PluralRules` already implements CLDR plural selection (including
 * Arabic's six categories), and `Intl.NumberFormat` / `Intl.DateTimeFormat`
 * cover the value formatting. A library would add weight without adding
 * capability at this scale.
 */

import { INTL_LOCALE, type Locale, type Message } from './dictionary';

export type MessageValues = Record<string, string | number>;

/** `Intl` constructors are expensive enough to be worth reusing. */
const pluralRulesCache = new Map<Locale, Intl.PluralRules>();

function pluralRulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[locale]);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/** Substitutes `{name}` placeholders, leaving unknown ones untouched. */
function interpolate(template: string, values: MessageValues): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Resolves a message to a string for the given locale.
 *
 * Plural messages select their form from `values.count`. A message missing the
 * form for its category falls back to `other`, which every dictionary must
 * define.
 */
export function translate(
  message: Message,
  locale: Locale,
  values: MessageValues = {},
): string {
  if (typeof message === 'string') {
    return interpolate(message, values);
  }

  const count = values['count'];
  const category =
    typeof count === 'number' ? pluralRulesFor(locale).select(count) : 'other';

  return interpolate(message[category] ?? message.other, values);
}

/** Formats a number using the locale's numbering system and grouping. */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

/**
 * Parses an API `YYYY-MM-DD` string into a Date in the *local* timezone.
 *
 * `new Date('2026-09-13')` would parse as UTC midnight, which lands on the
 * previous day for anyone west of Greenwich. The API's dates are calendar
 * dates in the network's local time, so they are built from parts instead.
 */
export function parseIsoDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * Formats an API `HH:mm` (or `HH:mm:ss`) string for display.
 *
 * Twelve-hour with a meridiem, in whichever form the locale writes it — "6:03
 * PM" in English, "٦:٠٣ م" in Arabic. A product decision: it is how most
 * people read a departure time, even where timetables are printed in 24-hour.
 *
 * The risk it carries is that "12:40 AM" reads as the wrong end of the day.
 * That is answered elsewhere rather than by the clock: an itinerary whose
 * arrival falls on the next day says so with the date, and every departure the
 * API returns carries its own date for exactly this reason.
 *
 * Only the display changes. Values on the wire stay 24-hour throughout.
 *
 * The time is placed on a fixed reference day rather than parsed from a
 * string, for the same reason `parseIsoDate` builds from parts: a bare time
 * has no date, and letting `Date` invent one invites a timezone shift.
 */
export function formatClockTime(time: string, locale: Locale): string {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return time;

  const [, hours, minutes] = match;
  const reference = new Date(2000, 0, 1, Number(hours), Number(minutes));

  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(reference);
}

/** Formats an API `YYYY-MM-DD` string for display, or returns it unchanged. */
export function formatDate(
  isoDate: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(date);
}

/**
 * The current date and time on a given IANA clock.
 *
 * Every timestamp in this system is wall-clock time in the network's zone, so
 * "today" and "now" have to be asked of that clock rather than the browser's.
 * A visitor in Amman planning a Helsinki journey has a different today for part
 * of every day, and a bare `new Date()` would quietly pick the wrong one.
 *
 * Formatted through `Intl` rather than by arithmetic on a timestamp so that
 * daylight saving is the platform's problem, not ours.
 */
export function nowInZone(timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    time: `${parts['hour']}:${parts['minute']}`,
  };
}
