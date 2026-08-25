import { Link } from 'react-router';
import { formatClockTime, formatDate, useLocale } from '../../i18n';
import type { Dictionary, Message } from '../../i18n/dictionary';
import { stopPath } from '../../app/routes';
import type { GtfsRouteType } from '../../types/journey';
import type { PatternStop, VariantTrip } from '../../types/route';
import { familyFor, visualForFamily } from '../journey/modeVisuals';
import type { NetworkMoment } from '../stops/minutesUntil';
import { nextCallAt } from './nextCallAt';

interface Props {
  stops: PatternStop[];
  routeType: GtfsRouteType;
  /** The day's trips, or null while they are on their way. */
  trips: VariantTrip[] | null;
  /** The day being looked at, so a call on another one says so. */
  viewedDate: string;
  /**
   * The network's clock, or null when the day being looked at is not today.
   *
   * Null is what removes the countdowns, and it is set from the *date* rather
   * than from whether the zone is known — those are different facts. A future
   * Sunday will never have a countdown worth showing; a live board whose zone
   * has not arrived yet will have one in a moment.
   */
  now: NetworkMoment | null;
}

/**
 * How far ahead a countdown earns its ink here.
 *
 * Ten minutes, where a departure board uses sixty. That is not an
 * inconsistency: a board is a handful of rows and the countdown *is* the
 * answer — "in 47 minutes" still beats reading a clock. This is a column of
 * forty stops, and a chip on every one of them is a wall of numbers with no
 * signal in it. What survives the cut is the only thing worth interrupting a
 * reader for: the vehicle is nearly at this stop.
 */
const IMMINENT_WITHIN_MINUTES = 10;

/**
 * What to call the number printed on the stop.
 *
 * GTFS gives a designation and never says what it names — a platform, a track,
 * a stand. The mode is the only honest guide and it is the one the networks
 * themselves use: HSL prints *raide* on a train and *laituri* on a bus stand.
 *
 * The same rule as `StopHeader` and the itinerary, read off the *line* rather
 * than off the stop, which is the one thing this page knows and they do not:
 * every stop in this list is being looked at as a stop of *this* line.
 */
function platformLabel(routeType: GtfsRouteType, strings: Dictionary): Message {
  return familyFor(routeType) === 'train'
    ? strings.planner.track
    : strings.planner.platform;
}

/**
 * Every stop the line calls at, in order, with the next vehicle beside each.
 *
 * A single coloured line runs the length of it in the mode's own colour, with a
 * circle at every stop — the same notation as the itinerary's strip map and the
 * line drawn on the map beside this. Somebody who has read either should not
 * have to learn this one.
 *
 * **The colour is on the line and the circles, never on the names.** Partly
 * because a mode colour clears the 3:1 a boundary needs and not the 4.5:1 text
 * needs, and partly because forty stop names in tram green is harder to read
 * than forty in ink. Mode is carried by the badge and the label in the header,
 * which is where it belongs; here it is wayfinding.
 *
 * Each name is a link rather than a button. It goes somewhere — the stop's own
 * page — so it should offer everything a link offers: a middle click, a copied
 * address, a visited colour.
 */
