import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { StopsMap } from './StopsMap';
import { HOME_VIEW } from './viewRequest';
import type { StopIdentity } from '../types/stop';

/*
 * Where the map is told to look, and — the part that went wrong — where it is
 * told not to.
 *
 * Asserted on Leaflet's own `setView`, because the bug was not a wrong final
 * position but an extra move on the way to it: the map went home and came back,
 * and the two animations collided so that only the first was ever seen.
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

let moves: Array<{ lat: number; zoom: number | undefined }>;

function show(props: Partial<Parameters<typeof StopsMap>[0]> = {}) {
  return render(
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
    </LocaleProvider>,
  );
}

const wentToTheCity = () =>
  moves.some((move) => Math.abs(move.lat - CITY_LAT) < 0.001);

beforeEach(() => {
  localStorage.clear();
  moves = [];
  /*
   * Recorded, not replaced. Stubbing it out left the map with no zoom of its
   * own, so `Math.max(map.getZoom(), 17)` came back `NaN` — the real Leaflet
   * has to run for the zoom under test to mean anything.
   */
  const setView = L.Map.prototype.setView;
  vi.spyOn(L.Map.prototype, 'setView').mockImplementation(function (
    this: L.Map,
    center: L.LatLngExpression,
    zoom?: number,
    options?: L.ZoomPanOptions,
  ) {
    moves.push({ lat: L.latLng(center as L.LatLngTuple).lat, zoom });
    return setView.call(this, center, zoom, options);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('StopsMap framing', () => {
  it('rests on the city when no stop is wanted', () => {
    show();
    expect(wentToTheCity()).toBe(true);
  });

  it('goes to the stop being inspected, and closer in', () => {
    show({ focused: LASIPALATSI });

    const last = moves[moves.length - 1];
    expect(last?.lat).toBeCloseTo(LASIPALATSI.lat, 4);
    expect(last?.zoom).toBeGreaterThanOrEqual(17);
  });

  /*
   * The bug. Pressing a stop on the map navigates, which clears the resolved
   * stop a moment before the next one arrives — and "no stop resolved" was
   * indistinguishable from "no stop wanted", so the map took the gap as
   * permission to go home. What a reader saw was a zoom out to the city and no
   * zoom back in, because the second move collided with the first.
   */
  it('holds still while the next stop is on its way', () => {
    const { rerender } = show({ focused: LASIPALATSI });
    moves = [];

    // The navigation has happened; the new stop has not answered yet.
    rerender(
      <LocaleProvider>
        <ThemeProvider>
          <StopsMap
            network="hsl"
            area={null}
            focused={null}
            pending
            onStopSelect={() => {}}
            filter={() => true}
            onVisibleStopsChange={() => {}}
            onBelowZoomChange={() => {}}
            view={HOME_VIEW}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(wentToTheCity()).toBe(false);
    expect(moves).toEqual([]);
  });

  it('frames the next stop once it arrives', () => {
    const { rerender } = show({ focused: LASIPALATSI });
    moves = [];

    rerender(
      <LocaleProvider>
        <ThemeProvider>
          <StopsMap
            network="hsl"
            area={null}
            focused={NEXT_DOOR}
            pending={false}
            onStopSelect={() => {}}
            filter={() => true}
            onVisibleStopsChange={() => {}}
            onBelowZoomChange={() => {}}
            view={HOME_VIEW}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(wentToTheCity()).toBe(false);
    expect(moves[moves.length - 1]?.lat).toBeCloseTo(NEXT_DOOR.lat, 4);
  });
});
