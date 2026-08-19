import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { DIRECTION, type Dictionary, type Locale } from './dictionary';
import { en } from './en';
import { ar } from './ar';
import { LOCALE_STORAGE_KEY, applyDocumentLocale, resolveInitialLocale } from './documentLocale';
import { LocaleContext, type LocaleContextValue } from './localeContext';
import { translate } from './translate';

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: DIRECTION[locale],
      strings: dictionaries[locale],
      t: (message, values) => translate(message, locale, values),
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LocaleContext value={value}>{children}</LocaleContext>;
}
