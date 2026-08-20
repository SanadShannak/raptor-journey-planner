import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DARK_SCHEME_QUERY,
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  isThemeChoice,
  resolveInitialThemeChoice,
  resolveTheme,
  systemTheme,
} from './theme';

/**
 * jsdom has no `matchMedia`. Installing a stub per test keeps the system
 * preference explicit rather than ambient.
 */
function stubMatchMedia(prefersDark: boolean | null) {
  if (prefersDark === null) {
    Reflect.deleteProperty(window, 'matchMedia');
    return;
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === DARK_SCHEME_QUERY && prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('isThemeChoice', () => {
  it('accepts the three supported choices', () => {
    expect(isThemeChoice('light')).toBe(true);
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('system')).toBe(true);
  });

  /*
   * localStorage is attacker-writable and survives across deploys, so a value
   * that used to be valid — or was never valid — must not reach the document.
   */
  it('rejects anything else, including stale or absent values', () => {
    expect(isThemeChoice('auto')).toBe(false);
    expect(isThemeChoice('')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
});

describe('resolveInitialThemeChoice', () => {
  it('defaults to following the system when nothing is stored', () => {
    expect(resolveInitialThemeChoice()).toBe('system');
  });

  it('restores a stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(resolveInitialThemeChoice()).toBe('dark');
  });

  it('falls back to the default when the stored value is not a choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    expect(resolveInitialThemeChoice()).toBe('system');
  });
});

describe('systemTheme', () => {
  it('reads the dark preference from matchMedia', () => {
    stubMatchMedia(true);
    expect(systemTheme()).toBe('dark');
  });

  it('reports light when the preference is not dark', () => {
    stubMatchMedia(false);
    expect(systemTheme()).toBe('light');
  });

  it('reports light where matchMedia does not exist', () => {
    stubMatchMedia(null);
    expect(systemTheme()).toBe('light');
  });
});

describe('resolveTheme', () => {
  it('passes explicit choices through without consulting the system', () => {
    stubMatchMedia(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('defers to the system preference for "system"', () => {
    stubMatchMedia(true);
    expect(resolveTheme('system')).toBe('dark');
  });
});

describe('applyDocumentTheme', () => {
  it('writes an explicit choice onto the document element', () => {
    applyDocumentTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applyDocumentTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  /*
   * The load-bearing case. The stylesheet decides between the schemes with
   * `:root:not([data-theme='light'])` inside a prefers-color-scheme query, so
   * "system" has to *remove* the attribute. Writing the resolved value instead
   * would look identical on load and then silently stop tracking the OS when
   * it flips at dusk.
   */
  it('removes the attribute for "system" so the media query takes over', () => {
    applyDocumentTheme('dark');
    applyDocumentTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
