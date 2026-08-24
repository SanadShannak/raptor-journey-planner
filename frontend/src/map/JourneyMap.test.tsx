import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { JourneyMap } from './JourneyMap';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../types/journey';

/*
 * jsdom has no layout, so nothing measurable can be asserted here — the map's
 * size is zero, which means no framing, no zoom, no tiles. What *is* worth
 * pinning is the one thing that would otherwise only be visible by eye and is
 * easy to break silently: that a route line carries the mode's own token class.
 *
 * That class is why a bus line is the same blue on the map as on its chip in
 * the sidebar, and why it follows the palette into dark mode without any
 * JavaScript. Passing a colour value from JS instead would look identical in
 * light mode and be wrong in dark, which no reviewer would catch.
 */

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

function show(journey: Journey | null) {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <JourneyMap journey={journey} network="hsl" area={null} onPick={() => {}} onRename={() => {}} />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe('JourneyMap', () => {
  it('mounts without a journey to draw', () => {
    const { container } = show(null);
    expect(container.querySelector('.leaflet-container')).toBeTruthy();
  });

  /*
   * routeType 3 is a bus, whose family is `bus`, whose stroke class is
   * `stroke-mode-bus` — which resolves to `--color-mode-bus`, the very token
   * the sidebar's chip uses, and which the stylesheet remaps in dark mode.
   */
  it('strokes a ride with its mode’s own colour token', () => {
    const { container } = show(
      journeyOf([ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3)]),
    );

    expect(container.querySelector('path.stroke-mode-bus')).toBeTruthy();
  });

  it('gives each mode its own token rather than one shared colour', () => {
    const a = stop('A', 60.1, 24.9);
    const b = stop('B', 60.2, 25.0);
    const c = stop('C', 60.3, 25.1);

    // routeType 2 is rail — the "train" family — and 0 is a tram.
    const { container } = show(journeyOf([ride(a, b, 2), ride(b, c, 0)]));

    expect(container.querySelector('path.stroke-mode-train')).toBeTruthy();
    expect(container.querySelector('path.stroke-mode-tram')).toBeTruthy();
  });

  /*
   * The casing has to be *under* the colour, which in SVG means earlier in the
   * document. Drawn the other way round it would paint over the very line it
   * exists to protect.
   */
  it('lays the casing beneath the colour, not over it', () => {
    const { container } = show(
      journeyOf([ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3)]),
    );

    const paths = [...container.querySelectorAll('path')];
    expect(paths[0]?.getAttribute('class')).toContain('stroke-surface');
    expect(paths[1]?.getAttribute('class')).toContain('stroke-mode-bus');
  });

  /*
   * A walk is a straight line the engine measured as the crow flies, so it is
   * dashed here exactly as it is in the strip map. The dash is the drawing
   * admitting it is an estimate rather than a route.
   */
  it('dashes a walk, and leaves a ride solid', () => {
    const { container } = show(
      journeyOf([
        walk(pin('ORIGIN', 60.0, 24.8), stop('A', 60.1, 24.9)),
        ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3),
      ]),
    );

    const dashed = [...container.querySelectorAll('path')].filter((path) =>
      path.getAttribute('stroke-dasharray'),
    );
    expect(dashed).toHaveLength(1);
  });

  it('marks the two ends the journey actually has', () => {
    const { container } = show(
      journeyOf([walk(pin('ORIGIN', 60.0, 24.8), pin('TARGET', 60.2, 25.0))]),
    );

    // The target, in the green this app has always started journeys in, and
    // deliberately not the single ring that every stop on this map is.
    expect(container.querySelector('.journey-marker svg.text-mode-tram')).toBeTruthy();
    // The destination pin, drawn from the path the form and strip map share.
    expect(container.querySelector('.journey-marker svg.text-brand-500')).toBeTruthy();
  });

  /*
   * The regression this file exists for.
   *
   * Leaflet applies a path's `className` when it creates the element and never
   * again, so a layer reused for a second journey kept the first one's colour:
   * pick a later departure that starts by tram and it was still drawn in the
   * bus blue of the one before it. Keying every layer to the journey is what
   * forces a fresh element, and this is the only way to see that it worked.
   */
  it('repaints when the journey changes, rather than keeping the old colours', () => {
    const a = stop('A', 60.1, 24.9);
    const b = stop('B', 60.2, 25.0);

    const { container, rerender } = show(journeyOf([ride(a, b, 3)]));
    expect(container.querySelector('path.stroke-mode-bus')).toBeTruthy();

    // A different journey, same shape, different vehicle: 0 is a tram.
    rerender(
      <LocaleProvider>
        <ThemeProvider>
          <JourneyMap
            journey={{ ...journeyOf([ride(a, b, 0)]), startTime: '19:00' }}
            network="hsl"
            area={null}
            onPick={() => {}}
            onRename={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(container.querySelector('path.stroke-mode-tram')).toBeTruthy();
    expect(container.querySelector('path.stroke-mode-bus')).toBeNull();
  });

  // Present so they can be inspected later; quiet so they are not in the way.
  it('dots the stops a vehicle passes through', () => {
    const { container } = show(
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
    expect(container.querySelectorAll('path.stroke-mode-bus')).toHaveLength(4);
  });

  /*
   * A ride is named by its line. A walk has no name, so it is named by what it
   * costs — the thing you would want to know before taking this itinerary at
   * all.
   */
  it('badges a ride with its line, and a walk with its length', () => {
    const { container } = show(
      journeyOf([
        walk(pin('ORIGIN', 60.0, 24.8), stop('A', 60.1, 24.9)),
        ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3),
      ]),
    );

    const badges = [...container.querySelectorAll('.journey-badge')];
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
 */
describe('choosing a point on the map', () => {
  it('offers the pressed point as either end', async () => {
    const picks: Array<[string, string]> = [];
    render(
      <LocaleProvider>
        <ThemeProvider>
          <JourneyMap
            journey={null}
            network="hsl"
            area={null}
            onPick={(place, end) => picks.push([place.label, end])}
            onRename={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    const map = document.querySelector('.leaflet-container');
    expect(map).toBeTruthy();
    fireEvent.click(map as Element, { clientX: 10, clientY: 10 });

    const start = await screen.findByRole('button', { name: 'Start here' });
    expect(screen.getByRole('button', { name: 'End here' })).toBeTruthy();

    fireEvent.click(start);
    // Photon answers nothing in a test, so the point keeps the honest name.
    expect(picks).toEqual([['Selected location', 'origin']]);
  });
});

/*
 * The popup asks a question and closes on being answered. It used to open
 * saying one thing and change to another under the pointer, because it was
 * asking the geocoder on the press — a name arriving is not worth a popup
 * rewriting itself while somebody is reading it.
 */
describe('the pick popup', () => {
  it('closes once an end has been chosen', async () => {
    render(
      <LocaleProvider>
        <ThemeProvider>
          <JourneyMap
            journey={null}
            network="hsl"
            area={null}
            onPick={() => {}}
            onRename={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    fireEvent.click(document.querySelector('.leaflet-container') as Element, {
      clientX: 10,
      clientY: 10,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'End here' }));

    expect(screen.queryByRole('button', { name: 'End here' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start here' })).toBeNull();
  });

  /*
   * A re-render must not disturb the question being asked. jsdom does not
   * reproduce the re-opening this was written for — Leaflet's `openOn` is a
   * no-op while the popup is already the map's current one, and without layout
   * the teardown path behaves differently — so this asserts the invariant
   * rather than the bug: whatever else changes, the popup stays put.
   */
  it('can be dismissed without choosing an end', async () => {
    const picks: string[] = [];
    render(
      <LocaleProvider>
        <ThemeProvider>
          <JourneyMap
            journey={null}
            network="hsl"
            area={null}
            onPick={(_place, end) => picks.push(end)}
            onRename={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    fireEvent.click(document.querySelector('.leaflet-container') as Element, {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('button', { name: 'Start here' })).toBeNull();
    // Dismissing is not choosing: nothing reaches the form.
    expect(picks).toEqual([]);
  });

  it('stays open across a re-render', async () => {
    const view = (onPick: () => void) => (
      <LocaleProvider>
        <ThemeProvider>
          <JourneyMap
            journey={null}
            network="hsl"
            area={null}
            onPick={onPick}
            onRename={() => {}}
          />
        </ThemeProvider>
      </LocaleProvider>
    );

    const { rerender } = render(view(() => {}));

    fireEvent.click(document.querySelector('.leaflet-container') as Element, {
      clientX: 10,
      clientY: 10,
    });
    expect(await screen.findByRole('button', { name: 'Start here' })).toBeTruthy();

    // A new handler identity is all it takes: this is what every parent render
    // hands down, and it must not disturb the question being asked.
    rerender(view(() => {}));

    expect(screen.getByRole('button', { name: 'Start here' })).toBeTruthy();
  });
});
