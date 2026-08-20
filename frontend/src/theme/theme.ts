/**
 * Colour-scheme handling: what the visitor has chosen, what that resolves to,
 * and mirroring the result onto the document.
 *
 * Deliberately three choices rather than a two-state switch. "System" is not
 * the same setting as "light" — a visitor who follows their OS expects the app
 * to turn dark at sunset with everything else, and a plain toggle gives them no
 * way back to that once they have touched it.
 */

/** What the visitor picked. */
export type ThemeChoice = 'light' | 'dark' | 'system';

/** What that actually paints, once the system preference is taken into account. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';

export const THEME_STORAGE_KEY = 'theme';

/** Matches the media query the stylesheet uses for the same decision. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function isThemeChoice(value: string | null | undefined): value is ThemeChoice {
  return value != null && (THEME_CHOICES as readonly string[]).includes(value);
}

/**
 * The visitor's stored choice, or "system" if they have never expressed one.
 *
 * Unlike the locale, the browser's own preference is not consulted here: the
 * stylesheet already follows `prefers-color-scheme` on its own, so "system"
 * needs no resolution at this level.
 */
export function resolveInitialThemeChoice(): ThemeChoice {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
}

/**
 * The system's current preference.
 *
 * `matchMedia` is absent in some non-browser environments, and a browser that
 * has never heard of the query reports `matches: false`, so both paths fall
 * back to light — the same thing the stylesheet does.
 */
export function systemTheme(): ResolvedTheme {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

/** What a choice paints right now. */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

/**
 * Mirrors the choice onto the document element.
 *
 * "System" *removes* the attribute rather than writing the resolved value:
 * that hands the decision back to the `prefers-color-scheme` media query in
 * the stylesheet, which then keeps up with the OS by itself — including while
 * the page sits open and the system flips at dusk.
 *
 * Called before the first render as well as on every change, so there is no
 * flash of the wrong scheme.
 */
export function applyDocumentTheme(choice: ThemeChoice): void {
  if (choice === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', choice);
  }
}
