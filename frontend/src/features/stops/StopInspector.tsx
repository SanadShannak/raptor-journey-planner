import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getStopBoard, getStopTimetable } from '../../api/stops';
import { useBackendHealth } from '../../app/useBackendHealth';
import { DateSelect } from '../../components/DateSelect';
import { ScheduleEstimateNotice } from '../../components/ScheduleEstimateNotice';
import { messageForApiError, useLocale } from '../../i18n';
import type { StopBoard, StopIdentity, StopTimetable } from '../../types/stop';
import { DayTimetable } from './DayTimetable';
import { LineFilter } from './LineFilter';
import { StopHeader } from './StopHeader';
import { UpcomingBoard } from './UpcomingBoard';
import { useNetworkNow } from './useNetworkNow';

interface Props {
  stopId: string;
  /** The network's zone, for the countdowns. Null until `/api/network` answers. */
  timezone: string | null;
  /** Exactly the days the loaded timetable covers, ascending. */
  validDates: string[];
  /** Today on the network's clock, so the date picker's labels are honest. */
  networkToday: string | null;
  /**
   * Where "back" goes. Null on a page that *is* the stop, where there is
   * nothing behind it to return to.
   */
  onBack: (() => void) | null;
  /** What the back control says, since its target differs by host. */
  backLabel: string;
  /** Hands the stop to the host once it is known, so a map can frame it. */
  onResolved?: ((stop: StopIdentity) => void) | undefined;
}

/**
 * How often the live board is asked again.
 *
 * A minute, which is the resolution the times themselves have — asking more
 * often cannot produce a different answer. The countdowns move on their own
 * half-minute tick in between, so this refresh is only about *which* departures
 * are listed, not about keeping the numbers moving.
 */
const REFRESH_MS = 60_000;

type View = 'upcoming' | 'timetable';

/**
 * One stop, inspected.
 *
 * Read from two places and owned by neither: the planner renders it in the
 * sidebar when somebody presses a stop on the map, and `/stops/:stopId` renders
 * it as the page. The only thing that differs is where "back" goes, which is
 * why that arrives as a prop rather than being decided here.
 *
 * The two views are a real split rather than a tidy one. "What leaves next"
 * and "the whole of Thursday" are different questions asked by different
 * people — one is standing at the stop, the other is planning around it — and
 * answering both at once produces a list that is too long to scan and too
 * shallow to plan with.
 */
