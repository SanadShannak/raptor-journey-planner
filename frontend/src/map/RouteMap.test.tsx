import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { RouteMap } from './RouteMap';
import { ROUTE_STOPS_MIN_ZOOM, STOPS_MIN_ZOOM } from './homeView';
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
  serviceDates: ['2026-09-10'],
  stops: [stop(0, 60.158), stop(1, 60.17), stop(2, 60.22)],
  shape: [
    [60.158, 24.934],
    [60.17, 24.9],
    [60.22, 24.95],
  ],
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
          vehicles={[]}
          {...props}
        />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

const wentToTheCity = () => moves.some((move) => Math.abs(move.lat - CITY_LAT) < 0.001);

/** The degrees the first vehicle badge's arrow is turned by. */
function rotationOf(container: HTMLElement): number {
  const html = container.querySelector('.route-vehicle')?.innerHTML ?? '';
  return Number(/rotate\(([-\d.]+)/.exec(html)?.[1] ?? NaN);
}

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
            vehicles={[]}
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
            vehicles={[]}
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
            vehicles={[]}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(container.querySelector('.stroke-mode-bus')).toBeTruthy();
    expect(container.querySelector('.stroke-mode-tram')).toBeNull();
  });

  /*
   * The network's other stops are context behind a drawn line, so they are held
   * back further here than on the page where they are the subject. A line framed
   * end to end covers a whole corridor; filling that with every stop in the city
   * buries the one thing the reader came for.
   */
  it('holds the network’s other stops back further than the stops page does', () => {
    expect(ROUTE_STOPS_MIN_ZOOM).toBe(STOPS_MIN_ZOOM + 2);
  });

  /*
   * Placed along the drawn shape, not between the two stops either side. The
   * elbow is the case that tells them apart: halfway from the first stop to the
   * last, a straight cut lands inside the corner — off the road the vehicle
   * actually drives.
   */
  it('puts a vehicle on the road rather than across the corner', () => {
    const { container } = show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'running', headsign: 'Käpylä', calls: [] },
          progress: { fromSequence: 0, toSequence: 2, fraction: 0.5, atStop: false },
        },
      ],
    });

    const marker = container.querySelector('.route-vehicle') as HTMLElement;
    expect(marker).toBeTruthy();
    // A rounded square rather than a circle, so it is not read as another stop.
    expect(marker.querySelector('rect[rx]')).toBeTruthy();
    // And an arrow, turned to the heading of the stretch it is on.
    expect(marker.innerHTML).toContain('rotate(');
  });

  it('draws one badge per vehicle out on the line', () => {
    const { container } = show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'ahead', headsign: null, calls: [] },
          progress: { fromSequence: 1, toSequence: 2, fraction: 0.2, atStop: false },
        },
        {
          trip: { tripId: 'behind', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: null, fraction: 0, atStop: true },
        },
      ],
    });

    expect(container.querySelectorAll('.route-vehicle')).toHaveLength(2);
  });

  /*
   * The arrow follows the road, not the straight line between two stops — and
   * this fixture is built to tell those apart. All three stops sit on the same
   * meridian, so interpolating between them would point every vehicle due north
   * whatever the line was doing. The shape bows west out of the first stop and
   * back east to the last, so the two legs have headings a long way apart and a
   * long way from north.
   */
  it('turns the arrow to the heading of the stretch it is on', () => {
    const onTheFirstLeg = show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'a', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
        },
      ],
    });
    const north = rotationOf(onTheFirstLeg.container);
    onTheFirstLeg.unmount();

    const onTheSecondLeg = show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'b', headsign: null, calls: [] },
          progress: { fromSequence: 1, toSequence: 2, fraction: 0.5, atStop: false },
        },
      ],
    });
    const east = rotationOf(onTheSecondLeg.container);

    // North-west out of the first stop, north-east into the last.
    expect(north).toBeCloseTo(305.4, 0);
    expect(east).toBeCloseTo(26.4, 0);
    // Neither is the due north a stop-to-stop line would have given.
    expect(Math.abs(north - 360)).toBeGreaterThan(20);
    expect(east).toBeGreaterThan(20);
  });

  /*
   * A vehicle is a door into its own run — but only where there is a run to
   * open. Left interactive with nothing to do, a Leaflet marker still swallows
   * the press, so a decoration would quietly eat clicks meant for the line or a
   * stop underneath it.
   */
  it('opens the run of a vehicle somebody presses', () => {
    const onFollowTrip = vi.fn();
    const { container } = show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'the-one', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
        },
      ],
      onFollowTrip,
    });

    const marker = container.querySelector('.route-vehicle-marker') as HTMLElement;
    expect(marker.classList.contains('leaflet-interactive')).toBe(true);
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onFollowTrip).toHaveBeenCalledWith('the-one');
  });

  it('leaves a vehicle inert when there is no run to open', () => {
    const { container } = show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'the-one', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
        },
      ],
      onFollowTrip: null,
    });

    const marker = container.querySelector('.route-vehicle-marker') as HTMLElement;
    expect(marker.classList.contains('leaflet-interactive')).toBe(false);
  });

  it('draws none when nothing is out', () => {
    const { container } = show({ variant: TRAM_1, vehicles: [] });
    expect(container.querySelectorAll('.route-vehicle')).toHaveLength(0);
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
