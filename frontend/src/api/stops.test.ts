import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStopBoard, getStopsInBounds, getStopTimetable } from './stops';
import { isApiError } from './errors';

/*
 * The parsing, not the request. A stop that cannot be placed or cannot be asked
 * about is not a stop this layer can use, and dropping it quietly is better
 * than drawing a marker at `undefined, undefined` — which Leaflet renders in
 * the Atlantic rather than refusing.
 */
function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const area = { minLat: 60.1, minLon: 24.9, maxLat: 60.2, maxLon: 25.0 };

afterEach(() => vi.unstubAllGlobals());

describe('getStopsInBounds', () => {
  it('sends the box as four numbers', async () => {
    const fetchMock = respondWith({ stops: [], truncated: false });

    await getStopsInBounds(area);

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/stops');
    expect(url.searchParams.get('minLat')).toBe('60.1');
    expect(url.searchParams.get('maxLon')).toBe('25');
  });

  it('reads a stop, and keeps the modes that pick its icon', async () => {
    respondWith({
      stops: [
        {
          id: '1020444',
          name: 'Lasipalatsi',
          code: 'H0101',
          lat: 60.170461,
          lon: 24.937728,
          description: 'Mannerheimintie',
          fareZone: 'A',
          platform: 'H0101',
          wheelchairAccessible: true,
          modes: [0, 3],
        },
      ],
      truncated: false,
    });

    const { stops, truncated } = await getStopsInBounds(area);

    expect(truncated).toBe(false);
    expect(stops[0]).toEqual({
      id: '1020444',
      name: 'Lasipalatsi',
      code: 'H0101',
      lat: 60.170461,
      lon: 24.937728,
      description: 'Mannerheimintie',
      fareZone: 'A',
      platform: 'H0101',
      wheelchairAccessible: true,
      modes: [0, 3],
    });
  });

  it('drops a stop it could not place or could not name', async () => {
    respondWith({
      stops: [
        { id: 'A', name: 'Fine', lat: 60.1, lon: 24.9, modes: [] },
        { id: 'B', name: 'No position', lat: null, lon: null, modes: [] },
        { name: 'No id', lat: 60.1, lon: 24.9, modes: [] },
        'not a stop at all',
      ],
      truncated: false,
    });

    const { stops } = await getStopsInBounds(area);

    expect(stops.map((stop) => stop.id)).toEqual(['A']);
  });

  /*
   * Absent is not the same as "not accessible". Collapsing the two would tell a
   * wheelchair user a stop is unusable when the truth is nobody published it.
   */
  it('keeps "nobody said" apart from "no"', async () => {
    respondWith({
      stops: [
        { id: 'A', name: 'A', lat: 60.1, lon: 24.9, modes: [] },
        { id: 'B', name: 'B', lat: 60.1, lon: 24.9, wheelchairAccessible: false, modes: [] },
      ],
      truncated: false,
    });

    const { stops } = await getStopsInBounds(area);

    expect(stops.map((stop) => stop.wheelchairAccessible)).toEqual([null, false]);
  });

  // The cap is the backend's, and a client must be able to see it was reached.
  it('reports a truncated answer as truncated', async () => {
    respondWith({ stops: [], truncated: true });
    expect((await getStopsInBounds(area)).truncated).toBe(true);
  });

  it('survives a body with no stops in it at all', async () => {
    respondWith({});
    expect(await getStopsInBounds(area)).toEqual({ stops: [], truncated: false });
  });
});

const STOP = {
  id: '2611502',
  name: 'Espoo',
  code: 'E6038',
  lat: 60.205172,
  lon: 24.656384,
  description: 'Espoonsilta',
  fareZone: 'C',
  platform: '1',
  wheelchairAccessible: true,
};

const DEPARTURE = {
  date: '2026-08-24',
  time: '15:52',
  arrivalDate: '2026-08-24',
  arrivalTime: '15:51',
  lineId: 'train-E',
  patternId: 716,
  routeShortName: 'E',
  routeType: 2,
  headsign: 'Kauklahti',
  destination: 'Kauklahti',
  terminatesHere: false,
  tripId: '3002E_20260814_Ma_1_1527',
  directionId: 0,
  routeLongName: 'Helsinki-Kauklahti',
};

