import { formatClockTime, formatDate, useLocale } from '../../i18n';
import type { StopDeparture } from '../../types/stop';
import { LineBadge } from './LineBadge';
import { minutesUntil, type NetworkMoment } from './minutesUntil';

interface Props {
  departure: StopDeparture;
  /**
   * The network's clock, or null when it is not known yet. Null removes the
   * countdown rather than measuring one against the browser's city.
   */
  now: NetworkMoment | null;
  /**
   * The day being looked at. A departure falling on another one says so — the
   * whole reason every departure carries its own date.
   */
  viewedDate: string;
  /**
   * Whether a countdown can appear on this board at all.
   *
   * Not inferred from {@link now}, because the two say different things. A
   * timetable is read for a day that is usually not today, so "in 3 min"
   * against a Thursday three weeks out is nonsense and the column should not
   * exist. A live board whose clock has not arrived yet *will* have countdowns
   * in a moment, and reserving the space now stops every row shifting sideways
   * when it does.
   */
  countdown: boolean;
}

/**
 * How far ahead a countdown is worth showing.
 *
 * Past an hour the number stops being the thing you act on: "in 47 minutes"
 * tells you less than "16:31" does, because you are going to look at a clock
 * anyway. Under it the countdown is the whole point — it answers "do I run"
 * without any arithmetic.
 */
const COUNTDOWN_WITHIN_MINUTES = 60;

/**
 * One vehicle calling at the stop.
 *
 * Reads as a line: what it is, where it goes, when it leaves. The countdown
 * sits at the end because it is the part that changes, and a number that moves
 * in the middle of a row drags the eye off everything that does not.
 *
 * Three of the API's rules are honoured here rather than left to a reader:
 *
 * - A trip that **terminates here** has no destination at all, and saying
 *   "towards <the stop you are standing at>" would be nonsense.
 * - A **headsign** is what is written on the front of the vehicle, so it is
 *   printed verbatim and a rider can match it. A `destination` without one is
 *   our inference from the pattern's last stop, so it reads "towards X" — the
 *   vehicle may be signed something else entirely.
 * - A departure on **another date** carries that date beside the time. A
 *   12-hour clock cannot say which side of midnight it is on, and this board
 *   legitimately runs past it.
 */
export function DepartureRow({ departure, now, viewedDate, countdown }: Props) {
  const { locale, strings, t } = useLocale();

  const minutes = now === null ? null : minutesUntil(departure, now);
  const counting =
    countdown &&
    minutes !== null &&
    minutes >= 0 &&
    minutes <= COUNTDOWN_WITHIN_MINUTES;

  const clock = formatClockTime(departure.time, locale);
  const elsewhere = departure.date !== viewedDate;

  return (
    <li className="border-border flex items-center gap-3 border-b py-2.5 last:border-b-0">
      <LineBadge
        lineId={departure.lineId}
        routeShortName={departure.routeShortName}
        routeType={departure.routeType}
        linked
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span dir="auto" className="truncate font-medium">
          {departure.terminatesHere
            ? t(strings.stops.terminatesHere)
            : departure.headsign !== null
              ? departure.headsign
              : departure.destination !== null
                ? t(strings.stops.towards, { destination: departure.destination })
                : (departure.routeLongName ?? '')}
        </span>

        {/*
          The arrival, only where it differs from the departure — which is where
          a vehicle stands for a while, and the difference is worth knowing if
          you are already on it.
        */}
        {departure.arrivalTime !== departure.time && (
          <span className="text-content-muted text-xs">
            {t(strings.stops.arrivesAt, {
              time: formatClockTime(departure.arrivalTime, locale),
            })}
          </span>
        )}
      </span>

      {/*
        The countdown sits *before* the time, not after it.

        The time is the fixed thing — it is the same on every board, and it is
        what a reader scans down — so it takes the end of the row and lines up
        with the hour's own heading above it. The countdown is the part that
        moves, and it belongs inside that edge rather than defining it.

        The column keeps its width whether or not it has anything to say, so a
        departure an hour out does not shunt its neighbours' times sideways.
        Wide enough for the longest thing that can land in it, which is not
        "9 min" — two digits and an Arabic "دقيقة" is the case that decides it,
        and at 3.5rem the chip wrapped its number above its unit. `nowrap` is
        the belt to that braces: a translation nobody has written yet must
        overflow rather than fold in half.
        Rendered at all only where countdowns are possible: on a timetable it
        would be three and a half rems of permanent nothing holding every time
        away from the edge.

        `aria-hidden`, paired with a full sentence for a screen reader: "3 min"
        beside a time is legible to the eye because the layout supplies the
        rest, and reads as a fragment when spoken.
      */}
      {countdown && (
        <span className="flex w-20 flex-none justify-end">
          {counting && (
            <>
              <span
                aria-hidden="true"
                className={`rounded-control px-1.5 py-0.5 text-sm font-semibold whitespace-nowrap tabular-nums ${
                  minutes <= 1
                    ? 'bg-brand-fill text-on-brand'
                    : 'bg-surface-sunken text-content'
                }`}
              >
                {minutes < 1
                  ? t(strings.stops.dueNow)
                  : t(strings.stops.inMinutes, { count: minutes })}
              </span>
              <span className="sr-only">
                {t(strings.stops.departsIn, { count: minutes })}
              </span>
            </>
          )}
        </span>
      )}

      <span className="flex flex-none flex-col items-end">
        <span className="font-semibold tabular-nums">{clock}</span>

        {elsewhere && (
          <span className="text-content-muted text-xs">
            {t(strings.stops.onDate, {
              date: formatDate(departure.date, locale, {
                day: 'numeric',
                month: 'short',
              }),
            })}
          </span>
        )}
      </span>
    </li>
  );
}
