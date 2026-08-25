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

/**
 * An amount of money, in whatever the network charges in.
 *
 * Through `Intl` for the usual reason and one more: **how many decimal places
 * a currency has is a property of the currency**, not something to choose. A
 * dinar has three — 1.300 JOD — and a euro two, and hard-coding either would
 * print the wrong thing on half the networks this app can load.
 *
 * With no currency established, a bare number with no symbol at all. Inventing
 * one would state a fact nobody supplied, and a balance in the wrong money is
 * worse than a balance in none.
 *
 * ---------------------------------------------------------------------------
 * One thing here is deliberately *not* what CLDR says.
 *
 * English writes `€1.30` and Arabic writes `1.30 €` — symbol on the side each
 * language puts it, and Arabic separates it with a space. Both are correct, and
 * side by side in one interface they read as an inconsistency rather than as
 * two conventions. So a **symbol** is pulled tight against the number in both.
 *
 * Only a symbol. Where the locale has no symbol it prints the code or an
 * abbreviation — `JOD 1.300` in English, `1.300 د.أ.` in Arabic — and those are
 * words: `JOD1.300` is not tidier, it is harder to read. The test is whether
 * the currency token contains a letter.
 *
 * The *side* is left alone either way. Which side a symbol sits on is not a
 * spacing preference — moving `€` in front of an Arabic number would read as a
 * mistake to somebody who reads Arabic, where the spacing merely reads as
 * tidier. So: `€1.30` and `1.30€`.
 * ---------------------------------------------------------------------------
 */
export function formatMoney(
  amount: number,
  currency: string | null,
  locale: Locale,
  options: { signed?: boolean } = {},
): string {
  if (!Number.isFinite(amount)) return '';

  /*
   * `always` rather than a hand-written "+" or "−": the sign is part of how a
   * locale writes a number, and Arabic's minus is not the ASCII hyphen.
   */
  const sign = options.signed === true ? { signDisplay: 'always' as const } : {};

  if (currency === null) {
    return new Intl.NumberFormat(INTL_LOCALE[locale], sign).format(amount);
  }

  try {
    const parts = new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: 'currency',
      currency,
      ...sign,
    }).formatToParts(amount);

    // A word keeps its space; a symbol does not get one.
    const symbolic =
      !/\p{L}/u.test(parts.find((part) => part.type === 'currency')?.value ?? 'x');

    return parts
      .filter((part, index) => {
        if (!symbolic || part.type !== 'literal') return true;
        /*
         * Whitespace only — never a directional mark. `\s` does not match the
         * RLM and LRM that Arabic formatting wraps its numbers in, and dropping
         * those would let the digits reorder inside a right-to-left sentence.
         */
        if (!/^\s+$/.test(part.value)) return true;
        return (
          parts[index - 1]?.type !== 'currency' && parts[index + 1]?.type !== 'currency'
        );
      })
      .map((part) => part.value)
      .join('');
  } catch {
    /*
     * `Intl` throws on a code it does not recognise, and the code comes from a
     * feed rather than from us. A number the reader can still act on beats an
     * exception thrown out of a render.
     */
    return new Intl.NumberFormat(INTL_LOCALE[locale], sign).format(amount);
  }
}

/**
 * A whole hour, as a heading.
 *
 * The same clock {@link formatClockTime} prints, without the minutes — a
 * timetable's hour headings are "3 PM", not "3:00 PM", and repeating a `:00`
 * down the side of the board is noise beside the real times under it.
 *
 * Through `Intl` like every other time in this app. The hour arrives as the
 * two-digit 24-hour string the API groups by, and writing `${hour}:00` would
 * put a 24-hour clock on a page whose every other time is 12-hour — which is
 * exactly what it used to do.
 */
export function formatClockHour(hour: string, locale: Locale): string {
  // Matched before it is converted: `Number('')` is 0, which is a perfectly
  // valid hour, so an empty string would otherwise print as midnight.
  if (!/^\d{1,2}$/.test(hour)) return hour;

  const parsed = Number(hour);
  if (parsed > 23) return hour;

  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: 'numeric',
    hour12: true,
  }).format(new Date(2000, 0, 1, parsed));
}

/**
 * The locale's own words for the two halves of the day.
 *
 * The time field shows what it displays — "4:54 PM" rather than the 16:54 that
 * goes on the wire — so it has to be able to read back what it printed. Asked
 * of `Intl` rather than kept in the dictionaries: Arabic writes "ص" and "م",
 * and a hand-maintained copy would be free to drift from whatever
 * {@link formatClockTime} actually prints.
 */
export function clockMeridiems(locale: Locale): { am: string; pm: string } {
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: 'numeric',
    hour12: true,
  });

  const at = (hour: number) =>
    format
      .formatToParts(new Date(2000, 0, 1, hour))
      .find((part) => part.type === 'dayPeriod')?.value ?? '';

  return { am: at(9), pm: at(21) };
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
