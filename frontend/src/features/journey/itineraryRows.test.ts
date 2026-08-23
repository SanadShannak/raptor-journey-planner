import { describe, expect, it } from 'vitest';
import { itineraryRows, type ItineraryRow } from './itineraryRows';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../../types/journey';

/*
 * The rule under test is not one a reader can check by eye: a stop appears
 * once or twice depending on whether anything is waited out there, and the
 * spine that gets drawn depends on the rows either side of each node. Both are
 * silently wrong-lookable — a missing departure time reads as a tidier design
 * rather than as a lost fact.
 */

const stop = (
  id: string,
  name: string,
  code: string | null = null,
  platform: string | null = null,
): Stop => ({
  id,
  name,
  code,
  platform,
  lat: 60,
  lon: 24,
});

const originPin: Stop = {
  id: null,
  name: 'ORIGIN',
  code: 'ORIGIN_PIN',
  platform: null,
  lat: 60,
  lon: 24,
};
const targetPin: Stop = {
  id: null,
  name: 'TARGET',
  code: 'TARGET_PIN',
  platform: null,
  lat: 60,
  lon: 24,
};

function walk(from: Stop, to: Stop, start: string, end: string, wait = 0): WalkLeg {
  return {
    mode: 'WALK',
    waitDurationMinutes: wait,
    startDate: '2026-08-24',
    startTime: start,
    endDate: '2026-08-24',
    endTime: end,
    fromStop: from,
    toStop: to,
    shape: [
      [60, 24],
      [60, 24],
    ],
    walkDurationMinutes: 4,
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
  };
}

function ride(
  from: Stop,
  to: Stop,
  start: string,
  end: string,
  wait = 0,
  routeType: 0 | 3 = 3,
): TransitLeg {
  return {
    mode: 'TRANSIT',
    waitDurationMinutes: wait,
    startDate: '2026-08-24',
    startTime: start,
    endDate: '2026-08-24',
    endTime: end,
    fromStop: from,
    toStop: to,
    shape: [
      [60, 24],
      [60, 24],
    ],
    routeShortName: '55',
    routeType,
    lineId: 'bus-55',
    routeLongName: null,
    directionId: null,
    headsign: null,
    destination: 'Rautatientori',
    intermediateStops: [],
    tripId: 't1',
    transitDurationMinutes: 10,
    transitDistanceMeters: 2000,
    walkDurationMinutes: null,
    walkDistanceMeters: null,
  };
}

function journeyOf(legs: Journey['legs']): Journey {
  return {
    startDate: '2026-08-24',
    startTime: legs[0]?.startTime ?? '18:00',
    endDate: '2026-08-24',
    endTime: legs[legs.length - 1]?.endTime ?? '19:00',
    totalDurationMinutes: 60,
    legs,
  };
}

const labels = {
  origin: { name: 'Kamppi', context: 'Helsinki' },
  destination: { name: 'Kallio', context: null },
  fallback: 'Selected location',
};

/** Node rows only, as `name @ time`, which is what the diagram shows. */
function nodes(rows: ItineraryRow[]): string[] {
  return rows
    .filter((row) => row.type === 'node')
    .map((row) => `${row.name} @ ${row.time}`);
}

