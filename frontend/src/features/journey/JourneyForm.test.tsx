import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { LocaleProvider } from '../../i18n';
import type { Place } from '../../types/place';
import { JourneyForm } from './JourneyForm';
import type { JourneyFormValues } from './journeySearch';

const POSITION = { coords: { latitude: 31.95, longitude: 35.91 } } as GeolocationPosition;

/** Requests held open, so a test decides when each location arrives. */
let pending: PositionCallback[] = [];
let latest: JourneyFormValues;

const EMPTY: JourneyFormValues = { origin: null, destination: null, date: '', time: '', pace: 'average' };

const PLACE: Place = {
  key: 'somewhere',
  lat: 31.9,
  lon: 35.9,
  label: 'Somewhere',
  context: null,
  kind: 'place',
  stopId: null,
  stopCode: null,
  platform: null,
  modes: null,
};

function Form({ start = EMPTY }: { start?: JourneyFormValues }) {
  const [values, setValues] = useState(start);
  useEffect(() => {
    latest = values;
  });
  return (
    <>
      <JourneyForm
        values={values}
        onChange={setValues}
        onSearch={() => {}}
        onLeaveNow={null}
        validDates={[]}
        today={null}
        bounds={null}
        network="amman"
      />
      <button type="button" onClick={() => setValues({ ...values, pace: 'fast' })}>
        change pace
      </button>
    </>
  );
}

const show = (start?: JourneyFormValues) =>
  render(
    <LocaleProvider>
      <Form {...(start === undefined ? {} : { start })} />
    </LocaleProvider>,
  );

/** The origin's button comes first in the document, the destination's second. */
const buttons = () => {
  const found = screen.getAllByRole('button', {
    name: /Use my location|Finding your location|already the other end/,
  });
  return { origin: found[0] as HTMLButtonElement, destination: found[1] as HTMLButtonElement };
};

const arrive = () =>
  act(() => {
    pending.shift()?.(POSITION);
  });

beforeEach(() => {
  localStorage.clear();
  pending = [];
  vi.stubGlobal('navigator', {
    ...navigator,
    language: 'en',
    languages: ['en'],
    permissions: undefined,
    geolocation: { getCurrentPosition: (ok: PositionCallback) => pending.push(ok) },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('using my location', () => {
  it('offers the button on both ends', () => {
    show();
    const { origin, destination } = buttons();
    expect(origin.disabled).toBe(false);
    expect(destination.disabled).toBe(false);
  });

  it('fills the destination when asked from there', () => {
    show();
    fireEvent.click(buttons().destination);
    arrive();
    expect(latest.destination?.key).toBe('my-location');
    expect(latest.origin).toBeNull();
  });

  it('turns off the other end once one has it, and says why', () => {
    show();
    fireEvent.click(buttons().origin);
    arrive();

    const { origin, destination } = buttons();
    expect(origin.disabled).toBe(false);
    expect(destination.disabled).toBe(true);
    expect(destination.getAttribute('aria-label')).toBe(
      'Your location is already the other end of this journey',
    );
  });

  it('follows the location when the ends are swapped', () => {
    show();
    fireEvent.click(buttons().origin);
    arrive();

    fireEvent.click(screen.getByRole('button', { name: 'Swap start and destination' }));

    const { origin, destination } = buttons();
    expect(origin.disabled).toBe(true);
    expect(destination.disabled).toBe(false);
  });

  it('turns off the other end for a location already in the form', () => {
    show({ ...EMPTY, origin: { ...PLACE, key: 'my-location' } });
    expect(buttons().destination.disabled).toBe(true);
  });

  it('leaves the other end free when a place is chosen instead', () => {
    show({ ...EMPTY, origin: PLACE });
    expect(buttons().destination.disabled).toBe(false);
  });

  it('holds the other end while a request is in flight', () => {
    show();
    fireEvent.click(buttons().origin);
    expect(buttons().destination.disabled).toBe(true);

    arrive();
    expect(pending).toHaveLength(0);
  });

  /* It arrives seconds later, and must not undo what was changed meanwhile. */
  it('keeps anything changed while it was finding the location', () => {
    show();
    fireEvent.click(buttons().origin);
    fireEvent.click(screen.getByRole('button', { name: 'change pace' }));
    arrive();

    expect(latest.pace).toBe('fast');
    expect(latest.origin?.key).toBe('my-location');
  });
});
