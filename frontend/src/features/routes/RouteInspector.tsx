import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getLine, getLineVariant, getVariantTimetable } from '../../api/routes';
import { DateSelect } from '../../components/DateSelect';
import { messageForApiError, useLocale } from '../../i18n';
import type { Line, LineVariantDetail, VariantTimetable } from '../../types/route';
import { useNetworkNow } from '../stops/useNetworkNow';
import { daySpan } from './daySpan';
import { RouteHeader } from './RouteHeader';
import { RouteStopList } from './RouteStopList';
import { TripTable } from './TripTable';
import { VariantPicker } from './VariantPicker';
import { reconcileSelection } from './stopSelection';
import { activeVehicles, nowSeconds, type Vehicle } from './vehicleProgress';

/**
 * How often the vehicles are moved.
 *
 * Ten seconds. The countdowns beside them tick at thirty, which is right for a
 * number that only ever changes once a minute — but a *position* between two
 * scheduled times is continuous, and at thirty seconds a vehicle crossing a
 * two-minute leg lurches through four places instead of gliding through twelve.
 *
 * It costs a re-render of the stop list, which is a few dozen rows of static
 * markup either side of the thing that actually moved.
 */
const VEHICLE_TICK_MS = 10_000;

interface Props {
  lineId: string;
  /**
   * Which variant to show, from the URL, or null to take the line's own first
   * — which is its busiest, because `/api/routes/:lineId` orders them that way.
   */
  patternId: number | null;
  /**
   * One run of the variant to follow, from the URL.
   *
   * Null is the ordinary view: the whole line, each stop answering "what leaves
   * here next". With a trip, the stop list becomes that one vehicle's journey.
   */
  tripId?: string | null | undefined;
  /**
   * The service day a followed trip belongs to. A trip id is only meaningful
   * against one, and the same run tomorrow is a different trip.
   */
  tripDate?: string | null | undefined;
  /** The network's zone, for the countdowns. Null until `/api/network` answers. */
  timezone: string | null;
  /** Today on the network's clock, so the date picker opens somewhere honest. */
  networkToday: string | null;
  /** Moves to another variant of the same line, by putting it in the URL. */
  onSelectVariant: (patternId: number) => void;
  /** Follows one run, or drops back to the whole line when given null. */
  onSelectTrip: (trip: { tripId: string; date: string } | null) => void;

  onBack: () => void;
  backLabel: string;
  /** Hands the variant to the host once it is known, so the map can draw it. */
  onResolved?: ((variant: LineVariantDetail) => void) | undefined;
  /**
   * Hands the vehicles up, so the map draws the same ones the spine does.
   *
   * Computed here rather than twice: the day's timetable lives here, and two
   * independent clocks would put one vehicle in two places.
   */
  onVehicles?: ((vehicles: Vehicle[]) => void) | undefined;
}

type View = 'stops' | 'timetable';

/**
 * One line, inspected.
 *
 * Three requests, in a deliberate order. The line comes first because it is the
 * only thing that knows which variants exist — including which one to show when
 * the URL names none, and whether there is an opposite direction to flip to.
 * The variant follows, and then the day.
 *
 * **Each view has its own day, and only one of them can be chosen.** The stop
 * list is about now — what is next at each stop, how far along the line the
 * vehicle is — so its day is today and there is no control to change it. The
 * timetable is about planning, so that is where the day is picked. A picker
 * over both would offer to move the stop list off today, which is the one day
 * it is for.
 *
 * They share the one request. The effective day is whichever view is showing,
 * so switching tabs can cost a fetch — a cheap one, and cheaper than holding
 * two days of the same line in memory to avoid it.
 *
 * Nothing polls. A whole service day is in hand, so the next departure at every
 * stop is recomputed locally as the clock ticks. A departure board refetches
 * because it is a window onto now; this is not.
 */
