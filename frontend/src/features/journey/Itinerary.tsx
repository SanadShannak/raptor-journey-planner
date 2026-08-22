import { useState } from 'react';
import {
  formatClockTime,
  formatDate,
  formatDistance,
  formatDuration,
  modeLabel,
  useLocale,
} from '../../i18n';
import type { Journey, JourneyLeg, TransitLeg, WalkLeg } from '../../types/journey';
import { ModeIcon, WalkIcon } from './modeIcons';
import { modeVisual } from './modeVisuals';

/**
 * One itinerary, drawn as a line diagram.
 *
 * Transit's own way of showing a journey is a strip map: a continuous line
 * down the page, changing colour where you change vehicle, with a node at
 * every point you get on or off. That is the form used here rather than a
 * stack of cards, because it carries real information — the line is unbroken
 * because the journey is, it is dashed while you walk and solid while you ride,
 * and it takes the colour of whatever you are on.
 *
 * Every one of those signals is duplicated in text and icon. Colour tells a
 * rider who already knows the network which line they want at a glance; it is
 * never the only thing saying so.
 */
export function Itinerary({ journey }: { journey: Journey }) {
  const locale = useLocale();
  const { strings, t } = locale;

  const rides = journey.legs.filter((leg) => leg.mode === 'TRANSIT');
  const transfers = Math.max(0, rides.length - 1);
  const crossesMidnight = journey.endDate !== journey.startDate;

  return (
    <article className="rounded-card border-border bg-surface-raised shadow-card overflow-hidden border">
      <header className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
        <p className="text-xl font-semibold tabular-nums tracking-tight">
          {formatClockTime(journey.startTime, locale.locale)}
          <span aria-hidden="true" className="text-content-muted mx-1.5 inline-block rtl:-scale-x-100">
            →
          </span>
          {formatClockTime(journey.endTime, locale.locale)}
        </p>

        {/* The number people compare itineraries by, so it gets its own weight. */}
        <p className="bg-brand-50 text-brand-700 rounded-control px-2 py-0.5 text-sm font-semibold">
          {formatDuration(journey.totalDurationMinutes, locale)}
        </p>

        <p className="text-content-muted text-sm">
          {t(strings.planner.changes, { count: transfers })}
        </p>

        {/*
          An arrival on the following day, said plainly. With a 12-hour clock
          this is what stops "12:40 AM" reading as thirteen hours earlier than
          it is.
        */}
        {crossesMidnight && (
          <p className="text-accent-strong text-sm font-semibold">
            {t(strings.planner.arrivesNextDay, {
              date: formatDate(journey.endDate, locale.locale),
            })}
          </p>
        )}
      </header>

      {rides.length === 0 && (
        <p className="text-content-muted bg-surface-muted border-border border-b px-4 py-2.5 text-sm">
          {t(strings.planner.walkOnly)}
        </p>
      )}

      <ol className="flex flex-col px-4 py-3">
        {journey.legs.map((leg, index) => (
          <LegRow
            key={`${leg.startTime}-${index}`}
            leg={leg}
            isFirst={index === 0}
            isLast={index === journey.legs.length - 1}
          />
        ))}
      </ol>
    </article>
  );
}

/**
 * One leg: a node, the line beneath it, and what happens along the way.
 *
 * The spine is drawn per row rather than as one background element so each
 * segment can take its own colour and dash without the rows having to know
 * their own height.
 */
function LegRow({
  leg,
  isFirst,
  isLast,
}: {
  leg: JourneyLeg;
  isFirst: boolean;
  isLast: boolean;
}) {
  const locale = useLocale();
  const { strings, t } = locale;

  const visual = leg.mode === 'TRANSIT' ? modeVisual(leg.routeType) : null;

  return (
    <li className="flex gap-3">
      {/* The spine. Decorative: everything it says is also written. */}
      <div aria-hidden="true" className="flex w-5 flex-none flex-col items-center">
        <span
          className={`h-2 w-0.5 ${isFirst ? 'bg-transparent' : leg.mode === 'TRANSIT' ? 'bg-current' : 'bg-border-strong'} ${visual?.ink ?? ''}`}
        />
        <span
          className={
            leg.mode === 'TRANSIT'
              ? `border-current ${visual?.ink ?? ''} bg-surface-raised h-3 w-3 flex-none rounded-full border-[3px]`
              : 'border-border-strong bg-surface-raised h-2.5 w-2.5 flex-none rounded-full border-2'
          }
        />
        <span
          className={`w-0.5 flex-1 ${
            isLast
              ? 'bg-transparent'
              : leg.mode === 'TRANSIT'
                ? `bg-current ${visual?.ink ?? ''}`
                : 'border-border-strong border-s-2 border-dashed bg-transparent'
          }`}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-4">
        {/* Waiting sits before the leg departs and is excluded from its own
            duration, so it is its own line rather than folded in. */}
        {leg.waitDurationMinutes > 0 && (
          <p className="text-content-muted text-xs">
            {t(strings.planner.wait, {
              duration: formatDuration(leg.waitDurationMinutes, locale),
            })}
          </p>
        )}

        {leg.mode === 'WALK' ? (
          <WalkBody leg={leg} isLast={isLast} />
        ) : (
          <TransitBody leg={leg} />
        )}
      </div>

      <p className="text-content-muted w-16 flex-none text-end text-sm font-medium tabular-nums">
        {formatClockTime(leg.startTime, locale.locale)}
      </p>
    </li>
  );
}

function WalkBody({ leg, isLast }: { leg: WalkLeg; isLast: boolean }) {
  const locale = useLocale();
  const { strings, t } = locale;

  return (
    <>
      <p className="flex items-center gap-2 text-sm font-medium" dir="auto">
        <span className="text-content-muted flex-none">
          <WalkIcon size={16} />
        </span>
        {isLast
          ? t(strings.planner.walkToDestination)
          : t(strings.planner.walkLeg, { place: leg.toStop.name })}
      </p>
      <p className="text-content-muted ps-6 text-sm">
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
          <ModeIcon routeType={leg.routeType} size={15} />
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

      <p className="text-content-muted text-sm" dir="auto">
        {leg.fromStop.name}
        <span aria-hidden="true"> → </span>
        {leg.toStop.name}
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
