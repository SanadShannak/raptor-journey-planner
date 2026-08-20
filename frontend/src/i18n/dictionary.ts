/**
 * Locale definitions and the shape every dictionary must satisfy.
 *
 * `Dictionary` is declared explicitly rather than inferred from the English
 * file so that adding a key is a compile error in *every* locale until it is
 * translated — a missing Arabic string can never reach production silently.
 */

export type Locale = 'en' | 'ar';

export type Direction = 'ltr' | 'rtl';

export const LOCALES: readonly Locale[] = ['en', 'ar'];

export const DEFAULT_LOCALE: Locale = 'en';

export const DIRECTION: Record<Locale, Direction> = {
  en: 'ltr',
  ar: 'rtl',
};

/**
 * BCP 47 tags passed to `Intl`, which are not always the same as the locale
 * key. Arabic requests Latin digits (`-u-nu-latn`) because route designations
 * arrive from GTFS in Latin script (`"M2"`, `"550"`); rendering clock times in
 * Arabic-Indic numerals beside them would read inconsistently.
 *
 * Switch `ar` to plain `'ar'` to get Arabic-Indic digits instead.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en',
  ar: 'ar-u-nu-latn',
};

/**
 * Language names are always written in their own language, never translated,
 * so they live here instead of inside each dictionary.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

/**
 * A message with one form per CLDR plural category. Only `other` is mandatory;
 * English uses `one`/`other`, while Arabic uses all six.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** Either a fixed string or a set of plural forms selected by a `count`. */
export type Message = string | PluralForms;

export interface Dictionary {
  app: {
    title: string;
  };
  language: {
    /** Accessible label for the language switcher. */
    switcherLabel: string;
  };
  theme: {
    /** Accessible label for the colour-scheme switcher. */
    switcherLabel: string;
    light: string;
    dark: string;
    /** Follow the operating system's colour scheme. */
    system: string;
  };
  status: {
    checkingBackend: string;
    backendReachable: string;
    backendUnreachable: string;
    availableDates: PluralForms;
  };
}
