import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useFollowInView } from './useFollowInView';

/*
 * The reported bug, in miniature: tracking one trip, scrolling away, and going
 * straight to a *different* trip without ever landing on "nothing tracked" in
 * between — the panel does not remount for that, so the hook has to notice a
 * new subject from the id alone.
 */

function Panel({ tripId }: { tripId: string | null }) {
  const holdInView = useFollowInView(tripId);

  return (
    <div
      data-testid="panel"
      style={{ overflowY: 'auto', height: '100px' }}
      ref={(el) => {
        if (el) Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true });
      }}
    >
      <div ref={holdInView} data-testid="badge" style={{ height: '20px' }} />
    </div>
  );
}

/*
 * jsdom lays nothing out, so `getComputedStyle().overflowY` and the two
 * heights are what `scrollingAncestor` actually reads — supplied by hand here,
 * the same way `RouteInspector.test.tsx`'s own scroll tests do.
 */
function withPanelGeometry() {
  const calls: unknown[] = [];
  Element.prototype.scrollTo = function (options: unknown) {
    calls.push(options);
  };
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return this.dataset['testid'] === 'panel' ? 100 : 20;
    },
  });
  return calls;
}

/**
 * The narrow layout: no `overflow-y-auto` ancestor at all, the way the sidebar
 * is unadorned below the breakpoint — `scrollingAncestor` finds nothing and
 * the hook has to fall back to the window itself.
 */
function BareBadge({ tripId }: { tripId: string | null }) {
  const holdInView = useFollowInView(tripId);
  return <div ref={holdInView} data-testid="badge" style={{ height: '20px' }} />;
}

function withWindowScroll() {
  const calls: unknown[] = [];
  window.scrollTo = ((options: unknown) => {
    calls.push(options);
  }) as typeof window.scrollTo;
  return calls;
}

describe('useFollowInView', () => {
  it('scrolls once for the first trip tracked', () => {
    const calls = withPanelGeometry();
    render(<Panel tripId="a" />);

    expect(calls).toHaveLength(1);
  });

  /*
   * The exact gap: A, scroll away, then B — with no render of `tripId: null`
   * anywhere in between. The old version only re-armed on a transition through
   * "nothing tracked", and missed this.
   */
  it('scrolls again for a different trip, with no untracked render in between', () => {
    const calls = withPanelGeometry();
    const { rerender } = render(<Panel tripId="a" />);
    expect(calls).toHaveLength(1);

    fireEvent.wheel(window);

    rerender(<Panel tripId="b" />);
    expect(calls).toHaveLength(2);
  });

  /* Re-picking the same trip after letting go counts as a new subject too. */
  it('scrolls again for the same trip re-picked after letting go', () => {
    const calls = withPanelGeometry();
    const { rerender } = render(<Panel tripId="a" />);
    fireEvent.wheel(window);

    rerender(<Panel tripId={null} />);
    rerender(<Panel tripId="a" />);
    expect(calls).toHaveLength(2);
  });

  it('does not scroll again for the same trip on an ordinary re-render', () => {
    const calls = withPanelGeometry();
    const { rerender } = render(<Panel tripId="a" />);
    expect(calls).toHaveLength(1);

    rerender(<Panel tripId="a" />);
    expect(calls).toHaveLength(1);
  });

  it('stays put once the reader has scrolled, for the trip they scrolled on', () => {
    const calls = withPanelGeometry();
    const { rerender } = render(<Panel tripId="a" />);
    expect(calls).toHaveLength(1);

    fireEvent.wheel(window);
    rerender(<Panel tripId="a" />);
    expect(calls).toHaveLength(1);
  });

  it('does nothing while nothing is tracked', () => {
    const calls = withPanelGeometry();
    render(<Panel tripId={null} />);
    expect(calls).toHaveLength(0);
  });

  /*
   * Below the breakpoint there is no panel to scroll, and the reported bug was
   * that nothing filled in for it — the hook simply gave up. It should fall
   * back to scrolling the window instead.
   */
  it('scrolls the window when there is no panel to scroll', () => {
    const calls = withWindowScroll();
    render(<BareBadge tripId="a" />);

    expect(calls).toHaveLength(1);
  });

  it('gives up the window scroll too, once the reader has taken over', () => {
    const calls = withWindowScroll();
    const { rerender } = render(<BareBadge tripId="a" />);
    expect(calls).toHaveLength(1);

    fireEvent.wheel(window);
    rerender(<BareBadge tripId="a" />);
    expect(calls).toHaveLength(1);
  });
});
