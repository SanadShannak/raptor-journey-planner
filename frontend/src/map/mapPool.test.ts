import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireMap, discardPooledMap, releaseMap } from './mapPool';

/*
 * The pool holds one map between pages, and lets it go when nobody comes back.
 *
 * Both halves matter and they pull against each other. Held too briefly, every
 * navigation rebuilds a rendering engine and the page waits on it; held for
 * ever, a WebGL context and its textures stay open behind a card balance.
 *
 * Timers are faked because the deadline is thirty seconds and the behaviour is
 * a decision, not a duration: what is asserted is that coming back inside the
 * window reuses the map and coming back outside it does not.
 */
const options = {
  style: 'https://example.test/style.json',
  center: [24.94, 60.17] as [number, number],
  zoom: 13,
};

beforeEach(() => {
  vi.useFakeTimers();
  discardPooledMap();
});

afterEach(() => {
  discardPooledMap();
  vi.useRealTimers();
});

describe('the map pool', () => {
  it('builds a map when there is none', () => {
    expect(acquireMap(options).reused).toBe(false);
  });

  it('hands the same map to the next page that wants one', () => {
    const first = acquireMap(options);
    releaseMap();

    const second = acquireMap(options);
    expect(second.reused).toBe(true);
    expect(second.map).toBe(first.map);
  });

  /*
   * Moving between two map pages is a press and a render — a second or two at
   * the outside. Nothing in that window should cost a rebuild.
   */
  it('keeps the map while somebody might still be coming back', () => {
    acquireMap(options);
    releaseMap();

    vi.advanceTimersByTime(29_000);

    expect(acquireMap(options).reused).toBe(true);
  });

  /*
   * And the other half: a reader who has gone off to read a card balance is
   * not coming back in a hurry, and a map held open for them is waste.
   */
  it('lets the map go once nobody has come back', () => {
    acquireMap(options);
    releaseMap();

    vi.advanceTimersByTime(31_000);

    expect(acquireMap(options).reused).toBe(false);
  });

  /*
   * The deadline is cancelled by the borrow, not merely outrun by it. Without
   * this, a page that arrived just in time would still have the map pulled out
   * from under it a moment later.
   */
  it('does not evict a map that has since been borrowed', () => {
    acquireMap(options);
    releaseMap();

    vi.advanceTimersByTime(20_000);
    expect(acquireMap(options).reused).toBe(true);

    // Well past the original deadline, but it was cancelled by that borrow.
    vi.advanceTimersByTime(60_000);
    expect(acquireMap(options).reused).toBe(true);
  });

  /* A fresh map has learned nothing yet, and must not claim otherwise. */
  it('reports a new map as not yet loaded', () => {
    const { loaded, styleReady, drawn } = acquireMap(options);
    expect([loaded, styleReady, drawn]).toEqual([false, false, false]);
  });
});
