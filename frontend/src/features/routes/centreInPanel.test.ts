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
   * jsdom reports every rect as zero, so what can be checked is the shape of
   * the sum rather than a real measurement — specifically the property the
   * whole thing rests on: it does not move when the container scrolls.
   */
  const boxed = (nodeTop: number, boxTop: number, scrollTop: number) => {
    const box = document.createElement('div');
    const node = document.createElement('div');
    box.append(node);
    box.getBoundingClientRect = () => ({ top: boxTop }) as DOMRect;
    node.getBoundingClientRect = () => ({ top: nodeTop }) as DOMRect;
    Object.defineProperty(box, 'scrollTop', { value: scrollTop, configurable: true });
    return { box, node };
  };

  it('is the gap between the boxes plus how far the panel has scrolled', () => {
    const { box, node } = boxed(500, 100, 0);
    expect(offsetWithin(node, box)).toBe(400);
  });

  /*
   * The property that lets this be read mid-animation. As the panel scrolls the
   * gap shrinks by exactly what `scrollTop` grows by, so the node's place in the
   * content never moves.
   */
  it('is the same answer however far the panel has scrolled', () => {
    const atRest = boxed(500, 100, 0);
    const scrolled = boxed(200, 100, 300);

    expect(offsetWithin(scrolled.node, scrolled.box)).toBe(
      offsetWithin(atRest.node, atRest.box),
    );
  });

  it('is negative for a node scrolled above the panel', () => {
    const { box, node } = boxed(50, 100, 0);
    expect(offsetWithin(node, box)).toBe(-50);
  });
});
