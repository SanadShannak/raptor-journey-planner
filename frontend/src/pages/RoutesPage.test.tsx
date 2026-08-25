import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigationType } from 'react-router';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { paths } from '../app/routes';
import RoutesPage from './RoutesPage';

/*
 * The page's wiring, not its panels — which have their own tests. What is here
 * is the thing that has now gone wrong twice: where "back" goes, and what it
 * does to history on the way.
 */

const LINE = {
  lineId: 'tram-1',
  routeShortName: '1',
  routeType: 0,
  routeLongName: 'Eira - Käpylä',
};

const VARIANT = {
  patternId: 0,
  directionId: 0,
  headsign: 'Käpylä',
  originStopName: 'Telakkakatu',
  terminusStopName: 'Pohjolanaukio',
  stopCount: 1,
  tripCount: 450,
  firstDeparture: '05:37',
  lastDeparture: '21:09',
  serviceDates: ['2026-09-10'],
};

const STOPS = [
  {
    id: 'id-0',
    name: 'Telakkakatu',
    code: 'H0446',
    platform: null,
    lat: 60.158,
    lon: 24.934,
    description: null,
    fareZone: 'A',
    wheelchairAccessible: null,
    sequence: 0,
    distanceFromOriginMeters: 0,
  },
];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url), 'http://api.test').pathname;
      const body =
        path === '/api/network'
          ? { network: 'hsl', timezone: 'Europe/Helsinki', modes: [0], capabilities: {} }
          : path.endsWith('/timetable')
            ? { ...LINE, ...VARIANT, stops: STOPS, stopCount: 1, trips: [], totalTrips: 0 }
            : /\/api\/routes\/[^/]+\/[^/]+$/.test(path)
              ? { ...LINE, ...VARIANT, stops: STOPS, stopCount: 1, shape: null }
              : { ...LINE, directions: [0], variants: [VARIANT] };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

let kinds: string[] = [];
function Watch() {
  kinds.push(useNavigationType());
  return null;
}

/** A history stack, so "back" has somewhere real to go. */
function show(entries: Array<string | { pathname: string; search?: string; state?: unknown }>) {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
          <Watch />
          <Routes>
            <Route path={paths.home} element={<p>the planner</p>} />
            <Route path={paths.routes} element={<RoutesPage />} />
            <Route path={paths.routeDetail} element={<RoutesPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  kinds = [];
  vi.setSystemTime(new Date('2026-09-10T12:44:30Z'));
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RoutesPage back', () => {
  /*
   * The regression. Navigating *to* the address somebody came from pushes a
   * second copy of it on top of the run — so the URL looks right and the
   * browser's own back button then returns to the run, which reads as a page
   * refusing to be left. Back has to be a step back.
   */
  it('steps back through history rather than pushing where it came from', async () => {
    show([
      '/',
      { pathname: '/routes/tram-1', state: { back: '/' } },
    ]);

    fireEvent.click(await screen.findByRole('button', { name: /Back to the journey/ }));

    expect(await screen.findByText('the planner')).toBeTruthy();
    // A POP, not a PUSH: the run's entry was left behind, not buried.
    expect(kinds[kinds.length - 1]).toBe('POP');
  });

  /* Nothing sent us, so there is no entry behind worth assuming. */
  it('goes to the line index when it was reached by its own address', async () => {
    show([{ pathname: '/routes/tram-1' }]);

    const back = await screen.findByRole('button', { name: 'All lines' });
    expect(screen.queryByRole('button', { name: /Back to the journey/ })).toBeNull();

    fireEvent.click(back);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lines' })).toBeTruthy());
  });
});
