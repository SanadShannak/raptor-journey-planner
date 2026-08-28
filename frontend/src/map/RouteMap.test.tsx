import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { RouteMap } from './RouteMap';
import { homeViewFor, ROUTE_STOPS_MIN_ZOOM, STOPS_MIN_ZOOM } from './homeView';
import { forgetMaps, liveMap } from '../test/mapStub';
import type { LineVariantDetail, PatternStop } from '../types/route';

/*
 * Where the map is told to look, and — the part that goes wrong — where it is
 * told not to.
 *
 * Asserted on the framing calls the map was asked to make, because the bug
 * this guards is not a wrong final position but an extra move on the way to
 * it: the map goes home and comes back, and the two animations collide so only
 * the first is ever seen. The stops map recorded the same lesson.
 *
 * A GL map needs WebGL, which jsdom has no notion of, so the module is
 * replaced — see `test/mapStub.ts`.
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

/**
 * Where this map opens, read from the same function the map reads.
 *
 * Not a number copied here: every map in the app shares one resting place now,
 * and a literal would quietly stop meaning "home" the next time it moved.
 */
const CITY = homeViewFor('hsl', null).center;

function view(props: Partial<Parameters<typeof RouteMap>[0]> = {}) {
  return (
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
async function show(props: Partial<Parameters<typeof RouteMap>[0]> = {}) {
  const result = render(view(props));
  await act(async () => {});
  return result;
}

/** The framing calls that centred the map, as `[lat, zoom]`. */
const centrings = () =>
  liveMap()
    .moves.filter((move) => move.kind !== 'fitBounds')
    .map((move) => ({ lat: move.center?.[1] ?? NaN, zoom: move.zoom }));

/**
 * The boxes the map was asked to fit, as corners.
 *
 * Normalised on the way out so the assertions can ask a box about its sides
 * rather than each one re-deriving them from a `[[west, south], [east, north]]`
 * tuple — which is itself the lat/lon swap this port has to keep straight.
 */
const fits = () =>
  liveMap()
    .moves.filter((move) => move.kind === 'fitBounds')
    .map((move) => {
      const [[west, south], [east, north]] = move.bounds!;
      return { west, south, east, north };
    });

/*
 * Both coordinates, not just the latitude. The resting place sits in central
 * Helsinki now, and a fixture stop can share a latitude with it while being
 * most of a kilometre away.
 */
const wentToTheCity = () =>
  liveMap().moves.some(
    (move) =>
      move.center !== undefined &&
      Math.abs(move.center[1] - CITY[0]) < 0.001 &&
      Math.abs(move.center[0] - CITY[1]) < 0.001,
  );

/** The degrees the first vehicle badge's arrow is turned by. */
function rotationOf(container: HTMLElement): number {
  const html = container.querySelector('.route-vehicle')?.innerHTML ?? '';
  return Number(/rotate\(([-\d.]+)/.exec(html)?.[1] ?? NaN);
}

/** Which token the drawn line was painted from. See `journeyLayers.ts`. */
function lineToken(): string | undefined {
  const data = liveMap().getSource('route-line')?.data as
    | { features?: { properties: Record<string, unknown> }[] }
    | undefined;
  return data?.features?.[0]?.properties['token'] as string | undefined;
}

beforeEach(() => {
  localStorage.clear();
  forgetMaps();
});

afterEach(() => vi.restoreAllMocks());

describe('RouteMap framing', () => {
  it('rests on the city when no line is wanted', async () => {
    await show();

    expect(wentToTheCity()).toBe(true);
    expect(fits()).toEqual([]);
  });

  /*
   * Framed on the drawn geometry rather than on the stops. A shape can bow well
   * outside the straight line between two stops — this one reaches 24.9 while
   * every stop sits at 24.94 — and a frame that clips it reads as the line
   * running off the edge of the map.
   */
  it('frames the line on its own geometry, bows included', async () => {
    await show({ variant: TRAM_1 });

    const box = fits().at(-1)!;
    expect(box.south).toBeCloseTo(60.158, 4);
    expect(box.north).toBeCloseTo(60.22, 4);
    expect(box.west).toBeCloseTo(24.9, 4);
    expect(box.east).toBeCloseTo(24.95, 4);
  });

  /* A feed without shapes.txt still has a line; it runs straight between its
     stops rather than not being drawn. */
  it('falls back to the stop sequence when the feed has no shape', async () => {
    await show({ variant: { ...TRAM_1, shape: null } });

    const box = fits().at(-1)!;
    expect(box.west).toBeCloseTo(24.94, 4);
    expect(box.east).toBeCloseTo(24.94, 4);
  });

  /*
   * The bug. Switching variant clears the resolved one a moment before the next
   * arrives, and "no line resolved" is indistinguishable from "no line wanted"
   * unless something says so — so the map takes the gap as permission to go
   * home, and the reader sees a zoom out to the city and no zoom back in.
   */
  it('holds still while the next line is on its way', async () => {
    const { rerender } = await show({ variant: TRAM_1 });
    liveMap().moves.length = 0;

    await act(async () => {
      rerender(view({ variant: null, pending: true }));
    });

    expect(wentToTheCity()).toBe(false);
    expect(liveMap().moves).toEqual([]);
  });

  it('frames the next line once it arrives, without visiting the city', async () => {
    const { rerender } = await show({ variant: TRAM_1 });
    liveMap().moves.length = 0;

    await act(async () => {
      rerender(view({ variant: BUS_550 }));
    });

    expect(wentToTheCity()).toBe(false);
    expect(fits().at(-1)!.west).toBeCloseTo(24.8, 4);
  });
});

describe('RouteMap drawing', () => {
  /*
   * A Leaflet path's `className` was applied when the element was created and
   * never touched again, so a layer reused across a change of variant kept the
   * colour it was born with — a bus line drawn in tram green.
   *
   * A GL layer cannot fail that way: the colour is in the data rather than in a
   * class fixed at creation. The assertion is kept because what it now guards
   * is that the new data reaches the source at all — a `setData` that never
   * fired would look exactly like the old bug.
   */
  it('repaints in the new line’s colour when the variant changes', async () => {
    const { rerender } = await show({ variant: TRAM_1 });
    expect(lineToken()).toBe('mode-tram');

    await act(async () => {
      rerender(view({ variant: BUS_550 }));
    });

    expect(lineToken()).toBe('mode-bus');
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
  it('puts a vehicle on the road rather than across the corner', async () => {
    const { container } = await show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'running', serviceDate: '2026-09-10', headsign: 'Käpylä', calls: [] },
          progress: { fromSequence: 0, toSequence: 2, fraction: 0.5, atStop: false },
        },
      ],
    });

    const marker = container.querySelector('.route-vehicle') as HTMLElement;
    expect(marker).toBeTruthy();
    // A pin with a beating halo, and the line's own designation inside it.
    expect(marker.querySelector('.vehicle-halo')).toBeTruthy();
    expect(marker.innerHTML).toContain(`>${TRAM_1.routeShortName}<`);
    // And a tail, turned to the heading of the stretch it is on.
    expect(marker.innerHTML).toContain('rotate(');
  });

  it('draws one badge per vehicle out on the line', async () => {
    const { container } = await show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'ahead', serviceDate: '2026-09-10', headsign: null, calls: [] },
          progress: { fromSequence: 1, toSequence: 2, fraction: 0.2, atStop: false },
        },
        {
          trip: { tripId: 'behind', serviceDate: '2026-09-10', headsign: null, calls: [] },
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
  it('turns the arrow to the heading of the stretch it is on', async () => {
    const onTheFirstLeg = await show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'a', serviceDate: '2026-09-10', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
        },
      ],
    });
    const north = rotationOf(onTheFirstLeg.container);
    onTheFirstLeg.unmount();

    const onTheSecondLeg = await show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'b', serviceDate: '2026-09-10', headsign: null, calls: [] },
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
   * open. Left interactive with nothing to do, a marker still swallows the
   * press, so a decoration would quietly eat clicks meant for the line or a
   * stop underneath it.
   */
  it('opens the run of a vehicle somebody presses', async () => {
    const onFollowTrip = vi.fn();
    const { container } = await show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'the-one', serviceDate: '2026-09-10', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
        },
      ],
      onFollowTrip,
    });

    const marker = container.querySelector('.route-vehicle-marker')
      ?.parentElement as HTMLElement;
    expect(marker.style.pointerEvents).toBe('auto');
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onFollowTrip).toHaveBeenCalledWith('the-one');
  });

  it('leaves a vehicle inert when there is no run to open', async () => {
    const { container } = await show({
      variant: TRAM_1,
      vehicles: [
        {
          trip: { tripId: 'the-one', serviceDate: '2026-09-10', headsign: null, calls: [] },
          progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
        },
      ],
      onFollowTrip: null,
    });

    const marker = container.querySelector('.route-vehicle-marker')
      ?.parentElement as HTMLElement;
    expect(marker.style.pointerEvents).toBe('none');
  });

  /*
   * Following one run, the map holds the vehicle instead of the line. A
   * corridor with a badge somewhere inside it does not answer "where is it" —
   * you have to find the badge before you can read anything from it.
   */
  it('holds the map on the vehicle when one run is being followed', async () => {
    const vehicle = {
      trip: { tripId: 'the-one', serviceDate: '2026-09-10', headsign: null, calls: [] },
      progress: { fromSequence: 0, toSequence: 1, fraction: 0.5, atStop: false },
    };

    const { rerender } = await show({
      variant: TRAM_1,
      vehicles: [vehicle],
      chase: true,
    });

    // The line's own box is never fitted; the vehicle is centred instead.
    expect(fits()).toEqual([]);
    const centred = centrings().at(-1)!;
    expect(centred.lat).toBeGreaterThan(TRAM_1.stops[0]!.lat);
    expect(centred.lat).toBeLessThan(TRAM_1.stops[1]!.lat);
    expect(centred.zoom).toBeGreaterThanOrEqual(15);

    liveMap().moves.length = 0;
    await act(async () => {
      rerender(
        view({
          variant: TRAM_1,
          vehicles: [{ ...vehicle, progress: { ...vehicle.progress, fraction: 0.9 } }],
          chase: true,
        }),
      );
    });

    // It moved along with it, rather than sitting where it first found it.
    expect(centrings().at(-1)!.lat).toBeGreaterThan(centred.lat);
  });

  it('frames the whole line again once the run is let go', async () => {
    await show({ variant: TRAM_1, vehicles: [], chase: false });

    expect(fits().length).toBeGreaterThan(0);
  });

  it('draws none when nothing is out', async () => {
    const { container } = await show({ variant: TRAM_1, vehicles: [] });
    expect(container.querySelectorAll('.route-vehicle')).toHaveLength(0);
  });

  /*
   * The stops between the ends. The first and last are drawn as the target and
   * pin the planner uses, not as circles — a slightly bigger circle among
   * circles was not a distinction anybody read.
   *
   * The circles are one GL layer rather than elements, so the id travels on the
   * feature and a press is answered by asking the map what is under it. The
   * layer named in the query is part of what is under test: a handler reading
   * the wrong layer would find nothing and silently do nothing.
   */
  it('opens the stop somebody presses', async () => {
    const onStopSelect = vi.fn();
    const { container } = await show({ variant: TRAM_1, onStopSelect });

    const data = liveMap().getSource('route-stops')?.data as {
      features: { properties: Record<string, unknown> }[];
    };
    expect(data.features).toHaveLength(TRAM_1.stops.length - 2);
    // The two ends, drawn as the marks the planner uses rather than as circles.
    expect(container.querySelector('svg.text-brand-500')).toBeTruthy();

    liveMap().hits = [{ layer: 'route-stops-passed', properties: { id: 'id-1' } }];
    await act(async () => {
      liveMap().fire('click', { point: { x: 5, y: 5 }, lngLat: { lat: 60.19, lng: 24.94 } });
    });

    expect(onStopSelect).toHaveBeenCalledWith('id-1');
  });
});

