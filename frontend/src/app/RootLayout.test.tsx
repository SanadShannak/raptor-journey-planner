import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { forgetSession } from '../auth';
import { forgetAuthPrompt } from '../auth/authPrompt';
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
  /*
   * The session and the open dialog are module-level stores shared by every
   * test in this file, the same as the favourites one — so they are reset
   * here, or a test that signs somebody in leaves every later test rendering
   * an account menu where it expects a log-in button.
   */
  forgetSession();
  forgetAuthPrompt();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

/**
 * The shell's account controls are **asynchronous now**, so they have to be
 * awaited rather than read.
 *
 * The session is an HTTP-only cookie, so "is anybody signed in" is a request
 * the layout makes on mount — and until it answers the header deliberately
 * shows neither a log-in button nor an account, because offering "Log in" to
 * somebody already signed in and then swapping it is worse than a brief gap.
 * With no server behind `api.test` that request fails, which resolves to
 * signed out; this is how a test waits for it.
 */
function signedOutHeader(name = 'Log in') {
  return screen.findByRole('button', { name });
}

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
    expect(current.map((link) => link.textContent)).toEqual(['Planner']);
  });

  it('shows a not-found page for an unknown path rather than an empty shell', () => {
    renderAt('/nope');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeTruthy();
  });

  it('translates the whole shell, not just the page', async () => {
    renderAt('/');
    // The account controls arrive with the session check; wait for them before
    // asking whether they are in Arabic.
    await signedOutHeader();
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
  /**
   * Answers the sign-in or register call, and nothing else.
   *
   * `/api/auth/me` is **always** a 401 here, which is the detail that makes
   * these tests work: it is the session probe the layout fires on mount, so
   * letting the login fixture answer it too would sign the visitor in before
   * the test had pressed anything, and there would be no log-in button to
   * press. Everything outside `/api/auth` fails, as it does with no server
   * behind `api.test`.
   */
  function serveAuth(reply: { body: unknown; status: number }) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(
            new Response(JSON.stringify({ message: 'Not authorized.' }), { status: 401 }),
          );
        }
        if (!url.includes('/api/auth/')) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(
          new Response(JSON.stringify(reply.body), { status: reply.status }),
        );
      }),
    );
  }

  /*
   * Sign-in is never a gate on *navigation*. Two pages need an account to show
   * their content and say so in place, but every section stays reachable.
   */
  it('never blocks navigation', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const names = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(new Set(names)).toEqual(
      new Set(['Planner', 'Routes', 'Stops', 'Travel card', 'Favourites']),
    );
  });

  it('validates the form before it costs a request', async () => {
    renderAt('/');
    fireEvent.click(await signedOutHeader());

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

  /** Fills both fields with something the local checks accept. */
  function fillCredentials(dialog: HTMLElement, password = 'a-real-password') {
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'rider@example.com' },
    });
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: password },
    });
  }

  /*
   * **The case worth a shell test of its own.** A rejected password comes back
   * as `{ message: "Incorrect Password." }` with status **200**, so a dialog
   * that trusted the status would close on a failed sign-in and leave somebody
   * looking at a signed-out app that believed otherwise.
   */
  it('stays open and says so when the password is wrong', async () => {
    serveAuth({ body: { message: 'Incorrect Password.' }, status: 200 });

    renderAt('/');
    fireEvent.click(await signedOutHeader());
    const dialog = screen.getByRole('dialog');
    fillCredentials(dialog);
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Log in' }));

    expect(
      await within(dialog).findByText('That email and password do not match an account.'),
    ).toBeTruthy();
    // Still open, so the password can be corrected without starting again.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  /* The server's own English is never shown — only `errorCode` is mapped. */
  it('never quotes the API when registration is refused', async () => {
    serveAuth({
      body: { message: 'A user with this email already exists.' },
      status: 400,
    });

    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign up' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Rider' },
    });
    fillCredentials(dialog);
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Create account' }));

    expect(
      await within(dialog).findByText(/An account with that email already exists/),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/already exists\.$/)).toBeNull();
  });

  /*
   * The server rejects individual fields with its own wording. Only the field
   * *names* are used; the message comes from the dictionary, so the form says
   * the same thing whether the complaint came from here or from there.
   */
  it('marks the field the server named, in its own words', async () => {
    serveAuth({
      body: {
        errors: [
          {
            type: 'field',
            msg: 'Name must be between 3 and 20 characters',
            path: 'name',
            location: 'body',
          },
        ],
      },
      status: 400,
    });

    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign up' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Ri' },
    });
    fillCredentials(dialog);
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Create account' }));

    const name = await within(dialog).findByLabelText('Name');
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));
    expect(
      within(dialog).getByText('Use 3 to 20 letters, numbers or spaces.'),
    ).toBeTruthy();
  });

  it('closes and names the account once signed in', async () => {
    serveAuth({
      body: {
        message: 'Login successful',
        data: { id: 'u1', name: 'Rider', email: 'rider@example.com' },
      },
      status: 200,
    });

    renderAt('/');
    fireEvent.click(await signedOutHeader());
    const dialog = screen.getByRole('dialog');
    fillCredentials(dialog);
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Log in' }));

    /*
     * The bar now says who is signed in. Found by its accessible name rather
     * than by the visible text, because the name on the control is
     * `aria-hidden` beside an `sr-only` label — the same pattern the clock
     * uses.
     */
    expect(await screen.findByRole('button', { name: 'Your account' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // And the log-in button is gone, rather than sitting beside the account.
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
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
