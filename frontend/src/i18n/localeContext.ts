import { createContext, use } from 'react';
import type { Dictionary, Direction, Locale, Message } from './dictionary';
import type { MessageValues } from './translate';

export interface LocaleContextValue {
  locale: Locale;
  direction: Direction;
  /** Strings for the active locale. */
  strings: Dictionary;
  /** Resolves a message, applying plural selection and interpolation. */
  t: (message: Message, values?: MessageValues) => string;
  setLocale: (locale: Locale) => void;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext);
  if (!value) {
    throw new Error('useLocale must be used within a LocaleProvider.');
  }
  return value;
}
