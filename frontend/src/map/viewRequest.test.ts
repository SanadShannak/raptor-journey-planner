import { describe, expect, it } from 'vitest';
import { askFor, HOME_VIEW, type ViewRequest } from './viewRequest';

describe('askFor', () => {
  /*
   * The whole reason a request carries an id. Pressing "near me" after panning
   * away produces the same coordinates, and without a fresh id the effect that
   * moves the map would see an equal value, not re-run, and the button would
   * look broken.
   */
  it('is a new request every time, even for the same place', () => {
    const first = askFor(HOME_VIEW, { kind: 'at', lat: 60.2, lon: 24.9 });
    const again = askFor(first, { kind: 'at', lat: 60.2, lon: 24.9 });

    expect(again.id).not.toBe(first.id);
    expect(again).not.toEqual(first);
  });

  it('carries the place asked for', () => {
    const request = askFor(HOME_VIEW, { kind: 'at', lat: 60.2, lon: 24.9 });
    expect(request.kind).toBe('at');
    if (request.kind === 'at') {
      expect([request.lat, request.lon]).toEqual([60.2, 24.9]);
    }
  });

  // The way back. A map sent to the visitor's position had no route home.
  it('goes back to the city, and counts as a fresh ask', () => {
    const located = askFor(HOME_VIEW, { kind: 'at', lat: 60.2, lon: 24.9 });
    const home = askFor(located, { kind: 'home' });

    expect(home.kind).toBe('home');
    expect(home.id).toBeGreaterThan(located.id);
  });

  it('opens on the city', () => {
    const opening: ViewRequest = HOME_VIEW;
    expect(opening.kind).toBe('home');
  });
});
