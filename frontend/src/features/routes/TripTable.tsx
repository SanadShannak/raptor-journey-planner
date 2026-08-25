import { formatClockTime, formatDate, useLocale } from '../../i18n';
import { StopSelect } from './StopSelect';
import type { TripCall, VariantTimetable } from '../../types/route';
import { minutesUntil, type NetworkMoment } from '../stops/minutesUntil';
import { stopsAfter } from './stopSelection';

interface Props {
  timetable: VariantTimetable;
  /** The chosen pair, already reconciled by the host. */
  origin: number | null;
  destination: number | null;
  onOriginChange: (sequence: number) => void;
  onDestinationChange: (sequence: number) => void;
  /**
   * The network's clock, or null when the day is not today. Null removes the
   * "already gone" dimming rather than measuring it against another day.
   */
  now: NetworkMoment | null;
}

/**
 * From one stop of the line to another, all day.
 *
 * The question a line page exists for and that no board of a single stop can
 * answer: when can I leave A, when do I reach B, and how long does it take. Two
 * fields and a column of trips.
 *
 * **The destination field offers only stops further along.** Every stop in both
 * fields would let somebody ask for a journey the vehicle does not make, and
 * answering that with an empty table teaches nothing — so the impossible choice
 * is made unavailable rather than merely wrong. `reconcileSelection` in
 * `stopSelection.ts` is what keeps the pair valid as the origin moves, and it
 * belongs to the host: the selection outlives any one variant on screen.
 *
 * Native selects, and deliberately. This is one choice out of an ordered list of
 * up to sixty-six, which is exactly what a `<select>` is: it brings keyboard
 * type-ahead, a platform picker on a phone, and a screen-reader announcement
 * that says how many options there are — none of which a custom listbox in this
 * codebase would get for free.
 */
export function TripTable({
  timetable,
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  now,
}: Props) {
  const { locale, strings, t } = useLocale();

  if (timetable.outsideTimetableRange) {
    return (
      <div className="rounded-card border-border bg-surface-muted flex flex-col gap-1 border px-4 py-5">
        <p className="font-medium">{t(strings.routes.outsideTimetableRange)}</p>
        <p className="text-content-muted text-sm">
          {t(strings.routes.outsideTimetableRangeHint)}
        </p>
      </div>
    );
  }

  const onward = stopsAfter(timetable.stops, origin);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <StopSelect
          label={t(strings.routes.fromStop)}
          stops={timetable.stops}
          value={origin}
          onChange={onOriginChange}
        />
        <StopSelect
          label={t(strings.routes.toStop)}
          stops={onward}
          value={destination}
          onChange={onDestinationChange}
          disabled={onward.length === 0}
        />
      </div>

      {/* The origin is the end of the line, so the question has no other half.
          A fallback destination would be a lie about which way it runs. */}
      {onward.length === 0 ? (
        <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
          {t(strings.routes.noOnwardStops)}
        </p>
      ) : (
        <Rows
          timetable={timetable}
          origin={origin}
          destination={destination}
          now={now}
          locale={locale}
        />
      )}
    </div>
  );
}

/**
 * The trips that make the chosen pair, in departure order.
 *
 * A trip missing either end is dropped. That is not defensive tidying: a short
 * working which joins the line after the chosen origin has nothing to say about
 * travelling from it, and a row with a blank half invites the reader to work out
 * why rather than telling them.
 */
function Rows({
  timetable,
  origin,
  destination,
  now,
  locale,
}: {
  timetable: VariantTimetable;
  origin: number | null;
  destination: number | null;
  now: NetworkMoment | null;
  locale: ReturnType<typeof useLocale>['locale'];
}) {
  const { strings, t } = useLocale();

  const rows =
    origin === null || destination === null
      ? []
      : timetable.trips
          .map((trip, index) => {
            const from = trip.calls[origin] ?? null;
            const to = trip.calls[destination] ?? null;
            if (from === null || to === null) return null;
            return { key: `${trip.tripId ?? 'trip'}-${index}`, from, to, headsign: trip.headsign };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return (
      <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
        {t(strings.routes.noTripsToday)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p aria-live="polite" className="text-content-muted text-xs">
        {t(strings.routes.tripsBetween, { count: rows.length })}
      </p>

      {/*
        A real table, because this is tabular data: three headed columns whose
        cells only mean anything by their column. A screen reader can then read
        "Departs 15:42" instead of a bare number, and move between rows and
        columns as a grid.

        Scrolls inside its own box rather than pushing the sidebar sideways —
        the times are `tabular-nums` and Arabic's own headings are longer.
      */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-muted border-border border-b text-xs font-semibold tracking-wide uppercase">
              <th scope="col" className="py-1.5 pe-3 text-start font-semibold">
                {t(strings.routes.departs)}
              </th>
              <th scope="col" className="py-1.5 text-end font-semibold">
                {t(strings.routes.arrives)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const gone = now !== null && isGone(row.from, now);

              return (
                <tr
                  key={row.key}
                  /*
                    Dimmed rather than hidden. A departure that has gone is
                    still the answer to "how often does this run" and to "did I
                    just miss one", and removing it makes the board silently
                    shorten as the afternoon wears on.
                  */
                  className={`border-border border-b last:border-b-0 ${gone ? 'opacity-55' : ''}`}
                >
                  <td className="py-2 pe-3 tabular-nums">
                    <span className="font-semibold">
                      {formatClockTime(row.from.time, locale)}
                    </span>
                    <DateNote date={row.from.date} viewedDate={timetable.date} />
                    {gone && (
                      <span className="sr-only">{t(strings.routes.alreadyDeparted)}</span>
                    )}
                  </td>
                  <td className="py-2 text-end tabular-nums">
                    <span className="font-semibold">
                      {formatClockTime(row.to.arrivalTime, locale)}
                    </span>
                    <DateNote date={row.to.arrivalDate} viewedDate={timetable.date} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A time on another date says so. A 12-hour clock cannot say it alone. */
function DateNote({ date, viewedDate }: { date: string; viewedDate: string }) {
  const { locale, strings, t } = useLocale();
  if (date === viewedDate) return null;

  return (
    <span className="text-content-muted block text-xs">
      {t(strings.stops.onDate, {
        date: formatDate(date, locale, { day: 'numeric', month: 'short' }),
      })}
    </span>
  );
}

const isGone = (call: TripCall, now: NetworkMoment): boolean => {
  const minutes = minutesUntil(call, now);
  return minutes !== null && minutes < 0;
};
