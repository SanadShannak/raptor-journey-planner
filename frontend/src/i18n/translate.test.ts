import { describe, expect, it } from 'vitest';
import { formatClockHour, formatDate, formatMoney, formatNumber, parseIsoDate, translate } from './translate';
import { LOCALES, type Locale, type PluralForms } from './dictionary';
import { en } from './en';
import { ar } from './ar';

describe('translate', () => {
  it('interpolates placeholders', () => {
    expect(translate('from {a} to {b}', 'en', { a: 'X', b: 'Y' })).toBe('from X to Y');
  });

  it('leaves unknown placeholders untouched rather than printing undefined', () => {
    expect(translate('{known} {missing}', 'en', { known: 'ok' })).toBe('{known} {missing}'.replace('{known}', 'ok'));
  });

  it('coerces numbers in placeholders', () => {
    expect(translate('{n} days', 'en', { n: 7 })).toBe('7 days');
  });

  const plural: PluralForms = {
    zero: 'zero',
    one: 'one',
    two: 'two',
    few: 'few',
    many: 'many',
    other: 'other',
  };

  it('selects English plural categories', () => {
    expect(translate(plural, 'en', { count: 1 })).toBe('one');
    expect(translate(plural, 'en', { count: 0 })).toBe('other');
    expect(translate(plural, 'en', { count: 60 })).toBe('other');
  });

  // Arabic is the reason plural forms exist here at all: it uses all six CLDR
  // categories, so `count === 1 ? singular : plural` would be wrong five ways.
  it('selects all six Arabic plural categories', () => {
    expect(translate(plural, 'ar', { count: 0 })).toBe('zero');
    expect(translate(plural, 'ar', { count: 1 })).toBe('one');
    expect(translate(plural, 'ar', { count: 2 })).toBe('two');
    expect(translate(plural, 'ar', { count: 3 })).toBe('few');
    expect(translate(plural, 'ar', { count: 11 })).toBe('many');
    expect(translate(plural, 'ar', { count: 100 })).toBe('other');
  });

  it('falls back to `other` when a count is not supplied', () => {
    expect(translate(plural, 'ar')).toBe('other');
  });

  it('falls back to `other` when the selected category is undefined', () => {
    expect(translate({ other: 'only' }, 'ar', { count: 3 })).toBe('only');
  });
});

describe('dictionaries', () => {
  const dictionaries: Record<Locale, typeof en> = { en, ar };

  /*
   * TypeScript guarantees both dictionaries have the same keys, but it cannot
   * know that Arabic needs `few` and `many` while English does not. This
   * catches a plural message that is missing a form its own locale can select.
   */
  it.each(LOCALES)('%s defines every plural form its locale can select', (locale) => {
    const categories = new Set<string>();
    for (let n = 0; n <= 200; n += 1) {
      categories.add(new Intl.PluralRules(locale).select(n));
    }

    const missing: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;

      if (typeof record['other'] === 'string') {
        for (const category of categories) {
          if (typeof record[category] !== 'string') {
            missing.push(`${path}.${category}`);
          }
        }
        return;
      }
      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`);
      }
    };

    walk(dictionaries[locale], locale);
    expect(missing).toEqual([]);
  });
});

describe('parseIsoDate', () => {
  /*
   * `new Date('2026-09-13')` is parsed as UTC midnight, which is 13 Sep only
   * for readers at or east of Greenwich. The API's dates are calendar dates,
   * so they must be built from parts.
   */
  it('keeps the calendar day regardless of timezone', () => {
    const date = parseIsoDate('2026-09-13');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(13);
  });

  it('rejects values that are not YYYY-MM-DD', () => {
    expect(parseIsoDate('13/09/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });
});

describe('formatting', () => {
  it('returns the input unchanged when a date cannot be parsed', () => {
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
  });

  // Route names arrive from GTFS in Latin script, so Arabic is pinned to Latin
  // digits to avoid two numbering systems in one sentence.
  it('uses Latin digits in Arabic', () => {
    expect(formatNumber(3950, 'ar')).toMatch(/3.?950/);
    expect(formatDate('2026-09-13', 'ar')).toMatch(/2026/);
  });
});

describe('formatClockHour', () => {
  /*
   * A timetable's hour headings used to be built as `${hour}:00`, which put a
   * 24-hour clock at the head of a board whose every other time was 12-hour.
   */
  it('reads as a 12-hour heading, without the minutes', () => {
    expect(formatClockHour('15', 'en')).toBe('3 PM');
    expect(formatClockHour('00', 'en')).toBe('12 AM');
    expect(formatClockHour('07', 'en')).toBe('7 AM');
  });

  it('uses the locale’s own meridiem and Latin digits in Arabic', () => {
    const arabic = formatClockHour('15', 'ar');
    expect(arabic).toContain('3');
    expect(arabic).not.toContain('15');
  });

  // Anything that is not an hour comes back untouched rather than as a date.
  it('returns an unreadable hour unchanged', () => {
    expect(formatClockHour('99', 'en')).toBe('99');
    expect(formatClockHour('', 'en')).toBe('');
  });
});

describe('formatMoney', () => {
  /*
   * The space `Intl` puts between a currency *word* and its number is a
   * non-breaking one, and stays that way — it is what stops "JOD" and "1.300"
   * landing on two different lines.
   */
  const NBSP = '\u00a0';

  /*
   * How many decimals is a property of the currency, never a choice: a dinar
   * has three, a euro two.
   */
  it('uses the decimals the currency has', () => {
    expect(formatMoney(1.3, 'JOD', 'en')).toBe(`JOD${NBSP}1.300`);
    expect(formatMoney(1.3, 'EUR', 'en')).toBe('€1.30');
  });

  /*
   * A symbol is pulled tight against the number in both languages, because
   * `€1.30` beside `1.30 €` reads as an inconsistency rather than as two
   * conventions. The side each locale puts it on is left alone.
   */
  it('gives a symbol no space, in either direction', () => {
    expect(formatMoney(1.3, 'EUR', 'en')).toBe('€1.30');
    expect(formatMoney(1.3, 'EUR', 'ar')).toContain('1.30€');
  });

  /*
   * A word is not a symbol. `JOD1.300` is not tidier than `JOD 1.300`, it is
   * harder to read, so the space survives wherever the locale prints a code or
   * an abbreviation instead of a sign.
   */
  it('leaves a word its space', () => {
    expect(formatMoney(1.3, 'JOD', 'en')).toBe(`JOD${NBSP}1.300`);
    expect(formatMoney(1.3, 'JOD', 'ar')).toContain(`1.300${NBSP}`);
  });

  it('signs an amount when asked, and not otherwise', () => {
    expect(formatMoney(-3.3, 'EUR', 'en', { signed: true })).toBe('-€3.30');
    expect(formatMoney(20, 'EUR', 'en', { signed: true })).toBe('+€20.00');
    expect(formatMoney(20, 'EUR', 'en')).toBe('€20.00');
  });

  // Null is a real answer: print the number, invent no currency.
  it('prints a bare number when no currency is established', () => {
    expect(formatMoney(1.3, null, 'en')).toBe('1.3');
  });

  /*
   * The code comes from a feed rather than from us, and `Intl` throws on one
   * it does not know. A number beats an exception thrown out of a render.
   */
  it('falls back to a plain number for a currency Intl rejects', () => {
    expect(formatMoney(1.3, 'NOTACURRENCY', 'en')).toBe('1.3');
  });
});
