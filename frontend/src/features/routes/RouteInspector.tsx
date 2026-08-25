import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getLine, getLineVariant, getVariantTimetable } from '../../api/routes';
import { DateSelect } from '../../components/DateSelect';
import { messageForApiError, useLocale } from '../../i18n';
import type { Line, LineVariantDetail, VariantTimetable } from '../../types/route';
import { useNetworkNow } from '../stops/useNetworkNow';
import { RouteHeader } from './RouteHeader';
import { RouteStopList } from './RouteStopList';
import { TripTable } from './TripTable';
import { VariantPicker } from './VariantPicker';
import { reconcileSelection } from './stopSelection';

interface Props {
  lineId: string;
  /**
   * Which variant to show, from the URL, or null to take the line's own first
   * — which is its busiest, because `/api/routes/:lineId` orders them that way.
   */
  patternId: number | null;
  /** The network's zone, for the countdowns. Null until `/api/network` answers. */
  timezone: string | null;
  /** Today on the network's clock, so the date picker opens somewhere honest. */
  networkToday: string | null;
  /** Moves to another variant of the same line, by putting it in the URL. */
  onSelectVariant: (patternId: number) => void;
  onBack: () => void;
  backLabel: string;
  /** Hands the variant to the host once it is known, so the map can draw it. */
  onResolved?: ((variant: LineVariantDetail) => void) | undefined;
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
 * **One date for the whole panel, above both views.** The obvious placement is
 * inside the timetable, where a date control belongs; but the stop list needs a
 * day's times too, or it has nothing to say about when anything leaves. Holding
 * one date means one request instead of two, one thing to change, and it turns
 * the stop list into an answer to "where does this line call on a Sunday, and
 * when" rather than only to "what is next right now".
 *
 * Which is also why nothing polls here. A whole service day is in hand, so the
 * next departure at every stop is recomputed locally as the clock ticks. A
 * departure board refetches because it is a window onto now; this is not.
 */
export function RouteInspector({
  lineId,
  patternId,
  timezone,
  networkToday,
  onSelectVariant,
  onBack,
  backLabel,
  onResolved,
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

  /* The day. */
  useEffect(() => {
    if (variant === null || date === '') return;

    const controller = new AbortController();

    void getVariantTimetable(variant.lineId, variant.patternId, date, {
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
  }, [variant, date]);

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
  const clock = useNetworkNow(timezone);
  const now = date !== '' && date === networkToday ? clock : null;

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
            The day, above both views because both are read against it. Its
            options are the variant's own service days rather than every date
            the feed covers — a control offering days this line does not run
            invites a choice that comes back empty.
          */}
          {variant.serviceDates.length > 0 && (
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
          <p aria-live="polite" aria-busy={timetable === null} className="sr-only">
            {timetable === null
              ? ''
              : t(strings.routes.dayAnnouncement, { count: timetable.totalTrips })}
          </p>

          {view === 'stops' ? (
            <RouteStopList
              stops={variant.stops}
              routeType={variant.routeType}
              trips={timetable === null ? null : timetable.trips}
              viewedDate={date}
              now={now}
            />
          ) : (
            timetable !== null && (
              <TripTable
                timetable={timetable}
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
