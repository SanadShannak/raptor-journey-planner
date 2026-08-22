import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from './ThemeProvider';
import { ThemeMenu } from './ThemeMenu';
import { THEME_STORAGE_KEY } from './theme';
import { useTheme } from './themeContext';

/** Change listeners registered by the provider, so tests can fire the OS flip. */
let listeners: Array<() => void> = [];
let prefersDark = false;

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      get matches() {
        return prefersDark;
      },
      media: query,
      addEventListener: (_: string, handler: () => void) => listeners.push(handler),
      removeEventListener: (_: string, handler: () => void) => {
        listeners = listeners.filter((existing) => existing !== handler);
      },
    })),
  });
}

function Probe() {
  const { choice, resolved } = useTheme();
  return (
    <>
      <span data-testid="choice">{choice}</span>
      <span data-testid="resolved">{resolved}</span>
      <ThemeMenu />
    </>
  );
}

function renderApp() {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  listeners = [];
  prefersDark = false;
  stubMatchMedia();
});

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('ThemeProvider', () => {
  it('starts on "system" and reports what the OS currently paints', () => {
    prefersDark = true;
    renderApp();

    expect(screen.getByTestId('choice').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applies and persists an explicit choice', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('restores a stored choice on the next visit', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    prefersDark = true;
    renderApp();

    expect(screen.getByTestId('choice').textContent).toBe('light');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });

  /*
   * Returning to "system" has to clear the attribute, otherwise the previous
   * explicit choice keeps overriding the media query and the setting appears
   * to do nothing.
   */
  it('hands control back to the OS when "system" is chosen again', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'System' }));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('tracks the OS flipping while the page is open on "system"', () => {
    renderApp();
    expect(screen.getByTestId('resolved').textContent).toBe('light');

    prefersDark = true;
    act(() => {
      for (const notify of listeners) notify();
    });

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('ignores the OS flipping once a choice has been made', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }));

    prefersDark = true;
    act(() => {
      for (const notify of listeners) notify();
    });

    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });
});

describe('ThemeMenu', () => {
  /*
   * These are settings, not actions: exactly one is always chosen. That is why
   * the items are `menuitemradio` with `aria-checked` — a plain `menuitem`
   * would announce them as commands and never say which is active.
   */
  it('exposes the choices as checkable menu items', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));

    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      'Light',
      'Dark',
      'System',
    ]);
    expect(
      items.filter((item) => item.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
  });

  /* The button's name has to carry the current value, or a screen-reader user
   * has to open the menu to find out what the setting is. */
  it('states the current setting in the button name', () => {
    renderApp();
    expect(
      screen.getByRole('button', { name: 'Appearance, currently System' }),
    ).toBeTruthy();
  });
});