describe('getStopBoard', () => {
  it('asks the singular endpoint, encoding the id into the path', async () => {
    const fetchMock = respondWith({ stop: STOP, asOf: {}, departures: [] });

    await getStopBoard('GTFS/HSL 1');

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/stop/GTFS%2FHSL%201');
    // Omitted rather than sent empty: the backend's own default is the answer.
    expect(url.searchParams.get('limit')).toBeNull();
  });

  it('passes a limit through when one is asked for', async () => {
    const fetchMock = respondWith({ stop: STOP, asOf: {}, departures: [] });

    await getStopBoard('1', { limit: 50 });

    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get('limit')).toBe('50');
  });

  it('reads the stop, the moment it was resolved, and the departures', async () => {
    respondWith({
      stop: STOP,
      asOf: { date: '2026-08-24', time: '15:44' },
      servingLines: [
        {
          lineId: 'train-E',
      patternId: null,
          routeShortName: 'E',
          routeType: 2,
          routeLongName: 'Helsinki-Kauklahti',
          directionId: 0,
          destinations: ['Kauklahti'],
        },
      ],
      departures: [DEPARTURE],
    });

    const board = await getStopBoard('2611502');

    expect(board.stop.platform).toBe('1');
    expect(board.asOf).toEqual({ date: '2026-08-24', time: '15:44' });
    expect(board.servingLines[0]?.destinations).toEqual(['Kauklahti']);
    expect(board.departures[0]).toEqual(DEPARTURE);
  });

  /*
   * The pattern is what makes a board row openable — with the trip and the date
   * it addresses the run in front of you rather than the line in general. A
   * backend that predates it answers null, and the row falls back to the line.
   */
  it('reads a departure with no pattern as having none, rather than guessing', async () => {
    const { patternId: _dropped, ...withoutPattern } = DEPARTURE;
    respondWith({
      stop: STOP,
      asOf: { date: '2026-08-24', time: '15:44' },
      servingLines: [],
      departures: [withoutPattern],
    });

    const board = await getStopBoard('2611502');

    expect(board.departures[0]?.patternId).toBeNull();
    expect(board.departures[0]?.tripId).toBe(DEPARTURE.tripId);
  });

  /*
   * The contract ties the two together, so the parser does as well — otherwise
   * every row that renders a destination has to remember the rule.
   */
  it('has no destination for a trip that terminates here', async () => {
    respondWith({
      stop: STOP,
      asOf: {},
      departures: [{ ...DEPARTURE, terminatesHere: true, destination: 'Espoo' }],
    });

    const board = await getStopBoard('2611502');

    expect(board.departures[0]?.destination).toBeNull();
    expect(board.departures[0]?.terminatesHere).toBe(true);
  });

  it('drops a departure with no time rather than printing a blank row', async () => {
    respondWith({
      stop: STOP,
      asOf: {},
      departures: [DEPARTURE, { ...DEPARTURE, time: null }, 'nonsense'],
    });

    expect((await getStopBoard('2611502')).departures).toHaveLength(1);
  });

  it('reports a body with no stop in it as malformed', async () => {
    respondWith({ asOf: {}, departures: [] });

    const error = await getStopBoard('2611502').catch((thrown: unknown) => thrown);

    expect(isApiError(error) && error.kind).toBe('malformed');
  });

  // 404 rather than an empty board: the id is not in the feed at all.
  it('surfaces an unknown stop as an ApiError carrying the code', async () => {
    respondWith({ errorCode: 'STOP_NOT_FOUND', error: 'Stop ID not found.' }, 404);

    const error = await getStopBoard('nope').catch((thrown: unknown) => thrown);

    expect(isApiError(error) && error.code).toBe('STOP_NOT_FOUND');
    expect(isApiError(error) && error.status).toBe(404);
  });
});

describe('getStopTimetable', () => {
  it('sends the date, and keeps the hours in the order they arrived', async () => {
    const fetchMock = respondWith({
      stop: STOP,
      date: '2026-09-10',
      schedule: [
        { hour: '07', departures: [DEPARTURE] },
        { hour: '10', departures: [DEPARTURE, DEPARTURE] },
        { hour: '23', departures: [] },
      ],
      totalDepartures: 3,
      outsideTimetableRange: false,
    });

    const timetable = await getStopTimetable('2611502', '2026-09-10');

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/stop/2611502/timetable');
    expect(url.searchParams.get('date')).toBe('2026-09-10');

    expect(timetable.schedule.map((hour) => hour.hour)).toEqual(['07', '10', '23']);
    expect(timetable.totalDepartures).toBe(3);
  });

  /*
   * A date the feed does not cover is an empty state, not a failure — the
   * backend answers 200 with an empty board and says so.
   */
  it('reports a date outside the feed as such rather than throwing', async () => {
    respondWith({
      stop: STOP,
      date: '2027-01-01',
      schedule: [],
      totalDepartures: 0,
      outsideTimetableRange: true,
    });

    const timetable = await getStopTimetable('2611502', '2027-01-01');

    expect(timetable.outsideTimetableRange).toBe(true);
    expect(timetable.schedule).toEqual([]);
  });

  it('counts the departures itself when the total is missing', async () => {
    respondWith({
      stop: STOP,
      date: '2026-09-10',
      schedule: [{ hour: '07', departures: [DEPARTURE, DEPARTURE] }],
    });

    expect((await getStopTimetable('2611502', '2026-09-10')).totalDepartures).toBe(2);
  });
});