export function RouteInspector({
  lineId,
  patternId,
  tripId = null,
  tripDate = null,
  timezone,
  networkToday,
  onSelectVariant,
  onSelectTrip,
  onBack,
  backLabel,
  onResolved,
  onVehicles,
}: Props) {
  const { strings, t } = useLocale();
  const viewLabelId = useId();

  const [line, setLine] = useState<Line | null>(null);
  const [variant, setVariant] = useState<LineVariantDetail | null>(null);
  const [timetable, setTimetable] = useState<VariantTimetable | null>(null);
  const [view, setView] = useState<View>('stops');
  const [date, setDate] = useState('');
  const [origin, setOrigin] = useState<number | null>(null);
  const [destination, setDestination] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /*
   * Held in a ref rather than a dependency. Telling the host about the variant
   * is a side effect on somebody else's state, and threading the callback
   * through the effect below would refetch every time the host re-rendered.
   */
  const resolved = useRef(onResolved);
  resolved.current = onResolved;

  const reportVehicles = useRef(onVehicles);
  reportVehicles.current = onVehicles;

  /* The line, and through it the variant. */
  useEffect(() => {
    const controller = new AbortController();

    // A different line is a different subject: nothing from the last one should
    // be on screen while this one loads.
    setLine(null);
    setVariant(null);
    setTimetable(null);
    setErrorMessage(null);
    setLoading(true);

    void getLine(lineId, { signal: controller.signal })
      .then(async (answer) => {
        if (controller.signal.aborted) return;
        setLine(answer);

        /*
         * A `patternId` is stable for the life of a dataset but not across a
         * pipeline re-run, so one that no longer belongs to this line falls
         * back to the busiest variant rather than erroring. The contract asks
         * for exactly this.
         */
        const wanted =
          patternId !== null &&
          answer.variants.some((candidate) => candidate.patternId === patternId)
            ? patternId
            : (answer.variants[0]?.patternId ?? null);

        if (wanted === null) {
          throw new Error('This line has no variants.');
        }

        const detail = await getLineVariant(lineId, wanted, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        setVariant(detail);
        resolved.current?.(detail);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setVariant(null);
        setErrorMessage(t(messageForApiError(error, strings)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId, patternId]);

  /*
   * The day the panel is actually asking about.
   *
   * Today on the stop list, whatever was picked on the timetable. Empty when
   * the stop list is showing and the line does not run today — which is a real
   * state with its own words rather than a reason to fall back to a day the
   * reader did not ask for.
   */
  const shownDate =
    view === 'stops'
      ? /*
         * A followed run pins the day to its own. Its trip id belongs to that
         * service day and to no other, so showing it against today would find
         * nothing — and the run is the subject, so the day follows it rather
         * than the other way round.
         */
        tripId !== null && tripDate !== null
        ? tripDate
        : networkToday !== null && variant?.serviceDates.includes(networkToday)
          ? networkToday
          : ''
      : date;

  /* The day. */
  useEffect(() => {
    if (variant === null || shownDate === '') return;

    const controller = new AbortController();

    void getVariantTimetable(variant.lineId, variant.patternId, shownDate, {
      signal: controller.signal,
    })
      .then((answer) => {
        if (controller.signal.aborted) return;
        setTimetable(answer);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setTimetable(null);
        setErrorMessage(t(messageForApiError(error, strings)));
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, shownDate]);

  /*
   * The day opens on today when this line runs then, and on the first day it
   * does otherwise. Read during render rather than in an effect: an effect
   * would paint one frame with no date and then correct it, and the correction
   * is not a synchronisation with anything — it is what the value *is* for this
   * variant.
   *
   * Reseeded whenever the variant changes, because a date that was valid for the
   * everyday service can be one a short working does not run at all.
   */
  const [lastDates, setLastDates] = useState<string[] | null>(null);
  if (variant !== null && variant.serviceDates !== lastDates) {
    setLastDates(variant.serviceDates);
    const covered =
      networkToday !== null && variant.serviceDates.includes(networkToday)
        ? networkToday
        : (variant.serviceDates[0] ?? '');
    if (covered !== date) {
      setDate(covered);
      // The day on screen belongs to the day that was asked for.
      setTimetable(null);
    }
  }

  /*
   * The pair of stops the timetable is between, kept valid as either end moves
   * and as the variant changes underneath them. One rule, applied on every
   * render rather than at each of the places a selection can change.
   */
  const pair = useMemo(
    () => reconcileSelection(variant?.stops ?? [], origin, destination),
    [variant, origin, destination],
  );

  /**
   * The clock, but only on a day a clock says anything about.
   *
   * A countdown against a Thursday three weeks out is nonsense, and "already
   * gone" against it is worse — it would dim the whole board. So `now` is
   * withheld by the *date* rather than by whether the zone has arrived: those
   * are different facts, and only one of them will resolve itself.
   */
  const clock = useNetworkNow(timezone, VEHICLE_TICK_MS);
  const now = shownDate !== '' && shownDate === networkToday ? clock : null;

  /*
   * The day's own span, and the day's own trips — but only once the answer on
   * screen is for the day being asked about. Between a tab switch and the
   * response, `timetable` still holds the *other* day, and a header reading
   * "runs 05:37 to 21:09 today" from Sunday's board is worse than a gap.
   */
  const dayTimetable =
    timetable !== null && timetable.date === shownDate ? timetable : null;
  const span = useMemo(
    () => (dayTimetable === null ? null : daySpan(dayTimetable.trips, dayTimetable.date)),
    [dayTimetable],
  );

  /**
   * The vehicles out on this pattern right now.
   *
   * Only on today. On any other day there are none to draw, and putting one
   * where it *would* be at this hour on a Sunday three weeks out is a claim
   * about a moment that is not happening.
   *
   * They are what explains something the stop list was already telling the
   * truth about and could not say: read down the line and the next departure
   * climbs and then drops, because the later stops are answered by a vehicle
   * already halfway along while the earlier ones are answered by the one behind
   * it. Two circles on the spine turn that from a glitch into the obvious
   * consequence of where they are.
   */
  /**
   * The run being followed, once the day it belongs to is in hand.
   *
   * Null when no trip is asked for, and also when one is asked for that the day
   * does not contain — a stale link, or a pattern id that moved under a data
   * refresh. Falling back to the whole line is the right answer to both: the
   * line is still there and still worth reading.
   */
  const focusTrip = useMemo(() => {
    if (tripId === null || dayTimetable === null) return null;
    return dayTimetable.trips.find((trip) => trip.tripId === tripId) ?? null;
  }, [tripId, dayTimetable]);

  const vehicles = useMemo(() => {
    if (dayTimetable === null || now === null) return [];
    const seconds = nowSeconds(now);
    if (seconds === null) return [];
    const out = activeVehicles(dayTimetable.trips, seconds);
    /*
     * Following one run, only that run's vehicle is drawn. The others are still
     * out there, but the page is answering a question about this one and a
     * second badge on the spine invites the reader to think it is theirs.
     */
    return focusTrip === null
      ? out
      : out.filter((vehicle) => vehicle.trip.tripId === focusTrip.tripId);
  }, [dayTimetable, now, focusTrip]);

  /*
   * Handed up in an effect rather than during render: it is somebody else's
   * state, and setting that while rendering is the one thing React will not
   * forgive. The ref keeps the host's own re-renders out of the dependencies.
   */
  useEffect(() => {
    reportVehicles.current?.(vehicles);
  }, [vehicles]);

  /** Where the flip goes, or null when this line only runs one way. */
  const flipTarget = useMemo(() => {
    if (line === null || variant === null || variant.directionId === null) return null;
    const opposite = variant.directionId === 0 ? 1 : 0;
    // `variants` arrives busiest-first, so the first match is the everyday
    // service in the other direction rather than a depot run.
    return line.variants.find((candidate) => candidate.directionId === opposite) ?? null;
  }, [line, variant]);

  return (
    <div className="flex flex-col gap-5 p-5">
      <button
        type="button"
        onClick={onBack}
        className="rounded-control text-content hover:bg-surface-muted focus-visible:outline-brand-500 -ms-2 flex cursor-pointer items-center gap-1.5 self-start px-2 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* Mirrors in RTL: it points the way back, which is a direction. */}
        <svg
          viewBox="0 0 20 20"
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
          <path d="M12 4l-6 6 6 6" />
        </svg>
        {backLabel}
      </button>

      {variant !== null && (
        <RouteHeader
          variant={variant}
          span={span}
          day={shownDate}
          networkToday={networkToday}
          onFlip={
            flipTarget === null ? null : () => onSelectVariant(flipTarget.patternId)
          }
        />
      )}

      {errorMessage !== null && (
        <p role="alert" className="rounded-card border-danger text-danger border px-4 py-3 text-sm">
          {errorMessage}
        </p>
      )}

      {variant === null && loading && (
        <p className="text-content-muted text-sm">{t(strings.routes.loadingLine)}</p>
      )}

      {variant !== null && (
        <>
          {line !== null && (
            <VariantPicker
              variants={line.variants}
              currentPatternId={variant.patternId}
              /*
                Judged against today rather than against a day picked in the
                timetable. "Running now" has to mean now, or the grouping
                changes under a reader who was only looking up a Sunday.
              */
              day={networkToday}
              onSelect={onSelectVariant}
            />
          )}

          {/*
            A radio group rather than two buttons: two answers to one question,
            exactly one true at a time, and the arrow keys move between them
            without any script of ours.
          */}
          <div role="radiogroup" aria-labelledby={viewLabelId} className="flex flex-col gap-2">
            <span id={viewLabelId} className="sr-only">
              {t(strings.routes.viewLabel)}
            </span>
            <div className="border-border-strong rounded-control flex w-full border p-0.5">
              {(['stops', 'timetable'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={view === option}
                  onClick={() => setView(option)}
                  className={`rounded-control focus-visible:outline-brand-500 flex-1 cursor-pointer px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    view === option
                      ? 'bg-brand-fill text-on-brand'
                      : 'text-content-muted hover:bg-surface-muted'
                  }`}
                >
                  {t(option === 'stops' ? strings.routes.stopsView : strings.routes.timetableView)}
                </button>
              ))}
            </div>
          </div>

          {/*
            The day, on the timetable only. The stop list is about today and has
            no day to choose; a picker sitting over both would offer to move it
            off the one day it is for.

            Its options are the variant's own service days rather than every
            date the feed covers — a control offering days this line does not
            run invites a choice that comes back empty.
          */}
          {view === 'timetable' && variant.serviceDates.length > 0 && (
            <DateSelect
              label={t(strings.routes.date)}
              value={date}
              onChange={setDate}
              options={variant.serviceDates}
              today={networkToday}
            />
          )}

          {/*
            Announced politely and deliberately narrow: it wraps a sentence that
            changes only when a day arrives, never the ticking list. A live
            region around the stops would re-announce forty rows twice a minute
            as the countdowns moved.
          */}
          <p aria-live="polite" aria-busy={dayTimetable === null} className="sr-only">
            {dayTimetable === null
              ? ''
              : t(strings.routes.dayAnnouncement, { count: dayTimetable.totalTrips })}
          </p>

          {view === 'stops' ? (
            <>
              {/*
                A run is a lens over the line, so it says so and offers the way
                out. Without this the page looks like the line itself with a
                strangely sparse set of times, and there is nothing to press to
                get back.
              */}
              {focusTrip !== null && (
                <div className="rounded-card border-brand-500 bg-brand-50 flex flex-wrap items-center gap-x-3 gap-y-2 border px-4 py-3">
                  <p className="text-brand-700 min-w-0 flex-1 text-sm font-medium">
                    {focusTrip.headsign === null
                      ? t(strings.routes.followingRun)
                      : t(strings.routes.followingRunTowards, {
                          destination: focusTrip.headsign,
                        })}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSelectTrip(null)}
                    className="rounded-control border-brand-500 text-brand-700 hover:bg-brand-100 focus-visible:outline-brand-500 flex-none cursor-pointer border px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {t(strings.routes.showWholeLine)}
                  </button>
                </div>
              )}

              {/*
                The line does not run today, so there is no "next" at any of its
                stops. Said once, at the top, rather than as the same phrase
                repeated down forty rows — and pointing at the tab that can
                answer for another day.
              */}
              {shownDate === '' && (
                <div className="rounded-card border-border bg-surface-muted flex flex-col gap-1 border px-4 py-5">
                  <p className="font-medium">{t(strings.routes.notRunningToday)}</p>
                  <p className="text-content-muted text-sm">
                    {t(strings.routes.notRunningTodayHint)}
                  </p>
                </div>
              )}

              {vehicles.length > 0 && (
                <p className="text-content-muted text-xs">
                  {t(strings.routes.scheduledPositions)}
                </p>
              )}

              <RouteStopList
                focusTrip={focusTrip}
                stops={variant.stops}
                routeType={variant.routeType}
                routeShortName={variant.routeShortName}
                /*
                  Null when there is no day to ask about — the list draws no
                  time either way rather than claiming nothing runs.

                  Following one run, `vehicles` above is already narrowed to
                  it, so the one badge on screen is the one being followed —
                  and pressing it again is the way out, back to the whole
                  route, rather than a press that does nothing.
                */
                onFollowTrip={
                  shownDate === ''
                    ? null
                    : focusTrip !== null
                      ? () => onSelectTrip(null)
                      : (trip) => onSelectTrip({ tripId: trip, date: shownDate })
                }
                trips={dayTimetable === null ? null : dayTimetable.trips}
                viewedDate={shownDate}
                now={now}
                vehicles={vehicles}
              />
            </>
          ) : (
            dayTimetable !== null && (
              <TripTable
                timetable={dayTimetable}
                origin={pair.origin}
                destination={pair.destination}
                onOriginChange={setOrigin}
                onDestinationChange={setDestination}
                now={now}
              />
            )
          )}
        </>
      )}
    </div>
  );
}
