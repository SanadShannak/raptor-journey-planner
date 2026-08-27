import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { JourneyMap } from './JourneyMap';
import { forgetMaps, liveMap } from '../test/mapStub';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../types/journey';

/*
 * jsdom has no layout and no WebGL, so the map module is replaced outright —
 * see `test/mapStub.ts`. Nothing measurable can be asserted here either: the
 * map's size is zero, which means no real framing and no tiles.
 *
 * What *is* worth pinning is the thing that would otherwise only be visible by
 * eye and is easy to break silently: that a route line is painted from the
 * mode's own design token.
 *
 * That token is why a bus line is the same blue on the map as on its chip in
 * the sidebar, and why it follows the palette into dark mode. On a GL map the
 * paint property needs a *value*, so the resolved colour travels with the
 * feature — but a resolved `#3b6fd4` proves nothing about where it came from,
 * and in jsdom, which loads no stylesheet, every token resolves to the same
 * fallback. So the provenance travels with it as `token`, and that is what
 * these assert on. See `journeyLayers.ts`.
 */

/** The features of one overlay source, as the map was given them. */
function features(source: string) {
  const data = liveMap().getSource(source)?.data as
    | { features?: { properties: Record<string, unknown> }[] }
    | undefined;
  return data?.features ?? [];
}

/** Which tokens the drawn lines were painted from. */
const lineTokens = () =>
  features('journey-lines').map((feature) => feature.properties['token']);

/** The ids of the layers drawn from an overlay, in the order they were added. */
const layerIds = (source: string) =>
  [...liveMap().layers.values()]
    .filter((layer) => layer.source === source)
    .map((layer) => layer.id);

const stop = (name: string, lat: number, lon: number): Stop => ({
  id: '1',
  name,
  code: null,
  platform: null,
  lat,
  lon,
});

const pin = (name: 'ORIGIN' | 'TARGET', lat: number, lon: number): Stop => ({
  id: null,
  name,
  code: name === 'ORIGIN' ? 'ORIGIN_PIN' : 'TARGET_PIN',
  platform: null,
  lat,
  lon,
});

const walk = (from: Stop, to: Stop): WalkLeg => ({
  mode: 'WALK',
  waitDurationMinutes: 0,
  startDate: '2026-08-24',
  startTime: '18:00',
  endDate: '2026-08-24',
  endTime: '18:05',
  fromStop: from,
  toStop: to,
  shape: [
    [from.lat, from.lon],
    [to.lat, to.lon],
  ],
  walkDurationMinutes: 5,
  walkDistanceMeters: 300,
  routeShortName: null,
  routeType: null,
  lineId: null,
  patternId: null,
  routeLongName: null,
  directionId: null,
  headsign: null,
  destination: null,
  intermediateStops: null,
  tripId: null,
  transitDurationMinutes: null,
  transitDistanceMeters: null,
});

const ride = (from: Stop, to: Stop, routeType: number): TransitLeg => ({
  mode: 'TRANSIT',
  waitDurationMinutes: 0,
  startDate: '2026-08-24',
  startTime: '18:05',
  endDate: '2026-08-24',
  endTime: '18:20',
  fromStop: from,
  toStop: to,
  shape: [
    [from.lat, from.lon],
    [to.lat, to.lon],
  ],
  routeShortName: '55',
  routeType: routeType as TransitLeg['routeType'],
  lineId: 'bus-55',
  patternId: 0,
  routeLongName: null,
  directionId: null,
  headsign: null,
  destination: null,
  intermediateStops: [],
  tripId: 't',
  transitDurationMinutes: 15,
  transitDistanceMeters: 2000,
  walkDurationMinutes: null,
  walkDistanceMeters: null,
});

const journeyOf = (legs: Journey['legs']): Journey => ({
  startDate: '2026-08-24',
  startTime: '18:00',
  endDate: '2026-08-24',
  endTime: '18:25',
  totalDurationMinutes: 25,
  legs,
});

