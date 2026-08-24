import { formatClockHour, useLocale } from '../../i18n';
import type { StopTimetable } from '../../types/stop';
import { DepartureRow } from './DepartureRow';
import { keepSelected } from './keepSelected';

interface Props {
  timetable: StopTimetable;
  selectedLines: ReadonlySet<string>;
}

/**
 * A whole service day, hour by hour.
 *
 * The hours arrive as an ordered list and are rendered as one. Re-keying them
 * by hour would hoist `"10"`–`"23"` ahead of `"07"` — integer-like object keys
 * are reordered by the language itself — and silently scramble the board, which
 * is why the backend does not send an object either.
 *
 * Two empty states, because they are two different facts. A date outside the
 * feed's window is a limit of the data; a date inside it with nothing scheduled
 * is a fact about this stop.
 *
 * No countdown here. A timetable is read for a day that is usually not today,
 * and "in 3 min" against a Thursday three weeks out would be nonsense — so the
 * rows are given no clock to measure against and print times alone.
 */
export function DayTimetable({ timetable, selectedLines }: Props) {
  const { locale, strings, t } = useLocale();

  if (timetable.outsideTimetableRange) {
    return (
      <div className="rounded-card border-border bg-surface-muted flex flex-col gap-1 border px-4 py-5">
        <p className="font-medium">{t(strings.stops.outsideTimetableRange)}</p>
        <p className="text-content-muted text-sm">
          {t(strings.stops.outsideTimetableRangeHint)}
        </p>
      </div>
    );
  }

  const hours = timetable.schedule
    .map((hour) => ({
      ...hour,
      departures: keepSelected(hour.departures, selectedLines),
    }))
    // An hour the filter emptied is not an hour worth a heading.
    .filter((hour) => hour.departures.length > 0);

  if (hours.length === 0) {
    return (
      <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
        {/* The reader's own filter emptied it, which they can undo; nothing
            running that day is a fact about the stop. Different words. */}
        {t(
          timetable.totalDepartures === 0
            ? strings.stops.noDeparturesToday
            : strings.stops.noMatchingLines,
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hours.map((hour) => (
        <section key={hour.hour} className="flex flex-col gap-1">
          <h3 className="text-content-muted border-border flex items-baseline justify-between border-b pb-1 text-xs font-semibold tracking-wide uppercase">
            <span className="tabular-nums">{formatClockHour(hour.hour, locale)}</span>
            <span className="font-normal normal-case">
              {t(strings.stops.departureCount, { count: hour.departures.length })}
            </span>
          </h3>

          <ul className="flex flex-col">
            {hour.departures.map((departure, index) => (
              <DepartureRow
                key={`${departure.tripId ?? departure.lineId}-${departure.time}-${index}`}
                departure={departure}
                now={null}
                viewedDate={timetable.date}
                countdown={false}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
