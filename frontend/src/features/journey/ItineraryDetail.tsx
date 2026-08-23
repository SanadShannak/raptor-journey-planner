import { useState } from 'react';
import {
  formatClockTime,
  formatDate,
  formatDistance,
  formatDuration,
  modeLabel,
  useLocale,
} from '../../i18n';
import type { Journey, TransitLeg, WalkLeg } from '../../types/journey';
import { ModeIcon, WalkIcon } from './modeIcons';
import { modeVisual, visualForFamily } from './modeVisuals';
import { journeyTotals } from './journeyTotals';
import {
  itineraryRows,
  type NodeRow,
  type SegmentRow,
  type Spine,
  type WaitRow,
} from './itineraryRows';

interface Props {
  journey: Journey;
  /** What the traveller called their own two ends, for the pin nodes. */
  originLabel: string | null;
  destinationLabel: string | null;
  onBack: () => void;
}

/**
 * One itinerary in full, drawn as a line diagram.
 *
 * Transit's own way of showing a journey is a strip map: a continuous line
 * down the page, changing colour where you change vehicle, with a node at
 * every point you get on or off. That is the form used here rather than a
 * stack of cards, because it carries real information — the line is unbroken
 * because the journey is, it is dashed while you walk, dotted while you wait,
 * and solid in the vehicle's own colour while you ride.
 *
 * The spine runs circle to circle. Each node draws the incoming line above it
 * and the outgoing line below it in their own styles, so a colour begins
 * exactly at the circle where you board and ends exactly at the circle where
 * you get off, with no stub of the wrong colour at either end.
 *
 * Every one of those signals is duplicated in text and icon. Colour tells a
 * rider who already knows the network which line they want at a glance; it is
 * never the only thing saying so.
 */
export function ItineraryDetail({
  journey,
  originLabel,
  destinationLabel,
  onBack,
}: Props) {
  const locale = useLocale();
  const { strings, t } = locale;

  const totals = journeyTotals(journey);
  const rows = itineraryRows(journey, {
    origin: originLabel,
    destination: destinationLabel,
    originFallback: t(strings.planner.startPoint),
    destinationFallback: t(strings.planner.endPoint),
  });

  return (
    <section className="flex flex-col gap-4" aria-label={t(strings.planner.journeyDetails)}>
      <button
        type="button"
        onClick={onBack}
        className="text-content hover:text-brand-500 focus-visible:outline-brand-500 rounded-control -ms-1 inline-flex cursor-pointer items-center gap-1.5 self-start px-1 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* A directional arrow, so it mirrors with the document. */}
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="rtl:-scale-x-100"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {t(strings.planner.backToResults)}
      </button>

      <article className="rounded-card border-border bg-surface-raised shadow-card overflow-hidden border">
        <header className="border-border flex flex-col gap-2 border-b px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {formatClockTime(journey.startTime, locale.locale)}
              <span
                aria-hidden="true"
                className="text-content-muted mx-1.5 inline-block rtl:-scale-x-100"
              >
                →
              </span>
              {formatClockTime(journey.endTime, locale.locale)}
            </p>

            <p className="bg-brand-50 text-brand-700 rounded-control px-2 py-0.5 text-sm font-semibold">
              {formatDuration(journey.totalDurationMinutes, locale)}
            </p>

            <p className="text-content-muted text-sm">
              {t(strings.planner.changes, { count: totals.transfers })}
            </p>

            {totals.crossesMidnight && (
              <p className="text-accent-strong text-sm font-semibold">
                {t(strings.planner.arrivesNextDay, {
                  date: formatDate(journey.endDate, locale.locale),
                })}
              </p>
            )}
          </div>

          {/*
            The journey's arithmetic. None of it is in the API — a leg knows
            its own numbers and nothing knows the total — and it is the first
            thing anyone asks who is deciding whether their shoes are up to it.
          */}
          <ul className="text-content-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {totals.walkMinutes > 0 && (
              <li>
                {t(strings.planner.totalWalking, {
                  duration: formatDuration(totals.walkMinutes, locale),
                  distance: formatDistance(totals.walkMeters, locale),
                })}
              </li>
            )}
            {totals.waitMinutes > 0 && (
              <li>
                {t(strings.planner.totalWaiting, {
                  duration: formatDuration(totals.waitMinutes, locale),
                })}
              </li>
            )}
            {totals.transitMinutes > 0 && (
              <li>
                {t(strings.planner.totalRiding, {
                  duration: formatDuration(totals.transitMinutes, locale),
                })}
              </li>
            )}
            {/* Null whenever the feed omits shape_dist_traveled — expected,
                and the line is simply absent rather than showing a zero. */}
            {totals.transitMeters !== null && totals.transitMeters > 0 && (
              <li>
                {t(strings.planner.ridingDistance, {
                  distance: formatDistance(totals.transitMeters, locale),
                })}
              </li>
            )}
          </ul>
        </header>

        {totals.rides.length === 0 && (
          <p className="text-content-muted bg-surface-muted border-border border-b px-4 py-2.5 text-sm">
            {t(strings.planner.walkOnly)}
          </p>
        )}

        <ol className="flex flex-col px-4 py-3">
          {rows.map((row) =>
            row.type === 'node' ? (
              <NodeLine key={row.key} row={row} />
            ) : row.type === 'wait' ? (
              <WaitLine key={row.key} row={row} />
            ) : (
              <SegmentLine
                key={row.key}
                row={row}
                originLabel={originLabel}
                destinationLabel={destinationLabel}
              />
            ),
          )}
        </ol>
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The spine
 * ------------------------------------------------------------------ */