function view(
  journey: Journey | null,
  props: Partial<Parameters<typeof JourneyMap>[0]> = {},
) {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <JourneyMap
          journey={journey}
          network="hsl"
          area={null}
          onPick={() => {}}
          onRename={() => {}}
          onStopSelect={() => {}}
          selectedStopId={null}
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
async function show(
  journey: Journey | null,
  props: Partial<Parameters<typeof JourneyMap>[0]> = {},
) {
  const result = render(view(journey, props));
  await act(async () => {});
  return result;
}

beforeEach(forgetMaps);

describe('JourneyMap', () => {
  it('mounts without a journey to draw', async () => {
    await show(null);
    expect(liveMap().removed).toBe(false);
  });

  /*
   * routeType 3 is a bus, whose family is `bus`, whose stroke class is
   * `stroke-mode-bus` — which resolves to `--color-mode-bus`, the very token
   * the sidebar's chip uses, and which the stylesheet remaps in dark mode.
   */
  it('strokes a ride with its mode’s own colour token', async () => {
    await show(journeyOf([ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3)]));

    expect(lineTokens()).toEqual(['mode-bus']);
  });

  it('gives each mode its own token rather than one shared colour', async () => {
    const a = stop('A', 60.1, 24.9);
    const b = stop('B', 60.2, 25.0);
    const c = stop('C', 60.3, 25.1);

    // routeType 2 is rail — the "train" family — and 0 is a tram.
    await show(journeyOf([ride(a, b, 2), ride(b, c, 0)]));

    expect(lineTokens()).toEqual(['mode-train', 'mode-tram']);
  });

  /*
   * The casing has to be *under* the colour. On a GL map that means added
   * first — the last layer added is on top — where under Leaflet it meant
   * earlier in the SVG document. Drawn the other way round the casing paints
   * over the very line it exists to protect.
   */
  it('lays the casing beneath the colour, not over it', async () => {
    await show(journeyOf([ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3)]));

    const ids = layerIds('journey-lines');
    expect(ids.indexOf('journey-lines-casing-ride')).toBeLessThan(
      ids.indexOf('journey-lines-ride'),
    );
  });

  /*
   * A walk is a straight line the engine measured as the crow flies, so it is
   * dashed here exactly as it is in the strip map. The dash is the drawing
   * admitting it is an estimate rather than a route.
   */
  it('dashes a walk, and leaves a ride solid', async () => {
    await show(
      journeyOf([
        walk(pin('ORIGIN', 60.0, 24.8), stop('A', 60.1, 24.9)),
        ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3),
      ]),
    );

    /*
     * `line-dasharray` cannot be driven from a feature's own properties, so
     * walking and riding are separate layers filtered apart — and the split is
     * the thing worth pinning, since a walk drawn by the solid layer would be
     * indistinguishable from a route the engine actually knows.
     */
    const walkLayer = liveMap().getLayer('journey-lines-walk');
    const rideLayer = liveMap().getLayer('journey-lines-ride');
    expect(walkLayer?.paint?.['line-dasharray']).toBeTruthy();
    expect(rideLayer?.paint?.['line-dasharray']).toBeUndefined();

    const walks = features('journey-lines').filter((f) => f.properties['walk']);
    expect(walks).toHaveLength(1);
  });

  it('marks the two ends the journey actually has', async () => {
    const { container } = await show(
      journeyOf([walk(pin('ORIGIN', 60.0, 24.8), pin('TARGET', 60.2, 25.0))]),
    );

    // The origin, in the green this app has always started journeys in, and
    // deliberately not the single ring that every stop on this map is.
    expect(container.querySelector('svg.text-mode-tram')).toBeTruthy();
    // The destination pin, drawn from the path the form and strip map share.
    expect(container.querySelector('svg.text-brand-500')).toBeTruthy();
  });

  /*
   * The regression this file exists for.
   *
   * Leaflet applied a path's `className` when it created the element and never
   * again, so a layer reused for a second journey kept the first one's colour:
   * pick a later departure that starts by tram and it was still drawn in the
   * bus blue of the one before it.
   *
   * A GL layer cannot fail this way — the colour is in the data rather than in
   * a class fixed at creation — but the assertion is kept, because what it
   * actually guards is that new data reaches the source at all. A `setData`
   * that never fired would look exactly like the old bug.
   */
  it('repaints when the journey changes, rather than keeping the old colours', async () => {
    const a = stop('A', 60.1, 24.9);
    const b = stop('B', 60.2, 25.0);

    const { rerender } = await show(journeyOf([ride(a, b, 3)]));
    expect(lineTokens()).toEqual(['mode-bus']);

    // A different journey, same shape, different vehicle: 0 is a tram.
    await act(async () => {
      rerender(view({ ...journeyOf([ride(a, b, 0)]), startTime: '19:00' }));
    });

    expect(lineTokens()).toEqual(['mode-tram']);
  });

  // Present so they can be inspected later; quiet so they are not in the way.
  it('dots the stops a vehicle passes through', async () => {
    await show(
      journeyOf([
        {
          ...ride(stop('A', 60.1, 24.9), stop('B', 60.3, 25.1), 3),
          intermediateStops: [
            {
              stopId: '9',
              stopName: 'Middle',
              stopCode: null,
              stopLat: 60.2,
              stopLon: 25.0,
              stopArrivalTime: '18:10',
            },
          ],
        },
      ]),
    );

    // Two calls (board, alight) plus the one ridden through.
    const circles = features('journey-stops');
    expect(circles.filter((f) => f.properties['call'])).toHaveLength(2);
    expect(circles.filter((f) => !f.properties['call'])).toHaveLength(1);
    expect(circles.every((f) => f.properties['token'] === 'mode-bus')).toBe(true);
  });

  /*
   * A ride is named by its line. A walk has no name, so it is named by what it
   * costs — the thing you would want to know before taking this itinerary at
   * all.
   */
  it('badges a ride with its line, and a walk with its length', async () => {
    const { container } = await show(
      journeyOf([
        walk(pin('ORIGIN', 60.0, 24.8), stop('A', 60.1, 24.9)),
        ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3),
      ]),
    );

    const badges = [...container.querySelectorAll('.ring-surface')];
    expect(badges).toHaveLength(2);
    // Trimmed: the silhouette's own markup carries the indentation it is
    // written with, and `textContent` collects it. Sorted because the order
    // they are placed in is the decluttering's business, not this test's.
    expect(badges.map((b) => b.textContent?.trim()).sort()).toEqual(['5 min', '55']);
  });
});

