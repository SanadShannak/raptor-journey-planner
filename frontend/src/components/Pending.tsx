import type { ReactNode } from 'react';
import { useLocale, type Message } from '../i18n';

/**
 * The waiting states every async surface shares: a ring for a press in
 * flight, and placeholder shapes for content on its way.
 *
 * Both are decoration. What a screen reader is told comes from words — the
 * button's own changed label and `aria-busy`, or the `label` a placeholder
 * group carries — and those words also carry the meaning for anyone who has
 * turned motion off, for whom the ring stops turning and the shapes stop
 * pulsing.
 */

/**
 * A small ring in the current text colour, turning.
 *
 * `currentColor` so it reads on any button ground without a token per
 * variant, and sized in `em` so it matches whatever text it sits beside.
 */
export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[1em] flex-none rounded-full border-2 border-current border-e-transparent motion-safe:animate-spin"
    />
  );
}

/**
 * A button's label with the ring beside it while the press is in flight.
 *
 * The buttons that use this already swap their words ("Add" → "Adding…") and
 * carry `aria-busy`. What they lacked was movement: a request that took a
 * second on a slow connection left a dimmed button and nothing else, which
 * reads as a page that has frozen rather than one that is working.
 */
export function PendingLabel({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {pending && <Spinner />}
      {children}
    </span>
  );
}

/**
 * One grey shape standing in for content that has not arrived.
 *
 * Sized entirely by the caller, because the point is to occupy the space the
 * real thing will — a placeholder the wrong size makes the page jump when
 * the answer lands, which is the jolt this exists to avoid.
 */
export function Placeholder({ className = '' }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={`bg-border rounded-control block motion-safe:animate-pulse ${className}`}
    />
  );
}

/**
 * A group of {@link Placeholder}s, appearing only if the wait is real.
 *
 * Held back for a moment before it fades in. Most answers here arrive in
 * well under that — the feed is in memory — and shapes that flashed for a
 * frame and were replaced read as flicker rather than as loading. A wait long
 * enough to notice gets them; one too short to notice gets nothing.
 *
 * With a `label` it is also the announcement: a polite status whose words a
 * screen reader reads while everyone else sees the shapes. Without one it is
 * silent, for a surface that already announces its own loading elsewhere.
 */
export function PlaceholderGroup({
  label,
  className = '',
  children,
}: {
  label?: Message | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  const { t } = useLocale();

  return (
    <div
      role={label === undefined ? undefined : 'status'}
      className={`motion-safe:animate-placeholder-in ${className}`}
    >
      {label !== undefined && <span className="sr-only">{t(label)}</span>}
      {children}
    </div>
  );
}
