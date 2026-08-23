import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import type { Journey, Stop, TransitLeg, WalkLeg } from '../../types/journey';
import { ItineraryDetail } from './ItineraryDetail';
import type { JourneyEnd } from './itineraryRows';

const stop = (id: string, name: string, code: string | null = null): Stop => ({
  id,
  name,
  code,
  lat: 60,
  lon: 24,
});

/* The engine's placeholders for a coordinate. Never shown to anyone. */
const originPin: Stop = { id: null, name: 'ORIGIN', code: 'ORIGIN_PIN', lat: 60, lon: 24 };
const targetPin: Stop = { id: null, name: 'TARGET', code: 'TARGET_PIN', lat: 60, lon: 24 };

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
});
