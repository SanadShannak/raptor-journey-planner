import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocaleProvider } from '../../i18n';
import { StopInspector } from './StopInspector';

/*
 * The panel as somebody reads it, queried the way somebody reaches it — by
 * role and accessible name. The API is stubbed at `fetch`, so what is under
 * test is everything from the parser upward.
 */

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

const SERVING_LINES = [
  {
    lineId: 'train-E',
    routeShortName: 'E',
    routeType: 2,
    routeLongName: 'Helsinki-Kauklahti',
    directionId: 0,
    destinations: ['Kauklahti'],
  },
  {
    lineId: 'bus-550',
    routeShortName: '550',
    routeType: 3,
    routeLongName: 'Itäkeskus-Westendinasema',
    directionId: 0,
    destinations: ['Itäkeskus'],
  },
];

const departure = (over: Record<string, unknown> = {}) => ({
  date: '2026-08-24',
  time: '15:52',
  arrivalDate: '2026-08-24',
  arrivalTime: '15:52',
  lineId: 'train-E',
  patternId: 716,
  routeShortName: 'E',
  routeType: 2,
  headsign: 'Kauklahti',
  destination: 'Kauklahti',
  terminatesHere: false,
  tripId: 'trip-1',
  directionId: 0,
  routeLongName: 'Helsinki-Kauklahti',
  ...over,
});

