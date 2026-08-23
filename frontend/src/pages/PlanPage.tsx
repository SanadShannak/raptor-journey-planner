import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { messageForApiError, nowInZone, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { getValidDates, planJourney } from '../api/journey';
import { getNetwork } from '../api/network';
import { checkHealth } from '../api/health';
import { boundsForNetwork, type GeoBounds } from '../config/geocoding';
import {
  DEFAULT_WALKING_PACE,
  WALKING_PACES,
  isWalkingPace,
} from '../config/journey';
import type { Journey } from '../types/journey';
import type { Place } from '../types/place';
import {
  JourneyForm,
  type JourneyFormValues,
} from '../features/journey/JourneyForm';
import { ItineraryOverview } from '../features/journey/ItineraryOverview';
import { ItineraryDetail } from '../features/journey/ItineraryDetail';

/** A place packed into a single search param: `lat,lon,label`. */
function encodePlace(place: Place): string {
  return `${place.lat},${place.lon},${place.label}`;
}

function decodePlace(raw: string | null, key: string): Place | null {
  if (raw === null) return null;
  const [lat, lon, ...rest] = raw.split(',');
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    key,
    lat: latitude,
    lon: longitude,
    label: rest.join(',') || `${latitude}, ${longitude}`,
    context: null,
    // A restored link cannot know whether it was a stop; nothing depends on it
    // beyond the icon, so claiming "place" is the honest default.
    kind: 'place',
    stopId: null,
    stopCode: null,
    platform: null,
    modes: null,
  };
}

/** Whether the routing service is answering at all. */
type Service = 'checking' | 'up' | 'down';

/**
 * The journey planner, and the site's front door.
 *
 * The search lives in the URL so a journey can be shared, bookmarked, and
 * reached with the back button. `useRouteFocus` deliberately ignores
 * search-param changes, so submitting does not yank focus out of the form.
 *
 * Results arrive as a list of overview cards; opening one replaces the
 * sidebar's contents with that journey in full. A sidebar this narrow cannot
 * show five itineraries stop by stop and still be read, and the alternative —
 * expanding a card in place — pushes the others off the screen and loses the
 * comparison the list exists for.
 */
