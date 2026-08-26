import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocaleProvider } from '../../i18n';
import { RouteInspector } from './RouteInspector';

/*
 * The panel as somebody reads it, queried the way somebody reaches it — by role
 * and accessible name. The API is stubbed at `fetch`, so what is under test is
 * everything from the parser upward.
 */

const stop = (sequence: number, name: string, over: Record<string, unknown> = {}) => ({
  id: `id-${sequence}`,
  name,
  code: `H000${sequence}`,
  lat: 60.16 + sequence / 100,
  lon: 24.94,
  description: null,
  fareZone: 'A',
  platform: null,
  wheelchairAccessible: null,
  sequence,
  distanceFromOriginMeters: sequence * 400,
  ...over,
});

const STOPS = [
  stop(0, 'Telakkakatu'),
  stop(1, 'Lasipalatsi', { platform: '51', description: 'Mannerheimintie' }),
  stop(2, 'Pohjolanaukio'),
];

const OUTBOUND = {
  patternId: 0,
  directionId: 0,
  headsign: 'Käpylä',
  originStopName: 'Telakkakatu',
  terminusStopName: 'Pohjolanaukio',
  stopCount: 3,
  tripCount: 450,
  firstDeparture: '05:37',
  lastDeparture: '21:09',
  serviceDates: ['2026-09-10', '2026-09-11'],
};

const INBOUND = {
  ...OUTBOUND,
  patternId: 1,
  directionId: 1,
  headsign: 'Eira',
  originStopName: 'Pohjolanaukio',
  terminusStopName: 'Telakkakatu',
  tripCount: 445,
};

/** Times are local wall clock in the network's zone; the day is 2026-09-10. */
const call = (time: string, arrivalTime = time) => ({
  date: '2026-09-10',
  time,
  arrivalDate: '2026-09-10',
  arrivalTime,
});

const TRIPS = [
  // Gone by 15:44.
  { tripId: 'trip-early', serviceDate: '2026-09-10', headsign: 'Käpylä', calls: [call('05:37'), call('05:44'), call('05:52')] },
  // Imminent at stop 1, and comfortably ahead at stop 2.
  { tripId: 'trip-soon', serviceDate: '2026-09-10', headsign: 'Käpylä', calls: [call('15:40'), call('15:50'), call('16:20')] },
  { tripId: 'trip-later', serviceDate: '2026-09-10', headsign: 'Käpylä', calls: [call('16:40'), call('16:50', '16:49'), call('17:20')] },
];

interface Feed {
  line?: Record<string, unknown>;
  variant?: Record<string, unknown> | undefined;
  timetable?: Record<string, unknown> | undefined;
  variantStatus?: number;
}

const LINE_FIELDS = {
  lineId: 'tram-1',
  routeShortName: '1',
  routeType: 0,
  routeLongName: 'Eira - Käpylä',
};

function stubFetch(feed: Feed = {}) {
  const line = feed.line ?? {
    ...LINE_FIELDS,
    directions: [0, 1],
    variants: [OUTBOUND, INBOUND],
  };
  const variant =
    feed.variant ?? {
      ...LINE_FIELDS,
      ...OUTBOUND,
      stops: STOPS,
      stopCount: 3,
      shape: null,
      serviceDates: ['2026-09-10', '2026-09-11'],
    };
  const timetable =
    feed.timetable ?? {
      ...LINE_FIELDS,
      ...OUTBOUND,
      stops: STOPS,
      stopCount: 3,
      trips: TRIPS,
      totalTrips: TRIPS.length,
      outsideTimetableRange: false,
    };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const asked = new URL(String(url));
      const path = asked.pathname;
      if (path.endsWith('/timetable')) {
        /*
         * Echoes the date it was asked for, as the real endpoint does. The panel
         * checks that an answer belongs to the day on screen before reading it,
         * so a fixture with a fixed date would look like a stale response.
         */
        return new Response(
          JSON.stringify({
            ...timetable,
            date: asked.searchParams.get('date') ?? timetable['date'],
          }),
          { status: 200 },
        );
      }
      // `/api/routes/tram-1/0` — three segments after the prefix.
      if (/\/api\/routes\/[^/]+\/[^/]+$/.test(path)) {
        // The inbound pattern answers as itself, so a flip has somewhere to go.
        const inbound = path.endsWith(`/${INBOUND.patternId}`);
        return new Response(
          JSON.stringify(
            inbound ? { ...(variant as object), ...INBOUND } : variant,
          ),
          { status: feed.variantStatus ?? 200 },
        );
      }
      return new Response(JSON.stringify(line), { status: 200 });
    }),
  );
}

