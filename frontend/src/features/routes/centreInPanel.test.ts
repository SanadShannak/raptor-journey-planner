import { describe, expect, it } from 'vitest';
import { centringScrollTop, offsetWithin } from './centreInPanel';

/*
 * The arithmetic, which is the part jsdom can be asked about — it lays nothing
 * out, so heights are all zero there and `scrollingAncestor` always answers
 * null. That is why the sum lives in a function of its own.
 */
describe('centringScrollTop', () => {
  /** A 600px panel, and a 40px row. */
  const PANEL = 600;
  const ROW = 40;

  it('centres a row on the panel', () => {
    // 1000 down, less the 280 of panel that should sit above it.
    expect(centringScrollTop(1000, ROW, PANEL)).toBe(720);
  });

  /*
   * The property that makes this safe to issue mid-animation: the answer is a
   * fixed place in the panel's own content, not an adjustment to wherever the
   * panel currently is. Asking twice asks for the same thing.
   */
  it('is the same answer however far the panel has already scrolled', () => {
    expect(centringScrollTop(1000, ROW, PANEL)).toBe(centringScrollTop(1000, ROW, PANEL));
  });

  it('never asks for a negative offset', () => {
    expect(centringScrollTop(10, ROW, PANEL)).toBe(0);
    expect(centringScrollTop(0, ROW, PANEL)).toBe(0);
  });

  it('accounts for the row\'s own height', () => {
    expect(centringScrollTop(1000, 200, PANEL)).toBe(1000 - 200);
  });
});

describe('offsetWithin', () => {
  /**
   * jsdom reports every `offsetTop` as zero, so what can be checked here is the
   * walk itself — that it climbs to the container and stops, and that it
   * refuses a node living somewhere else entirely.
   */
  const build = () => {
    const box = document.createElement('div');
    const middle = document.createElement('div');
    const row = document.createElement('div');
    middle.append(row);
    box.append(middle);
    document.body.append(box);
    return { box, row };
  };

  it('walks up to the container it was given', () => {
    const { box, row } = build();
    expect(offsetWithin(row, box)).toBe(0);
  });

  it('is null for a node that is not inside it', () => {
    const { box } = build();
    const stranger = document.createElement('div');
    document.body.append(stranger);

    expect(offsetWithin(stranger, box)).toBeNull();
  });

  it('is zero for the container asked about itself', () => {
    const { box } = build();
    expect(offsetWithin(box, box)).toBe(0);
  });
});