/**
 * One stretch of the line.
 *
 * Transit is a solid bar in the mode's colour; walking is dashed and waiting
 * is dotted, which distinguishes the two kinds of not-moving without needing a
 * third colour. `null` renders an invisible strut of the same width, so the
 * circle at the top and bottom of the diagram sits on the same axis as every
 * other one instead of shifting by two pixels.
 */
function SpineLine({ spine }: { spine: Spine | null }) {
  if (spine === null) return <span className="w-0.5 flex-1" />;
  if (spine.kind === 'transit') {
    return (
      <span
        className={`${visualForFamily(spine.family).ink} w-0.5 flex-1 bg-current`}
      />
    );
  }
  return (
    <span
      className={`border-border-strong w-0 flex-1 border-s-2 ${
        spine.kind === 'wait' ? 'border-dotted' : 'border-dashed'
      }`}
    />
  );
}

/** The colour a node takes: the vehicle's, wherever one is involved. */
function nodeInk(row: NodeRow): string | null {
  for (const spine of [row.above, row.below]) {
    if (spine?.kind === 'transit') return visualForFamily(spine.family).ink;
  }
  return null;
}

/**
 * A point on the journey: a circle, its name, and the time you are there.
 *
 * The `min-h` on each half of the spine is what stops a node from collapsing
 * the line to nothing when its label is a single short line of text — without
 * it, two adjacent nodes would touch.
 */
function NodeLine({ row }: { row: NodeRow }) {
  const locale = useLocale();
  const { strings, t } = locale;
  const ink = nodeInk(row);

  const dot =
    row.role === 'origin'
      ? 'border-mode-tram bg-surface-raised h-3.5 w-3.5 border-[3px]'
      : row.role === 'destination'
        ? 'bg-brand-500 h-3.5 w-3.5'
        : ink !== null
          ? `${ink} border-current bg-surface-raised h-3 w-3 border-[3px]`
          : 'border-border-strong bg-surface-raised h-2.5 w-2.5 border-2';

  return (
    <li className="flex items-stretch gap-3">
      <span aria-hidden="true" className="flex w-5 flex-none flex-col items-center">
        <SpineLine spine={row.above} />
        <span className={`${dot} my-0 flex-none rounded-full`} />
        <SpineLine spine={row.below} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <span dir="auto" className="text-sm font-semibold">
          {row.name}
        </span>
        {(row.role !== 'via' || row.code !== null) && (
          <span className="text-content-muted text-xs">
            {row.role === 'origin'
              ? t(strings.planner.startPoint)
              : row.role === 'destination'
                ? t(strings.planner.endPoint)
                : row.code}
          </span>
        )}
      </span>

      <span className="w-16 flex-none self-center text-end text-sm font-semibold tabular-nums">
        {formatClockTime(row.time, locale.locale)}
      </span>
    </li>
  );
}

/**
 * The wait, given the same weight as a leg.
 *
 * It used to be a line of small grey text tucked above the next leg, which
 * understated it: standing at a stop for eleven minutes is a real part of a
 * journey and often the part that decides whether it is worth taking. Here it
 * is its own segment between the arrival and the departure, so the two times
 * at that stop have the wait visibly sitting between them.
 */
