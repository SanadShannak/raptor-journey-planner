import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { checkSession, forgetSession } from '../../auth';
import { forgetAuthPrompt, getAuthPrompt } from '../../auth/authPrompt';
import { LocaleProvider } from '../../i18n';
import { FavouriteButton } from './FavouriteButton';
import { forgetFavourites } from './favouritesStore';
import type { FavouriteDraft } from './favourite';

const STOP: FavouriteDraft = { kind: 'stop', stopId: '1040124' };

const ACCOUNT = { _id: 'u1', name: 'Rider', email: 'rider@example.com' };

/** A saved stop subdocument, as the server stores one. */
const savedStop = (id: string) => ({
  _id: `id-${id}`,
  nickname: `Stop ${id}`,
  stopId: id,
  savedOn: '2026-10-07T21:07:35.592Z',
});

interface Stub {
  signedIn?: boolean;
  stops?: unknown[];
  /** Replaces the answer to a write, so a refusal can be exercised. */
  write?: { body: unknown; status: number };
}

function stubApi({ signedIn = true, stops = [], write }: Stub = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? 'GET';
      const json = (body: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));

      if (path === '/api/auth/me') {
        return signedIn
          ? json({ data: ACCOUNT })
          : json({ message: 'Not authorized. Please log in.' }, 401);
      }
      if (method !== 'GET' && write !== undefined) {
        return json(write.body, write.status);
      }
      if (path.startsWith('/api/user/saved-stops')) {
        return method === 'GET'
          ? json({ data: stops })
          : json({ data: { savedStops: [...stops, savedStop('1040124')] } });
      }
      return json({ data: [] });
    }),
  );
}

beforeEach(() => {
  forgetSession();
  forgetFavourites();
  forgetAuthPrompt();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderStar = (favourite: FavouriteDraft | null = STOP) =>
  render(
    <LocaleProvider>
      <FavouriteButton favourite={favourite} />
    </LocaleProvider>,
  );

/** The star, with the session settled — which is how it is always reached. */
async function star(favourite: FavouriteDraft | null = STOP) {
  renderStar(favourite);
  await act(async () => {
    await checkSession();
  });
  return screen.getByRole('button');
}

describe('the star', () => {
  /*
   * Queried by accessible name, which is also the assertion: the control has
   * to say what pressing it *does*, because the shape and the colour say
   * nothing to a screen reader.
   */
  it('names what pressing it would do', async () => {
    stubApi();
    await star();
    expect(screen.getByRole('button', { name: 'Add to favourites' })).toBeTruthy();
  });

  it('is pressed and named for removal once it is saved', async () => {
    stubApi({ stops: [savedStop('1040124')] });
    const button = await star();

    await vi.waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toBeTruthy();
  });

  /*
   * **The bug this test exists for.** While the session is still being checked
   * nobody is signed in *yet* — and an earlier version folded that into the
   * same flag as the cap, so the star went off and explained itself with "you
   * can save 5 of each", which is a different and false statement.
   */
  it('says nothing about the limit while the session is unknown', () => {
    stubApi();
    renderStar();

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText(/You can save/)).toBeNull();
  });

  /*
   * Needing an account is not a refusal. A press is an intention to save, and
   * the dialog is the next step towards it — so the control stays live.
   */
  it('opens the sign-in dialog instead of refusing when signed out', async () => {
    stubApi({ signedIn: false });
    const button = await star();

    expect(button.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button);

    expect(getAuthPrompt()).toBe('logIn');
    // And nothing was saved behind the dialog.
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  /*
   * **Never `disabled`.** A disabled button is unfocusable and screen readers
   * skip it, so the one person who most needs to know why the star is off
   * would never find out. It carries `aria-disabled` and a reason instead.
   */
  it('stays focusable when there is nothing to save, and says why', async () => {
    stubApi();
    const button = await star(null);

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');

    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Fill in the whole search before saving it.',
    );
  });

  /*
   * The server can refuse for reasons this component cannot predict — the kind
   * is full as counted on another device, the stop has left the dataset — so a
   * refusal is shown rather than swallowed, and never in the API's own words.
   */
  it('reports a refusal from the server, in the reader’s language', async () => {
    stubApi({
      write: { body: { message: 'This stop is already saved.' }, status: 400 },
    });
    const button = await star();

    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('That is already in your favourites.');
    expect(screen.queryByText('This stop is already saved.')).toBeNull();
  });

  /* The fill follows the stored row, so it only fills once the save happened. */
  it('fills only after the server has saved it', async () => {
    stubApi();
    const button = await star();
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);

    await vi.waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
  });
});
