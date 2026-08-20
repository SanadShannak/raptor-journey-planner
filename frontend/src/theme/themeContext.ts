import { createContext, use } from 'react';
import type { ResolvedTheme, ThemeChoice } from './theme';

export interface ThemeContextValue {
  /** What the visitor chose, including "system". */
  choice: ThemeChoice;
  /** What that currently paints — use this to label or illustrate the state. */
  resolved: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return value;
}