describe('itineraryRows', () => {
  it('alternates node and segment, starting and ending with a node', () => {
    const rows = itineraryRows(
      journeyOf([
        walk(originPin, stop('1', 'Kyläsaarenkatu'), '18:00', '18:05'),
        ride(stop('1', 'Kyläsaarenkatu'), targetPin, '18:05', '18:20'),
      ]),
      labels,
    );

    const kinds = rows.map((row) => (row.type === 'node' ? 'node' : 'segment'));
    expect(kinds).toEqual(['node', 'segment', 'node', 'segment', 'node']);
  });

  /*
   * The load-bearing one. Waiting happens *at* a stop, between arriving and
   * departing, so the stop is two events and needs both times shown.
   */
  it('shows a stop twice when there is a wait, with both times', () => {
    const change = stop('2', 'Rautatientori', 'H0101');

    const rows = itineraryRows(
      journeyOf([
        ride(originPin, change, '18:00', '18:24'),
        ride(change, targetPin, '18:30', '18:50', 6),
      ]),
      labels,
    );

    expect(nodes(rows)).toEqual([
      'Kamppi @ 18:00',
      'Rautatientori @ 18:24',
      'Rautatientori @ 18:30',
      'Kallio @ 18:50',
    ]);

    const wait = rows.find((row) => row.type === 'wait');
    expect(wait?.type === 'wait' && wait.minutes).toBe(6);
    expect(wait?.type === 'wait' && wait.place).toBe('Rautatientori');
  });

  // With nothing to wait out, arriving and departing are the same moment.
  it('shows a stop once when the connection is immediate', () => {
    const change = stop('2', 'Rautatientori');

    const rows = itineraryRows(
      journeyOf([
        ride(originPin, change, '18:00', '18:24'),
        ride(change, targetPin, '18:24', '18:50', 0),
      ]),
      labels,
    );

    expect(nodes(rows)).toEqual([
      'Kamppi @ 18:00',
      'Rautatientori @ 18:24',
      'Kallio @ 18:50',
    ]);
    expect(rows.some((row) => row.type === 'wait')).toBe(false);
  });

  /*
   * The engine's synthetic stops are named "ORIGIN" and "TARGET", which are
   * placeholders rather than places. Showing either to a traveller is worse
   * than showing nothing.
   */
  it('replaces the pin placeholders with what the traveller chose', () => {
    const rows = itineraryRows(
      journeyOf([walk(originPin, targetPin, '18:00', '18:20')]),
      labels,
    );

    expect(nodes(rows)).toEqual(['Kamppi @ 18:00', 'Kallio @ 18:20']);
  });

  it('falls back to a generic name when no place was chosen', () => {
    const rows = itineraryRows(journeyOf([walk(originPin, targetPin, '18:00', '18:20')]), {
      ...labels,
      origin: { name: null, context: null },
      destination: { name: null, context: null },
    });

    expect(nodes(rows)).toEqual([
      'Selected location @ 18:00',
      'Selected location @ 18:20',
    ]);
  });

  /*
   * The line under a node. A pin is not a stop and has no code, so what goes
   * there is where the traveller's own chosen place is — and the node used to
   * print "Start" beneath a node already named "Start".
   */
  it('puts the chosen place\u2019s own context under an end node', () => {
    const rows = itineraryRows(
      journeyOf([walk(originPin, targetPin, '18:00', '18:20')]),
      labels,
    );

    const nodeRows = rows.filter((row) => row.type === 'node');
    expect(nodeRows[0]?.detail).toBe('Helsinki');
    // Null rather than a placeholder: the geocoder offered nothing to say.
    expect(nodeRows[1]?.detail).toBeNull();
  });

  it('puts a real stop\u2019s own code under it, at either end or in between', () => {
    const rows = itineraryRows(
      journeyOf([
        ride(originPin, stop('2', 'Rautatientori', 'H0101'), '18:00', '18:24'),
        ride(stop('2', 'Rautatientori', 'H0101'), stop('9', 'Kallio', 'H0202'), '18:30', '18:50', 6),
      ]),
      labels,
    );

    const nodeRows = rows.filter((row) => row.type === 'node');
    expect(nodeRows.map((row) => row.detail)).toEqual([
      'Helsinki',
      'H0101',
      'H0101',
      'H0202',
    ]);
  });

  // A real stop keeps its own name even at the end of the journey.
  it('keeps a real stop name rather than the destination label', () => {
    const rows = itineraryRows(
      journeyOf([ride(originPin, stop('9', 'Kallion virastotalo'), '18:00', '18:20')]),
      labels,
    );

    expect(nodes(rows)[1]).toBe('Kallion virastotalo @ 18:20');
  });

  /*
   * What makes the line run circle to circle: each node knows the segment
   * above and below it, so a colour starts and stops exactly at a node instead
   * of overshooting or falling short of one.
   */
  it('gives every node the spine of the segments either side of it', () => {
    const change = stop('2', 'Rautatientori');

    const rows = itineraryRows(
      journeyOf([
        walk(originPin, change, '18:00', '18:05'),
        ride(change, targetPin, '18:10', '18:30', 5),
      ]),
      labels,
    );

    const nodeRows = rows.filter((row) => row.type === 'node');

    // The origin has nothing arriving at it, the destination nothing leaving.
    expect(nodeRows[0]?.above).toBeNull();
    expect(nodeRows[0]?.below).toEqual({ kind: 'walk' });

    expect(nodeRows[1]?.above).toEqual({ kind: 'walk' });
    expect(nodeRows[1]?.below).toEqual({ kind: 'wait' });

    expect(nodeRows[2]?.above).toEqual({ kind: 'wait' });
    expect(nodeRows[2]?.below).toEqual({ kind: 'transit', family: 'bus' });

    expect(nodeRows[3]?.above).toEqual({ kind: 'transit', family: 'bus' });
    expect(nodeRows[3]?.below).toBeNull();
  });

  it('carries the mode family so the segment takes the vehicle’s colour', () => {
    const rows = itineraryRows(
      journeyOf([ride(originPin, targetPin, '18:00', '18:20', 0, 0)]),
      labels,
    );

    const segment = rows.find((row) => row.type === 'segment');
    expect(segment?.type === 'segment' && segment.spine).toEqual({
      kind: 'transit',
      family: 'tram',
    });
  });

  // Every row needs a stable key, and a stop visited twice must not collide.
  it('gives every row a distinct key', () => {
    const change = stop('2', 'Rautatientori');
    const rows = itineraryRows(
      journeyOf([
        ride(originPin, change, '18:00', '18:24'),
        ride(change, targetPin, '18:30', '18:50', 6),
      ]),
      labels,
    );

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

/*
 * A wait is drawn exactly when the API reports one. That is only safe because
 * the API measures its durations between the times it publishes — the wait
 * here and the gap between the two clock readings on the page are the same
 * number, so a stop cannot be split by a minute the reader cannot see.
 */
describe('a wait of nothing', () => {
  it('draws one node when there is no wait to draw', () => {
    const change = stop('2', 'Sörnäinen');

    const rows = itineraryRows(
      journeyOf([
        ride(originPin, change, '01:30', '01:49'),
        ride(change, targetPin, '01:49', '02:10', 0),
      ]),
      labels,
    );

    expect(nodes(rows)).toEqual([
      'Kamppi @ 01:30',
      'Sörnäinen @ 01:49',
      'Kallio @ 02:10',
    ]);
    expect(rows.some((row) => row.type === 'wait')).toBe(false);
  });

  it('splits the stop as soon as there is a minute in it', () => {
    const change = stop('2', 'Sörnäinen');

    const rows = itineraryRows(
      journeyOf([
        ride(originPin, change, '01:30', '01:49'),
        ride(change, targetPin, '01:50', '02:10', 1),
      ]),
      labels,
    );

    expect(nodes(rows)).toEqual([
      'Kamppi @ 01:30',
      'Sörnäinen @ 01:49',
      'Sörnäinen @ 01:50',
      'Kallio @ 02:10',
    ]);
    const wait = rows.find((row) => row.type === 'wait');
    expect(wait?.type === 'wait' && wait.minutes).toBe(1);
  });
});
