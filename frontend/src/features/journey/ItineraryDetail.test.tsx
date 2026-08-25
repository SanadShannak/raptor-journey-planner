import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../../types/journey';
import { ItineraryDetail } from './ItineraryDetail';
import type { JourneyEnd } from './itineraryRows';

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

/* The engine's placeholders for a coordinate. Never shown to anyone. */
const originPin: Stop = { id: null, name: 'ORIGIN', code: 'ORIGIN_PIN', platform: null, lat: 60, lon: 24 };
const targetPin: Stop = { id: null, name: 'TARGET', code: 'TARGET_PIN', platform: null, lat: 60, lon: 24 };

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

function ride(from: Stop, to: Stop, start: string, end: string, wait = 0): TransitLeg {
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
    routeType: 3,
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
    totalDurationMinutes: 30,
    legs,
  };
}

const kamppi: JourneyEnd = { name: 'Kamppi', context: 'Helsinki' };
const unnamed: JourneyEnd = { name: null, context: null };

function show(journey: Journey, origin = kamppi, destination = kamppi) {
  render(
    <LocaleProvider>
      <ItineraryDetail
        journey={journey}
        origin={origin}
        destination={destination}
        searchedDate="2026-08-24"
        onBack={() => {}}
      />
    </LocaleProvider>,
  );
}

/*
 * The strip map's rows, by tag rather than by role: the totals above it are a
 * list too, and these tests are about the ordered one — the journey itself.
 */
function steps(): HTMLElement[] {
  const list = document.querySelector('ol');
  if (list === null) throw new Error('no itinerary list was rendered');
  return within(list).getAllByRole('listitem');
}

describe('ItineraryDetail ends', () => {
  /*
   * The two ends are the traveller's own pins. The engine calls them ORIGIN
   * and TARGET, which are placeholders for a coordinate rather than names.
   */
  it('names each end with the place that was chosen', () => {
    show(
      journeyOf([
        walk(originPin, stop('1', 'Kyläsaarenkatu'), '18:00', '18:05'),
        ride(stop('1', 'Kyläsaarenkatu'), targetPin, '18:05', '18:20'),
      ]),
      { name: 'Kamppi', context: 'Helsinki' },
      { name: 'Kallio', context: 'Sörnäinen · Helsinki' },
    );

    expect(screen.getByText('Kamppi')).toBeTruthy();
    expect(screen.getByText('Kallio')).toBeTruthy();
    expect(screen.queryByText('ORIGIN')).toBeNull();
    expect(screen.queryByText('TARGET')).toBeNull();
  });

  /*
   * The line under an end node used to repeat the node's own name: a node
   * called "Start" with "Start" written beneath it. It now says where the
   * place is, which is the thing that was missing.
   */
  it('describes the place under it rather than repeating the name', () => {
    show(
      journeyOf([walk(originPin, targetPin, '18:00', '18:20')]),
      { name: 'Kamppi', context: 'Helsinki' },
      unnamed,
    );

    const first = steps()[0]!;
    expect(within(first).getByText('Kamppi')).toBeTruthy();
    expect(within(first).getByText('Helsinki')).toBeTruthy();
    // Named for a screen reader only, and never twice over.
    expect(within(first).queryAllByText('Start')).toHaveLength(0);
  });

  it('calls an unnamed pin a selected location', () => {
    show(journeyOf([walk(originPin, targetPin, '18:00', '18:20')]), unnamed, unnamed);

    expect(screen.getAllByText('Selected location')).toHaveLength(2);
  });

  it('still says which end is which, for a screen reader', () => {
    show(journeyOf([walk(originPin, targetPin, '18:00', '18:20')]), kamppi, kamppi);

    const rows = steps();
    expect(rows[0]!.textContent).toContain('(Start)');
    expect(rows[rows.length - 1]!.textContent).toContain('(Destination)');
  });

  // A real stop at the end of the journey keeps its own name and its own code.
  it('leaves a real stop to speak for itself', () => {
    show(
      journeyOf([ride(originPin, stop('9', 'Kallion virastotalo', 'H0202'), '18:00', '18:20')]),
      kamppi,
      { name: 'Somewhere else', context: 'Not this' },
    );

    expect(screen.getByText('Kallion virastotalo')).toBeTruthy();
    expect(screen.getByText('H0202')).toBeTruthy();
    expect(screen.queryByText('Somewhere else')).toBeNull();
  });
});

describe('ItineraryDetail legs', () => {
  /*
   * A walk leg says "Walk" and nothing else: the places it runs between are
   * drawn as named, timed nodes directly above and below it, so phrasing the
   * instruction around them restated its own neighbours.
   */
  it('says only that you walk', () => {
    show(
      journeyOf([
        walk(originPin, stop('1', 'Kyläsaarenkatu'), '18:00', '18:05'),
        ride(stop('1', 'Kyläsaarenkatu'), targetPin, '18:05', '18:20'),
      ]),
      kamppi,
      kamppi,
    );

    expect(screen.getByText('Walk')).toBeTruthy();
    expect(screen.queryByText(/Walk from/)).toBeNull();
    expect(screen.queryByText(/Walk to/)).toBeNull();
  });

  /*
   * The mirror of the arrival note: searching late can push the first
   * departure past midnight, and a twelve-hour clock cannot say so alone.
   */
  it('says so when the journey leaves on a different day than was searched', () => {
    const journey = journeyOf([walk(originPin, targetPin, '00:15', '00:35')]);
    render(
      <LocaleProvider>
        <ItineraryDetail
          journey={{ ...journey, startDate: '2026-08-25', endDate: '2026-08-25' }}
          origin={kamppi}
          destination={kamppi}
          searchedDate="2026-08-24"
          onBack={() => {}}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText(/Departs/)).toBeTruthy();
  });

  it('stays quiet when it leaves on the day that was searched', () => {
    show(journeyOf([walk(originPin, targetPin, '18:00', '18:20')]));
    expect(screen.queryByText(/Departs/)).toBeNull();
  });

});

