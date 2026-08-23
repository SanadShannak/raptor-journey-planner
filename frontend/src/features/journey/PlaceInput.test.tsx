import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import type { Place } from '../../types/place';
import { PlaceInput } from './PlaceInput';

const kamppi: Place = {
  key: 'kamppi',
  lat: 60.169,
  lon: 24.931,
  label: 'Kamppi',
  context: 'Helsinki',
  kind: 'stop',
  stopId: '1040401',
  stopCode: 'H0201',
  platform: null,
  modes: [0],
};

const kallio: Place = { ...kamppi, key: 'kallio', label: 'Kallio', stopId: '1' };

/**
 * The field as the form actually wires it: the parent holds the chosen place,
 * so every change the input reports comes straight back down as a new `value`.
 * That round trip is the whole subject of these tests.
 */
function Field({ initial }: { initial: Place | null }) {
  const [place, setPlace] = useState<Place | null>(initial);
  return (
    <LocaleProvider>
      <PlaceInput label="Origin" role="origin" value={place} onChange={setPlace} />
      <span data-testid="chosen">{place?.label ?? '—'}</span>
      <button type="button" onClick={() => setPlace(kallio)}>
        set from outside
      </button>
    </LocaleProvider>
  );
}

const field = () =>
  screen.getByRole('combobox', { name: 'Origin' }) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  // The suggestion lookup is debounced past the end of these tests, but a
  // stub keeps a real request from ever being the reason one of them fails.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ features: [] }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('PlaceInput', () => {
  it('shows the chosen place', () => {
    render(<Field initial={kamppi} />);
    expect(field().value).toBe('Kamppi');
  });

  /*
   * The regression this exists for.
   *
   * Typing over a chosen place clears the choice, because the text no longer
   * stands for a set of coordinates. That clear comes back from the parent as
   * `value: null`, which looked exactly like a place being set from outside —
   * and the field answered by resetting itself to that value's label, an empty
   * string. One keystroke emptied the whole field.
   */
  it('keeps what was typed when typing clears the chosen place', () => {
    render(<Field initial={kamppi} />);

    fireEvent.change(field(), { target: { value: 'Kamppix' } });

    expect(field().value).toBe('Kamppix');
    expect(screen.getByTestId('chosen').textContent).toBe('—');
  });

  it('keeps typing from there rather than starting over', () => {
    render(<Field initial={kamppi} />);

    fireEvent.change(field(), { target: { value: 'Kamppin' } });
    fireEvent.change(field(), { target: { value: 'Kamppinen' } });

    expect(field().value).toBe('Kamppinen');
  });

  // The swap button and a restored link both set the field from outside, and
  // that must still win over whatever is half-typed in it.
  it('takes a place set from outside over the typed text', () => {
    render(<Field initial={kamppi} />);

    fireEvent.change(field(), { target: { value: 'half typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'set from outside' }));

    expect(field().value).toBe('Kallio');
    expect(screen.getByTestId('chosen').textContent).toBe('Kallio');
  });

  // Clearing the field by hand leaves nothing chosen, and nothing typed.
  it('lets the field be emptied', () => {
    render(<Field initial={kamppi} />);

    fireEvent.change(field(), { target: { value: '' } });

    expect(field().value).toBe('');
    expect(screen.getByTestId('chosen').textContent).toBe('—');
  });
});
