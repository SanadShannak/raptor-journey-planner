import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from './LocaleProvider';
import { useLocale } from './localeContext';
import { applyDocumentLocale, resolveInitialLocale } from './documentLocale';

function Probe() {
  const { locale, direction, strings, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="direction">{direction}</span>
      <span data-testid="title">{strings.app.title}</span>
      <button type="button" onClick={() => setLocale('ar')}>
        arabic
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  applyDocumentLocale('en');
});

afterEach(() => {
  localStorage.clear();
});

describe('LocaleProvider', () => {
  it('provides the English dictionary by default', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('direction').textContent).toBe('ltr');
  });

  /*
   * The whole layout depends on `dir` flipping, which is why components must
   * use logical CSS properties. If this stops working, RTL silently degrades
   * into a mirrored-content-but-LTR-layout mess.
   */
  it('flips document dir and lang when switching to Arabic', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'arabic' }));

    expect(screen.getByTestId('direction').textContent).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('swaps the dictionary along with the locale', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    const english = screen.getByTestId('title').textContent;

    fireEvent.click(screen.getByRole('button', { name: 'arabic' }));

    expect(screen.getByTestId('title').textContent).not.toBe(english);
  });

  it('remembers the choice across sessions', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'arabic' }));

    expect(resolveInitialLocale()).toBe('ar');
  });

  it('throws a useful error when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrowError(/LocaleProvider/);
  });
});

describe('resolveInitialLocale', () => {
  it('prefers a stored choice over the browser languages', () => {
    localStorage.setItem('locale', 'ar');
    expect(resolveInitialLocale()).toBe('ar');
  });

  it('ignores a stored value that is not a supported locale', () => {
    localStorage.setItem('locale', 'fi');
    expect(resolveInitialLocale()).toBe('en');
  });
});