function stubFetch(handler: (url: string) => { body: unknown; status?: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const { body, status = 200 } = handler(String(url));
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

const board = (over: Record<string, unknown> = {}) => ({
  stop: STOP,
  asOf: { date: '2026-08-24', time: '15:44' },
  servingLines: SERVING_LINES,
  departures: [departure()],
  ...over,
});

function show(props: Partial<Parameters<typeof StopInspector>[0]> = {}) {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <StopInspector
          stopId="2611502"
          timezone="Europe/Helsinki"
          validDates={['2026-08-24', '2026-08-25']}
          networkToday="2026-08-24"
          onBack={() => {}}
          backLabel="Back to stops"
          {...props}
        />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.setSystemTime(new Date('2026-08-24T12:44:30Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('StopInspector', () => {
  it('names the stop, and says what is printed on it', async () => {
    stubFetch(() => ({ body: board() }));
    show();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Espoo' }),
    ).toBeTruthy();
    expect(screen.getByText('Espoonsilta')).toBeTruthy();
    expect(screen.getByText('Stop E6038')).toBeTruthy();
    expect(screen.getByText('Zone C')).toBeTruthy();
  });

  /*
   * A rail stop says "Track", because that is the word the networks use and
   * GTFS never says which of platform, track or stand the number names.
   */
  it('calls a rail designation a track and a bus one a platform', async () => {
    stubFetch(() => ({ body: board() }));
    const { unmount } = show();
    expect(await screen.findByText('Track 1')).toBeTruthy();
    unmount();

    stubFetch(() => ({
      body: board({ servingLines: [SERVING_LINES[1]] }),
    }));
    show();
    expect(await screen.findByText('Platform 1')).toBeTruthy();
  });

  /*
   * Tri-state. "Nobody said" is not a softer "no", and rendering it as one
   * tells a wheelchair user a stop is unusable when the truth is unknown.
   */
  it.each([
    [true, 'Step-free access'],
    [false, 'No step-free access'],
    [null, 'Step-free access not stated'],
  ])('says accessibility %s as its own answer', async (state, expected) => {
    stubFetch(() => ({
      body: board({ stop: { ...STOP, wheelchairAccessible: state } }),
    }));
    show();

    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it('counts down to a departure that is close', async () => {
    stubFetch(() => ({ body: board() }));
    show();

    // 15:52 against a board resolved at 15:44 on the Helsinki clock.
    expect(await screen.findByText('8 min')).toBeTruthy();
    expect(screen.getByText('Departs in 8 minutes')).toBeTruthy();
  });

  /*
   * "Towards X" for a destination we inferred, and the sign verbatim when the
   * feed carries one — the difference licenses different wording.
   */
  it('reads an inferred destination as "towards", and a headsign as itself', async () => {
    stubFetch(() => ({
      body: board({
        departures: [
          departure({ headsign: 'Kauklahti' }),
          departure({ tripId: 'trip-2', headsign: null, destination: 'Kirkkonummi' }),
        ],
      }),
    }));
    show();

    expect(await screen.findByText('Kauklahti')).toBeTruthy();
    expect(screen.getByText('towards Kirkkonummi')).toBeTruthy();
  });

  it('says a trip terminates here rather than naming this stop as its destination', async () => {
    stubFetch(() => ({
      body: board({
        departures: [departure({ terminatesHere: true, destination: null })],
      }),
    }));
    show();

    expect(await screen.findByText('Terminates here')).toBeTruthy();
  });

  // Service ends. That is an answer, not a failure.
  it('reads an empty board as an empty state', async () => {
    stubFetch(() => ({ body: board({ departures: [] }) }));
    show();

    expect(await screen.findByText('Nothing more today')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /*
   * The one rule that matters most here: the API's `error` is developer-facing
   * English and must never reach a reader.
   */
  it('shows a localised failure and never the API’s own words', async () => {
    stubFetch(() => ({
      body: { errorCode: 'STOP_NOT_FOUND', error: 'Stop ID not found.' },
      status: 404,
    }));
    show();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'No stop with that identifier is in this timetable.',
    );
    expect(screen.queryByText(/Stop ID not found/)).toBeNull();
  });

  it('offers the whole day, and asks for it only when asked', async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      if (url.includes('/timetable')) {
        return {
          body: {
            stop: STOP,
            date: '2026-08-24',
            servingLines: SERVING_LINES,
            schedule: [{ hour: '07', departures: [departure({ time: '07:12' })] }],
            totalDepartures: 1,
            outsideTimetableRange: false,
          },
        };
      }
      return { body: board() };
    });

    show();
    await screen.findByRole('heading', { level: 1, name: 'Espoo' });
    expect(seen.some((url) => url.includes('/timetable'))).toBe(false);

    const group = screen.getByRole('radiogroup', { name: 'What to show' });
    within(group).getByRole('radio', { name: 'Timetable' }).click();

    await waitFor(() => {
      expect(seen.some((url) => url.includes('/timetable'))).toBe(true);
    });
    // The heading is formatted, not templated: 12-hour like every other
    // time on the page, and without the `:00` a heading does not need.
    expect(await screen.findByText('7 AM')).toBeTruthy();
  });

  /*
   * A timetable is read for a day that is usually not today, so a countdown
   * against it would be nonsense — and the column it would occupy is what was
   * holding every time away from the end of the row.
   */
  it('counts down on the live board but never on the timetable', async () => {
    stubFetch((url) =>
      url.includes('/timetable')
        ? {
            body: {
              stop: STOP,
              date: '2026-08-24',
              servingLines: SERVING_LINES,
              // The same 15:52 the live board counts eight minutes down to.
              schedule: [{ hour: '15', departures: [departure()] }],
              totalDepartures: 1,
              outsideTimetableRange: false,
            },
          }
        : { body: board() },
    );

    show();
    expect(await screen.findByText('8 min')).toBeTruthy();

    const group = screen.getByRole('radiogroup', { name: 'What to show' });
    within(group).getByRole('radio', { name: 'Timetable' }).click();

    expect(await screen.findByText('3 PM')).toBeTruthy();
    expect(screen.queryByText('8 min')).toBeNull();
    expect(screen.queryByText('Departs in 8 minutes')).toBeNull();
  });

  /*
   * Choosing every line one at a time leaves the whole board showing, which is
   * where the filter started — so the control offering to undo it has to go
   * away. It used to stay, over a board identical to the unfiltered one.
   */
  it('is back to resting once every line has been chosen', async () => {
    stubFetch(() => ({
      body: board({
        departures: [
          departure(),
          departure({
            tripId: 'trip-2',
            lineId: 'bus-550',
            routeShortName: '550',
            routeType: 3,
            headsign: 'Itäkeskus',
            destination: 'Itäkeskus',
          }),
        ],
      }),
    }));
    show();

    await screen.findByText('Itäkeskus');
    expect(screen.queryByRole('button', { name: 'Show all lines' })).toBeNull();

    screen.getByRole('checkbox', { name: 'E' }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Show all lines' })).toBeTruthy(),
    );

    screen.getByRole('checkbox', { name: '550' }).click();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Show all lines' })).toBeNull(),
    );
  });

  it('narrows the board to the lines that are left switched on', async () => {
    stubFetch(() => ({
      body: board({
        departures: [
          departure(),
          departure({
            tripId: 'trip-2',
            lineId: 'bus-550',
            routeShortName: '550',
            routeType: 3,
            headsign: 'Itäkeskus',
            destination: 'Itäkeskus',
          }),
        ],
      }),
    }));
    show();

    expect(await screen.findByText('Kauklahti')).toBeTruthy();
    expect(screen.getByText('Itäkeskus')).toBeTruthy();

    screen.getByRole('checkbox', { name: '550' }).click();

    await waitFor(() => expect(screen.queryByText('Kauklahti')).toBeNull());
    expect(screen.getByText('Itäkeskus')).toBeTruthy();
  });

  /*
   * A departure board prints departures. Where a vehicle waits — a terminus, a
   * timing point — the moment it pulls in is a different and useful fact, and
   * where it does not the two numbers would say the same thing twice.
   */
  it('names the arrival only where it differs from the departure', async () => {
    stubFetch(() => ({
      body: board({
        departures: [
          departure({ arrivalTime: '15:48', time: '15:52' }),
          departure({ tripId: 'trip-2', arrivalTime: '16:10', time: '16:10' }),
        ],
      }),
    }));
    show();

    expect(await screen.findByText('3:52 PM')).toBeTruthy();
    expect(screen.getByText('Arrives 3:48 PM')).toBeTruthy();

    // The one that does not wait says nothing twice.
    expect(screen.getByText('4:10 PM')).toBeTruthy();
    expect(screen.queryByText('Arrives 4:10 PM')).toBeNull();
  });

  /* The countdown measures to the departure, which is the headline. */
  it('counts down to the departure', async () => {
    stubFetch(() => ({
      body: board({ departures: [departure({ arrivalTime: '15:48', time: '15:52' })] }),
    }));
    show();

    // 15:44 on the Helsinki clock, from the system time set above.
    expect(await screen.findByText('8 min')).toBeTruthy();
  });

  // Nothing behind it to return to, so no control claiming there is.
  it('has no back control on a page that is the stop', async () => {
    stubFetch(() => ({ body: board() }));
    show({ onBack: null });

    await screen.findByRole('heading', { level: 1, name: 'Espoo' });
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
  });
});

/*
 * A board row is about the vehicle in front of you, so pressing it opens that
 * run — not the line in general, which is what the badge alone used to offer.
 */
describe('StopInspector departures open their own run', () => {
  it('makes the whole row a link to that trip on that day', async () => {
    stubFetch(() => ({ body: board() }));
    show();

    const row = await screen.findByRole('link', { name: /Kauklahti/ });
    const url = new URL(row.getAttribute('href')!, 'http://x');

    expect(url.pathname).toBe('/routes/train-E');
    expect(url.searchParams.get('variant')).toBe('716');
    expect(url.searchParams.get('trip')).toBe('trip-1');
    expect(url.searchParams.get('date')).toBe('2026-08-24');

    // The time and the countdown are inside the target, not beside it.
    expect(row.textContent).toContain('3:52 PM');
  });

  /* No pattern, no run to open — the line is the honest fallback. */
  it('falls back to the line when the departure has no pattern', async () => {
    stubFetch(() => ({
      body: board({ departures: [departure({ patternId: null })] }),
    }));
    show();

    const row = await screen.findByRole('link', { name: /Kauklahti/ });
    expect(row.getAttribute('href')).toBe('/routes/train-E');
  });
});
