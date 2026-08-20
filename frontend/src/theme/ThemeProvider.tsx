import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DARK_SCHEME_QUERY,
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  resolveInitialThemeChoice,
  resolveTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from './theme';
import { ThemeContext, type ThemeContextValue } from './themeContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(resolveInitialThemeChoice);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(choice));

  const setTheme = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    setResolved(resolveTheme(next));
    applyDocumentTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  /*
   * While the choice is "system", the stylesheet repaints itself when the OS
   * flips — but `resolved` is what the switcher labels itself with, so it has
   * to be kept in step. Nothing here touches the document; the media query
   * already owns that.
   */
  useEffect(() => {
    if (choice !== 'system' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const sync = () => setResolved(query.matches ? 'dark' : 'light');

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [choice]);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setTheme }),
    [choice, resolved, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
