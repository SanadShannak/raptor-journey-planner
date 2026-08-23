import { useEffect, useRef, useState } from 'react';
import { messageForApiError, nowInZone, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { getValidDates, planJourney } from '../api/journey';
import { getNetwork } from '../api/network';
import { checkHealth } from '../api/health';
import { boundsForNetwork, type GeoBounds } from '../config/geocoding';
import { DEFAULT_WALKING_PACE, WALKING_PACES } from '../config/journey';
import type { Journey } from '../types/journey';
import type { Place } from '../types/place';
import { JourneyForm } from '../features/journey/JourneyForm';
import {
  searchSignature,
  type JourneyFormValues,
} from '../features/journey/journeySearch';
import type { JourneyEnd } from '../features/journey/itineraryRows';
import { ItineraryOverview } from '../features/journey/ItineraryOverview';
import { ItineraryDetail } from '../features/journey/ItineraryDetail';

/** Whether the routing service is answering at all. */
type Service = 'checking' | 'up' | 'down';

/**
 * How long the searching state stays up, at the least.
 *
 * The engine holds the whole network in memory and usually answers in well
 * under a tenth of a second, which sounds like a good problem to have and is
 * not: the skeleton appears and vanishes inside a single frame or two, so what
 * a visitor sees is the sidebar flickering and a different set of results
 * already in place. Nothing marked the boundary between the old answer and the
 * new one, and a search that fast reads as a glitch rather than as an answer.
 *
 * Long enough to register as a state, short enough that nobody waits on it.
 * The hold runs *alongside* the request rather than after it, so a slow answer
 * is never made slower.
 */
const MINIMUM_SEARCH_MS = 750;

const hold = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The two ends as the traveller chose them, for the strip map's end nodes. */
function endOf(place: Place | null): JourneyEnd {
  return { name: place?.label ?? null, context: place?.context ?? null };
}

/**
 * The journey planner, and the site's front door.
 *
 * The search is not in the URL — see the state below for what that trades
 * away. `useRouteFocus` ignores search-param changes, which is what kept
 * submitting from yanking focus out of the form back when there were any.
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

  const [validDates, setValidDates] = useState<string[]>([]);
  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);
  const [service, setService] = useState<Service>('checking');

  /*
   * The search no longer lives in the URL.
   *
   * It used to, so a journey could be shared and reached with the back button
   * — and the cost was a query string of coordinates and labels on screen for
   * the whole session. That is the trade being made here, deliberately: no
   * shareable link, and no bookmark that reopens a search.
   *
   * One thing falls out of it. A stale `pace` in an old link used to outlive
   * the search that set it, so the form could open on a pace nobody had
   * chosen this time. The form now always opens on its own default.
   */
  const [values, setValues] = useState<JourneyFormValues>({
    origin: null,
    destination: null,
    date: '',
    time: '',
    pace: DEFAULT_WALKING_PACE,
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
      const pending = planJourney({
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

      /*
       * `allSettled` rather than a plain wait: it attaches a handler to the
       * request immediately, so a rejection arriving mid-hold is caught below
       * instead of surfacing as an unhandled rejection. The `await` after it
       * is what actually rethrows.
       */
      if (mode === 'replace') {
        await Promise.allSettled([pending, hold(MINIMUM_SEARCH_MS)]);
      }
      const result = await pending;

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
      /*
       * A failed search leaves nothing to show. The cards on screen answered
       * the previous question, and leaving them under an error message that
       * says the origin is outside the network invites reading them as the
       * answer to the new one. "Later" is the exception: it failed to *add* to
       * a list that is still perfectly good.
       */
      if (mode === 'replace') {
        setJourneys([]);
        setOpenIndex(null);
      }
    } finally {
      if (id === requestId.current) setExtending(false);
    }
  }

  /**
   * Drops everything on screen that belongs to a question no longer being
   * asked.
   *
   * The request id moves with it. An answer already in flight belongs to the
   * inputs as they were, and if the change leaves the form incomplete no new
   * search follows to invalidate it — so without this the old results would
   * arrive after the clear and quietly put themselves back.
   */
  function clearResults() {
    requestId.current += 1;
    setJourneys([]);
    setSearched(false);
    setOpenIndex(null);
    setExhausted(null);
    setErrorMessage(null);
    setState('idle');
  }

  /**
   * Every change to the form goes through here.
   *
   * Changing an input makes the results stale at the moment of the change, not
   * when the next answer arrives — and sometimes no answer follows at all,
   * because the change emptied a field. Clearing on the way in is what keeps
   * the sidebar from showing five itineraries beside an error saying the
   * origin is outside the network.
   */
  function updateValues(next: JourneyFormValues) {
    if (searchSignature(next) !== searchSignature(values)) clearResults();
    setValues(next);
  }

  /*
   * Run when the form is submitted, and only then. It needs no guard against
   * repeating itself: nothing calls it but a press, and a press is a request
   * to search — including the same search twice.
   */
  function runSearch() {
    /*
     * Cleared first, even when nothing changed. Pressing the button with the
     * same inputs is still a request, and answering it by leaving the old
     * cards in place — the engine returns in milliseconds — looked like the
     * press had missed. Clearing lets the searching state be seen.
     */
    clearResults();
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
          // Through `updateValues` like every other change to the form: this
          // moves the time, so whatever is on screen answered a different
          // question and goes with it.
          updateValues({
            ...values,
            // Today when the feed covers it; otherwise leave the date alone,
            // because jumping to a day nothing runs on is not "now".
            date: validDates.includes(now.date) ? now.date : values.date,
            time: now.time,
          });
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
    <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      {/*
        The height comes from the layout above rather than from
        `calc(100vh - 3.75rem)`. Subtracting a header this pane cannot see
        meant guessing at it: the guess was a little too tall, so the sidebar
        overflowed the viewport, its own scrollbar never engaged — the content
        fitted the box, the box just did not fit the screen — and "Later" sat
        below the fold with the page scrolling to reach it.

        Scrolling is confined to this pane only from `lg`, where the two-pane
        layout applies. On a phone the panes stack and the page scrolls.
      */}
      <div className="border-border flex w-full flex-none flex-col border-e lg:min-h-0 lg:w-[26rem] lg:overflow-y-auto xl:w-[30rem]">
        {/*
          One scrolling column, divided by a rule rather than by a second
          scroller.

          Giving the form its own scroll pane meant a dropdown opening inside
          it had to fit there: the pane grew a scrollbar, the scrollbar took
          width from the popover, and the popover narrowed as it opened. A
          menu that changes shape while you read it is worse than a sidebar
          you scroll, so the panes are back to being one, and the separation
          is drawn instead of enforced.
        */}
        {open !== null ? (
          <div className="flex flex-col gap-5 p-5">
            <ItineraryDetail
              journey={open}
              origin={endOf(values.origin)}
              destination={endOf(values.destination)}
              searchedDate={values.date}
              onBack={() => setOpenIndex(null)}
            />
          </div>
        ) : (
          <>
            {/* The question. A light rule under it marks where the answers
                begin, spanning the full width because the padding lives on
                the panes rather than on the sidebar. */}
            <div className="border-border flex flex-col gap-5 p-5 lg:border-b">
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
              onChange={updateValues}
              onSearch={runSearch}
              onLeaveNow={leaveNow}
              validDates={validDates}
              today={networkToday}
              bounds={bounds}
              disabled={offline}
            />
            </div>

            {/*
              Announced politely so a screen-reader user learns the search
              finished without focus being moved out from under them.
            */}
            <section
              aria-live="polite"
              aria-busy={state === 'searching'}
              className="flex flex-col gap-3 p-5"
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

              {state === 'searching' && journeys.length === 0 && <Searching />}

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
                      searchedDate={values.date}
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
 * The search, while it is running.
 *
 * A pulsing grey card was standing in for the answer, which is a shape that
 * only works when the wait is long enough to read and the thing arriving
 * really does look like the placeholder. Neither held here: the engine answers
 * in milliseconds, so the card flashed, and five results arrived where one
 * grey rectangle had been.
 *
 * Said outright instead. A ring turning in the brand colour, and a sentence
 * that names what is happening — which is also the only version of this that
 * works for someone who has turned motion off, since the text carries the
 * message and the ring is decoration.
 *
 * Hidden from assistive technology, which is told about the search by the live
 * region above rather than by a second, competing announcement.
 */
function Searching() {
  const { strings, t } = useLocale();

  return (
    <div
      aria-hidden="true"
      className="rounded-card border-border bg-surface-raised flex flex-col items-center gap-3 border px-4 py-8 motion-safe:animate-settle-in"
    >
      <span className="relative flex h-9 w-9 flex-none items-center justify-center">
        {/* The track, and the arc that runs around it. */}
        <span className="border-brand-100 absolute inset-0 rounded-full border-4" />
        <span className="border-brand-500 absolute inset-0 rounded-full border-4 border-e-transparent border-b-transparent border-s-transparent motion-safe:animate-spin" />
      </span>

      <span className="flex flex-col items-center gap-1 text-center">
        <span className="font-medium">{t(strings.planner.searching)}</span>
        <span className="text-content-muted text-sm text-balance">
          {t(strings.planner.searchingHint)}
        </span>
      </span>
    </div>
  );
}
