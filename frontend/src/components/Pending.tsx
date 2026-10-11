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
 * A group of {@link Placeholder}s, there from the very first frame.
 *
 * It used to wait a quarter of a second and then fade in, on the theory that
 * a fast answer should never show placeholders at all. In practice that was
 * the worst of both: the space sat empty, *then* the shapes arrived, *then*
 * the content replaced them — three states for one wait. Now the shapes are
 * simply what the space looks like until the content is ready, and it is the
 * content that fades in over them (`animate-content-in`), so a quick answer
 * reads as the page settling rather than flickering.
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
    <div role={label === undefined ? undefined : 'status'} className={className}>
      {label !== undefined && <span className="sr-only">{t(label)}</span>}
      {children}
    </div>
  );
}

/**
 * A timetable on its way: a header row and a column of times.
 *
 * Shared by a stop's day and a route's day, which are both a grid of times
 * under a short heading, and fetched separately from the page around them
 * each time a different day is picked.
 */
export function TimetablePlaceholder() {
  return (
    <PlaceholderGroup className="flex flex-col gap-2">
      <Placeholder className="h-5 w-1/3" />
      {[0, 1, 2, 3, 4, 5, 6].map((row) => (
        <span key={row} className="flex items-center gap-3">
          <Placeholder className="h-5 w-12" />
          <Placeholder className="h-5 flex-1" />
        </span>
      ))}
    </PlaceholderGroup>
  );
}

/**
 * Enough placeholder rows to fill the space a list will take, and no fewer.
 *
 * A list of stops or routes runs past the bottom of the screen, so a couple
 * of grey rows at its head left most of the pane blank and then filled it all
 * at once. This draws as many as the window is tall, at the real row's height
 * — the rows decide their own shape, through `row` — so the list arriving
 * replaces the placeholders one for one and nothing below it moves.
 *
 * The widths vary from row to row, the way names do, so the column reads as
 * a list rather than as stripes.
 */
export function ListPlaceholder({
  rowHeight,
  row,
}: {
  /** The real row's height in pixels, used only to work out how many to draw. */
  rowHeight: number;
  row: (width: string, index: number) => ReactNode;
}) {
  const count = Math.max(6, Math.ceil(window.innerHeight / rowHeight));
  return (
    <PlaceholderGroup className="flex flex-col">
      {Array.from({ length: count }, (_, index) => row(NAME_WIDTHS[index % NAME_WIDTHS.length] ?? 'w-1/2', index))}
    </PlaceholderGroup>
  );
}

const NAME_WIDTHS = ['w-1/2', 'w-2/3', 'w-2/5', 'w-3/5', 'w-1/3', 'w-3/4', 'w-1/2', 'w-2/5'];
