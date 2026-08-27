import { formatClockTime, formatDate, useLocale } from '../../i18n';
import { LineBadge } from '../stops/LineBadge';
import type { LineVariantDetail } from '../../types/route';
import type { DaySpan } from './daySpan';

interface Props {
  variant: LineVariantDetail;
  /**
   * When the first and last vehicle leave the origin on the day being looked
   * at, or null when it does not run that day.
   *
   * The day's own span rather than the pattern's lifetime one. Those answer
   * different questions — "how early does this line ever start" against "when
   * does it start on a Sunday" — and only the second is worth printing beside a
   * date.
   */
  span: DaySpan | null;
  /**
   * How many trips run on the day being looked at, or null while that day's
   * timetable has not arrived, has none to report, or the caller is not
   * currently showing the timetable tab.
   *
   * The day's own count, not the pattern's lifetime one — {@link
   * LineVariantDetail.tripCount} is every distinct trip the compiled
   * timetable carries across the whole feed, which a trip recurring on many
   * calendar days makes far larger than what runs on any one of them, and
   * reads as a claim about today that is not true of it. This is the number
   * a reader can check by opening the timetable tab for this same day and
   * counting rows — which is also why the caller passes null outside that
   * tab: the stops tab is about where the line goes and when the next one
   * calls, not a count of the day's trips.
   */
  tripsOnDay: number | null;
  /** The day the span belongs to, so it can say which day it is talking about. */
  day: string;
  /** Today on the network's clock, so "today" is only said when it is true. */
  networkToday: string | null;
  /**
   * Where the flip goes, or null when there is nowhere to flip to.
   *
   * Resolved by the caller from the line's variants rather than worked out here:
   * a direction only exists if a pattern runs it, and this component sees one
   * pattern. Null is the honest state for a feed with no `direction_id` at all,
   * and for a line that genuinely only runs one way.
   */
  onFlip: (() => void) | null;
}

/**
 * Who this line is, and which way round it is being shown.
 *
 * The designation wears its mode, as it does on every board — the same badge,
 * unlinked, because pressing it would lead here. Beside it the long name, which
 * is the operator's own description of the route and often the only place the
 * middle of the line is named at all.
 *
 * **The long name does not change when the direction does, and cannot.** An
 * operator publishes one name for a line, written along the corridor rather
 * than along a direction — "Eira - Lasipalatsi - Ooppera - Sörnäinen (M) -
 * Käpylä" is the same road travelled either way, and reversing the words to
 * make it look directional would be inventing a name the feed does not carry.
 *
 * What genuinely differs between the two directions is where the vehicle is
 * *going*, so that is the line underneath: the headsign, which is what is
 * written on the front of the vehicle and what a rider matches against. It
 * changes on a flip because it is the thing the flip changes.
 */
export function RouteHeader({ variant, span, tripsOnDay, day, networkToday, onFlip }: Props) {
  const { locale, strings, t } = useLocale();

  const facts = [
    t(strings.routes.stopCount, { count: variant.stopCount }),
    tripsOnDay === null
      ? null
      : day === networkToday
        ? t(strings.routes.tripCountToday, { count: tripsOnDay })
        : t(strings.routes.tripCountOnDate, {
            count: tripsOnDay,
            date: formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' }),
          }),
    span === null
      ? null
      : day === networkToday
        ? t(strings.routes.spanToday, {
            first: formatClockTime(span.first, locale),
            last: formatClockTime(span.last, locale),
          })
        : t(strings.routes.spanOnDate, {
            first: formatClockTime(span.first, locale),
            last: formatClockTime(span.last, locale),
            date: formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' }),
          }),
  ].filter((fact): fact is string => fact !== null);

  /*
   * The sign, or the last stop when the feed carries none for this pattern.
   * The fallback is our inference rather than the operator's word, so it is
   * worded "towards" either way — a rider should not be told a vehicle is
   * signed something we worked out ourselves.
   */
  const destination = variant.headsign ?? variant.terminusStopName;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <LineBadge
          lineId={variant.lineId}
          routeShortName={variant.routeShortName}
          routeType={variant.routeType}
        />
        {/*
          Sized to the name rather than stretched across the row, and no
          `dir="auto"` on it.

          Both halves of that matter in Arabic, and they fix different things.
          `dir="auto"` resolves from the first strong character, so a Latin
          route name would turn the whole heading left-to-right and strand it at
          the far side of the page. And a box stretched to the full row leaves
          the name at whichever end its own text-alignment lands on, a sidebar's
          width away from the badge it belongs to — the same fault the stop rows
          and the departure board each had, and the same fix.

          `min-w-0` keeps it able to shrink, so a long name still wraps inside
          the row instead of pushing the badge off it.
        */}
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
          {variant.routeLongName ?? variant.routeShortName}
        </h1>
      </div>

      {/*
        Where this vehicle is heading, and the way round. The two sit on one
        line because the flip acts on exactly this sentence — it is what turns
        "towards Käpylä" into "towards Eira".
      */}
      {(destination !== null || onFlip !== null) && (
        <div className="flex items-center gap-2">
          {destination !== null && (
            <p dir="auto" className="text-content min-w-0 flex-1 text-sm font-medium">
              {t(strings.routes.towards, { destination })}
            </p>
          )}

          {onFlip !== null && (
            <button
              type="button"
              onClick={onFlip}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 ms-auto flex flex-none cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {/*
                Mirrors in RTL: two arrows pointing opposite ways still have a
                leading one, and which end leads is what the page's direction
                decides.
              */}
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="rtl:-scale-x-100"
              >
                <path d="M3 7h11l-3-3M17 13H6l3 3" />
              </svg>
              {t(strings.routes.flipDirection)}
            </button>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <ul className="text-content-muted flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {facts.map((fact) => (
            <li
              key={fact}
              className="rounded-control bg-surface-muted px-2 py-0.5 tabular-nums"
            >
              {fact}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
