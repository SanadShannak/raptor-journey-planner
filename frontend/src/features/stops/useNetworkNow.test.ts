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

    expect(helsinki.result.current).toEqual({ date: '2026-08-24', time: '15:44' });
    expect(newYork.result.current).toEqual({ date: '2026-08-24', time: '08:44' });
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
