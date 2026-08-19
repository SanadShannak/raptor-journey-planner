import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, parseIsoDate, translate } from './translate';
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