/*
 * What the map is actually holding.
 *
 * These three cover a failure that every other test in this file was blind
 * to, because each of them asks about one overlay and the bug was in how two
 * of them get along.
 */
describe('RouteMap overlays', () => {
  const sourceIds = () =>
    [...liveMap().sources.keys()].filter((id) => id.startsWith('route-'));

  /*
   * Both, and this is the regression.
   *
   * The layers used to be gated on `map.isStyleLoaded()`, which asks a
   * different question than it looks like it does: it is false while any
   * source is still loading, and adding a source is what makes one. So the
   * first overlay added turned the answer false and the second was refused —
   * every time, not sometimes — and it never came back, because nothing it
   * depended on ever changed again. The stop circles had never once drawn.
   */
  it('draws the line and the stop circles, not just whichever went first', async () => {
    await show({ variant: TRAM_1 });

    expect(sourceIds().sort()).toEqual(['route-line', 'route-stops']);
  });

  /*
   * The map is *constructed* with a style, so re-applying it is not a no-op to
   * be tidied away: `setStyle` discards the whole style document and every
   * source and layer on it. Doing that once at startup is what made a drawn
   * route come and go depending on where the data landed in the sequence.
   */
  it('does not re-apply the style the map was built with', async () => {
    await show({ variant: TRAM_1 });

    expect(liveMap().styleSets).toEqual([]);
  });

  /*
   * And when the style genuinely is replaced — the colour scheme changed —
   * everything drawn on it has to come back, because a style swap discards it.
   */
  it('puts the overlays back after the style is replaced', async () => {
    await show({ variant: TRAM_1 });
    expect(sourceIds()).toHaveLength(2);

    // What a real swap does: empties the map, then announces the new style.
    await act(async () => {
      liveMap().setStyle('dark');
    });
    await act(async () => {});

    expect(sourceIds().sort()).toEqual(['route-line', 'route-stops']);
  });
});

