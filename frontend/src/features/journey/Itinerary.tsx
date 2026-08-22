import { useState } from 'react';
import {
  formatClockTime,
  formatDate,
  formatDistance,
  formatDuration,
  modeLabel,
  useLocale,
} from '../../i18n';
import type { Journey, JourneyLeg, TransitLeg } from '../../types/journey';

/**
 * One itinerary, start to finish.
 *
 * Everything here is readable as text without a map. The map, when it lands,
 * is an enhancement over this list rather than the only way to understand a
 * journey.
 */
export function Itinerary({ journey }: { journey: Journey }) {
  const locale = useLocale();
  const { strings, t } = locale;

  const changes = journey.legs.filter((leg) => leg.mode === 'TRANSIT').length;
  const transferCount = Math.max(0, changes - 1);
  const crossesMidnight = journey.endDate !== journey.startDate;
  const walkOnly = changes === 0;

  return (
    <article className="rounded-card border-border bg-surface-raised flex flex-col gap-4 border p-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {formatClockTime(journey.startTime, locale.locale)}
          {/* An arrow that must mirror with the text direction. */}
          <span aria-hidden="true" className="text-content-muted mx-2 rtl:-scale-x-100 inline-block">
            →
          </span>
          {formatClockTime(journey.endTime, locale.locale)}
        </p>
        <p className="text-content-muted text-sm">
          {formatDuration(journey.totalDurationMinutes, locale)}
          <span aria-hidden="true"> · </span>
          {t(strings.planner.changes, { count: transferCount })}
        </p>
        {/*
          A journey can legitimately end on the following day. Without saying
          so, an 01:10 arrival reads as thirteen hours earlier than it is.
        */}
        {crossesMidnight && (
          <p className="text-accent-strong text-sm font-medium">
            {t(strings.planner.arrivesNextDay, {
              date: formatDate(journey.endDate, locale.locale),
            })}
          </p>
        )}
      </header>

      {/*
        Documented engine behaviour, not a failure: when walking beats waiting,
        or nothing runs in the window, the answer is a walk.
      */}
      {walkOnly && (
        <p className="text-content-muted rounded-control bg-surface-muted px-3 py-2 text-sm">
          {t(strings.planner.walkOnly)}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {journey.legs.map((leg, index) => (
          <Leg
            key={`${leg.startTime}-${index}`}
            leg={leg}
            isLast={index === journey.legs.length - 1}
          />
        ))}
      </ol>
    </article>
  );
}

function Leg({ leg, isLast }: { leg: JourneyLeg; isLast: boolean }) {
  const locale = useLocale();
  const { strings, t } = locale;

  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="text-content-muted mt-0.5 flex-none">
        {leg.mode === 'WALK' ? <WalkIcon /> : <ModeIcon routeType={leg.routeType} />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/*
          Waiting sits before the leg departs and is excluded from the leg's own
          duration, so it is shown as its own line rather than folded in.
        */}
        {leg.waitDurationMinutes > 0 && (
          <p className="text-content-muted text-sm">
            {t(strings.planner.wait, {
              duration: formatDuration(leg.waitDurationMinutes, locale),
            })}
          </p>
        )}

        {leg.mode === 'WALK' ? (
          <WalkLegBody leg={leg} isLast={isLast} />
        ) : (
          <TransitLegBody leg={leg} />
        )}
      </div>

      <p className="text-content-muted flex-none text-sm tabular-nums">
        {formatClockTime(leg.startTime, locale.locale)}
      </p>
    </li>
  );
}

function WalkLegBody({
  leg,
  isLast,
}: {
  leg: Extract<JourneyLeg, { mode: 'WALK' }>;
  isLast: boolean;
}) {
  const locale = useLocale();
  const { strings, t } = locale;

  // The final walk ends at a dropped pin, which has no name worth printing.
  const destination = isLast
    ? t(strings.planner.walkToDestination)
    : t(strings.planner.walkLeg, { place: leg.toStop.name });

  return (
    <>
      <p className="text-sm font-medium" dir="auto">
        {destination}
      </p>
      <p className="text-content-muted text-sm">
        {formatDuration(leg.walkDurationMinutes, locale)}
        <span aria-hidden="true"> · </span>
        {formatDistance(leg.walkDistanceMeters, locale)}
      </p>
    </>
  );
}

function TransitLegBody({ leg }: { leg: TransitLeg }) {
  const locale = useLocale();
  const { strings, t } = locale;
  const [showStops, setShowStops] = useState(false);

  const stops = leg.intermediateStops;

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {/* Mode as text as well as icon — never colour or shape alone. */}
        <span className="bg-brand-fill text-on-brand rounded-control px-1.5 py-0.5 text-xs font-semibold">
          {leg.routeShortName}
        </span>
        <span className="text-content-muted">
          {modeLabel(leg.routeType, strings)}
        </span>
        {leg.destination !== null && (
          <span dir="auto" className="font-medium">
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
        {/* Null whenever the feed omits shape_dist_traveled — expected, not a gap. */}
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
            className="text-brand-500 focus-visible:outline-brand-500 rounded-control cursor-pointer text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {showStops
              ? t(strings.planner.hideStops)
              : t(strings.planner.intermediateStops, { count: stops.length })}
          </button>

          {showStops && (
            <ol className="border-border text-content-muted mt-2 flex flex-col gap-1 border-s ps-3 text-sm">
              {stops.map((stop) => (
                <li key={stop.stopId} className="flex justify-between gap-3">
                  <span dir="auto">{stop.stopName}</span>
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

const iconProps = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const WalkIcon = () => (
  <svg {...iconProps}>
    <circle cx="13" cy="4" r="2" />
    <path d="M11 21l1-6-3-2V9l4-2 3 3 3 1M9 21l2-5" />
  </svg>
);

/** One shape per mode family, so the icon is not merely decorative. */
function ModeIcon({ routeType }: { routeType: number }) {
  if (routeType === 4) {
    return (
      <svg {...iconProps}>
        <path d="M3 17c2 0 2 1.5 4 1.5S9 17 11 17s2 1.5 4 1.5S17 17 19 17M5 17V9h14v8M8 9V6h8v3" />
      </svg>
    );
  }
  if (routeType === 0 || routeType === 1 || routeType === 2) {
    return (
      <svg {...iconProps}>
        <rect x="5" y="3" width="14" height="13" rx="2" />
        <path d="M5 10h14M8 21l2-3M16 21l-2-3" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
      </svg>
    );
  }
  return (
    <svg {...iconProps}>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M4 10h16M7 21v-2M17 21v-2" />
      <circle cx="8" cy="14" r="1" />
      <circle cx="16" cy="14" r="1" />
    </svg>
  );
}