export function RouteStopList({ stops, routeType, trips, viewedDate, now }: Props) {
  const { strings, t } = useLocale();
  const ink = visualForFamily(familyFor(routeType)).ink;

  return (
    <ul className="flex flex-col">
      {stops.map((stop, index) => {
        const next = trips === null ? null : nextCallAt(trips, stop.sequence, now);
        const first = index === 0;
        const last = index === stops.length - 1;

        const facts = [
          stop.code === null ? null : t(strings.stops.stopCode, { code: stop.code }),
          stop.platform === null
            ? null
            : t(platformLabel(routeType, strings), { platform: stop.platform }),
          stop.fareZone === null
            ? null
            : t(strings.stops.fareZone, { zone: stop.fareZone }),
        ].filter((fact): fact is string => fact !== null);

        return (
          <li key={`${stop.sequence}-${stop.id}`} className="flex gap-3">
            {/*
              The spine. Two struts and a circle between them, so the line
              enters and leaves at the circle's edge rather than showing through
              it — and the first and last rows get an invisible strut of the
              same width, which keeps every circle on one axis instead of
              shifting the ends by two pixels.
            */}
            <span aria-hidden="true" className="flex flex-none flex-col items-center">
              <Strut ink={ink} hidden={first} lead />
              <span
                className={`${ink} my-0.5 flex-none rounded-full border-current bg-current ${
                  first || last ? 'h-3.5 w-3.5 border-[3px] bg-transparent' : 'h-2.5 w-2.5'
                }`}
              />
              <Strut ink={ink} hidden={last} />
            </span>

            <div className="border-border flex min-w-0 flex-1 items-start gap-3 border-b py-2.5">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <Link
                  to={stopPath(stop.id)}
                  dir="auto"
                  className="rounded-control text-content hover:text-brand-700 focus-visible:outline-brand-500 max-w-full truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {stop.name}
                </Link>

                {stop.description !== null && (
                  <span dir="auto" className="text-content-muted max-w-full truncate text-xs">
                    {stop.description}
                  </span>
                )}

                {facts.length > 0 && (
                  <span className="text-content-muted flex flex-wrap gap-x-2 text-xs tabular-nums">
                    {facts.map((fact) => (
                      <span key={fact}>{fact}</span>
                    ))}
                  </span>
                )}
              </div>

              <NextDeparture
                next={next}
                pending={trips === null}
                viewedDate={viewedDate}
                counting={now !== null}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One half of the spine between two circles.
 *
 * `lead` is the stretch above a circle, which has to reach the middle of the
 * stop's name — the row's top padding plus half a line — so a stop is never
 * written above its own dot. Below it, the strut simply fills what is left.
 */
function Strut({
  ink,
  hidden,
  lead = false,
}: {
  ink: string;
  hidden: boolean;
  lead?: boolean;
}) {
  const height = lead ? 'h-[0.8125rem]' : 'min-h-2 flex-1';
  if (hidden) return <span className={`w-1 ${height}`} />;
  return <span className={`${ink} w-1 rounded-full bg-current ${height}`} />;
}

/**
 * When the next vehicle leaves this stop.
 *
 * The time takes the end of the row because it is the fixed thing a reader
 * scans down; the countdown sits inside that edge, because it is the part that
 * moves and a number moving in a column's own margin drags the eye off
 * everything that does not.
 *
 * The countdown's chip is `aria-hidden` with a full sentence beside it: "3 min"
 * beside a time is legible to the eye because the layout supplies the rest, and
 * reads as a fragment when spoken.
 */
function NextDeparture({
  next,
  pending,
  viewedDate,
  counting,
}: {
  next: ReturnType<typeof nextCallAt>;
  pending: boolean;
  viewedDate: string;
  counting: boolean;
}) {
  const { locale, strings, t } = useLocale();

  // Times are on their way. Say nothing rather than "nothing runs", which is a
  // claim this row is not yet in a position to make.
  if (pending) return <span className="w-24 flex-none" />;

  if (next === null) {
    return (
      <span className="text-content-muted w-24 flex-none text-end text-xs">
        {/* Two different facts. "Nothing more today" is the end of service on a
            day that had one; "does not call that day" is a short working that
            never comes here at all. Only a clock can tell them apart. */}
        {t(counting ? strings.routes.noMoreToday : strings.routes.noCallHere)}
      </span>
    );
  }

  const { call, minutes } = next;
  const imminent =
    counting && minutes !== null && minutes >= 0 && minutes <= IMMINENT_WITHIN_MINUTES;

  return (
    <span className="flex w-24 flex-none flex-col items-end gap-0.5">
      <span className="flex items-center gap-1.5">
        {imminent && (
          <>
            <span
              aria-hidden="true"
              className={`rounded-control px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums ${
                minutes <= 1 ? 'bg-brand-fill text-on-brand' : 'bg-surface-sunken text-content'
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
        <span className="font-semibold tabular-nums">
          {formatClockTime(call.time, locale)}
        </span>
      </span>

      {/*
        The arrival, only where it differs. This is a departure list — the
        headline time is when a vehicle leaves, which is what somebody waiting
        at the stop is waiting for. Where it waits, a terminus or a timing
        point, the moment it pulls in is a separate and useful fact; where it
        does not, the two numbers would say the same thing twice.
      */}
      {call.arrivalTime !== call.time && (
        <span className="text-content-muted text-xs tabular-nums">
          {t(strings.stops.arrivesAt, { time: formatClockTime(call.arrivalTime, locale) })}
        </span>
      )}

      {/* A call past midnight carries its date. A 12-hour clock cannot say
          which side of midnight it is on, and this list legitimately crosses. */}
      {call.date !== viewedDate && (
        <span className="text-content-muted text-xs">
          {t(strings.stops.onDate, {
            date: formatDate(call.date, locale, { day: 'numeric', month: 'short' }),
          })}
        </span>
      )}
    </span>
  );
}