export default function PlanPage() {
  const locale = useLocale();
  const { strings, t } = locale;
  usePageTitle(t(strings.pages.plan.title));

  const [searchParams, setSearchParams] = useSearchParams();
  const [validDates, setValidDates] = useState<string[]>([]);
  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);
  const [service, setService] = useState<Service>('checking');

  const [values, setValues] = useState<JourneyFormValues>(() => {
    const pace = searchParams.get('pace');
    return {
      origin: decodePlace(searchParams.get('from'), 'from'),
      destination: decodePlace(searchParams.get('to'), 'to'),
      date: searchParams.get('date') ?? '',
      time: searchParams.get('time') ?? '',
      pace: isWalkingPace(pace) ? pace : DEFAULT_WALKING_PACE,
    };
  });

  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [state, setState] = useState<'idle' | 'searching' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [extending, setExtending] = useState(false);
  const [exhausted, setExhausted] = useState<string | null>(null);
  /** Which result is open in full, by index; null while the list is showing. */
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const requestId = useRef(0);
  /** Bumped to re-run the startup effect when the visitor retries. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    /*
     * The probe answers first and cheaply: everything below it fails together
     * when the backend is down, and there is no point showing three separate
     * failures for one cause. It never rejects — "down" is an answer.
     */
    void checkHealth({ signal: controller.signal }).then((alive) => {
      if (controller.signal.aborted) return;
      setService(alive ? 'up' : 'down');
    });

    /*
     * Both are needed before the form can be seeded: the network states which
     * clock "now" belongs to, and the valid dates say whether that day is even
     * covered. Requested together rather than in sequence — neither depends on
     * the other's answer.
     */
    void Promise.allSettled([
      getNetwork({ signal: controller.signal }),
      getValidDates({ signal: controller.signal }),
    ]).then(([networkResult, datesResult]) => {
      if (controller.signal.aborted) return;

      const dates = datesResult.status === 'fulfilled' ? datesResult.value : [];
      setValidDates(dates);

      /*
       * "Now" on the network's clock, never the browser's — they differ for
       * part of every day, and the timetable belongs to the network.
       */
      const now =
        networkResult.status === 'fulfilled'
          ? nowInZone(networkResult.value.timezone)
          : null;

      // Resolved out here rather than inside the updater below: a state
      // updater must be pure, and one that returns early would skip these
      // entirely — which is exactly what happened when a shared link supplied
      // the date and the relative labels silently stopped appearing.
      if (now !== null) setNetworkToday(now.date);
      if (networkResult.status === 'fulfilled') {
        setTimezone(networkResult.value.timezone);
        setBounds(boundsForNetwork(networkResult.value.network));
      }

      setValues((current) => {
        if (current.date !== '' && current.time !== '') return current;

        // Today when the feed covers it; otherwise the first day it does, so
        // the form never opens on a date the engine will refuse.
        const covered =
          now !== null && dates.includes(now.date) ? now.date : (dates[0] ?? '');

        return {
          ...current,
          date: current.date === '' ? covered : current.date,
          time: current.time === '' ? (now?.time ?? '08:00') : current.time,
        };
      });
    });

    return () => controller.abort();
  }, [attempt]);

  async function search(from: JourneyFormValues, mode: 'replace' | 'later') {
    if (from.origin === null || from.destination === null) return;

    const id = ++requestId.current;
    if (mode === 'replace') {
      setState('searching');
      setExhausted(null);
      // A new search invalidates whichever result was open: index 2 of the old
      // list is a different journey in the new one.
      setOpenIndex(null);
    } else {
      setExtending(true);
    }

    try {
      const result = await planJourney({
        origin: {
          type: 'coordinate',
          lat: from.origin.lat,
          lon: from.origin.lon,
        },
        destination: {
          type: 'coordinate',
          lat: from.destination.lat,
          lon: from.destination.lon,
        },
        date: from.date,
        // The API takes seconds on input even though it returns HH:mm.
        time: `${from.time}:00`,
        walkingSpeedMps: WALKING_PACES[from.pace],
      });

      if (id !== requestId.current) return;

      if (mode === 'replace') {
        setJourneys(result);
        setSearched(true);
      } else if (result.length === 0) {
        setExhausted(t(strings.planner.noLater));
      } else {
        /*
         * Appended, not replaced — the itinerary someone is reading stays put
         * while more arrive around it.
         */
        setJourneys((current) =>
          [...current, ...result]
            .filter(
              (journey, index, all) =>
                all.findIndex(
                  (other) =>
                    other.startDate === journey.startDate &&
                    other.startTime === journey.startTime &&
                    other.endTime === journey.endTime,
                ) === index,
            )
            .sort((a, b) =>
              `${a.startDate}${a.startTime}`.localeCompare(
                `${b.startDate}${b.startTime}`,
              ),
            ),
        );
      }
      setState('idle');
      setErrorMessage(null);
      // A search that got through is proof the service is up, whatever an
      // earlier probe concluded.
      setService('up');
    } catch (error) {
      if (id !== requestId.current) return;
      setState('failed');
      setErrorMessage(t(messageForApiError(error, strings)));
    } finally {
      if (id === requestId.current) setExtending(false);
    }
  }

  /*
   * Deliberately not memoised. `JourneyForm` runs this from an effect that
   * depends on it, so a new identity each render does re-run that effect —
   * but the form already refuses to search the same inputs twice, and that
   * guard is what makes the search idempotent. Wrapping this in a callback
   * would mean either reading `values` impurely inside a state updater or
   * carrying a ref to shadow it, both of which trade a real bug for an
   * imagined saving.
   */
  function runSearch() {
    const next = new URLSearchParams();
    if (values.origin) next.set('from', encodePlace(values.origin));
    if (values.destination) next.set('to', encodePlace(values.destination));
    next.set('date', values.date);
    next.set('time', values.time);
    next.set('pace', values.pace);
    setSearchParams(next, { replace: true });
    void search(values, 'replace');
  }

  /** Shifts the query a minute past the last departure already shown. */
  function extendLater() {
    const edge = journeys[journeys.length - 1];
    if (!edge) return;

    const minutes =
      Number(edge.startTime.slice(0, 2)) * 60 +
      Number(edge.startTime.slice(3, 5)) +
      1;

    const wrapped = ((minutes % 1440) + 1440) % 1440;
    const time = `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(
      wrapped % 60,
    ).padStart(2, '0')}`;

    void search({ ...values, date: edge.startDate, time }, 'later');
  }

  /**
   * Sets both fields to the network's own clock.
   *
   * Null while the timezone is unknown, which removes the button rather than
   * showing one that would answer with the browser's city.
   */
  const leaveNow =
    timezone === null
      ? null
      : () => {
          const now = nowInZone(timezone);
          setValues((current) => ({
            ...current,
            // Today when the feed covers it; otherwise leave the date alone,
            // because jumping to a day nothing runs on is not "now".
            date: validDates.includes(now.date) ? now.date : current.date,
            time: now.time,
          }));
        };

  const offline = service === 'down';
  const showEmpty = searched && state === 'idle' && journeys.length === 0;
  const open = openIndex === null ? null : (journeys[openIndex] ?? null);

  return (
    /*
     * Sidebar and map, not a page of stacked sections.
     *
     * A journey is two things at once — a list of instructions and a shape on
     * the ground — and a rider reads both together. Side by side they stay in
     * view of each other; stacked, checking the map means losing your place in
     * the itinerary.
     *
     * The sidebar scrolls on its own so the map never leaves the screen. Below
     * `lg` that inverts: on a phone there is no room for two panes, so the
     * itinerary takes the width and the map sits above it at a fixed height.
     */
    <div className="lg:min-h-viewport flex flex-col lg:h-[calc(100vh-3.75rem)] lg:flex-row">
      <div className="border-border flex w-full flex-none flex-col gap-5 overflow-y-auto border-e p-5 lg:w-[26rem] xl:w-[30rem]">
        {open !== null ? (
          <ItineraryDetail
            journey={open}
            originLabel={values.origin?.label ?? null}
            destinationLabel={values.destination?.label ?? null}
            onBack={() => setOpenIndex(null)}
          />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {t(strings.pages.plan.title)}
              </h1>
            </div>

            {/*
              The service being down is stated once, at the top, and the form
              below it is turned off rather than left to fail on submit. Every
              other control on the page — theme, language, navigation — keeps
              working, because none of them needs the backend.
            */}
            {offline && (
              <div
                role="alert"
                className="rounded-card border-danger bg-surface-muted flex flex-col items-start gap-2 border px-4 py-3"
              >
                <p className="text-danger font-medium">
                  {t(strings.planner.serviceUnavailable)}
                </p>
                <p className="text-content-muted text-sm">
                  {t(strings.planner.serviceUnavailableHint)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setService('checking');
                    setAttempt((count) => count + 1);
                  }}
                  className="rounded-control border-border-strong text-content hover:bg-surface hover:border-brand-500 focus-visible:outline-brand-500 cursor-pointer px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {t(strings.planner.retryConnection)}
                </button>
              </div>
            )}

            <JourneyForm
              values={values}
              onChange={setValues}
              onSearch={runSearch}
              onLeaveNow={leaveNow}
              validDates={validDates}
              today={networkToday}
              bounds={bounds}
              disabled={offline}
            />

            {/*
              Announced politely so a screen-reader user learns the search
              finished without focus being moved out from under them.
            */}
            <section
              aria-live="polite"
              aria-busy={state === 'searching'}
              className="flex flex-col gap-3"
            >
              <p className="sr-only">
                {service === 'checking'
                  ? t(strings.planner.checkingService)
                  : state === 'searching'
                    ? t(strings.planner.searching)
                    : journeys.length > 0
                      ? t(strings.planner.resultsFound, {
                          count: journeys.length,
                        })
                      : ''}
              </p>

              {state === 'searching' && journeys.length === 0 && (
                <ItinerarySkeleton />
              )}

              {state === 'failed' && errorMessage !== null && (
                <p className="rounded-card border-danger text-danger border px-4 py-3 text-sm">
                  {errorMessage}
                </p>
              )}

              {/*
                Nothing found is an empty state, not a failure: the search ran,
                and the honest answer is that nothing connects these places
                then.
              */}
              {showEmpty && (
                <div className="rounded-card border-border bg-surface-muted flex flex-col gap-1 border px-4 py-5">
                  <p className="font-medium">{t(strings.planner.noJourney)}</p>
                  <p className="text-content-muted text-sm">
                    {t(strings.planner.noJourneyHint)}
                  </p>
                </div>
              )}

              {journeys.length > 0 && (
                <>
                  {journeys.map((journey, index) => (
                    <ItineraryOverview
                      key={`${journey.startDate}-${journey.startTime}-${index}`}
                      journey={journey}
                      onOpen={() => setOpenIndex(index)}
                    />
                  ))}

                  {/*
                    Only "later". Searching backwards asked the engine for a
                    departure *before* a time and took whatever it found, which
                    is not the same question — it answers "the best journey
                    leaving at or after X" and cannot be run in reverse, so the
                    results drifted rather than filling in.
                  */}
                  <button
                    type="button"
                    onClick={extendLater}
                    disabled={extending}
                    className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer self-center px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress disabled:opacity-70"
                  >
                    {extending
                      ? t(strings.planner.searching)
                      : t(strings.planner.later)}
                  </button>

                  {exhausted !== null && (
                    <p
                      role="status"
                      className="text-content-muted text-center text-sm"
                    >
                      {exhausted}
                    </p>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/*
        The map's place, held open so the layout is the real one before the map
        exists. Ordered first on a phone and second on a desktop.
      */}
      <div className="bg-surface-muted relative order-first h-56 flex-1 lg:order-none lg:h-auto">
        <div className="text-content-muted absolute inset-0 flex items-center justify-center text-sm">
          {t(strings.planner.mapComingSoon)}
        </div>
      </div>
    </div>
  );
}

/**
 * A placeholder shaped like the result it is waiting for.
 *
 * Sized to a typical overview card so the sidebar does not jump when the real
 * one arrives. Hidden from assistive technology, which is told about the
 * search by the live region instead.
 */
function ItinerarySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-card border-border bg-surface-raised flex flex-col gap-3 border p-4"
    >
      <div className="bg-surface-muted h-6 w-40 rounded motion-safe:animate-pulse" />
      <div className="bg-surface-muted h-5 w-3/4 rounded motion-safe:animate-pulse" />
      <div className="bg-surface-muted h-3 w-2/3 rounded motion-safe:animate-pulse" />
    </div>
  );
}
