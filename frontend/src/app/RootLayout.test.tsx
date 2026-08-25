import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { RootLayout } from './RootLayout';
import PlanPage from '../pages/PlanPage';
import StopsPage from '../pages/StopsPage';
import NotFoundPage from '../pages/NotFoundPage';
import { paths } from './routes';

/*
 * Locale and theme both persist to localStorage, which is shared across tests
 * in a file. Without clearing it, a test that switches to Arabic leaves every
 * later test rendering in Arabic — and failing for a reason unrelated to what
 * it is checking.
 */
beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});

afterEach(() => localStorage.clear());

function renderAt(initialPath: string) {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<RootLayout />}>
              <Route path={paths.home} element={<PlanPage />} />
              <Route path={paths.stops} element={<StopsPage />} />
              <Route path={paths.stopDetail} element={<StopsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe('app shell', () => {
  /*
   * The skip link must be the first thing a keyboard user reaches, and it must
   * point at an element that can actually take focus. A skip link aimed at a
   * container without tabindex="-1" silently does nothing in several browsers.
   */
  it('puts a working skip link first in the document', () => {
    renderAt('/');

    const link = screen.getByRole('link', { name: 'Skip to content' });
    const focusables = document.querySelectorAll('a[href], button, input');
    expect(focusables[0]).toBe(link);

    const target = document.querySelector(link.getAttribute('href') ?? '');
    expect(target?.tagName).toBe('MAIN');
    expect(target?.getAttribute('tabindex')).toBe('-1');
  });

  it('gives every page exactly one h1, first inside main', () => {
    for (const path of ['/', '/nonsense']) {
      const { unmount } = renderAt(path);
      const main = screen.getByRole('main');
      const headings = within(main).getAllByRole('heading', { level: 1 });
      expect(headings).toHaveLength(1);
      unmount();
    }
  });

  it('marks the current page in the navigation', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const current = within(nav).getAllByRole('link', { current: 'page' });
    expect(current.map((link) => link.textContent)).toEqual(['Plan a journey']);
  });

  it('shows a not-found page for an unknown path rather than an empty shell', () => {
    renderAt('/nope');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeTruthy();
  });

  it('translates the whole shell, not just the page', () => {
    renderAt('/');
    /*
     * The toggle offers the language you are *not* reading, so from English it
     * is labelled in Arabic. Queried by that name deliberately: if it ever
     * announces itself in the current language instead, this fails.
     */
    fireEvent.click(screen.getByRole('button', { name: /بالعربية/ }));

    expect(screen.getByRole('navigation', { name: 'الرئيسية' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('auth', () => {
  /*
   * Sign-in is never a gate. Every section must stay reachable without it, or
   * the "accounts are not available yet" state would lock the site.
   */
  it('never blocks navigation', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const names = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(new Set(names)).toEqual(
      new Set(['Plan a journey', 'Lines', 'Stops', 'Travel card']),
    );
  });

  it('validates the form rather than pretending to sign anyone in', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Log in' }));

    expect(within(dialog).getByText('Enter your email address.')).toBeTruthy();
    expect(within(dialog).getByText('Enter a password.')).toBeTruthy();

    const email = within(dialog).getByLabelText('Email');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    // The error is tied to its field, not just placed near it.
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Enter your email address.',
    );
  });

  it('says accounts do not exist once the form is otherwise valid', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'rider@example.com' },
    });
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: 'a-real-password' },
    });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Log in' }));

    expect(
      within(dialog).getByText(/Accounts are not available yet/),
    ).toBeTruthy();
  });
});

/*
 * The planner fills the viewport and scrolls inside its own panes, so a
 * page-level footer under it is a strip you reach by scrolling a layout that
 * was supposed to end at the fold.
 *
 * Pinned because the first attempt at this tested the wrong path: the planner
 * is mounted at the *root*, and `/plan` only redirects to it — so a page that
 * never renders was the one being asked about, and the footer stayed exactly
 * where it was.
 */
describe('the footer', () => {
  it('is absent on the planner', () => {
    renderAt(paths.home);
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  /*
   * The stops pages are the same two-pane, viewport-height shape, so they owe
   * the same absence — and both of them, because a stop is reached at its own
   * path as often as through the index.
   */
  it.each([paths.stops, '/stops/1020444'])('is absent on %s', (path) => {
    renderAt(path);
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  /* And the lines pages, which are the same shape for the same reason. */
  it.each([paths.routes, '/routes/tram-1'])('is absent on %s', (path) => {
    renderAt(path);
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('is present on an ordinary page', () => {
    renderAt('/somewhere-else');
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});
