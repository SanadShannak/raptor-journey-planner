import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatClockTime, formatDate, useLocale } from '../../i18n';
import type { Dictionary, Message } from '../../i18n/dictionary';
import { stopPath } from '../../app/routes';
import type { GtfsRouteType } from '../../types/journey';
import type { PatternStop, VariantTrip } from '../../types/route';
import { familyFor, visualForFamily } from '../journey/modeVisuals';
import type { NetworkMoment } from '../stops/minutesUntil';
import { callOnTrip, nextCallAt } from './nextCallAt';
import { VehicleBadge } from './VehicleBadge';
import type { Vehicle } from './vehicleProgress';

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
  /**
   * The vehicles out on this pattern right now, furthest along first.
   *
   * Empty on a day that is not today — a Sunday three weeks out has no vehicles
   * on it, and drawing where one *would* be is a claim about a moment that is
   * not happening.
   */
  vehicles: Vehicle[];
  /**
   * One run to follow, instead of the whole line.
   *
   * The list then answers a different question. Ordinarily each row shows what
   * leaves that stop *next*, which on a busy line is a different vehicle at
   * every row — and is why the times can climb and then drop. Following one
   * trip, every row shows when *this* vehicle is there, including the stops it
   * has already passed: the run is the subject, so its whole journey is.
   */
  focusTrip?: VariantTrip | null | undefined;
  /** Opens a stop. The whole row is the target, not just the name. */
  onOpenStop: (stopId: string) => void;
  /**
   * Follows the run a vehicle is on, or null when there is nothing to follow to
   * — already following one, or no day to follow it on.
   *
   * Null also takes the badges back out of the tab order, which is right: a
   * decoration that cannot be acted on should not be a stop on the way to
   * something that can.
   */
  onFollowTrip?: ((tripId: string) => void) | null | undefined;
}

/**
 * Keeps a followed vehicle in view, until the reader would rather it did not.
 *
 * Only while one run is being followed. With five vehicles on a line there is
 * no "the" vehicle to hold on screen, and a list that scrolled itself to one of
 * them would be taking a decision nobody asked it to.
 *
 * **It gives up the moment the reader scrolls.** Reading ahead down the line is
 * the obvious thing to do while following a run, and a list that hauls itself
 * back every ten seconds is unusable — worse than one that never moved. Once
 * they have taken over they keep it for as long as the run is followed.
 *
 * Intent is read from `wheel`, `touchstart` and the keys that scroll, rather
 * than from scroll position. Position cannot tell our own smooth scroll from a
 * person's, and every attempt to do so with a flag is a race with the animation
 * it is trying to ignore.
 */
function useFollowInView(active: boolean): (node: HTMLElement | null) => void {
  /*
   * The node in state rather than in a ref. A ref read during render is a value
   * React has not been told about, so the effect below would keep whichever
   * node it first saw — and the whole point is that this one moves from row to
   * row as the vehicle advances.
   */
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [surrendered, setSurrendered] = useState(false);

  /*
   * A new run is a new subject, so the list is allowed to move again. Adjusted
   * during render rather than in an effect: an effect would paint one frame
   * still surrendered and then re-render to correct it, and the correction is
   * not a synchronisation with anything — it is what the value *is* for the new
   * subject.
   */
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setSurrendered(false);
  }

  useEffect(() => {
    if (!active) return;

    const takeOver = () => setSurrendered(true);
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) takeOver();
    };

    window.addEventListener('wheel', takeOver, { passive: true });
    window.addEventListener('touchstart', takeOver, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', takeOver);
      window.removeEventListener('touchstart', takeOver);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  useEffect(() => {
    if (!active || surrendered || node === null) return;
    /*
     * `center`, not `nearest`. `nearest` does the least it can get away with,
     * which is to bring the badge just past the edge of the panel — technically
     * in view, and with nothing of the line ahead of it to read. Centring costs
     * a small movement on a vehicle that was already on screen and buys the
     * stops either side of it, which is the thing somebody following a run is
     * looking at.
     */
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, surrendered, node]);

  return setNode;
}

/** The keys that scroll a list, and therefore say the reader is driving. */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

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
 * How far down a row's spine column the marker's centre sits.
 *
 * The row's top padding plus half a line of text, less half the marker's box —
 * 10 plus 12 less 7. It is a constant because every marker shares one box size;
 * see {@link Strut} for the rest of the arithmetic.
 */
const MARKER_CENTRE = 22;

