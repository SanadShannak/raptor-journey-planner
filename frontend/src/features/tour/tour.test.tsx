import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    <LocaleProvider>
      <TourHost />
    </LocaleProvider>,
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
   * The routes tour points at three things. With only two on screen it is a
   * two-step tour: the count says so, and nothing points at empty space.
   */
  it('skips a step whose element is not on screen, and counts without it', () => {
    placeTargets('routes-search', 'routes-map');
    renderHost();
    act(() => startTour('routes'));

    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Find a route' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Routes on the map' })).toBeTruthy();
  });

  it('goes back a step, and finishes with Done on the last one', () => {
    placeTargets('routes-search', 'routes-list', 'routes-map');
    renderHost();
    act(() => startTour('routes'));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();

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
    expect(screen.getByText('Step 1 of 1')).toBeTruthy();
  });

  it('ends at once when there is nothing at all to show', () => {
    placeTargets();
    renderHost();
    act(() => startTour('favourites'));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasSeenTour('favourites')).toBe(true);
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
