import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { StopsMap } from './StopsMap';
import { HOME_VIEW } from './viewRequest';
import { forgetMaps, liveMap } from '../test/mapStub';
import type { StopIdentity } from '../types/stop';

/*
 * Where the map is told to look, and — the part that went wrong — where it is
 * told not to.
 *
 * Asserted on the framing calls the map was asked to make, because the bug was
 * not a wrong final position but an extra move on the way to it: the map went
 * home and came back, and the two animations collided so that only the first
 * was ever seen.
 *
 * A GL map needs WebGL, which jsdom has no notion of, so the whole module is
 * replaced — see `test/mapStub.ts`. That also puts the moves somewhere
 * readable, which is what these tests are about.
 */

const LASIPALATSI: StopIdentity = {
  id: '1020444',
  name: 'Lasipalatsi',
  code: 'H0101',
  platform: null,
  lat: 60.170461,
  lon: 24.937728,
  description: null,
  fareZone: null,
  wheelchairAccessible: null,
};

/** A few metres away, as a neighbour pressed on the map would be. */
const NEXT_DOOR: StopIdentity = { ...LASIPALATSI, id: '1020445', lat: 60.17055 };

/** Helsinki, which is where `homeViewFor` rests when nothing is chosen. */
const CITY_LAT = 60.185;

function view(props: Partial<Parameters<typeof StopsMap>[0]> = {}) {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <StopsMap
          network="hsl"
          area={null}
          focused={null}
          pending={false}
          onStopSelect={() => {}}
          filter={() => true}
          onVisibleStopsChange={() => {}}
          onBelowZoomChange={() => {}}
          view={HOME_VIEW}
          {...props}
        />
      </ThemeProvider>
    </LocaleProvider>
  );
}

/**
 * Rendered *and settled*.
 *
 * The map loads on a microtask and `MapCanvas` draws no children until it has,
 * so a synchronous render would assert against an empty map and pass for the
 * wrong reason.
 */
async function show(props: Partial<Parameters<typeof StopsMap>[0]> = {}) {
  const result = render(view(props));
  await act(async () => {});
  return result;
}

/** Every latitude the map was sent to, in order. */
const latitudes = () =>
  liveMap().moves.map((move) => move.center?.[1] ?? NaN);

const wentToTheCity = () =>
  latitudes().some((lat) => Math.abs(lat - CITY_LAT) < 0.001);

beforeEach(() => {
  localStorage.clear();
  forgetMaps();
});

afterEach(() => vi.restoreAllMocks());

describe('StopsMap framing', () => {
  it('rests on the city when no stop is wanted', async () => {
    await show();
    expect(wentToTheCity()).toBe(true);
  });

  it('goes to the stop being inspected, and closer in', async () => {
    await show({ focused: LASIPALATSI });

    const moves = liveMap().moves;
    const last = moves[moves.length - 1];
    expect(last?.center?.[1]).toBeCloseTo(LASIPALATSI.lat, 4);
    expect(last?.zoom).toBeGreaterThanOrEqual(17);
  });

  /*
   * The bug. Pressing a stop on the map navigates, which clears the resolved
   * stop a moment before the next one arrives — and "no stop resolved" was
   * indistinguishable from "no stop wanted", so the map took the gap as
   * permission to go home. What a reader saw was a zoom out to the city and no
   * zoom back in, because the second move collided with the first.
   */
  it('holds still while the next stop is on its way', async () => {
    const { rerender } = await show({ focused: LASIPALATSI });
    liveMap().moves.length = 0;

    // The navigation has happened; the new stop has not answered yet.
    await act(async () => {
      rerender(view({ focused: null, pending: true }));
    });

    expect(wentToTheCity()).toBe(false);
    expect(liveMap().moves).toEqual([]);
  });

  it('frames the next stop once it arrives', async () => {
    const { rerender } = await show({ focused: LASIPALATSI });
    liveMap().moves.length = 0;

    await act(async () => {
      rerender(view({ focused: NEXT_DOOR }));
    });

    expect(wentToTheCity()).toBe(false);
    const moves = liveMap().moves;
    expect(moves[moves.length - 1]?.center?.[1]).toBeCloseTo(NEXT_DOOR.lat, 4);
  });
});

/*
 * Leaving a map page.
 *
 * The regression this guards produced a blank page *somewhere else entirely*:
 * navigate away from a map and the next page rendered nothing at all, with one
 * `TypeError` in the console and no clue as to which component caused it.
 *
 * The cause is an ordering that is easy to get wrong twice. React runs a
 * component's effect cleanups in the order the effects were declared, and
 * unmounts a deleted subtree parent first — so the effect that creates the map
 * is also the first to clean up, and destroys it before every other cleanup in
 * `MapCanvas` and before every cleanup in every layer drawn on it. Each of
 * those then tidies up against an object with no internals left, and a throw
 * in a passive cleanup takes the whole unmount with it.
 *
 * The stub refuses calls on a removed map for exactly this reason, so any
 * cleanup that forgets to ask whether the map is still there fails here rather
 * than in a browser three pages later.
 */
describe('leaving the map', () => {
  it('unmounts without touching a map that is already gone', async () => {
    const { unmount } = await show({ focused: LASIPALATSI });

    expect(() => unmount()).not.toThrow();
    expect(liveMap().removed).toBe(true);
  });

  it('tears down cleanly with layers and markers on it', async () => {
    const { unmount } = await show({ focused: LASIPALATSI, pending: false });
    // A style reload mid-life, so the re-added layers are the ones torn down.
    await act(async () => liveMap().fire('style.load'));

    expect(() => unmount()).not.toThrow();
  });
});
