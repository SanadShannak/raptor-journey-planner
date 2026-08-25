import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { RouteMap } from './RouteMap';
import type { LineVariantDetail, PatternStop } from '../types/route';

/*
 * Where the map is told to look, and — the part that goes wrong — where it is
 * told not to.
 *
 * Asserted on Leaflet's own framing calls, because the bug this guards is not a
 * wrong final position but an extra move on the way to it: the map goes home
 * and comes back, and the two animations collide so only the first is ever
 * seen. The stops map recorded the same lesson.
 */

const stop = (sequence: number, lat: number): PatternStop => ({
  id: `id-${sequence}`,
  name: `Stop ${sequence}`,
  code: null,
  platform: null,
  lat,
  lon: 24.94,
  description: null,
  fareZone: null,
  wheelchairAccessible: null,
  sequence,
  distanceFromOriginMeters: null,
});

/** A tram line down the middle of Helsinki, and a shape that bows west of it. */
const TRAM_1: LineVariantDetail = {
  lineId: 'tram-1',
  routeShortName: '1',
  routeType: 0,
  routeLongName: 'Eira - Käpylä',
  patternId: 0,
  directionId: 0,
  headsign: 'Käpylä',
  originStopName: 'Telakkakatu',
  terminusStopName: 'Pohjolanaukio',
  stopCount: 3,
  tripCount: 450,
  firstDeparture: '05:37',
  lastDeparture: '21:09',
  stops: [stop(0, 60.158), stop(1, 60.17), stop(2, 60.22)],
  shape: [
    [60.158, 24.934],
    [60.17, 24.9],
    [60.22, 24.95],
  ],
  serviceDates: ['2026-09-10'],
};

/** A different line, so a re-render has something else to frame. */
const BUS_550: LineVariantDetail = {
  ...TRAM_1,
  lineId: 'bus-550',
  routeShortName: '550',
  routeType: 3,
  patternId: 7,
  stops: [stop(0, 60.19), stop(1, 60.2), stop(2, 60.21)],
  shape: [
    [60.19, 24.8],
    [60.21, 24.85],
  ],
};

/** Helsinki, which is where `homeViewFor` rests when nothing is chosen. */
const CITY_LAT = 60.185;

let moves: Array<{ lat: number; zoom: number | undefined }>;
let fits: L.LatLngBounds[];

function show(props: Partial<Parameters<typeof RouteMap>[0]> = {}) {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <RouteMap
          network="hsl"
          area={null}
          variant={null}
          pending={false}
          onStopSelect={() => {}}
          {...props}
        />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

const wentToTheCity = () => moves.some((move) => Math.abs(move.lat - CITY_LAT) < 0.001);

beforeEach(() => {
  localStorage.clear();
  moves = [];
  fits = [];

  /*
   * Recorded, not replaced. Stubbing these out leaves the map with no view of
   * its own, and the real Leaflet has to run for what is under test to mean
   * anything.
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

  const fitBounds = L.Map.prototype.fitBounds;
  vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (
    this: L.Map,
    bounds: L.LatLngBoundsExpression,
    options?: L.FitBoundsOptions,
  ) {
    // Normalised on the way in, so the assertions below can ask a box about
    // its corners rather than each one re-deriving them from a tuple.
    fits.push(L.latLngBounds(bounds as L.LatLngBoundsLiteral));
    return fitBounds.call(this, bounds, options);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('RouteMap framing', () => {
  it('rests on the city when no line is wanted', () => {
    show();

    expect(wentToTheCity()).toBe(true);
    expect(fits).toEqual([]);
  });

  /*
   * Framed on the drawn geometry rather than on the stops. A shape can bow well
   * outside the straight line between two stops — this one reaches 24.9 while
   * every stop sits at 24.94 — and a frame that clips it reads as the line
   * running off the edge of the map.
   */
  it('frames the line on its own geometry, bows included', () => {
    show({ variant: TRAM_1 });

    const box = fits[fits.length - 1]!;
    expect(box.getSouth()).toBeCloseTo(60.158, 4);
    expect(box.getNorth()).toBeCloseTo(60.22, 4);
    expect(box.getWest()).toBeCloseTo(24.9, 4);
    expect(box.getEast()).toBeCloseTo(24.95, 4);
  });

  /* A feed without shapes.txt still has a line; it runs straight between its
     stops rather than not being drawn. */
  it('falls back to the stop sequence when the feed has no shape', () => {
    show({ variant: { ...TRAM_1, shape: null } });

    const box = fits[fits.length - 1]!;
    expect(box.getWest()).toBeCloseTo(24.94, 4);
    expect(box.getEast()).toBeCloseTo(24.94, 4);
  });

  /*
   * The bug. Switching variant clears the resolved one a moment before the next
   * arrives, and "no line resolved" is indistinguishable from "no line wanted"
   * unless something says so — so the map takes the gap as permission to go
   * home, and the reader sees a zoom out to the city and no zoom back in.
   */
  it('holds still while the next line is on its way', () => {
    const { rerender } = show({ variant: TRAM_1 });
    moves = [];
    fits = [];

    rerender(
      <LocaleProvider>
        <ThemeProvider>
          <RouteMap
            network="hsl"
            area={null}
            variant={null}
            pending
            onStopSelect={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(wentToTheCity()).toBe(false);
    expect(moves).toEqual([]);
    expect(fits).toEqual([]);
  });

  it('frames the next line once it arrives, without visiting the city', () => {
    const { rerender } = show({ variant: TRAM_1 });
    moves = [];
    fits = [];

    rerender(
      <LocaleProvider>
        <ThemeProvider>
          <RouteMap
            network="hsl"
            area={null}
            variant={BUS_550}
            pending={false}
            onStopSelect={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(wentToTheCity()).toBe(false);
    const box = fits[fits.length - 1]!;
    expect(box.getWest()).toBeCloseTo(24.8, 4);
  });
});

describe('RouteMap drawing', () => {
  /*
   * A Leaflet path's `className` is applied when the element is created and
   * never touched again, so a layer reused across a change of variant keeps the
   * colour it was born with — a bus line drawn in tram green. Keys scoped to
   * the variant are what force a remount, and this is the assertion that says
   * the repaint actually happened.
   */
  it('repaints in the new line’s colour when the variant changes', () => {
    const { container, rerender } = show({ variant: TRAM_1 });
    expect(container.querySelector('.stroke-mode-tram')).toBeTruthy();
    expect(container.querySelector('.stroke-mode-bus')).toBeNull();

    rerender(
      <LocaleProvider>
        <ThemeProvider>
          <RouteMap
            network="hsl"
            area={null}
            variant={BUS_550}
            pending={false}
            onStopSelect={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(container.querySelector('.stroke-mode-bus')).toBeTruthy();
    expect(container.querySelector('.stroke-mode-tram')).toBeNull();
  });

  it('opens the stop somebody presses', () => {
    const onStopSelect = vi.fn();
    const { container } = show({ variant: TRAM_1, onStopSelect });

    // The circles, in pattern order, drawn after the line's two polylines.
    const circles = [...container.querySelectorAll('path.leaflet-interactive')];
    expect(circles).toHaveLength(TRAM_1.stops.length);

    circles[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onStopSelect).toHaveBeenCalledWith('id-1');
  });
});
