import { describe, expect, it } from 'vitest';
import { parseTypedTime } from './parseTypedTime';

/*
 * A parser is exactly the kind of thing a reader cannot verify by eye, and it
 * sits between what someone types and what the engine is asked. A misread
 * "7pm" returns a plausible itinerary for the wrong half of the day.
 */
describe('parseTypedTime', () => {
  it('reads a bare hour', () => {
    expect(parseTypedTime('9')).toBe('09:00');
    expect(parseTypedTime('19')).toBe('19:00');
  });

  it('reads the separators people actually use', () => {
    expect(parseTypedTime('9:30')).toBe('09:30');
    expect(parseTypedTime('9.30')).toBe('09:30');
    expect(parseTypedTime('0930')).toBe('09:30');
    expect(parseTypedTime('930')).toBe('09:30');
  });

  it('applies a meridiem', () => {
    expect(parseTypedTime('7pm')).toBe('19:00');
    expect(parseTypedTime('7:45 pm')).toBe('19:45');
    expect(parseTypedTime('7 AM')).toBe('07:00');
  });

  /* The two that a naive `+12` gets wrong in opposite directions. */
  it('handles the midnight and noon edges', () => {
    expect(parseTypedTime('12am')).toBe('00:00');
    expect(parseTypedTime('12pm')).toBe('12:00');
    expect(parseTypedTime('12:30am')).toBe('00:30');
  });

  it('refuses what is not a time rather than guessing', () => {
    expect(parseTypedTime('')).toBeNull();
    expect(parseTypedTime('later')).toBeNull();
    expect(parseTypedTime('25:00')).toBeNull();
    expect(parseTypedTime('9:75')).toBeNull();
    expect(parseTypedTime('12345')).toBeNull();
    // A meridiem only makes sense on a 12-hour clock.
    expect(parseTypedTime('19pm')).toBeNull();
  });
});