function show(props: Partial<Parameters<typeof RouteInspector>[0]> = {}) {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <RouteInspector
          lineId="tram-1"
          patternId={null}
          timezone="Europe/Helsinki"
          networkToday="2026-09-10"
          onSelectVariant={() => {}}
          onSelectTrip={() => {}}
          onBack={() => {}}
          backLabel="All lines"
          {...props}
        />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // 15:44 in Helsinki, which is inside the day the timetable describes.
  vi.setSystemTime(new Date('2026-09-10T12:44:30Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RouteInspector', () => {
  it('names the line, and says where this vehicle is heading', async () => {
    stubFetch();
    show();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Eira - Käpylä' }),
    ).toBeTruthy();
    expect(screen.getByText('towards Käpylä')).toBeTruthy();
    expect(screen.getByText('3 stops')).toBeTruthy();
    expect(screen.getByText('450 trips')).toBeTruthy();
  });

  /*
   * The day's own span, not the pattern's lifetime one. Beside a date the
   * lifetime span reads as a claim about that date, and on a line whose weekend
   * service is shorter it is a wrong one. Here the trips run 05:37 to 16:40 from
   * the origin, while the variant's own `lastDeparture` says 21:09.
   */
  it('spans the day it is showing, not the pattern’s whole life', async () => {
    stubFetch();
    show();

    expect(await screen.findByText('Runs 5:37 AM to 4:40 PM today')).toBeTruthy();
    expect(screen.queryByText(/9:09 PM/)).toBeNull();
  });

  /*
   * The long name is the operator's, written along the corridor rather than
   * along a direction — the same road travelled either way. What flips is the
   * destination, so that is what the header puts under it.
   */
  it('keeps the line’s name and flips the destination under it', async () => {
    stubFetch();
    const { rerender } = show({ patternId: 0 });
    expect(await screen.findByText('towards Käpylä')).toBeTruthy();

    rerender(
      <LocaleProvider>
        <MemoryRouter>
          <RouteInspector
            lineId="tram-1"
            patternId={1}
            timezone="Europe/Helsinki"
            networkToday="2026-09-10"
            onSelectVariant={() => {}}
            onSelectTrip={() => {}}
              onBack={() => {}}
            backLabel="All lines"
          />
        </MemoryRouter>
      </LocaleProvider>,
    );

    // The same heading; a different destination.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Eira - Käpylä' }),
    ).toBeTruthy();
    expect(screen.queryByText('towards Käpylä')).toBeNull();
    expect(screen.getByText('towards Eira')).toBeTruthy();
  });

  /*
   * GTFS gives a designation and never says what it names, so the word comes
   * from the mode of the line being looked at — the same rule a stop's own page
   * and the itinerary follow.
   */
  it('calls a tram designation a platform and a rail one a track', async () => {
    stubFetch();
    const { unmount } = show();
    expect(await screen.findByText('Platform 51')).toBeTruthy();
    unmount();

    stubFetch({
      line: { ...LINE_FIELDS, routeType: 2, directions: [], variants: [OUTBOUND] },
      variant: {
        ...LINE_FIELDS,
        routeType: 2,
        ...OUTBOUND,
        stops: STOPS,
        stopCount: 3,
        shape: null,
        serviceDates: ['2026-09-10'],
      },
    });
    show();
    expect(await screen.findByText('Track 51')).toBeTruthy();
  });

  /*
   * The whole card, not just the name. A name is a small target beside a wide
   * row of its own details, and a reader who has just read the platform and the
   * zone has their pointer on the part that used to do nothing — so the
   * accessible name is the card's contents rather than the stop's name alone.
   */
  it('makes every stop row a link to its own page', async () => {
    stubFetch();
    show();

    const row = await screen.findByRole('link', { name: /Lasipalatsi/ });
    expect(row.getAttribute('href')).toBe('/stops/id-1');
    // The details are inside the target, not beside it.
    expect(row.textContent).toContain('Mannerheimintie');
    expect(row.textContent).toContain('Platform 51');
  });

  /*
   * Ten minutes here rather than the sixty a departure board uses: a column of
   * stops with a chip on every row is a wall of numbers, and the only thing
   * worth interrupting a reader for is that the vehicle is nearly here.
   */
  it('counts down only for a departure that is nearly here', async () => {
    stubFetch();
    show();

    // Stop 1 at 15:50 is six minutes out, so it counts.
    expect(await screen.findByText('Departs in 6 minutes')).toBeTruthy();
    // Stop 2 at 16:20 is thirty-six, which a clock answers better than a chip.
    expect(screen.queryByText('Departs in 36 minutes')).toBeNull();
    expect(screen.getByText('4:20 PM')).toBeTruthy();
  });

  it('shows the arrival only where it differs from the departure', async () => {
    stubFetch({
      timetable: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        date: '2026-09-10',
        stops: STOPS,
        stopCount: 3,
        // Only the middle stop waits.
        trips: [{ tripId: 't', serviceDate: '2026-09-10', headsign: null, calls: [call('16:00'), call('16:10', '16:08'), call('16:20')] }],
        totalTrips: 1,
        outsideTimetableRange: false,
      },
    });
    show();

    expect(await screen.findByText('Arrives 4:08 PM')).toBeTruthy();
    expect(screen.queryByText('Arrives 4:00 PM')).toBeNull();
  });

  it('says nothing more runs today once the last vehicle has gone', async () => {
    stubFetch({
      timetable: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        date: '2026-09-10',
        stops: STOPS,
        stopCount: 3,
        trips: [TRIPS[0]],
        totalTrips: 1,
        outsideTimetableRange: false,
      },
    });
    show();

    await waitFor(() =>
      expect(screen.getAllByText('Nothing more today')).toHaveLength(3),
    );
  });

  /* A direction only exists if a pattern runs it. */
  it('offers the flip when the other direction exists', async () => {
    const onSelectVariant = vi.fn();
    stubFetch();
    show({ onSelectVariant });

    const flip = await screen.findByRole('button', { name: 'Show the other direction' });
    fireEvent.click(flip);

    expect(onSelectVariant).toHaveBeenCalledWith(INBOUND.patternId);
  });

  it('offers no flip on a line that only runs one way', async () => {
    stubFetch({
      line: { ...LINE_FIELDS, directions: [0], variants: [OUTBOUND] },
    });
    show();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Show the other direction' })).toBeNull();
  });

  it('lists the other patterns of the same line, and says which one is showing', async () => {
    stubFetch();
    show();

    const disclose = await screen.findByRole('button', { name: 'Show alternative variants' });
    fireEvent.click(disclose);

    const panel = within(screen.getByRole('heading', { name: 'Alternative variants' }).parentElement!);
    /*
     * Both ends, never the destination alone. Variants of one line share
     * headsigns constantly — tram 1 has two patterns both signed "Käpylä" — so
     * a list of destinations is a list you cannot choose from.
     */
    expect(panel.getByText('Pohjolanaukio to Telakkakatu')).toBeTruthy();
    expect(panel.getByText('Telakkakatu to Pohjolanaukio')).toBeTruthy();
    expect(panel.queryByText('towards Eira')).toBeNull();
    expect(panel.getByText('Showing now')).toBeTruthy();
  });

  /*
   * Flat, thirty-nine variants are a set of equally plausible wrong answers.
   * Grouped by whether they run today, the choice is a choice.
   */
  it('groups the alternatives by whether they run today', async () => {
    stubFetch({
      line: {
        ...LINE_FIELDS,
        directions: [0, 1],
        variants: [
          OUTBOUND,
          // Starts after today.
          { ...INBOUND, patternId: 5, headsign: 'Autumn', serviceDates: ['2026-10-05'] },
          // Finished before it.
          { ...INBOUND, patternId: 6, headsign: 'Summer', serviceDates: ['2026-07-01'] },
        ],
      },
    });
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'Show alternative variants' }));

    expect(screen.getByRole('heading', { name: 'Running now' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Future' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No longer running' })).toBeTruthy();
  });

  /*
   * Dates, not times. Two short workings both running "05:13 to 06:53" are told
   * apart by the months they cover, never by the hours.
   */
  it('dates each alternative by its calendar range', async () => {
    stubFetch();
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'Show alternative variants' }));

    expect(screen.getAllByText(/Runs Sep 10 to Sep 11/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Runs 5:37 AM to 9:09 PM/)).toBeNull();
  });

  it('offers no alternatives for a line with a single pattern', async () => {
    stubFetch({ line: { ...LINE_FIELDS, directions: [0], variants: [OUTBOUND] } });
    show();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Show alternative variants' })).toBeNull();
  });

  /*
   * The days the *line* runs, not the days the feed covers. A control offering
   * the other fifty invites a choice that comes back empty.
   */
  /*
   * The stop list is about now — what is next at each stop, how far along the
   * line the vehicle is — so its day is today and there is nothing to choose. A
   * picker over both views would offer to move it off the one day it is for.
   */
  it('offers no day to pick on the stop list', async () => {
    stubFetch();
    show();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /Service day/ })).toBeNull();
  });

  it('offers only the variant’s own service days, on the timetable', async () => {
    stubFetch();
    show();

    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('radio', { name: 'Timetable' }));

    const picker = await screen.findByRole('button', { name: /Service day/ });
    fireEvent.click(picker);

    const list = screen.getByRole('listbox', { name: 'Service day' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    expect(within(list).getByRole('option', { name: /Sep 10/ })).toBeTruthy();
  });

  it('opens the timetable on today when the line runs then', async () => {
    stubFetch();
    show();

    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('radio', { name: 'Timetable' }));

    expect(await screen.findByRole('button', { name: /Today/ })).toBeTruthy();
  });

  /* Today is not a day this variant runs, so the picker opens on one that is. */
  it('opens the timetable on the first day it runs when that is not today', async () => {
    stubFetch({
      line: {
        ...LINE_FIELDS,
        directions: [0],
        variants: [{ ...OUTBOUND, serviceDates: ['2026-09-14', '2026-09-15'] }],
      },
      variant: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        serviceDates: ['2026-09-14', '2026-09-15'],
        stops: STOPS,
        stopCount: 3,
        shape: null,
      },
    });
    show();

    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('radio', { name: 'Timetable' }));

    const picker = await screen.findByRole('button', { name: /Service day/ });
    expect(picker.textContent).toContain('Sep 14');
    expect(picker.textContent).not.toContain('Today');
  });

  /*
   * The line does not run today at all, so there is no "next" at any of its
   * stops — said once, at the top, and pointing at the tab that can answer for
   * another day rather than repeating itself down forty rows.
   */
  it('says so once when the line does not run today', async () => {
    stubFetch({
      line: {
        ...LINE_FIELDS,
        directions: [0],
        variants: [{ ...OUTBOUND, serviceDates: ['2026-09-14'] }],
      },
      variant: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        serviceDates: ['2026-09-14'],
        stops: STOPS,
        stopCount: 3,
        shape: null,
      },
    });
    show();

    expect(await screen.findByText('This route does not run today.')).toBeTruthy();
    expect(screen.getAllByText('This route does not run today.')).toHaveLength(1);
    // No span either: there is no day to span.
    expect(screen.queryByText(/^Runs /)).toBeNull();
  });

  describe('the timetable', () => {
    const openTimetable = async () => {
      await screen.findByRole('heading', { level: 1 });
      fireEvent.click(await screen.findByRole('radio', { name: 'Timetable' }));
    };

    it('opens end to end, and lists a trip per row', async () => {
      stubFetch();
      show();
      await openTimetable();

      // Listboxes now, matching the date picker above them, so the chosen stop
      // is the trigger's own accessible name rather than a `value`.
      expect(await screen.findByRole('button', { name: /From Telakkakatu/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /To Pohjolanaukio/ })).toBeTruthy();

      const rows = screen.getAllByRole('row');
      // A heading row plus one per trip.
      expect(rows).toHaveLength(1 + TRIPS.length);
      expect(screen.getByText('3 trips between these stops.')).toBeTruthy();
    });

    /* Two columns, and no third. The duration was a number nobody asked for
       between two they did. */
    it('shows the departure and the arrival at the far end, and nothing else', async () => {
      stubFetch();
      show();
      await openTimetable();

      const rows = await screen.findAllByRole('row');
      expect(within(rows[0]!).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
        'Departs',
        'Arrives',
      ]);

      const early = within(rows[1]!);
      expect(early.getByText('5:37 AM')).toBeTruthy();
      expect(early.getByText('5:52 AM')).toBeTruthy();
      expect(early.queryByText('15 min')).toBeNull();
    });

    /* Only the stops the vehicle reaches after the chosen origin. */
    it('offers no destination the vehicle has already passed', async () => {
      stubFetch();
      show();
      await openTimetable();

      fireEvent.click(await screen.findByRole('button', { name: /From Telakkakatu/ }));
      fireEvent.click(
        within(screen.getByRole('listbox', { name: 'From' })).getByRole('option', {
          name: /Lasipalatsi/,
        }),
      );

      fireEvent.click(screen.getByRole('button', { name: /To / }));
      const onward = within(screen.getByRole('listbox', { name: 'To' })).getAllByRole('option');
      expect(onward.map((option) => option.textContent)).toEqual([
        expect.stringContaining('Pohjolanaukio'),
      ]);
    });

    it('says so when the origin is the end of the line', async () => {
      stubFetch();
      show();
      await openTimetable();

      fireEvent.click(await screen.findByRole('button', { name: /From Telakkakatu/ }));
      fireEvent.click(
        within(screen.getByRole('listbox', { name: 'From' })).getByRole('option', {
          name: /Pohjolanaukio/,
        }),
      );

      expect(screen.getByText(/end of the route/)).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
    });

    it('drops a trip that does not make both of the chosen stops', async () => {
      stubFetch({
        timetable: {
          ...LINE_FIELDS,
          ...OUTBOUND,
          stops: STOPS,
          stopCount: 3,
          trips: [
            { tripId: 'full', serviceDate: '2026-09-10', headsign: null, calls: [call('06:00'), call('06:10'), call('06:20')] },
            // A short working that joins the line after the origin.
            { tripId: 'short', serviceDate: '2026-09-10', headsign: null, calls: [null, call('06:40'), call('06:50')] },
          ],
          totalTrips: 2,
          outsideTimetableRange: false,
        },
      });
      show();
      await openTimetable();

      expect(await screen.findByText('One trip between these stops.')).toBeTruthy();
    });

    it('reports a day the line does not run as an empty day, not an error', async () => {
      stubFetch({
        timetable: {
          ...LINE_FIELDS,
          ...OUTBOUND,
          stops: STOPS,
          stopCount: 3,
          trips: [],
          totalTrips: 0,
          outsideTimetableRange: false,
        },
      });
      show();
      await openTimetable();

      expect(await screen.findByText(/does not run on the day you picked/)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('distinguishes a date outside the feed from a day with no service', async () => {
      stubFetch({
        timetable: {
          ...LINE_FIELDS,
          ...OUTBOUND,
          stops: [],
          stopCount: 0,
          trips: [],
          totalTrips: 0,
          outsideTimetableRange: true,
        },
      });
      show();
      await openTimetable();

      expect(await screen.findByText('Outside the timetable')).toBeTruthy();
      expect(screen.queryByText(/does not run on the day you picked/)).toBeNull();
    });
  });

  /*
   * The reported behaviour, and what now explains it.
   *
   * Two vehicles are out at 15:44: one between stops 0 and 1, one between 1 and
   * 2. That is exactly why stop 2 shows 15:46 while stop 1 shows 15:50 — a later
   * stop with an earlier time, because the two are answered by different
   * vehicles. Nothing on screen said so; now two badges do.
   */
  it('draws a badge for every vehicle out on the line', async () => {
    stubFetch({
      timetable: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        stops: STOPS,
        stopCount: 3,
        trips: [
          // Ahead: between stops 1 and 2 at 15:44.
          { tripId: 'ahead', serviceDate: '2026-09-10', headsign: null, calls: [call('15:20'), call('15:38'), call('15:46')] },
          // Behind: between stops 0 and 1.
          { tripId: 'behind', serviceDate: '2026-09-10', headsign: null, calls: [call('15:40'), call('15:50'), call('16:01')] },
          // Finished, so not drawn.
          { tripId: 'gone', serviceDate: '2026-09-10', headsign: null, calls: [call('05:37'), call('05:44'), call('05:52')] },
        ],
        totalTrips: 3,
        outsideTimetableRange: false,
      },
    });
    show();

    await screen.findByRole('heading', { level: 1 });
    await waitFor(() =>
      expect(document.querySelectorAll('.route-vehicle').length).toBe(2),
    );

    // And says plainly that this is the timetable's word, not a live feed's.
    expect(
      screen.getByText('Vehicles are shown where the timetable says they should be.'),
    ).toBeTruthy();
  });

  it('draws no vehicles on a day that is not today', async () => {
    stubFetch({
      line: {
        ...LINE_FIELDS,
        directions: [0],
        variants: [{ ...OUTBOUND, serviceDates: ['2026-09-14'] }],
      },
      variant: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        serviceDates: ['2026-09-14'],
        stops: STOPS,
        stopCount: 3,
        shape: null,
      },
    });
    show();

    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('radio', { name: 'Timetable' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Stops' }));

    await waitFor(() =>
      expect(document.querySelectorAll('.route-vehicle')).toHaveLength(0),
    );
  });

  /*
   * A stop the line has finished with for the day is dimmed rather than hidden.
   * It is still a stop on this route and somebody reading the line wants to see
   * it — it just cannot be boarded at any more.
   */
  it('dims a stop nothing will call at again today', async () => {
    stubFetch({
      timetable: {
        ...LINE_FIELDS,
        ...OUTBOUND,
        stops: STOPS,
        stopCount: 3,
        // One trip, already past the first two stops at 15:44.
        trips: [{ tripId: 'last', serviceDate: '2026-09-10', headsign: null, calls: [call('15:20'), call('15:30'), call('15:50')] }],
        totalTrips: 1,
        outsideTimetableRange: false,
      },
    });
    show();

    // The stops arrive with the variant; the dimming waits on the day's times.
    await waitFor(() =>
      expect(screen.getAllByText('Nothing more today')).toHaveLength(2),
    );

    const passed = screen.getByText('Telakkakatu');
    const ahead = screen.getByText('Pohjolanaukio');

    expect(passed.className).toContain('text-content-muted');
    expect(ahead.className).toContain('text-content');
    expect(ahead.className).not.toContain('text-content-muted');
  });

  it('dims nothing while the day’s times are still on their way', async () => {
    stubFetch();
    show();

    // The stops arrive with the variant, a request before the times do.
    const first = await screen.findByText('Telakkakatu');
    expect(first.className).not.toContain('text-content-muted');
  });

  /*
   * Following one run of the line rather than the line itself.
   *
   * The ordinary list answers "what leaves here next", which on a busy line is
   * a different vehicle at every row. Following a run asks the opposite — "when
   * is *this* vehicle at each stop" — and the answer has to include the stops it
   * has already passed, or the list empties out behind it as it goes.
   */
  describe('following one run', () => {
    const FOLLOWED = {
      tripId: 'the-one',
      serviceDate: '2026-09-10',
      headsign: 'Käpylä',
      calls: [call('15:20'), call('15:38'), call('16:30')],
    };
    const OTHER = {
      tripId: 'another',
      serviceDate: '2026-09-10',
      headsign: 'Käpylä',
      calls: [call('15:52'), call('16:02'), call('16:44')],
    };

    const followed = () =>
      stubFetch({
        timetable: {
          ...LINE_FIELDS,
          ...OUTBOUND,
          stops: STOPS,
          stopCount: 3,
          trips: [FOLLOWED, OTHER],
          totalTrips: 2,
          outsideTimetableRange: false,
        },
      });

    it('shows this run’s own times, past calls included', async () => {
      followed();
      show({ tripId: 'the-one', tripDate: '2026-09-10' });

      // Its own three calls, not the next departure from any trip. Without the
      // focus, stop 0 would read 3:52 PM — the other trip's.
      expect(await screen.findByText('3:20 PM')).toBeTruthy();
      expect(screen.getByText('3:38 PM')).toBeTruthy();
      expect(screen.getByText('4:30 PM')).toBeTruthy();
      expect(screen.queryByText('3:52 PM')).toBeNull();
    });

    it('says which run it is following, and offers the way out', async () => {
      const onSelectTrip = vi.fn();
      followed();
      show({ tripId: 'the-one', tripDate: '2026-09-10', onSelectTrip });

      expect(
        await screen.findByText('Following one run, towards Käpylä.'),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Show the whole route' }));
      expect(onSelectTrip).toHaveBeenCalledWith(null);
    });

    it('draws only the followed run’s vehicle', async () => {
      // Both of these are out at 15:44: one between stops 1 and 2, one between
      // 0 and 1. `followed()`'s second trip has not set off yet.
      stubFetch({
        timetable: {
          ...LINE_FIELDS,
          ...OUTBOUND,
          stops: STOPS,
          stopCount: 3,
          trips: [
            FOLLOWED,
            { tripId: 'another', serviceDate: '2026-09-10', headsign: null, calls: [call('15:40'), call('15:50'), call('16:44')] },
          ],
          totalTrips: 2,
          outsideTimetableRange: false,
        },
      });
      const { rerender } = show();

      // Both are out at 15:44 without a focus.
      await waitFor(() =>
        expect(document.querySelectorAll('.route-vehicle')).toHaveLength(2),
      );

      rerender(
        <LocaleProvider>
          <MemoryRouter>
            <RouteInspector
              lineId="tram-1"
              patternId={null}
              tripId="the-one"
              tripDate="2026-09-10"
              timezone="Europe/Helsinki"
              networkToday="2026-09-10"
              onSelectVariant={() => {}}
              onSelectTrip={() => {}}
                  onBack={() => {}}
              backLabel="All lines"
            />
          </MemoryRouter>
        </LocaleProvider>,
      );

      await waitFor(() =>
        expect(document.querySelectorAll('.route-vehicle')).toHaveLength(1),
      );
    });

    /*
     * The leg the vehicle is *on* is split exactly where it has got to, rather
     * than staying lit until the instant it completes. At 15:44:30 on a trip
     * that left stop 1 at 15:38 and reaches stop 2 at 16:30, six and a half of
     * the fifty-two minutes have gone — an eighth of the leg, precisely.
     */
    it('splits the current leg at the vehicle’s own position', async () => {
      followed();
      show({ tripId: 'the-one', tripDate: '2026-09-10' });

      await screen.findByText('3:20 PM');

      const grey = document.querySelector('[style*="height"]') as HTMLElement | null;
      expect(grey).toBeTruthy();
      expect(grey?.style.height).toBe('12.5%');
      expect(grey?.className).toContain('text-border-strong');

      // The rest of the same leg stays lit, not merely "not yet grey".
      const lit = grey?.nextElementSibling as HTMLElement | null;
      expect(lit?.className).toContain('text-mode-tram');
      expect(lit?.style.height).toBe('');
    });

    /* A stop this run drives past is a different fact from the end of service. */
    it('says a skipped stop is not on this run', async () => {
      stubFetch({
        timetable: {
          ...LINE_FIELDS,
          ...OUTBOUND,
          stops: STOPS,
          stopCount: 3,
          trips: [{ tripId: 'the-one', serviceDate: '2026-09-10', headsign: null, calls: [call('15:20'), null, call('16:30')] }],
          totalTrips: 1,
          outsideTimetableRange: false,
        },
      });
      show({ tripId: 'the-one', tripDate: '2026-09-10' });

      expect(await screen.findByText('Not on this run')).toBeTruthy();
      expect(screen.queryByText('Nothing more today')).toBeNull();
    });

    /* A stale link, or a pattern id moved by a data refresh. The line is still
       there and still worth reading, so it is what shows. */
    it('falls back to the whole line for a trip the day does not have', async () => {
      followed();
      show({ tripId: 'no-such-trip', tripDate: '2026-09-10' });

      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText(/Following one run/)).toBeNull();
      // And the ordinary "what leaves next" answer is back.
      expect(await screen.findByText('3:52 PM')).toBeTruthy();
    });

    /*
     * A trip id belongs to one service day and to no other, so the run pins the
     * day rather than the other way round. Asking today's board for yesterday's
     * trip finds nothing.
     */
    it('pins the day to the run’s own, not today', async () => {
      const asked: string[] = [];
      followed();
      const inner = globalThis.fetch as typeof globalThis.fetch;
      vi.stubGlobal('fetch', (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        if (href.includes('/timetable')) {
          asked.push(new URL(href).searchParams.get('date') ?? '');
        }
        return inner(url, init);
      });

      show({ tripId: 'the-one', tripDate: '2026-09-11' });

      await waitFor(() => expect(asked.length).toBeGreaterThan(0));
      expect(asked[0]).toBe('2026-09-11');
    });
  });

  /*
   * Following a run scrolls the panel to its vehicle — every time, not just the
   * first.
   *
   * The bug this guards: the hold-ref was attached to *every* vehicle badge
   * rather than only a followed run's, so with five trams out the hook ended up
   * holding whichever row rendered last. Letting go of one run and following
   * another then scrolled to a stranger, or did nothing at all.
   *
   * jsdom lays nothing out, so the panel's geometry has to be lent to it. Where
   * it lands is not checkable here and does not need to be — that arithmetic is
   * a pure function with its own tests. What is checkable is *that* it moves,
   * and that it moves again for the next run.
   */
  describe('holding a followed run in view', () => {
    const withPanelGeometry = () => {
      const scrolls: unknown[] = [];
      Element.prototype.scrollTo = function (options: unknown) {
        scrolls.push(options);
      };
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get: () => 2000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get: () => 600,
      });
      const real = window.getComputedStyle.bind(window);
      vi.stubGlobal('getComputedStyle', (element: Element) =>
        element instanceof HTMLElement && element.dataset['panel'] === 'yes'
          ? ({ overflowY: 'auto' } as CSSStyleDeclaration)
          : real(element),
      );
      return scrolls;
    };

    const inPanel = (props: Partial<Parameters<typeof RouteInspector>[0]>) =>
      render(
        <LocaleProvider>
          <MemoryRouter>
            <div data-panel="yes">
              <RouteInspector
                lineId="tram-1"
                patternId={null}
                timezone="Europe/Helsinki"
                networkToday="2026-09-10"
                onSelectVariant={() => {}}
                onSelectTrip={() => {}}
                onBack={() => {}}
                backLabel="All lines"
                {...props}
              />
            </div>
          </MemoryRouter>
        </LocaleProvider>,
      );

    const TWO_OUT = {
      ...LINE_FIELDS,
      ...OUTBOUND,
      stops: STOPS,
      stopCount: 3,
      trips: [
        { tripId: 'ahead', serviceDate: '2026-09-10', headsign: null, calls: [call('15:20'), call('15:38'), call('15:46')] },
        { tripId: 'behind', serviceDate: '2026-09-10', headsign: null, calls: [call('15:40'), call('15:50'), call('16:01')] },
      ],
      totalTrips: 2,
      outsideTimetableRange: false,
    };

    /* Five badges on a line is not "the" vehicle, and moving the panel to one
       of them would be a decision nobody asked for. */
    it('holds nothing while the whole line is showing', async () => {
      const scrolls = withPanelGeometry();
      stubFetch({ timetable: TWO_OUT });
      inPanel({});

      await waitFor(() =>
        expect(document.querySelectorAll('.route-vehicle')).toHaveLength(2),
      );
      expect(scrolls).toEqual([]);
    });

    it('moves for the run being followed, and again for the next one', async () => {
      const scrolls = withPanelGeometry();
      stubFetch({ timetable: TWO_OUT });
      const { rerender } = inPanel({ tripId: 'ahead', tripDate: '2026-09-10' });

      await waitFor(() => expect(scrolls.length).toBeGreaterThan(0));
      const afterFirst = scrolls.length;

      rerender(
        <LocaleProvider>
          <MemoryRouter>
            <div data-panel="yes">
              <RouteInspector
                lineId="tram-1"
                patternId={null}
                tripId="behind"
                tripDate="2026-09-10"
                timezone="Europe/Helsinki"
                networkToday="2026-09-10"
                onSelectVariant={() => {}}
                onSelectTrip={() => {}}
                onBack={() => {}}
                backLabel="All lines"
              />
            </div>
          </MemoryRouter>
        </LocaleProvider>,
      );

      // A different run, a different row, and the panel follows it there.
      await waitFor(() => expect(scrolls.length).toBeGreaterThan(afterFirst));
    });
  });

  /*
   * The way back belongs to whoever sent you.
   *
   * A reader who pressed a leg of their own itinerary did not come from the
   * line index, and offering it as the only way out strands them — the planner
   * is one press away and the control points at the wrong place entirely.
   */
  it('offers the way back the host gave it', async () => {
    const onBack = vi.fn();
    stubFetch();
    show({ onBack, backLabel: 'Back to the journey' });

    fireEvent.click(await screen.findByRole('button', { name: 'Back to the journey' }));

    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'All lines' })).toBeNull();
  });

  /* The API's own `error` string is developer-facing English and never shown. */
  it('reports a failure in the reader’s language, never the API’s', async () => {
    stubFetch({
      variant: { errorCode: 'PATTERN_NOT_FOUND', error: 'Variant not found on this line.' },
      variantStatus: 404,
    });
    show();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('Variant not found on this line.');
    expect(alert.textContent).toBeTruthy();
  });
});
