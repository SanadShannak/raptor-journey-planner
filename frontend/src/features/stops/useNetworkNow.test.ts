import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNetworkNow } from './useNetworkNow';

/*
 * The clock, not the formatting — `nowInZone` has its own tests. What is worth
 * checking here is that the hook keeps asking, and that it asks in the zone it
 * was given rather than the one the test runner happens to be in.
 */
describe('useNetworkNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:44:30Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('answers in the network zone, not the host one', () => {
    // 12:44 UTC is 15:44 in Helsinki and 08:44 in New York.
    const helsinki = renderHook(() => useNetworkNow('Europe/Helsinki'));
    const newYork = renderHook(() => useNetworkNow('America/New_York'));

    expect(helsinki.result.current).toMatchObject({ date: '2026-08-24', time: '15:44' });
    expect(newYork.result.current).toMatchObject({ date: '2026-08-24', time: '08:44' });
  });

  /*
   * The seconds are for one job: placing something *between* two scheduled
   * times, where minute steps make a moving thing look like a stuttering one.
   * They belong to the same zone as the rest of the moment, which is the part
   * worth pinning — 15:44:30 in Helsinki and 08:44:30 in New York are different
   * numbers of seconds into their respective days.
   */
  it('counts the seconds in the network zone too', () => {
    const helsinki = renderHook(() => useNetworkNow('Europe/Helsinki'));
    const newYork = renderHook(() => useNetworkNow('America/New_York'));

    expect(helsinki.result.current?.secondOfDay).toBe(15 * 3600 + 44 * 60 + 30);
    expect(newYork.result.current?.secondOfDay).toBe(8 * 3600 + 44 * 60 + 30);
  });

  /*
   * A caller placing a vehicle wants a faster tick than one counting a minute
   * down. The default is unchanged for everyone who does not ask.
   */
  it('ticks as often as it is asked to', () => {
    const { result } = renderHook(() => useNetworkNow('Europe/Helsinki', 10_000));

    expect(result.current?.secondOfDay).toBe(15 * 3600 + 44 * 60 + 30);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current?.secondOfDay).toBe(15 * 3600 + 44 * 60 + 40);
  });

  it('keeps up as the minute turns', () => {
    const { result } = renderHook(() => useNetworkNow('Europe/Helsinki'));

    expect(result.current?.time).toBe('15:44');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current?.time).toBe('15:45');
  });

  // Not "waiting for a timezone" — there is no clock to show at all yet.
  it('has no answer until the network has stated its zone', () => {
    const { result } = renderHook(() => useNetworkNow(null));
    expect(result.current).toBeNull();
  });

  it('stops asking once it is gone', () => {
    const { unmount } = renderHook(() => useNetworkNow('Europe/Helsinki'));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