/*
 * Pressing the map is another way to fill the form in. What is worth pinning
 * is the fallback: a geocoder that cannot name the spot — or has nothing to
 * say about it — must still hand back a usable end of a journey, because a
 * coordinate is one whether or not anybody can name it.
 *
 * The press is delivered as the map's own `click`, carrying the coordinates it
 * resolved. Under Leaflet this was a DOM event on the container; a GL map
 * projects the point itself and hands over a `lngLat`, so that is what the
 * test supplies.
 */
async function press(at: { lat: number; lon: number } = { lat: 60.17, lon: 24.94 }) {
  await act(async () => {
    liveMap().fire('click', {
      lngLat: { lat: at.lat, lng: at.lon },
      point: { x: 10, y: 10 },
    });
  });
}

describe('choosing a point on the map', () => {
  it('offers the pressed point as either end', async () => {
    const picks: Array<[string, string]> = [];
    await show(null, { onPick: (place, end) => picks.push([place.label, end]) });

    await press();

    const start = await screen.findByRole('button', { name: 'Start here' });
    expect(screen.getByRole('button', { name: 'End here' })).toBeTruthy();

    fireEvent.click(start);
    // Photon answers nothing in a test, so the point keeps the honest name.
    expect(picks).toEqual([['Selected location', 'origin']]);
  });

  it('takes the coordinates the map resolved, not the ones on screen', async () => {
    const picks: Array<{ lat: number; lon: number }> = [];
    await show(null, { onPick: (place) => picks.push({ lat: place.lat, lon: place.lon }) });

    await press({ lat: 60.1699, lon: 24.9384 });
    fireEvent.click(await screen.findByRole('button', { name: 'Start here' }));

    /*
     * The one conversion this port could silently get wrong: everything in
     * this app is [lat, lon] and MapLibre speaks [lon, lat]. Swapped, Helsinki
     * lands in the Arabian Sea — a plausible-looking point, and no error.
     */
    expect(picks).toEqual([{ lat: 60.1699, lon: 24.9384 }]);
  });
});

/*
 * The card asks a question and closes on being answered. It used to open
 * saying one thing and change to another under the pointer, because it was
 * asking the geocoder on the press — a name arriving is not worth a card
 * rewriting itself while somebody is reading it.
 */
describe('the pick card', () => {
  it('closes once an end has been chosen', async () => {
    await show(null);
    await press();

    fireEvent.click(await screen.findByRole('button', { name: 'End here' }));

    expect(screen.queryByRole('button', { name: 'End here' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start here' })).toBeNull();
  });

  it('can be dismissed without choosing an end', async () => {
    const picks: string[] = [];
    await show(null, { onPick: (_place, end) => picks.push(end) });

    await press();
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('button', { name: 'Start here' })).toBeNull();
    // Dismissing is not choosing: nothing reaches the form.
    expect(picks).toEqual([]);
  });

  it('goes when the map is driven out from under it', async () => {
    await show(null);
    await press();
    expect(await screen.findByRole('button', { name: 'Start here' })).toBeTruthy();

    /*
     * It was asked about a point, and once that point is somewhere else on the
     * screen the card is a label for nothing. `movestart` rather than the end
     * of the move, so it goes at the first sign of the map being driven.
     */
    await act(async () => liveMap().fire('movestart'));

    expect(screen.queryByRole('button', { name: 'Start here' })).toBeNull();
  });

  it('stays open across a re-render', async () => {
    const { rerender } = await show(null);

    await press();
    expect(await screen.findByRole('button', { name: 'Start here' })).toBeTruthy();

    // A new handler identity is all it takes: this is what every parent render
    // hands down, and it must not disturb the question being asked.
    await act(async () => {
      rerender(view(null, { onPick: () => {} }));
    });

    expect(screen.getByRole('button', { name: 'Start here' })).toBeTruthy();
  });
});
