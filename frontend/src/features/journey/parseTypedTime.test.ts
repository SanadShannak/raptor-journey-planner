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

/*
 * The field shows what it displays rather than the 24-hour value on the wire,
 * so whatever it printed has to come back in. English needs nothing extra;
 * Arabic writes "م" for pm, and reading that as nothing at all turned a
 * perfectly good afternoon into the small hours.
 */
describe('the locale’s own meridiem', () => {
  const arabic = { am: 'ص', pm: 'م' };

  it('reads back the Arabic afternoon', () => {
    expect(parseTypedTime('4:54 م', arabic)).toBe('16:54');
    expect(parseTypedTime('4:54 ص', arabic)).toBe('04:54');
    expect(parseTypedTime('12:30 م', arabic)).toBe('12:30');
    expect(parseTypedTime('12:30 ص', arabic)).toBe('00:30');
  });

  it('still reads English am and pm, whatever the locale', () => {
    expect(parseTypedTime('4:54 pm', arabic)).toBe('16:54');
    expect(parseTypedTime('4:54 PM', { am: 'AM', pm: 'PM' })).toBe('16:54');
  });

  it('leaves a bare time alone', () => {
    expect(parseTypedTime('16:54', arabic)).toBe('16:54');
    expect(parseTypedTime('454', arabic)).toBe('04:54');
  });
});
