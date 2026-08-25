import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import PlanPage from './PlanPage';
import { paths } from '../app/routes';

/*
 * Inspecting a stop from inside the planner, driven the whole way: search,
 * open a result, press a stop in the itinerary, and read the panel that opens.
 *
 * Worth the setup because the wiring crosses three components — the itinerary
 * raises an id, the page decides what to show, the inspector fetches it — and
 * none of them can tell on its own whether the right stop arrived.
 */

const STOP = {
  id: '1020444',
  name: 'Lasipalatsi',
  code: 'H0101',
  platform: null,
  lat: 60.170461,
  lon: 24.937728,
  description: 'Mannerheimintie',
  fareZone: 'A',
  wheelchairAccessible: true,
};

const JOURNEY = {
  startDate: '2026-08-25',
  startTime: '18:00',
  endDate: '2026-08-25',
  endTime: '18:25',
  totalDurationMinutes: 25,
  legs: [
    {
      mode: 'TRANSIT',
      waitDurationMinutes: 0,
      startDate: '2026-08-25',
      startTime: '18:00',
      endDate: '2026-08-25',
      endTime: '18:25',
      fromStop: { ...STOP },
      toStop: { ...STOP, id: '1020445', name: 'Kamppi', code: 'H0102' },
      shape: [
        [60.17, 24.93],
        [60.18, 24.94],
      ],
      routeShortName: '550',
      routeType: 3,
      intermediateStops: [],
      tripId: 't1',
      transitDurationMinutes: 25,
      transitDistanceMeters: 5000,
      walkDurationMinutes: null,
      walkDistanceMeters: null,
      lineId: 'bus-550',
      patternId: 0,
      routeLongName: null,
      directionId: 0,
      headsign: 'Itäkeskus',
      destination: 'Itäkeskus',
    },
  ],
};

/** One suggestion, whatever is typed — the geocoder is not what is under test. */
const SUGGESTION = {
  features: [
    {
      geometry: { coordinates: [24.9, 60.17] },
      properties: { name: 'Somewhere', city: 'Helsinki' },
    },
  ],
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const { pathname, host } = new URL(String(url));
      const json = (body: unknown) => new Response(JSON.stringify(body));

      if (host.includes('photon')) return json(SUGGESTION);
      if (pathname === '/api/health') return json({ status: 'active' });
      if (pathname === '/api/network')
        return json({ network: 'hsl', timezone: 'Europe/Helsinki', modes: [3] });
      if (pathname === '/api/valid-dates') return json(['2026-08-25', '2026-08-26']);
      if (pathname === '/api/planner') return json(JOURNEY);
      if (pathname === '/api/stops') return json({ stops: [], truncated: false });
      if (pathname.startsWith('/api/stop/')) {
        // Keyed by id, so a test that opens Kamppi is not handed Lasipalatsi.
        const id = pathname.slice('/api/stop/'.length);
        const stop =
          id === '1020445'
            ? { ...STOP, id, name: 'Kamppi', code: 'H0102' }
            : { ...STOP, id };
        return json({ stop, asOf: {}, servingLines: [], departures: [] });
      }

      return new Response('{}', { status: 404 });
    }),
  );
}

function show(at: string = paths.home) {
  return render(
    <StrictMode>
      <LocaleProvider>
        <ThemeProvider>
          <MemoryRouter initialEntries={[at]}>
            <Routes>
              <Route path={paths.home} element={<PlanPage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </LocaleProvider>
    </StrictMode>,
  );
}

/** Types into a place field and takes the first suggestion offered. */
async function fill(label: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: 'Somewhere' } });
  const option = await screen.findByRole('option', {}, { timeout: 3000 });
  /*
   * Pointer-down, not click. The list commits on pointer-down because a click
   * would land after the input's blur had already closed it — so a test that
   * clicks chooses nothing, and the form stays empty for reasons invisible
   * from here.
   */
  fireEvent.pointerDown(option);
}

beforeEach(() => {
  localStorage.clear();
  stubApi();
});

afterEach(() => vi.unstubAllGlobals());

describe('inspecting a stop from inside the planner', () => {
  it('opens the stop the itinerary named, and goes back to the journey', async () => {
    show();
    await screen.findByLabelText('From');

    await fill('From');
    await fill('To');

    fireEvent.click(screen.getByRole('button', { name: 'Find a journey' }));

    /*
     * Pressed twice: the first press chooses the card and shows it on the map,
     * the second opens it. A journey is worth looking at before committing to
     * reading it, which is what that costs.
     */
    const card = await screen.findByRole(
      'button',
      { name: /18:00|6:00/ },
      { timeout: 3000 },
    );
    fireEvent.click(card);
    fireEvent.click(card);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Kamppi' }, { timeout: 3000 }),
    );

    // The panel replaces the itinerary rather than navigating, so the search
    // this page is holding survives.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kamppi' }, { timeout: 3000 }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to the journey' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Back to results' })).toBeTruthy(),
    );
  });
});

/*
 * The search in the address.
 *
 * This page can now be left — a leg of an itinerary opens the run it is riding
 * — so coming back has to find the journey still there rather than an empty
 * form.
 */
describe('PlanPage search in the address', () => {
  const asked =
    '/?from=Kamppi&fromLat=60.169&fromLon=24.931' +
    '&to=Pasila&toLat=60.199&toLon=24.933' +
    '&date=2026-08-25&time=09:00&pace=calm';

  it('opens on the search the address carries, and runs it', async () => {
    show(asked);

    // The form is filled in from the URL, without anybody typing.
    expect(await screen.findByDisplayValue('Kamppi', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByDisplayValue('Pasila')).toBeTruthy();

    // And the answer arrives without the button being pressed.
    expect(
      await screen.findByRole(
        'button',
        { name: /Show this journey/ },
        { timeout: 3000 },
      ),
    ).toBeTruthy();
  });

  /*
   * Where you left from is where you come back to. Leaving from the detail
   * panel and returning to the list is returning to the wrong place.
   */
  it('reopens the itinerary that was open when the page was left', async () => {
    show(`${asked}&open=0`);

    expect(
      await screen.findByRole('button', { name: 'Back to results' }, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it('comes back to the list when nothing was open', async () => {
    show(asked);

    await screen.findByRole('button', { name: /Show this journey/ }, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Back to results' })).toBeNull();
  });

  /* An index the restored list does not reach is not an itinerary. */
  it('shows the list for an index that is not there', async () => {
    show(`${asked}&open=99`);

    await screen.findByRole('button', { name: /Show this journey/ }, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Back to results' })).toBeNull();
  });

  /* A half-filled address is not a search, so it opens an empty form. */
  it('ignores an address missing an end', async () => {
    show('/?from=Kamppi&fromLat=60.169&fromLon=24.931&date=2026-08-25&time=09:00');

    await waitFor(() => expect(screen.queryByDisplayValue('Kamppi')).toBeNull());
  });
});
