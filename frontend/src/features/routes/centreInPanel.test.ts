import { describe, expect, it } from 'vitest';
import { centringScrollTop } from './centreInPanel';

/*
 * The arithmetic, which is the part jsdom can be asked about — it lays nothing
 * out, so `scrollingAncestor` has no heights to read and always answers null
 * there. That is why the sum lives in a function of its own.
 */
describe('centringScrollTop', () => {
  /** A 600px panel scrolled to the top, and a 40px row somewhere in it. */
  const box = { top: 100, height: 600 };

  it('does not move a row already in the middle', () => {
    const row = { top: 100 + 300 - 20, height: 40 };
    expect(centringScrollTop(row, box, 0)).toBe(0);
  });

  it('scrolls down for a row below the middle', () => {
    // Centre at 580 against the panel's 400: 180 further down.
    const row = { top: 560, height: 40 };
    expect(centringScrollTop(row, box, 0)).toBe(180);
  });

  it('adds to wherever the panel already is', () => {
    const row = { top: 560, height: 40 };
    expect(centringScrollTop(row, box, 1000)).toBe(1180);
  });

  it('scrolls up for a row above the middle', () => {
    const row = { top: 120, height: 40 };
    expect(centringScrollTop(row, box, 500)).toBe(500 - 260);
  });

  /*
   * A row near the top of a panel that is already at the top would ask for a
   * negative offset. Browsers clamp it, but returning one invites a caller to
   * do arithmetic on it and find a surprise.
   */
  it('never asks for a negative offset', () => {
    const row = { top: 100, height: 40 };
    expect(centringScrollTop(row, box, 0)).toBe(0);
  });
});
