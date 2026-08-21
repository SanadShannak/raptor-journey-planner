/**
 * Duration and distance formatting.
 *
 * Separate from `translate.ts` because these need the dictionary, and
 * `translate.ts` deliberately does not depend on it — it resolves whatever
 * message it is handed.
 *
 * `Intl.DurationFormat` would do the duration job natively, but it lands in
 * Chrome 129 and Safari 16.4, well past the browser baseline in
 * `vite.config.ts`. These are a few lines instead.
 */

import type { Dictionary, Locale, Message } from './dictionary';
import { formatNumber, type MessageValues } from './translate';

/**
 * What both formatters need from the active locale.
 *
 * Declared structurally rather than imported from `localeContext` so this
 * module stays independent of React — but `useLocale()`'s return value
 * satisfies it, so callers pass it straight through.
 */
export interface UnitFormatContext {
  locale: Locale;
  strings: Dictionary;
  t: (message: Message, values?: MessageValues) => string;
}

const MINUTES_PER_HOUR = 60;

/** Below this, distance reads in metres; at or above it, in kilometres. */
const METRES_IN_A_KILOMETRE = 1000;

/**
 * Formats a whole number of minutes as an abbreviated duration.
 *
 * The API already rounds durations to whole minutes with a floor of 1, so
 * there is nothing to round here.
 */
export function formatDuration(minutes: number, ctx: UnitFormatContext): string {
  const { locale, strings, t } = ctx;
  const safeMinutes = Math.max(0, Math.round(minutes));

  if (safeMinutes < MINUTES_PER_HOUR) {
    return t(strings.units.minutes, { minutes: formatNumber(safeMinutes, locale) });
  }

  const hours = Math.floor(safeMinutes / MINUTES_PER_HOUR);
  const remainder = safeMinutes % MINUTES_PER_HOUR;

  if (remainder === 0) {
    return t(strings.units.hours, { hours: formatNumber(hours, locale) });
  }

  return t(strings.units.hoursMinutes, {
    hours: formatNumber(hours, locale),
    minutes: formatNumber(remainder, locale),
  });
}

/**
 * Formats a distance in metres.
 *
 * The API rounds distances to the nearest 50 m with a floor of 50, so metre
 * values are already coarse; kilometres get one decimal place, which is the
 * most precision those inputs can justify.
 */
export function formatDistance(meters: number, ctx: UnitFormatContext): string {
  const { locale, strings, t } = ctx;
  const safeMeters = Math.max(0, meters);

  if (safeMeters < METRES_IN_A_KILOMETRE) {
    return t(strings.units.meters, {
      meters: formatNumber(Math.round(safeMeters), locale),
    });
  }

  return t(strings.units.kilometers, {
    kilometers: formatNumber(safeMeters / METRES_IN_A_KILOMETRE, locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  });
}
