import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { tripPath } from '../app/routes';
import { ScheduleEstimateNotice } from '../components/ScheduleEstimateNotice';
import { messageForApiError, nowInZone, useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { getValidDates, planJourney } from '../api/journey';
import { getNetwork } from '../api/network';
import { markServiceUp } from '../app/backendHealth';
import { useBackendHealth } from '../app/useBackendHealth';
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
import { fromSearchParams, toSearchParams } from '../features/journey/searchParams';
import {
  recallPlanner,
  rememberPlanner,
  type PlannerMemory,
} from '../features/journey/plannerMemory';
import { JourneyMap } from '../map/JourneyMap';
import { StopInspector } from '../features/stops/StopInspector';

/**
 * Whether two results are the same journey.
 *
 * There is no id on an itinerary, so it is identified by when it runs. Two
 * searches overlapping in time return the same departures, and appending them
 * blind would list a journey twice.
 */
function sameJourney(a: Journey, b: Journey): boolean {
  return (
    a.startDate === b.startDate &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime
  );
}

/** Existing results plus new ones, without duplicates and in departure order. */
function mergeJourneys(current: Journey[], added: Journey[]): Journey[] {
  return [...current, ...added]
    .filter(
      (journey, index, all) =>
        all.findIndex((other) => sameJourney(other, journey)) === index,
    )
    .sort((a, b) =>
      `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`),
    );
}

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
  const navigate = useNavigate();
  const { strings, t } = locale;
  /*
   * The tab is named for what it is, which is not what the heading says. A
   * heading invites — "Plan a journey" — and a tab is one of fifteen, read
   * sideways, three words wide.
   */
  usePageTitle(t(strings.pages.plan.documentTitle));

  const [validDates, setValidDates] = useState<string[]>([]);
  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const { service } = useBackendHealth();

  /*
   * The search lives in the URL again, and the reversal is worth recording
   * because the removal was deliberate.
   *
   * It was taken out because a query string of coordinates and labels sat on
   * screen for the whole session and bought only a shareable link nobody had
   * asked for. What changed is that this page now has somewhere to go: a leg of
   * an itinerary opens the run it is riding, and so does a drawn line on the
   * map. Coming back from either landed on an empty form with the journey
   * gone — and a back button that does not work costs far more than a long
   * address does.
   *
   * Written only when a search is *run*, never as the form is filled in. The
   * address is a record of a question that was asked, not a transcript of one
   * being typed.
   */
  const [searchP, setSearchParams] = useSearchParams();

  /**
   * What to open on: where you left off, or what the address asks for.
   *
   * The address wins only when it asks for a *different* search from the one
   * being held — a link somebody followed, or a reload. Coming back from a run,
   * or in through the nav bar, the two agree and what was left off is richer:
   * it has the answer, and which itinerary was open.
   *
   * Computed once. Later renders must not reconsider it, or typing in the form
   * would be undone by the address it was last written to.
   */
  const [seed] = useState<PlannerMemory>(() => {
    const asked = fromSearchParams(searchP, DEFAULT_WALKING_PACE);
    const held = recallPlanner();

    const blank: PlannerMemory = {
      values: {
        origin: null,
        destination: null,
        date: '',
        time: '',
        pace: DEFAULT_WALKING_PACE,
      },
      journeys: [],
      searched: false,
      openIndex: null,
      selectedIndex: null,
      inspectStopId: null,
      exhausted: null,
    };

    if (asked === null) return held ?? blank;
    if (held !== null && searchSignature(asked) === searchSignature(held.values)) {
      return held;
    }

    /*
     * A search this session has not seen — a link, or a reload. Its view comes
     * from the address too, which is the only place it can: there is no answer
     * yet and nothing held to take a view from.
     */
    const open = searchP.get('open');
    return {
      ...blank,
      values: asked,
      openIndex: open !== null && /^\d+$/.test(open) ? Number(open) : null,
      inspectStopId: searchP.get('stop'),
    };
  });

  const [values, setValues] = useState<JourneyFormValues>(seed.values);

  /*
   * A search restored from the address runs itself, once.
   *
   * Coming back to a planned journey and being shown the form that would find
   * it, unpressed, is most of the way to not having come back at all. Guarded
   * by a ref rather than by the results, because a search that legitimately
   * finds nothing must not be retried for ever.
   */
  const restored = useRef(false);

  const [journeys, setJourneys] = useState<Journey[]>(seed.journeys);

  /**
   * Opens or closes the detail panel, and records which in the address.
   *
   * `replace` throughout: opening a card is a change of view within one answer,
   * not a new question, and pushing would make the back button walk out through
   * every itinerary somebody glanced at before it left the page.
   */
  /**
   * Records which of the sidebar's three views is showing.
   *
   * `replace` throughout: changing view is a change within one answer, not a
   * new question, and pushing would make the back button walk out through every
   * itinerary and stop somebody glanced at before it left the page.
   */
  const rememberPanel = useCallback(
    (key: 'open' | 'stop', value: string | null) => {
      setSearchParams(
        (params) => {
          const copy = new URLSearchParams(params);
          if (value === null) copy.delete(key);
          else copy.set(key, value);
          return copy;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setOpenIndex = useCallback(
    (next: number | null) => {
      setOpenIndexState(next);
      rememberPanel('open', next === null ? null : String(next));
    },
    [rememberPanel],
  );

  const setInspectStopId = useCallback(
    (next: string | null) => {
      setInspectStopIdState(next);
      rememberPanel('stop', next);
    },
    [rememberPanel],
  );
  const [state, setState] = useState<'idle' | 'searching' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(seed.searched);
  const [extending, setExtending] = useState(false);
  const [exhausted, setExhausted] = useState<string | null>(seed.exhausted);
  /*
   * Which result is open in full, by index; null while the list is showing.
   *
   * Seeded from what was left off, and written to the address as well so a
   * shared or reloaded link opens the same view. An index rather than anything
   * richer because the list it indexes is restored alongside it.
   */
  const [openIndex, setOpenIndexState] = useState<number | null>(seed.openIndex);
  /**
   * Which card the traveller has actually chosen, as opposed to grazed.
   *
   * Pressing a card that is not this one makes it this one, and shows it on the
   * map. Pressing the one that already is opens it step by step. A journey is
   * worth looking at on a map before committing to reading it, and there was no
   * way to ask for that: pointing at a card showed it and moving away took it
   * straight back.
   */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(seed.selectedIndex);

  /*
   * A stop pressed on the map, opened in the sidebar rather than navigated to.
   *
   * `/stops/:stopId` renders the same panel and would be the obvious thing to
   * send somebody to — but the search on this page does not live in the URL, so
   * leaving would throw it away and the back button would return to an empty
   * form. Swapping the sidebar keeps the question intact behind the answer.
   */
  /*
   * The stop open in the sidebar, in the address for the same reason the open
   * itinerary is: a departure on that board opens the run it belongs to, which
   * leaves the page — and coming back to the itinerary you were not looking at
   * is coming back to the wrong place.
   */
  const [inspectStopId, setInspectStopIdState] = useState<string | null>(
    seed.inspectStopId,
  );

  const requestId = useRef(0);
  /** Bumped to re-run the startup effect when the service comes back. */
  const [attempt, setAttempt] = useState(0);

  /*
   * The network and the valid dates fail together with the health probe —
   * "everything below it fails together when the backend is down" is why
   * that comment used to sit right above a call to `checkHealth` here — so a
   * recovery is worth the same retry, even though the probe itself now lives
   * in the header rather than on this page. Adjusted during render rather
   * than in an effect, and only on the transition *out of* `'down'`: `service`
   * starts at `'checking'` on every ordinary load and resolves to `'up'`
   * within a few seconds of that, which is not a recovery and would otherwise
   * queue a second, redundant fetch behind the one already in flight.
   */
  const [lastService, setLastService] = useState(service);
  if (service !== lastService) {
    setLastService(service);
    if (service === 'up' && lastService === 'down') setAttempt((count) => count + 1);
  }

  useEffect(() => {
    const controller = new AbortController();

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
        setNetwork(networkResult.value.network);
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

    /*
     * The address records the question, so leaving the page and coming back
     * finds it still being asked.
     *
     * `replace`, not push: a search is an adjustment to the one question this
     * page exists to answer, and pushing would make the back button walk out
     * through every time and pace somebody tried on the way to the one they
     * wanted, instead of leaving the page.
     *
     * `mode: 'later'` deliberately does not write. Asking for more departures
     * shifts the time past the last result, which is a way of reading further
     * down one answer rather than a different question — and recording it would
     * mean returning to a search nobody typed.
     */
    if (mode === 'replace') {
      setSearchParams(toSearchParams(from), { replace: true });
    }

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
        /*
         * `journeys` as it was when this search was started, which is what the
         * new results have to be merged into. A second "Later" cannot overtake
         * the first: the request id below drops whichever answer is stale.
         */
        const before = journeys;
        const merged = mergeJourneys(before, result);
        setJourneys(merged);

        /*
         * The first of the new ones becomes the chosen one. Pressing "Later"
         * is a question about what comes after, so the answer is what should
         * be on the map — and leaving the border on the card above it said the
         * map and the list disagreed about which journey was being looked at.
         */
        const firstNew = merged.findIndex(
          (journey) => !before.some((earlier) => sameJourney(earlier, journey)),
        );
        if (firstNew >= 0) setSelectedIndex(firstNew);
      }
      setState('idle');
      setErrorMessage(null);
      // A search that got through is proof the service is up, whatever an
      // earlier probe concluded.
      markServiceUp();
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

  /*
   * Everything worth coming back to, held for as long as the tab lives.
   *
   * Written on every change rather than on the way out: there is no "way out"
   * to hook — a nav link unmounts this page without warning, and a leg of an
   * itinerary is an ordinary link.
   */
  useEffect(() => {
    rememberPlanner({
      values,
      journeys,
      searched,
      openIndex,
      selectedIndex,
      inspectStopId,
      exhausted,
    });
  }, [values, journeys, searched, openIndex, selectedIndex, inspectStopId, exhausted]);

  /*
   * Runs a search the address already carries.
   *
   * Held until the service check has answered, so a restored search does not
   * race the probe that gates the form — and once only, so an honest empty
   * answer is not retried for ever.
   */
  useEffect(() => {
    if (restored.current) return;
    if (service !== 'up') return;
    if (values.origin === null || values.destination === null) return;

    restored.current = true;

    /*
     * Already answered — this is what was left off, not a link being opened —
     * so there is nothing to ask. Asking anyway would blink the results out and
     * fetch the same ones back.
     */
    if (searched) return;

    /*
     * A search starts by closing whatever was open, because index 2 of the old
     * list is a different journey in the new one. That is right for a search
     * somebody asks for and wrong for this one: the address named both the
     * question *and* the view, so the view is put back once the answer lands.
     */
    void search(values, 'replace').then(() => {
      if (seed.openIndex !== null) setOpenIndex(seed.openIndex);
      if (seed.inspectStopId !== null) setInspectStopId(seed.inspectStopId);
    });
    // Deliberately not depending on `values`: this fires for what arrived in
    // the URL, and every later change is somebody typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

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
    /*
     * An index into a list that is about to be replaced, so it would otherwise
     * point at whichever journey happened to land in that slot next — the same
     * reason `openIndex` is cleared here.
     */
    setSelectedIndex(null);
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

  /*
   * The open result, else the chosen one, else the first — so the map is never
   * blank while there is something to show, and the journey it falls back to is
   * the soonest departure, which is the one most people take.
   *
   * The pointer used to outrank both, on the reasoning that a graze is a
   * question worth answering. In practice it meant the map changed under you
   * whenever you moved across the list on the way to something else, and a
   * journey you had chosen could not be looked at while you read the card
   * above it. Choosing is the only thing that moves the map now.
   */
  const active = selectedIndex ?? 0;
  const shown =
    openIndex !== null ? (journeys[openIndex] ?? null) : (journeys[active] ?? null);

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
        {inspectStopId !== null ? (
          /*
            A stop, opened from the map. It sits ahead of the itinerary in this
            chain because it was asked for later: pressing a stop while reading
            a journey is a question about that stop, and answering it must not
            close the journey underneath.
          */
          <StopInspector
            stopId={inspectStopId}
            timezone={timezone}
            validDates={validDates}
            networkToday={networkToday}
            onBack={() => setInspectStopId(null)}
            /* Back goes to whatever was showing underneath, which is the
               open itinerary when there is one and the list otherwise. */
            backLabel={t(
              open !== null ? strings.stops.backToJourney : strings.stops.backToResults,
            )}
          />
        ) : open !== null ? (
          <div className="flex flex-col gap-5 p-5">
            <ItineraryDetail
              journey={open}
              origin={endOf(values.origin)}
              destination={endOf(values.destination)}
              searchedDate={values.date}
              onBack={() => setOpenIndex(null)}
              /*
                Pressing a stop while reading a journey is a question about
                that stop, not a decision to abandon the journey — so it swaps
                the panel and leaves `openIndex` alone. Back returns to the
                itinerary, which is what the inspector's own label says.
              */
              onInspectStop={setInspectStopId}
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
              The service being down is stated once, in the header every page
              shares — this used to be said again here, but a visitor already
              seeing it above the form does not need it repeated below the
              same fold. What still belongs to this page is the one thing the
              header cannot say: the form itself is off rather than left to
              fail on submit, and everything else on this page — theme,
              language, navigation — keeps working regardless.
            */}
            {offline && (
              <p className="text-content-muted text-sm">
                {t(strings.planner.serviceUnavailableHint)}
              </p>
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
                      selected={index === active}
                      onOpen={() =>
                        index === active
                          ? setOpenIndex(index)
                          : setSelectedIndex(index)
                      }
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

                  <ScheduleEstimateNotice />
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/*
        The map. Ordered first on a phone and second on a desktop.

        Labelled as a region and nothing more: every stop, time and change it
        draws is already written out in the itinerary beside it, so it is an
        enhancement over that list rather than a second place to have to look.
      */}
      <section
        aria-label={t(strings.planner.mapLabel)}
        className="bg-surface-muted relative isolate order-first h-half-viewport shrink-0 lg:order-none lg:h-auto lg:flex-1"
        /*
          `flex-1` on this element clobbered its own fixed height on the narrow
          layout: Tailwind's flex-1 sets `flex-basis: 0%`, and on mobile the
          containing column has no defined height for it to grow into, so
          the section collapsed to nothing — the map was never drawn, not
          merely small. `shrink-0` gives the explicit height back its say;
          `lg:flex-1` restores the grow behaviour once the desktop layout
          pins the page and there is real space to fill.

          `isolate` boxes in Leaflet's own stacking order. Its panes carry
          z-index up to 1000 so controls sit over tiles sit over the map's own
          background, but `.leaflet-container` never claims a z-index of its
          own to hold that ordering inside — so without this, those numbers
          compete directly with whatever the rest of the page uses, and a
          value meant to beat a marker beats the mobile navigation panel too.
          `isolation: isolate` gives the map its own stacking context, so
          nothing inside it can out-rank an element sitting outside it.
        */
      >
        <JourneyMap
          journey={shown}
          network={network}
          area={bounds}
          timezone={timezone}
          /*
            Straight into the form, through the same path a typed place takes —
            so it clears the results, runs the same guard, and the field shows
            what was chosen. Pressing the map is another way to fill the form
            in, not a second way to plan a journey.
          */
          onPick={(place, end) => updateValues({ ...values, [end]: place })}
          /*
            A drawn line opens the run it belongs to.

            The one navigation this map makes, and it costs the search — which
            does not live in the URL, so leaving the page loses it. The same run
            is a real link in the itinerary beside this, where it can be
            middle-clicked to keep both; here there is no way to offer that, and
            the alternative is a line you can see and cannot ask about.
          */
          onSelectLeg={(leg) =>
            void navigate(tripPath(leg.lineId, leg.patternId, leg.tripId, leg.startDate), {
              // The run's page can then offer the way back here, rather than
              // only the line index nobody arrived from.
              state: { back: `${window.location.pathname}${window.location.search}` },
            })
          }
          /*
            A better name for the same coordinates. It goes in directly rather
            than through `updateValues`, because the search has not changed —
            the query is built from the position, and running it through the
            change path would throw away results over a word.
          */
          onRename={(place, end) =>
            setValues((current) =>
              current[end]?.key === place.key ? { ...current, [end]: place } : current,
            )
          }
          onStopSelect={setInspectStopId}
          selectedStopId={inspectStopId}
        />
      </section>
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