/*
 * GTFS carries the designation and never its noun, so the word is chosen from
 * the vehicle — and it is null across a whole feed rather than at odd stops,
 * which is the case that has to stay quiet.
 */
describe('ItineraryDetail platforms', () => {
  it('calls it a platform on a bus, and a track on a train', () => {
    const busStop = stop('1', 'Kamppi', 'H0201', '16');
    show(journeyOf([ride(originPin, busStop, '18:00', '18:20')]));
    expect(screen.getByText('Platform 16')).toBeTruthy();
    cleanup();

    const railStop = stop('2', 'Pasila', 'H0085', '3');
    const rail = { ...ride(originPin, railStop, '18:00', '18:20'), routeType: 2 as const };
    show(journeyOf([rail]));
    expect(screen.getByText('Track 3')).toBeTruthy();
  });

  it('says nothing at all when the feed publishes no designations', () => {
    show(journeyOf([ride(originPin, stop('1', 'Kamppi', 'H0201'), '18:00', '18:20')]));
    expect(screen.queryByText(/Platform/)).toBeNull();
    expect(screen.queryByText(/Track/)).toBeNull();
    // The stop code beside it is unaffected.
    expect(screen.getByText('H0201')).toBeTruthy();
  });
});

/*
 * A stop in an itinerary is a place you can ask about, not just a name on a
 * line. The panel raises the id and the page decides what to do with it, so
 * what matters here is that the right id leaves by the right press.
 */
describe('ItineraryDetail stop inspection', () => {
  const withInspect = (journey: Journey, onInspectStop: (stopId: string) => void) =>
    render(
      <LocaleProvider>
        <ItineraryDetail
          journey={journey}
          origin={kamppi}
          destination={kamppi}
          searchedDate="2026-08-24"
          onBack={() => {}}
          onInspectStop={onInspectStop}
        />
      </LocaleProvider>,
    );

  it('opens the stop behind a name', () => {
    const opened: string[] = [];
    withInspect(
      journeyOf([ride(stop('1', 'Lasipalatsi'), stop('2', 'Kamppi'), '18:00', '18:10')]),
      (id) => opened.push(id),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lasipalatsi' }));
    expect(opened).toEqual(['1']);
  });

  /*
   * The code is the same stop as the name above it. Somebody scanning for
   * "H0101" should not have to find the name to press.
   */
  it('opens the same stop behind its code', () => {
    const opened: string[] = [];
    withInspect(
      journeyOf([
        ride(stop('1', 'Lasipalatsi', 'H0101'), stop('2', 'Kamppi'), '18:00', '18:10'),
      ]),
      (id) => opened.push(id),
    );

    fireEvent.click(screen.getByRole('button', { name: 'H0101' }));
    expect(opened).toEqual(['1']);
  });

  /*
   * A stop ridden through is as inspectable as one changed at — arguably more
   * so, since "what else calls there" is what somebody deciding where to get
   * off is asking.
   */
  it('opens an intermediate stop', () => {
    const opened: string[] = [];
    const leg = ride(stop('1', 'A'), stop('2', 'B'), '18:00', '18:20');
    leg.intermediateStops = [
      {
        stopId: '99',
        stopName: 'Töölöntori',
        stopCode: 'H0199',
        stopLat: 60,
        stopLon: 24,
        stopArrivalTime: '18:10',
      },
    ];

    withInspect(journeyOf([leg]), (id) => opened.push(id));

    fireEvent.click(screen.getByRole('button', { name: 'One stop on the way' }));
    fireEvent.click(screen.getByRole('button', { name: 'Töölöntori' }));
    expect(opened).toEqual(['99']);
  });

  /*
   * A journey from a dropped pin ends at a coordinate the engine resolved, not
   * at a place in the timetable. A name that is a button and leads nowhere is
   * worse than a name that is text.
   */
  it('leaves a dropped pin as text, with nothing to press', () => {
    withInspect(
      journeyOf([walk(originPin, stop('2', 'Kamppi'), '18:00', '18:05')]),
      () => {},
    );

    expect(screen.queryByRole('button', { name: 'Kamppi' })).toBeTruthy();
    // The origin renders under the traveller's own label, and is not a control.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).not.toContain(
      'Kamppi (Start)',
    );
  });

  // Without a host that can open one, a name is just a name.
  it('is not a control when nothing can open a stop', () => {
    show(journeyOf([ride(stop('1', 'Lasipalatsi'), stop('2', 'Kamppi'), '18:00', '18:10')]));
    expect(screen.queryByRole('button', { name: 'Lasipalatsi' })).toBeNull();
  });
});
