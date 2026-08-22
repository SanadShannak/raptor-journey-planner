import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** The text to show. */
  text: string;
  /**
   * When set, the tooltip becomes the control's *description* under this id,
   * and the control references it with `aria-describedby`.
   *
   * Leave it off when the tooltip only repeats the control's accessible name —
   * an icon-only button, say — because a description identical to the name is
   * announced twice and tells nobody anything new. The tooltip is then hidden
   * from assistive technology and exists purely for sighted pointer and
   * keyboard users.
   */
  describedById?: string;
  children: ReactNode;
}

/**
 * A hover and focus tooltip.
 *
 * Shown on focus as well as hover, because a keyboard user reaches the control
 * without a pointer ever touching it and would otherwise never see the hint.
 *
 * Escape dismisses it without moving focus, and it sits inside the hover
 * target so a pointer can travel onto it without it vanishing — both are
 * requirements for content that appears on hover, not refinements.
 *
 * It is deliberately not interactive and never takes focus: a tooltip that can
 * be focused becomes a tab stop between the control and whatever follows it.
 */
export function Tooltip({ text, describedById, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const show = () => {
    setDismissed(false);
    setVisible(true);
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={() => setVisible(false)}
      /* focus/blur bubble in React, so the wrapper hears the button's. */
      onFocus={show}
      onBlur={() => setVisible(false)}
    >
      {children}

      {visible && !dismissed && (
        <span
          id={describedById}
          role="tooltip"
          aria-hidden={describedById === undefined ? true : undefined}
          /*
           * `end-0`, not a centred transform: centring needs a physical
           * translate that would push the wrong way once the document flips.
           * Hanging from the trailing edge is direction-agnostic and keeps the
           * tooltip on screen for controls that sit at the edge of the bar.
           */
          className="rounded-control border-border bg-surface-raised text-content shadow-card pointer-events-none absolute end-0 top-full z-30 mt-2 w-max max-w-56 border px-2.5 py-1.5 text-xs font-medium"
        >
          {text}
        </span>
      )}
    </span>
  );
}
