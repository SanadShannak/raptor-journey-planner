import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';
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
  const { choice, resolved, setTheme } = useTheme();
  return (
    <>
      <span data-testid="choice">{choice}</span>
      <span data-testid="resolved">{resolved}</span>
      <ThemeToggle />
      {/*
        The toggle offers no way back to "system" by design — it moves between
        two states. The provider still supports it, and first load still
        depends on it, so it is exercised here rather than through the UI.
      */}
      <button type="button" onClick={() => setTheme('system')}>
        follow system
      </button>
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

    // Starts on system, which the stub resolves to light, so one press means
    // dark.
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'follow system' }));

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
    // The stub reports light, so the toggle's one press pins an explicit dark.
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    prefersDark = true;
    act(() => {
      for (const notify of listeners) notify();
    });

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(screen.getByTestId('choice').textContent).toBe('dark');
  });
});

describe('ThemeToggle', () => {
  /*
   * The name says what pressing it will do, not what the setting currently is.
   * "Dark theme" as a name leaves a screen-reader user unable to tell whether
   * that describes the state or the outcome.
   */
  it('names the outcome rather than the state', () => {
    prefersDark = false;
    renderApp();
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    ).toBeTruthy();
  });

  /*
   * "System" is not one of the two states the toggle moves between, but it is
   * still where an untouched visitor starts — so the first press has to switch
   * away from whatever the OS resolved to, not from a hardcoded default.
   */
  it('starts from the system setting and switches away from what it resolved to', () => {
    prefersDark = true;
    renderApp();

    expect(screen.getByTestId('choice').textContent).toBe('system');
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(screen.getByTestId('choice').textContent).toBe('light');
  });
});
