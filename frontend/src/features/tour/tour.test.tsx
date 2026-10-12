import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocaleProvider } from '../../i18n';
import { TourHost } from './TourHost';
import { endTour, forgetTours, hasSeenTour, startTour } from './tourStore';

/*
 * jsdom lays nothing out, so every element measures 0×0 — which the tour reads
 * as "not on screen" and skips. These tests give a size to exactly the
 * elements they mean to be visible.
 */
function placeTargets(...targets: string[]) {
  document.body.innerHTML = '';
  for (const target of targets) {
    const element = document.createElement('div');
    element.dataset['tour'] = target;
    element.getBoundingClientRect = () =>
      ({ top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100 }) as DOMRect;
    document.body.append(element);
  }
}

const renderHost = () =>
  render(
    <MemoryRouter>
      <LocaleProvider>
        <TourHost />
      </LocaleProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  forgetTours();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('which tours have been seen', () => {
  it('remembers a tour once it ends, skipped or finished alike', () => {
    expect(hasSeenTour('routes')).toBe(false);
    startTour('routes');
    endTour();
    expect(hasSeenTour('routes')).toBe(true);
    expect(hasSeenTour('stops')).toBe(false);
  });

  /* Storage written by something else, or by an older version, is not trusted. */
  it('reads unreadable storage as nothing seen rather than failing', () => {
    localStorage.setItem('tours-seen', '{not json');
    expect(hasSeenTour('plan')).toBe(false);

    localStorage.setItem('tours-seen', JSON.stringify({ plan: true }));
    expect(hasSeenTour('plan')).toBe(false);
  });
});

describe('the tour', () => {
  /*
   * The routes tour points at four things. With only the search and the map on
   * screen the two in between are passed over — counted until they are
   * reached, then dropped — and nothing is ever shown pointing at empty space.
   */
  it('passes over steps whose element is not on screen, and stops counting them', async () => {
    placeTargets('routes-search', 'routes-map');
    renderHost();
    act(() => startTour('routes'));

    expect(screen.getByRole('heading', { name: 'Find a route' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // The route-opening step waits for its route before passing over it.
    await screen.findByRole('heading', { name: 'Routes on the map' }, { timeout: 5000 });
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
  }, 10_000);

  it('goes back a step, and finishes with Done on the last one', () => {
    placeTargets('routes-search', 'routes-list', 'route-detail', 'routes-map');
    renderHost();
    act(() => startTour('routes'));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // The last step has nothing to skip to, so it offers only Done.
    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasSeenTour('routes')).toBe(true);
  });

  /* A step about the page as a whole needs nothing on screen to point at. */
  it('shows a welcome step with no target', () => {
    placeTargets();
    renderHost();
    act(() => startTour('plan'));

    expect(screen.getByRole('heading', { name: 'Welcome to Journey Planner' })).toBeTruthy();
    // Every other step is still counted until it has been reached.
    expect(screen.getByText(/^Step 1 of/)).toBeTruthy();
  });

  it('ends when there is nothing at all to show', async () => {
    placeTargets();
    renderHost();
    act(() => startTour('favourites'));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Whether it now counts as seen depends on being signed in; see below.
  });

  it('ends on Escape and counts as seen', () => {
    placeTargets('stops-map');
    renderHost();
    act(() => startTour('stops'));

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasSeenTour('stops')).toBe(true);
  });
});

describe('tours of pages that need an account', () => {
  /*
   * Signed out, the travel card page is a log-in prompt. Watching its tour
   * then must not use up the real one, which should still run after signing
   * in.
   */
  it('do not count as seen when watched signed out', () => {
    startTour('card');
    endTour();
    expect(hasSeenTour('card')).toBe(false);
  });

  it('other tours still count as seen when skipped', () => {
    startTour('routes');
    endTour();
    expect(hasSeenTour('routes')).toBe(true);
  });
});