/*
 * The map outlives the page, so leaving one has to leave the map clean.
 *
 * This is the half of pooling that is easy to get wrong, and it fails a whole
 * page later rather than where the mistake is: a layer left behind is only
 * noticed when the *next* page adds one with the same name and MapLibre
 * throws `Source "route-stops" already exists` — in an effect, which takes the
 * render down and shows a blank page.
 *
 * It bit exactly once, and for a reason worth keeping written down. React runs
 * a component's cleanups parent-first, so `MapCanvas` tidies up before any
 * layer does; it had been clearing the reference that `isAlive` reads, which
 * answered "the map is gone" to every layer still waiting to remove itself.
 * Each politely skipped its own cleanup, and all of them stayed.
 */
describe('handing the map back', () => {
  it('takes its overlays off, so the next page can add its own', async () => {
    const first = await show({ variant: TRAM_1 });
    const map = liveMap();
    expect([...map.sources.keys()].sort()).toEqual(['route-line', 'route-stops']);

    first.unmount();

    expect([...map.sources.keys()]).toEqual([]);
    expect([...map.layers.keys()]).toEqual([]);
  });

  it('can be drawn on again without colliding with what it drew before', async () => {
    (await show({ variant: TRAM_1 })).unmount();

    // The same map, borrowed again. Adding the same sources must not throw.
    const second = await show({ variant: BUS_550 });
    expect([...liveMap().sources.keys()].sort()).toEqual(['route-line', 'route-stops']);
    expect(second.container).toBeTruthy();
  });
});
