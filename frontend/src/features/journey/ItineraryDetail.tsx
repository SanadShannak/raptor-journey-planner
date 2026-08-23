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
import { ModeIcon, SeatedIcon, WalkIcon } from './modeIcons';
import { modeVisual, visualForFamily } from './modeVisuals';
import { journeyTotals } from './journeyTotals';
import {
  itineraryRows,
  type JourneyEnd,
  type NodeRow,
  type SegmentRow,
  type Spine,
  type WaitRow,
} from './itineraryRows';
import { DestinationMarker, OriginMarker } from './placeMarkers';

interface Props {
  journey: Journey;
  /**
   * The two ends as the traveller chose them, name and all.
   *
   * The engine answers with `ORIGIN` and `TARGET` — placeholders for a pair of
   * coordinates — so the only thing that can name the ends of the journey is
   * what was picked in the form.
   */
  origin: JourneyEnd;
  destination: JourneyEnd;
  /** The day that was asked about, so a departure on another one can say so. */
  searchedDate: string;
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
  origin,
  destination,
  searchedDate,
  onBack,
}: Props) {
  const locale = useLocale();
  const { strings, t } = locale;

  const totals = journeyTotals(journey);
  const rows = itineraryRows(journey, {
    origin,
    destination,
    fallback: t(strings.planner.selectedLocation),
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
        {/*
          Two lines, and each one answers a different question.
          
          The top line is when: the two times, and the duration pinned to the
          end where the overview cards keep theirs, so opening a result does
          not move the number you chose it by. Everything else — the changes,
          the arithmetic — is what the journey is *made of*, and it moved down
          to sit with the totals it belongs with.

          It stays at the top rather than moving below the diagram. This is
          the panel someone opened to decide whether to take this journey, and
          the answer to "is that too much walking" has to be readable without
          scrolling past twelve stops to find it. What was wrong with it was
          density, not position: four unrelated figures were sharing one
          baseline with the times.
        */}
        <header className="border-border flex flex-col gap-2.5 border-b px-5 py-4">
          <div className="flex items-baseline gap-x-3">
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

            <p className="bg-brand-50 text-brand-700 rounded-control ms-auto flex-none px-2 py-0.5 text-sm font-semibold">
              {formatDuration(journey.totalDurationMinutes, locale)}
            </p>
          </div>

          {journey.startDate !== searchedDate && (
            <p className="text-accent-strong text-sm font-semibold">
              {t(strings.planner.departsOnDate, {
                date: formatDate(journey.startDate, locale.locale),
              })}
            </p>
          )}

          {totals.crossesMidnight && (
            <p className="text-accent-strong text-sm font-semibold">
              {t(strings.planner.arrivesNextDay, {
                date: formatDate(journey.endDate, locale.locale),
              })}
            </p>
          )}

          {/*
            The journey's arithmetic. None of it is in the API — a leg knows
            its own numbers and nothing knows the total — and it is the first
            thing anyone asks who is deciding whether their shoes are up to it.

            Each figure carries the icon of the thing it counts, which is what
            lets the row be read by scanning rather than word by word.
          */}
          <ul className="text-content-muted flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-sm">
            <li className="flex items-center gap-1.5">
              <ChangeIcon />
              {t(strings.planner.changes, { count: totals.transfers })}
            </li>
            {totals.walkMinutes > 0 && (
              <li className="flex items-center gap-1.5">
                <span className="flex-none">
                  <WalkIcon size={17} />
                </span>
                {t(strings.planner.totalWalking, {
                  duration: formatDuration(totals.walkMinutes, locale),
                  distance: formatDistance(totals.walkMeters, locale),
                })}
              </li>
            )}
            {totals.waitMinutes > 0 && (
              <li className="flex items-center gap-1.5">
                <SeatedIcon size={17} />
                {t(strings.planner.totalWaiting, {
                  duration: formatDuration(totals.waitMinutes, locale),
                })}
              </li>
            )}
            {totals.transitMinutes > 0 && (
              <li className="flex items-center gap-1.5">
                <RideIcon />
                {t(strings.planner.totalRiding, {
                  duration: formatDuration(totals.transitMinutes, locale),
                })}
                {/* Null whenever the feed omits shape_dist_traveled —
                    expected, and the distance is simply absent rather than
                    shown as a zero. */}
                {totals.transitMeters !== null && totals.transitMeters > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    {formatDistance(totals.transitMeters, locale)}
                  </>
                )}
              </li>
            )}
          </ul>
        </header>

        {totals.rides.length === 0 && (
          <p className="text-content-muted bg-surface-muted border-border border-b px-4 py-2.5 text-sm">
            {t(strings.planner.walkOnly)}
          </p>
        )}

        {/*
          The legs sat almost touching, which read as one dense block rather
          than as a sequence of separate things you do. The spacing lives on
          the rows themselves rather than as a gap here, because the spine has
          to run continuously through it — a gap between list items would cut
          the line into pieces at exactly the points where the journey does not
          stop.
        */}
        <ol className="flex flex-col px-5 py-4">
          {rows.map((row) =>
            row.type === 'node' ? (
              <NodeLine key={row.key} row={row} />
            ) : row.type === 'wait' ? (
              <WaitLine key={row.key} row={row} />
            ) : (
              <SegmentLine key={row.key} row={row} />
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
  if (spine === null) return <span className="w-1 flex-1" />;
  if (spine.kind === 'transit') {
    return (
      <span
        className={`${visualForFamily(spine.family).ink} w-1 flex-1 rounded-full bg-current`}
      />
    );
  }
  return (
    <span
      className={`border-border-strong w-0 flex-1 border-s-[3px] ${
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

  /*
   * The two ends carry the same markers the form does — the ring you start
   * from, the pin you are heading to. They were plain dots here, which meant
   * the journey you composed at the top of the sidebar and the journey drawn
   * below it used two different notations for the same two points.
   */
  const marker =
    row.role === 'origin' ? (
      <OriginMarker size={22} />
    ) : row.role === 'destination' ? (
      <DestinationMarker size={24} hole="fill-surface-raised" />
    ) : (
      <span
        className={`${
          ink !== null
            ? `${ink} border-current`
            : 'border-border-strong'
        } bg-surface-raised block h-4 w-4 rounded-full border-[3px]`}
      />
    );

  return (
    <li className="flex items-stretch gap-3.5">
      <span aria-hidden="true" className="flex w-7 flex-none flex-col items-center">
        <SpineLine spine={row.above} />
        <span className="flex flex-none items-center justify-center">{marker}</span>
        <SpineLine spine={row.below} />
      </span>

      {/*
        `items-start` so the name and the badge are boxes the width of their
        own text. Left to stretch, a Latin stop name in an Arabic page aligned
        itself to the left of a column whose start is the right — which put
        the name at the far side of the row from the marker it belongs to, and
        the badge under it on the opposite side again.
      */}
      <span className="flex min-w-0 flex-1 flex-col items-start justify-center py-1.5">
        {/*
          The time shares a baseline with the name rather than being centred
          against the whole block. Two scripts do not put their glyphs at the
          same height inside a line box, so "centred" left an Arabic name
          visibly riding above the Latin digits beside it. A baseline is the
          one alignment both agree on.
        */}
        <span className="flex w-full items-baseline gap-3.5">
          <span className="min-w-0 flex-1 truncate font-semibold">
            {/* The box follows the page's direction; the name follows its
                own, so a Latin name still sits where the row starts. */}
            <span dir="auto">{row.name}</span>
            {/*
              The ends are named for a screen reader rather than on the page:
              the marker says which is which to anyone who can see it, and the
              line below is where the place itself gets described. Printing
              "Start" under a node already called "Start" said nothing twice.
            */}
            {row.role !== 'via' && (
              <span className="sr-only">
                {' '}
                (
                {row.role === 'origin'
                  ? t(strings.planner.startPoint)
                  : t(strings.planner.endPoint)}
                )
              </span>
            )}
          </span>

          {/*
            Wide enough for "12:34 PM" on one line, and told not to wrap. At
            four rem the meridiem dropped to a second line, which grew the row
            it shares with the name — and pushed the badge a line and a half
            clear of the stop it belongs to.
          */}
          <span className="w-20 flex-none whitespace-nowrap text-end font-semibold tabular-nums">
            {formatClockTime(row.time, locale.locale)}
          </span>
        </span>

        {/*
          A badge rather than a second line of grey text. A stop code is a
          label printed on the pole and the context under a pin is a different
          kind of thing from the name above it — quiet, but its own object,
          not a continuation of the sentence.
        */}
        {row.detail !== null && (
          <span className="bg-surface-muted text-content-muted rounded-control mt-1 px-1.5 py-0.5 text-xs font-medium">
            <span dir="auto">{row.detail}</span>
          </span>
        )}
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
    <li className="flex items-stretch gap-3.5">
      <span aria-hidden="true" className="flex w-7 flex-none flex-col items-center">
        <SpineLine spine={row.spine} />
      </span>

      {/* Weighted like a walk: standing still is a leg of the journey too. */}
      <span className="text-content-muted flex min-w-0 flex-1 items-center gap-2.5 py-5 font-medium">
        <SeatedIcon size={24} />
        <span dir="auto">
          {t(strings.planner.waitHere, {
            duration: formatDuration(row.minutes, locale),
            place: row.place,
          })}
        </span>
      </span>

      <span className="w-20 flex-none" />
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Icons the panel uses for itself
 * ------------------------------------------------------------------ */

const strokeProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'flex-none',
} as const;

/** A change of vehicle: two lines meeting and parting. */
function ChangeIcon({ size = 17 }: { size?: number }) {
  return (
    <svg {...strokeProps} width={size} height={size}>
      <path d="M4 7h9l-2.5-2.5M4 7h9l-2.5 2.5" />
      <path d="M20 17h-9l2.5-2.5M20 17h-9l2.5 2.5" />
    </svg>
  );
}

/**
 * Time on board, drawn as a route rather than as a vehicle.
 *
 * A journey can change mode halfway, so any one silhouette here would be
 * wrong for half of what it is counting. A line between two points is true of
 * all of them.
 */
function RideIcon({ size = 17 }: { size?: number }) {
  return (
    <svg {...strokeProps} width={size} height={size}>
      <circle cx="5.5" cy="18.5" r="2.4" />
      <circle cx="18.5" cy="5.5" r="2.4" />
      <path d="M7.9 16.1c1.6-1.6 1.6-4.2 3.6-6.2s4.6-2 6.2-3.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The legs
 * ------------------------------------------------------------------ */

function SegmentLine({ row }: { row: SegmentRow }) {
  return (
    <li className="flex items-stretch gap-3.5">
      <span aria-hidden="true" className="flex w-7 flex-none flex-col items-center">
        <SpineLine spine={row.spine} />
      </span>

      {/* Roomier than the nodes either side of it: a leg is something you
          spend time doing, and it should not read as tightly packed as the
          instants that bracket it. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-5">
        {row.leg.mode === 'WALK' ? (
          <WalkBody leg={row.leg} />
        ) : (
          <TransitBody leg={row.leg} />
        )}
      </div>

      <span className="w-20 flex-none" />
    </li>
  );
}

/**
 * A leg on foot, which says only that.
 *
 * It used to phrase itself around its two ends — "Walk from Selected location",
 * "Walk to Kyläsaarenkatu" — and every one of those places is already drawn as
 * a node immediately above or below the instruction, named and timed. The
 * sentence was restating its own neighbours, in worse words, and it grew
 * longest exactly where the pin had no name to use.
 */
function WalkBody({ leg }: { leg: WalkLeg }) {
  const locale = useLocale();
  const { strings, t } = locale;

  return (
    <>
      <p className="flex items-center gap-2.5 font-medium">
        <span className="text-content-muted flex-none">
          <WalkIcon size={24} />
        </span>
        {t(strings.planner.walk)}
      </p>
      <p className="text-content-muted ps-8.5 text-sm">
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
          className={`${visual.fill} text-on-mode rounded-control inline-flex items-center gap-1.5 px-2.5 py-1 font-bold tabular-nums`}
        >
          <ModeIcon routeType={leg.routeType} size={22} />
          {leg.routeShortName}
        </span>

        {/* Named as well as coloured, always. */}
        <span className="text-content-muted text-sm">
          {modeLabel(leg.routeType, strings)}
        </span>

        {leg.destination !== null && (
          <span dir="auto" className="font-medium">
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
                    className={`${visual.ink} h-2 w-2 flex-none rounded-full bg-current opacity-60`}
                  />
                  {/*
                    Sized to the name rather than filling the row. Stretched,
                    a Latin name in an Arabic page sat at the far left of its
                    box while its bullet stayed at the right, with the width
                    of the sidebar in between. The time is pushed to the end
                    instead, which is where it was going anyway.
                  */}
                  <span className="min-w-0 truncate">
                    <span dir="auto">{stop.stopName}</span>
                  </span>
                  <span className="ms-auto flex-none tabular-nums">
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