function WaitLine({ row }: { row: WaitRow }) {
  const locale = useLocale();
  const { strings, t } = locale;

  return (
    <li className="flex items-stretch gap-3">
      <span aria-hidden="true" className="flex w-5 flex-none flex-col items-center">
        <SpineLine spine={row.spine} />
      </span>

      <span className="text-content-muted flex min-w-0 flex-1 items-center gap-2 py-2 text-sm">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-none"
        >
          {/* An hourglass: time passing while you are not moving. */}
          <path d="M6.5 3h11M6.5 21h11" />
          <path d="M8 3v3.2c0 1.4 1.2 2.4 2.6 3.4 1 .7 1 1.1 0 1.8C9.2 12.4 8 13.4 8 14.8V21" />
          <path d="M16 3v3.2c0 1.4-1.2 2.4-2.6 3.4-1 .7-1 1.1 0 1.8 1.4 1 2.6 2 2.6 3.4V21" />
        </svg>
        <span dir="auto">
          {t(strings.planner.waitHere, {
            duration: formatDuration(row.minutes, locale),
            place: row.place,
          })}
        </span>
      </span>

      <span className="w-16 flex-none" />
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * The legs
 * ------------------------------------------------------------------ */

function SegmentLine({
  row,
  originLabel,
  destinationLabel,
}: {
  row: SegmentRow;
  originLabel: string | null;
  destinationLabel: string | null;
}) {
  return (
    <li className="flex items-stretch gap-3">
      <span aria-hidden="true" className="flex w-5 flex-none flex-col items-center">
        <SpineLine spine={row.spine} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
        {row.leg.mode === 'WALK' ? (
          <WalkBody
            leg={row.leg}
            isFirst={row.isFirst}
            isLast={row.isLast}
            originLabel={originLabel}
            destinationLabel={destinationLabel}
          />
        ) : (
          <TransitBody leg={row.leg} />
        )}
      </div>

      <span className="w-16 flex-none" />
    </li>
  );
}

/**
 * A leg on foot.
 *
 * The first and last legs name where they start and end in the traveller's own
 * words. Without that the opening instruction was "Walk to Kyläsaarenkatu" —
 * true, but silent about the fact that it starts at the pin they dropped, which
 * is the one thing they might want confirmed.
 */
function WalkBody({
  leg,
  isFirst,
  isLast,
  originLabel,
  destinationLabel,
}: {
  leg: WalkLeg;
  isFirst: boolean;
  isLast: boolean;
  originLabel: string | null;
  destinationLabel: string | null;
}) {
  const locale = useLocale();
  const { strings, t } = locale;

  const from = originLabel ?? t(strings.planner.startPoint);
  const to = destinationLabel ?? t(strings.planner.endPoint);

  const text =
    isFirst && isLast
      ? t(strings.planner.walkWholeWay, { from, to })
      : isFirst
        ? t(strings.planner.walkFromOrigin, { place: from })
        : isLast
          ? t(strings.planner.walkToDestination, { place: to })
          : t(strings.planner.walkLeg, { place: leg.toStop.name });

  return (
    <>
      <p className="flex items-center gap-2 text-sm font-medium" dir="auto">
        <span className="text-content-muted flex-none">
          <WalkIcon size={20} />
        </span>
        {text}
      </p>
      <p className="text-content-muted ps-7 text-sm">
        {formatDuration(leg.walkDurationMinutes, locale)}
        <span aria-hidden="true"> · </span>
        {formatDistance(leg.walkDistanceMeters, locale)}
      </p>
    </>
  );
}

function TransitBody({ leg }: { leg: TransitLeg }) {
  const locale = useLocale();
  const { strings, t } = locale;
  const [showStops, setShowStops] = useState(false);
  const visual = modeVisual(leg.routeType);
  const stops = leg.intermediateStops;

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* The route bullet: transit's own way of naming a line. */}
        <span
          className={`${visual.fill} text-on-mode rounded-control inline-flex items-center gap-1.5 px-2 py-1 text-sm font-bold tabular-nums`}
        >
          <ModeIcon routeType={leg.routeType} size={18} />
          {leg.routeShortName}
        </span>

        {/* Named as well as coloured, always. */}
        <span className="text-content-muted text-xs">
          {modeLabel(leg.routeType, strings)}
        </span>

        {leg.destination !== null && (
          <span dir="auto" className="text-sm font-medium">
            {t(strings.planner.towards, { destination: leg.destination })}
          </span>
        )}
      </p>

      <p className="text-content-muted text-sm">
        {formatDuration(leg.transitDurationMinutes, locale)}
        {/* Null whenever the feed omits shape_dist_traveled — expected. */}
        {leg.transitDistanceMeters !== null && (
          <>
            <span aria-hidden="true"> · </span>
            {formatDistance(leg.transitDistanceMeters, locale)}
          </>
        )}
      </p>

      {stops.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowStops((shown) => !shown)}
            aria-expanded={showStops}
            className={`${visual.ink} focus-visible:outline-brand-500 rounded-control cursor-pointer text-sm font-medium underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2`}
          >
            {showStops
              ? t(strings.planner.hideStops)
              : t(strings.planner.intermediateStops, { count: stops.length })}
          </button>

          {showStops && (
            <ol className="text-content-muted mt-1.5 flex flex-col gap-1 text-sm">
              {stops.map((stop) => (
                <li key={stop.stopId} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`${visual.ink} h-1.5 w-1.5 flex-none rounded-full bg-current opacity-60`}
                  />
                  <span dir="auto" className="flex-1 truncate">
                    {stop.stopName}
                  </span>
                  <span className="tabular-nums">
                    {formatClockTime(stop.stopArrivalTime, locale.locale)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}
