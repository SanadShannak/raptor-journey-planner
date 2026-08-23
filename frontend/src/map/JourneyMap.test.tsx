import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
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
        <JourneyMap journey={journey} network="hsl" area={null} />
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

  // Drawn beneath the colour so it reads over any basemap, light or dark.
  it('lays a surface-coloured casing under every line', () => {
    const { container } = show(
      journeyOf([ride(stop('A', 60.1, 24.9), stop('B', 60.2, 25.0), 3)]),
    );

    expect(container.querySelectorAll('path.stroke-surface')).toHaveLength(1);
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

    // The origin ring, in the same green the form's own marker uses.
    expect(container.querySelector('path.stroke-mode-tram')).toBeTruthy();
    // The destination pin, drawn from the shared path.
    expect(container.querySelector('.journey-marker svg')).toBeTruthy();
  });
});