/**
 * Down the list is the way the vehicles travel, because the stops are in order.
 *
 * A compass bearing, like the map's — 0 north, 180 south — so the one arrow
 * shape serves both renderers. It is fixed here rather than read from the
 * geometry: a list has one direction whatever the road is doing, and an arrow
 * that pointed north-east because the line does would be describing the wrong
 * thing entirely. The map is where the road's own heading belongs.
 */
const DOWN = 180;

/**
 * A stop nothing will call at again today, and the line leading to it.
 *
 * `border-strong` rather than a faded mode colour: the point is that the line
 * is *not* live here, and a paler tram green still reads as tram green. Both
 * this and the muted name the spent rows take are tokens the contrast check
 * already covers for exactly these roles — a boundary at 3:1, text at 4.5:1 —
 * so a stop that has been passed is dimmed without becoming unreadable.
 */
const SPENT = 'text-border-strong';

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
export function RouteStopList({
  stops,
  routeType,
  trips,
  viewedDate,
  now,
  vehicles,
  focusTrip = null,
  onOpenStop,
  onFollowTrip = null,
}: Props) {
  /*
   * Only a followed run has a vehicle worth holding on screen, and only while
   * the day actually has one out.
   */
  const holdInView = useFollowInView(focusTrip !== null && vehicles.length > 0);
  const { strings, t } = useLocale();
  const family = familyFor(routeType);
  const ink = visualForFamily(family).ink;

  /*
   * The next departure at every stop, worked out once. It is read three times
   * per row — for the time, for whether the row is spent, and for the struts
   * either side of it — and `nextCallAt` walks every trip each time it is asked.
   */
  const nextCalls = stops.map((stop) => {
    if (focusTrip !== null) return callOnTrip(focusTrip, stop.sequence, now);
    return trips === null ? null : nextCallAt(trips, stop.sequence, now);
  });

  /**
   * A stop nothing will call at again today.
   *
   * The line has gone past and nothing behind it will reach here before the
   * service day ends. Greyed rather than hidden, because it is still a stop on
   * this line and somebody reading the route wants to see it — it just cannot
   * be boarded at any more.
   *
   * Read per stop rather than as a run. Coverage is *not* always a clean prefix:
   * an evening of short workings that turn back early leaves the tail of the
   * line unserved while its start is still running, so an assumption about the
   * shape of it would grey the wrong end.
   *
   * Only ever true once the day's times are in hand. While they are loading
   * nothing is spent — a blank list drawn entirely in grey says the line is
   * finished when it has not been asked yet.
   */
  const spent = (index: number): boolean => {
    if (trips === null || now === null) return false;
    /*
     * Following one run, "spent" means this vehicle has been and gone — not
     * that nothing will ever call again. A stop the trip skips is not spent
     * either; it is simply not on this run, which the row says in words.
     */
    if (focusTrip !== null) {
      const call = nextCalls[index];
      return call !== null && call !== undefined && call.minutes !== null && call.minutes < 0;
    }
    return nextCalls[index] === null;
  };

  return (
    <ul className="flex flex-col">
      {stops.map((stop, index) => {
        const next = nextCalls[index] ?? null;
        const first = index === 0;
        const last = index === stops.length - 1;

        /*
         * A strut is spent when the stops at *both* of its ends are — the leg
         * between a spent stop and a live one is still going to be driven.
         */
        const leadSpent = spent(index) && (first || spent(index - 1));
        const belowSpent = spent(index) && (last || spent(index + 1));

        /*
         * The vehicle standing at this stop, or the one running from it towards
         * the next. At most one is drawn per position: two vehicles nose to tail
         * on one leg is a real thing but two discs on top of each other is not a
         * picture of it, and the one in front is the one that matters.
         */
        const here = vehicles.find(
          (vehicle) =>
            vehicle.progress.atStop && vehicle.progress.fromSequence === stop.sequence,
        );
        const leaving = vehicles.find(
          (vehicle) =>
            !vehicle.progress.atStop && vehicle.progress.fromSequence === stop.sequence,
        );

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
          /*
            `gap-5` rather than the `gap-3` a plain spine needs. A vehicle badge
            is 42px centred on a 14px column, so it hangs fourteen pixels past
            each side — at the old gap it sat on top of the stop's own name.
          */
          <li key={`${stop.sequence}-${stop.id}`} className="flex gap-5">
            {/*
              The spine. Two struts and a circle between them, so the line
              enters and leaves at the circle's edge rather than showing through
              it — and the first and last rows get an invisible strut of the
              same width, which keeps every circle on one axis instead of
              shifting the ends by two pixels.
            */}
            <span
              /*
                Referenced only where the followed vehicle is, so the hook has
                exactly one node to keep on screen and no bookkeeping to do
                about which row that is.
              */
              ref={here !== undefined || leaving !== undefined ? holdInView : undefined}
              className="relative flex flex-none flex-col items-center"
            >
              <Strut ink={leadSpent ? SPENT : ink} hidden={first} lead />
              {/*
                A fixed 14px box around every marker, whatever size the marker
                inside it is.
                
                That box is what keeps the line straight. Sized to the marker
                instead, an end ring is 14px and an intermediate dot 10px, so
                the two sit on axes two pixels apart — and because the ends are
                the ones that differ, the bend showed up immediately under the
                first stop and again above the last. One box, one axis.

                It has no margin, and the struts overlap it by two pixels
                instead — see {@link Strut}. Spaced apart, the line arrived at
                the box rather than at the dot inside it, which left a hairline
                of nothing on both sides of every intermediate stop. The marker
                sits above the overlap, so the join cannot be seen.
              */}
              <span className="relative z-10 flex h-3.5 w-3.5 flex-none items-center justify-center">
                <span
                  className={`${spent(index) ? SPENT : ink} rounded-full border-current bg-current ${
                    first || last ? 'h-3.5 w-3.5 border-[3px] bg-surface' : 'h-2.5 w-2.5'
                  }`}
                />
              </span>
              <Strut ink={belowSpent ? SPENT : ink} hidden={last} />

              {/*
                The vehicles, laid over the spine rather than in it.

                Standing at a stop it covers that stop's marker, which is what
                standing there looks like. Running, it sits a fraction of the way
                down this row's own column — and because the column is stretched
                to the row's height, a percentage of it *is* the distance to the
                next marker, so no measuring is needed and rows of different
                heights all work out.
              */}
              {here !== undefined && (
                <VehicleOnSpine
                  vehicle={here}
                  family={family}
                  onFollow={onFollowTrip}
                  /*
                    Stretched across the column and flex-centred rather than
                    offset from one edge. `start-1/2` with a negative
                    `translate-x` centres in a left-to-right page and pushes the
                    badge a whole width off the spine in a right-to-left one —
                    the offset is logical and the translate is not. Two logical
                    edges and `justify-center` need no translate at all, and the
                    badge overflows the 14px column evenly on both sides.
                  */
                  top={`${MARKER_CENTRE}px`}
                />
              )}
              {leaving !== undefined && (
                <VehicleOnSpine
                  vehicle={leaving}
                  family={family}
                  onFollow={onFollowTrip}
                  top={`calc(${MARKER_CENTRE}px + ${leaving.progress.fraction * 100}%)`}
                />
              )}
            </span>

            {/*
              The whole row opens the stop, not just its name.
              
              A name is a small target beside a wide row of its own details, and
              a reader who has just read the platform and the zone has their
              pointer on the part that did nothing. The card is what they were
              already looking at.

              A link rather than a button: it goes somewhere, so it should offer
              what a link offers — a middle click, a copied address, a visited
              colour. Nothing else in the row is interactive, so nothing is
              nested inside it.
            */}
            <Link
              to={stopPath(stop.id)}
              onClick={() => onOpenStop(stop.id)}
              className="border-border hover:bg-surface-muted focus-visible:outline-brand-500 rounded-control -mx-2 flex min-w-0 flex-1 items-start gap-3 border-b px-2 py-2.5 last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span
                  dir="auto"
                  className={`max-w-full truncate font-medium ${
                    spent(index) ? 'text-content-muted' : 'text-content'
                  }`}
                >
                  {stop.name}
                </span>

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

              {/*
                Discoverable by navigation, never announced. A live region here
                would read a vehicle's position out every few seconds; a plain
                note is found by anyone moving through the list and ignored by
                everyone else.
              */}
              {(here !== undefined || leaving !== undefined) && (
                <span className="sr-only">
                  {t(here !== undefined ? strings.routes.vehicleHere : strings.routes.vehicleLeaving)}
                </span>
              )}

              <NextDeparture
                next={next}
                pending={trips === null}
                viewedDate={viewedDate}
                counting={now !== null}
                following={focusTrip !== null}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A vehicle on the spine, and a way into the run it is making.
 *
 * Pressable only where there is somewhere to go. Following one run already, or
 * looking at a day with no times, it stays a picture — and a picture, rather
 * than a button that does nothing, is what keeps it out of the tab order.
 *
 * When it *is* pressable it stops being `aria-hidden` and takes a real name,
 * because it has become a control. The badge inside stays hidden either way:
 * the button's name is the accessible content, and the drawing is decoration
 * on top of it.
 */
function VehicleOnSpine({
  vehicle,
  family,
  onFollow,
  top,
}: {
  vehicle: Vehicle;
  family: string;
  onFollow: ((tripId: string) => void) | null | undefined;
  top: string;
}) {
  const { strings, t } = useLocale();
  const tripId = vehicle.trip.tripId;
  const canFollow = onFollow !== null && onFollow !== undefined && tripId !== null;

  return (
    <span
      className="absolute start-0 end-0 z-20 flex -translate-y-1/2 justify-center"
      style={{ top }}
    >
      {canFollow ? (
        <button
          type="button"
          onClick={() => onFollow(tripId)}
          className="rounded-control focus-visible:outline-brand-500 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="sr-only">{t(strings.routes.followThisRun)}</span>
          <VehicleBadge family={family} bearing={DOWN} />
        </button>
      ) : (
        <VehicleBadge family={family} bearing={DOWN} />
      )}
    </span>
  );
}

/**
 * One half of the spine between two circles.
 *
 * Both ends **overlap the marker box by two pixels**, which is what closes the
 * hairline that used to show either side of every intermediate stop: a 10px dot
 * inside a 14px box left 2px of nothing between the line and the dot. The
 * marker is drawn above the overlap, so the join is invisible — and on an end
 * ring the two pixels land inside its 3px border rather than in its hollow.
 *
 * `lead` is the stretch above a marker and has to land the marker's centre on
 * the middle of the stop's name, or a stop is written above its own dot. That
 * is the row's top padding plus half a line — 10px plus 12px — less half the
 * 14px box, plus the 2px the strut gives back by overlapping: seventeen. It
 * only holds because every marker shares one box size.
 *
 * Below it, the strut simply fills what is left.
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
  const height = lead ? 'h-[1.0625rem] -mb-0.5' : 'min-h-2 flex-1 -mt-0.5';
  if (hidden) return <span className={`w-1 ${height}`} />;
  // Square-ended, not rounded: a rounded cap is a semicircle of nothing at the
  // very join the overlap exists to close.
  return <span className={`${ink} w-1 bg-current ${height}`} />;
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
  following,
}: {
  next: ReturnType<typeof nextCallAt>;
  pending: boolean;
  viewedDate: string;
  counting: boolean;
  /** Following one run, so a call in the past is shown rather than dropped. */
  following: boolean;
}) {
  const { locale, strings, t } = useLocale();

  // Times are on their way. Say nothing rather than "nothing runs", which is a
  // claim this row is not yet in a position to make.
  if (pending) return <span className="w-28 flex-none" />;

  if (next === null) {
    return (
      <span className="text-content-muted w-28 flex-none text-end text-xs">
        {/*
          Three different facts, and they are not interchangeable. Following one
          run, a missing call means this vehicle drives past without stopping.
          Otherwise it is the end of service on a day that had one, or a short
          working that never comes here at all — and only a clock separates
          those two.
        */}
        {t(
          following
            ? strings.routes.notOnThisRun
            : counting
              ? strings.routes.noMoreToday
              : strings.routes.noCallHere,
        )}
      </span>
    );
  }

  const { call, minutes } = next;
  const imminent =
    counting && minutes !== null && minutes >= 0 && minutes <= IMMINENT_WITHIN_MINUTES;
  /*
   * Following one run, a call it has already made is still part of its journey
   * and stays on the list — dimmed, because it is not something you can act on.
   * On the line as a whole a past call is simply never the answer.
   */
  const gone = following && minutes !== null && minutes < 0;

  return (
    /*
      Wide enough for a chip and a clock side by side, and `nowrap` so a
      translation nobody has written yet overflows rather than folding. At 6rem
      the meridiem dropped onto its own line under the time — which reads as two
      different facts rather than one time.
    */
    <span
      className={`flex w-28 flex-none flex-col items-end gap-0.5 ${gone ? 'opacity-55' : ''}`}
    >
      <span className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
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
        <span className="font-semibold whitespace-nowrap tabular-nums">
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
        <span className="text-content-muted text-xs whitespace-nowrap tabular-nums">
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