export function StopInspector({
  stopId,
  timezone,
  validDates,
  networkToday,
  onBack,
  backLabel,
  onResolved,
}: Props) {
  const { strings, t } = useLocale();
  const { service } = useBackendHealth();
  const now = useNetworkNow(timezone);
  const viewLabelId = useId();

  const [board, setBoard] = useState<StopBoard | null>(null);
  const [timetable, setTimetable] = useState<StopTimetable | null>(null);
  const [view, setView] = useState<View>('upcoming');
  const [date, setDate] = useState('');
  const [selectedLines, setSelectedLines] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /*
   * Held in a ref rather than a dependency. Telling the host about the stop is
   * a side effect on somebody else's state, and threading the callback through
   * the effect below would re-run the fetch every time the host re-rendered.
   */
  const resolved = useRef(onResolved);
  resolved.current = onResolved;

  /* The board. Refetched on a timer, and whenever the tab comes back. */
  const loadBoard = useCallback(
    async (signal: AbortSignal, { quiet }: { quiet: boolean }) => {
      if (!quiet) setLoading(true);
      try {
        const answer = await getStopBoard(stopId, { limit: 40, signal });
        if (signal.aborted) return;
        setBoard(answer);
        setErrorMessage(null);
        resolved.current?.(answer.stop);
      } catch (error) {
        if (signal.aborted) return;
        /*
         * A failed *refresh* leaves the board that is on screen alone. It was
         * true a minute ago, and replacing a readable board with an error
         * because one poll missed is worse than a slightly stale one.
         */
        if (!quiet) {
          setBoard(null);
          setErrorMessage(t(messageForApiError(error, strings)));
        }
      } finally {
        if (!signal.aborted && !quiet) setLoading(false);
      }
    },
    // `t` and `strings` are stable for a locale; the stop is what this is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopId],
  );

  useEffect(() => {
    const controller = new AbortController();

    // A different stop is a different subject: nothing from the last one
    // should be on screen while this one loads.
    setBoard(null);
    setTimetable(null);
    setSelectedLines(new Set());
    setErrorMessage(null);

    void loadBoard(controller.signal, { quiet: false });

    const timer = window.setInterval(() => {
      void loadBoard(controller.signal, { quiet: true });
    }, REFRESH_MS);

    const onVisibility = () => {
      if (!document.hidden) void loadBoard(controller.signal, { quiet: true });
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadBoard]);

  /* The day. Fetched only once somebody asks for it. */
  useEffect(() => {
    if (view !== 'timetable' || date === '') return;

    const controller = new AbortController();
    setLoading(true);

    void getStopTimetable(stopId, date, { signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return;
        setTimetable(answer);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setTimetable(null);
        setErrorMessage(t(messageForApiError(error, strings)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId, date, view]);

  /*
   * The day opens on today when the feed covers it, and on the first day it
   * does otherwise — the same rule the planner's form uses, so the timetable
   * never opens on a date the backend will answer as empty.
   */
  if (date === '' && validDates.length > 0) {
    const covered =
      networkToday !== null && validDates.includes(networkToday)
        ? networkToday
        : (validDates[0] ?? '');
    if (covered !== '') setDate(covered);
  }

  const stop = board?.stop ?? timetable?.stop ?? null;
  const servingLines = board?.servingLines ?? timetable?.servingLines ?? [];

  return (
    <div className="flex flex-col gap-5 p-5">
      {onBack !== null && (
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
      )}

      {stop !== null && <StopHeader stop={stop} servingLines={servingLines} />}

      {/*
        The backend being down is a fact the shared header already states —
        this only says that *this stop* has nothing to show while it is,
        rather than waiting out this request's own timeout to say so.
      */}
      {service === 'down' ? (
        <p
          role="alert"
          className="rounded-card border-danger text-danger border px-4 py-3 text-sm"
        >
          {t(strings.status.resultsUnavailable)}
        </p>
      ) : (
        errorMessage !== null && (
          <p
            role="alert"
            className="rounded-card border-danger text-danger border px-4 py-3 text-sm"
          >
            {errorMessage}
          </p>
        )
      )}

      {stop === null && loading && service !== 'down' && (
        <p className="text-content-muted text-sm">{t(strings.stops.loadingStop)}</p>
      )}

      {stop !== null && (
        <>
          {/*
            A radio group rather than two buttons: these are two answers to one
            question, exactly one of them is true at a time, and the arrow keys
            move between them without any script of ours.
          */}
          <div role="radiogroup" aria-labelledby={viewLabelId} className="flex flex-col gap-2">
            <span id={viewLabelId} className="sr-only">
              {t(strings.stops.viewLabel)}
            </span>
            <div className="border-border-strong rounded-control flex w-full border p-0.5">
              {(['upcoming', 'timetable'] as const).map((option) => (
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
                  {t(strings.stops[option])}
                </button>
              ))}
            </div>
          </div>

          {view === 'timetable' && validDates.length > 0 && (
            <DateSelect
              label={t(strings.stops.date)}
              value={date}
              onChange={setDate}
              options={validDates}
              today={networkToday}
            />
          )}

          <LineFilter
            lines={servingLines}
            selected={selectedLines}
            onChange={setSelectedLines}
          />

          {/*
            Announced politely, and deliberately narrow: it wraps a sentence
            that changes only when an answer arrives, never the ticking list.
            A live region around the board itself would re-announce every
            departure twice a minute as the countdowns moved.
          */}
          <p aria-live="polite" aria-busy={loading} className="sr-only">
            {loading
              ? t(strings.stops.loadingStop)
              : view === 'upcoming'
                ? board === null
                  ? ''
                  : t(strings.stops.boardAnnouncement, {
                      count: board.departures.length,
                    })
                : timetable === null
                  ? ''
                  : t(strings.stops.departureCount, {
                      count: timetable.totalDepartures,
                    })}
          </p>

          {view === 'upcoming'
            ? board !== null && (
                <UpcomingBoard board={board} now={now} selectedLines={selectedLines} />
              )
            : timetable !== null && (
                <DayTimetable timetable={timetable} selectedLines={selectedLines} />
              )}

          <ScheduleEstimateNotice />
        </>
      )}
    </div>
  );
}
