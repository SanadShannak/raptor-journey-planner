/**
 * Browser-facing side of locale handling: what the visitor prefers, and
 * mirroring the active choice onto the document.
 */

import { DEFAULT_LOCALE, DIRECTION, LOCALES, type Locale } from './dictionary';

export const LOCALE_STORAGE_KEY = 'locale';

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

/**
 * Reads the visitor's preferred locale: an explicit past choice first, then the
 * browser's languages, then the default.
 */
export function resolveInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isLocale(stored)) return stored;

  for (const language of navigator.languages) {
    const base = language.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Mirrors the locale onto the document element. `lang` drives screen-reader
 * pronunciation and font selection; `dir` flips the whole layout, which is why
 * components must use logical CSS properties rather than left/right ones.
 *
 * Called before the first render as well as on every change, so there is no
 * flash of the wrong direction.
 */
export function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = DIRECTION[locale];
}
