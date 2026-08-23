import {
  formatClockTime,
  formatDate,
  formatDistance,
  formatDuration,
  modeLabel,
  useLocale,
} from '../../i18n';
import type { Journey } from '../../types/journey';
import { ModeIcon, WalkIcon } from './modeIcons';
import { modeVisual } from './modeVisuals';
import { journeyTotals } from './journeyTotals';

interface Props {
  journey: Journey;
  onOpen: () => void;
}

/**
 * One itinerary at a glance.
 *
 * Results are read by *comparing* first and following second: someone with
 * five options wants to know which leaves soonest, which is quickest, and
 * which involves a change they would rather avoid. None of that needs the
 * stop-by-stop account, and printing five of those makes the comparison
 * impossible — the sidebar becomes a wall of text with the answer buried in
 * it.
 *
 * So the card carries only what a choice is made on: the two times, the
 * duration, the vehicles in order, and the walking. Pressing it opens the full
 * account of that one journey.
 *
 * The whole card is the button rather than a "details" link inside it. The
 * target is then the size of the card, which matters on a phone and to anyone
 * whose pointing is imprecise, and there is one tab stop per result instead of
 * two.
 */
export function ItineraryOverview({ journey, onOpen }: Props) {
  const locale = useLocale();
  const { strings, t } = locale;

  const totals = journeyTotals(journey);

  return (
    <article>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-card border-border bg-surface-raised shadow-card hover:border-brand-500 focus-visible:outline-brand-500 flex w-full cursor-pointer flex-col gap-2.5 border p-4 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/*
          Named for a screen reader as one sentence, because the visual
          shorthand below — an arrow between two times, a strip of bullets —
          reads as disconnected fragments when it is spoken.
        */}
        <span className="sr-only">
          {t(strings.planner.journeySummary, {
            start: formatClockTime(journey.startTime, locale.locale),
            end: formatClockTime(journey.endTime, locale.locale),
            duration: formatDuration(journey.totalDurationMinutes, locale),
          })}
          {' '}
          {t(strings.planner.viewDetails)}
        </span>

        <span aria-hidden="true" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-semibold tabular-nums tracking-tight">
            {formatClockTime(journey.startTime, locale.locale)}
            <span className="text-content-muted mx-1.5 inline-block rtl:-scale-x-100">
              →
            </span>
            {formatClockTime(journey.endTime, locale.locale)}
          </span>

          {/* The number itineraries are actually compared by. */}
          <span className="bg-brand-50 text-brand-700 rounded-control px-2 py-0.5 text-sm font-semibold">
            {formatDuration(journey.totalDurationMinutes, locale)}
          </span>
        </span>

        {/*
          The journey's shape, in the order it happens. Aria-hidden because the
          detail panel says all of it in words; here it is a picture to scan.
        */}
        <span aria-hidden="true" className="flex flex-wrap items-center gap-1">
          {journey.legs.map((leg, index) => (
            <span key={`${leg.startTime}-${index}`} className="flex items-center gap-1">
              {index > 0 && (
                <span className="text-content-muted text-xs rtl:-scale-x-100">›</span>
              )}
              {leg.mode === 'WALK' ? (
                <span className="text-content-muted flex items-center gap-0.5 text-xs font-medium tabular-nums">
                  <WalkIcon size={16} />
                  {leg.walkDurationMinutes}
                </span>
              ) : (
                <span
                  className={`${modeVisual(leg.routeType).fill} text-on-mode rounded-control flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold tabular-nums`}
                >
                  <ModeIcon routeType={leg.routeType} size={14} />
                  {leg.routeShortName}
                </span>
              )}
            </span>
          ))}
        </span>

        <span className="text-content-muted flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span>{t(strings.planner.changes, { count: totals.transfers })}</span>
          {totals.walkMinutes > 0 && (
            <span>
              {t(strings.planner.totalWalking, {
                duration: formatDuration(totals.walkMinutes, locale),
                distance: formatDistance(totals.walkMeters, locale),
              })}
            </span>
          )}
          {totals.waitMinutes > 0 && (
            <span>
              {t(strings.planner.totalWaiting, {
                duration: formatDuration(totals.waitMinutes, locale),
              })}
            </span>
          )}

          {/*
            An arrival on the following day, said plainly. With a 12-hour clock
            this is what stops "12:40 AM" reading as thirteen hours earlier
            than it is — so it is never left to the detail panel.
          */}
          {totals.crossesMidnight && (
            <span className="text-accent-strong font-semibold">
              {t(strings.planner.arrivesNextDay, {
                date: formatDate(journey.endDate, locale.locale),
              })}
            </span>
          )}

          {/* The engine can legitimately answer with no transit at all. */}
          {totals.rides.length === 0 && <span>{t(strings.planner.walkOnly)}</span>}

          {/*
            A single ride names its mode in words here, because the card's
            only other statement of it is the coloured bullet — and colour is
            never allowed to carry meaning alone.
          */}
          {totals.rides.length > 0 && (
            <span className="sr-only">
              {totals.rides
                .map(
                  (ride) =>
                    `${modeLabel(ride.routeType, strings)} ${ride.routeShortName}`,
                )
                .join(', ')}
            </span>
          )}
        </span>
      </button>
    </article>
  );
}
