import { describe, expect, it } from 'vitest';
import { minutesUntil } from './minutesUntil';

const at = (date: string, time: string) => ({ date, time });

describe('minutesUntil', () => {
  it('counts forward within a day', () => {
    expect(minutesUntil(at('2026-08-24', '15:52'), at('2026-08-24', '15:44'))).toBe(8);
  });

  it('answers zero for the minute it is', () => {
    expect(minutesUntil(at('2026-08-24', '15:44'), at('2026-08-24', '15:44'))).toBe(0);
  });

  it('goes negative once the departure has gone', () => {
    expect(minutesUntil(at('2026-08-24', '15:40'), at('2026-08-24', '15:44'))).toBe(-4);
  });

  /*
   * The whole reason both sides carry a date. A 00:10 departure is twenty
   * minutes away at 23:50, not a day and a bit in the past — which is what
   * comparing the clock times alone would say.
   */
  it('reads an after-midnight departure as minutes away, not a day back', () => {
    expect(minutesUntil(at('2026-08-25', '00:10'), at('2026-08-24', '23:50'))).toBe(20);
  });

  it('crosses a month boundary', () => {
    expect(minutesUntil(at('2026-09-01', '00:05'), at('2026-08-31', '23:55'))).toBe(10);
  });

  it('crosses a leap day', () => {
    expect(minutesUntil(at('2028-03-01', '00:00'), at('2028-02-29', '23:00'))).toBe(60);
  });

  // A countdown invented from an unreadable time is worse than no countdown.
  it('refuses to guess at a moment it cannot read', () => {
    expect(minutesUntil(at('', ''), at('2026-08-24', '15:44'))).toBeNull();
    expect(minutesUntil(at('2026-08-24', '15:44'), at('nonsense', '15:44'))).toBeNull();
  });
});
