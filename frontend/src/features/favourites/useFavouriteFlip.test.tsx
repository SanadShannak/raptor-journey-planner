import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { useFavouriteFlip } from './useFavouriteFlip';

/*
 * What the glide is *for*, and what it must ignore.
 *
 * It exists so a card that changes place is seen to change place. It is not a
 * general "something moved" animation, and treating it as one was visible on
 * every visit to the page: the row rebuilds its list while rendering, so the
 * array arrived new each time and the effect ran each time — including on the
 * renders where a card had grown because its departures arrived, which pushes
 * every row below it down.
 *
 * The whole page glided into place a moment after it appeared, and again on
 * every timetable refresh, as though it had reloaded. Nothing was reordered
 * either time.
 */

/** Positions the cards are pretending to occupy, keyed by their favourite. */
let layout: Record<string, number> = {};

function place(top: number): DOMRect {
  return { top, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: top } as DOMRect;
}

function Row({ order }: { order: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFavouriteFlip(ref, order);

  return (
    <div ref={ref}>
      {order.map((key) => (
        <div
          key={key}
          data-favourite={key}
          data-testid={key}
          ref={(el) => {
            if (el === null) return;
            el.getBoundingClientRect = () => place(layout[key] ?? 0);
          }}
        />
      ))}
    </div>
  );
}

const transformOf = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`[data-favourite="${key}"]`)?.style.transform ?? '';

afterEach(() => {
  layout = {};
  vi.restoreAllMocks();
});

describe('the favourites glide', () => {
  it('animates a card that has changed place', () => {
    layout = { a: 0, b: 100 };
    const { container, rerender } = render(<Row order={['a', 'b']} />);

    // They swap: each ends up where the other was.
    layout = { a: 100, b: 0 };
    rerender(<Row order={['b', 'a']} />);

    expect(transformOf(container, 'a')).toContain('translate');
    expect(transformOf(container, 'b')).toContain('translate');
  });

  /*
   * The regression. A card grew, so everything below it moved — but nothing
   * changed place in the sense the reader cares about, and animating it reads
   * as the page reloading itself.
   */
  it('ignores a move that no reorder caused', () => {
    layout = { a: 0, b: 100 };
    const { container, rerender } = render(<Row order={['a', 'b']} />);

    // The row above grew: both cards shift down, in the same order.
    layout = { a: 60, b: 160 };
    rerender(<Row order={['a', 'b']} />);

    expect(transformOf(container, 'a')).toBe('');
    expect(transformOf(container, 'b')).toBe('');
  });

  /*
   * Ignoring a move is not the same as forgetting it. The positions still have
   * to be recorded, or the next real reorder inverts from somewhere the card
   * left long ago and glides in from off the row.
   */
  it('still animates correctly after a move it ignored', () => {
    layout = { a: 0, b: 100 };
    const { container, rerender } = render(<Row order={['a', 'b']} />);

    layout = { a: 60, b: 160 };
    rerender(<Row order={['a', 'b']} />);

    // Now a real swap, from the shifted positions.
    layout = { a: 160, b: 60 };
    rerender(<Row order={['b', 'a']} />);

    // 60 - 160 = -100: measured from where it actually was, not from 0.
    expect(transformOf(container, 'a')).toContain('-100px');
  });

  it('does not animate the first time it sees a card', () => {
    layout = { a: 0 };
    const { container } = render(<Row order={['a']} />);

    expect(transformOf(container, 'a')).toBe('');
  });
});
