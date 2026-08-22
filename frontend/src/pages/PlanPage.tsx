import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { messageForApiError, nowInZone, useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { SectionLinks } from '../components/SectionLinks';
import { usePageTitle } from '../app/usePageTitle';
import { getValidDates, planJourney } from '../api/journey';
import { getNetwork } from '../api/network';
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
import { Itinerary } from '../features/journey/Itinerary';

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
  };
}

/**
 * The journey planner, and the site's front door.
 *
 * The search lives in the URL so a journey can be shared, bookmarked, and
 * reached with the back button. `useRouteFocus` deliberately ignores
 * search-param changes, so submitting does not yank focus out of the form.
 */
export default function PlanPage() {
  const locale = useLocale();
  const { strings, t } = locale;
  usePageTitle(t(strings.pages.plan.title));

  const [searchParams, setSearchParams] = useSearchParams();
  const [validDates, setValidDates] = useState<string[]>([]);

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
  const [extending, setExtending] = useState<'earlier' | 'later' | null>(null);
  const [exhausted, setExhausted] = useState<string | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    /*
     * Both are needed before the form can be seeded: the network states which
     * clock "now" belongs to, and the valid dates say whether that day is even
     * covered. Requested together rather than in sequence — neither depends on
     * the other's answer.
     */
    Promise.allSettled([
      getNetwork({ signal: controller.signal }),
      getValidDates({ signal: controller.signal }),
    ]).then(([networkResult, datesResult]) => {
      if (controller.signal.aborted) return;

      const dates =
        datesResult.status === 'fulfilled' ? datesResult.value : [];
      setValidDates(dates);

      setValues((current) => {
        if (current.date !== '' && current.time !== '') return current;

        /*
         * "Now" on the network's clock, never the browser's — they differ for
         * part of every day, and the timetable belongs to the network.
         */
        const now =
          networkResult.status === 'fulfilled'
            ? nowInZone(networkResult.value.timezone)
            : null;

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
  }, []);

  async function search(
    from: JourneyFormValues,
    mode: 'replace' | 'earlier' | 'later',
  ) {
    if (from.origin === null || from.destination === null) return;

    const id = ++requestId.current;
    if (mode === 'replace') {
      setState('searching');
      setExhausted(null);
    } else {
      setExtending(mode);
    }

    try {
      const result = await planJourney({
        origin: { type: 'coordinate', lat: from.origin.lat, lon: from.origin.lon },
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
        setExhausted(
          mode === 'later'
            ? t(strings.planner.noLater)
            : t(strings.planner.noEarlier),
        );
      } else {
        /*
         * Appended, not replaced — the itinerary someone is reading stays put
         * while more arrive around it. Sorted so an earlier result lands above
         * rather than at the end of the list.
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
    } catch (error) {
      if (id !== requestId.current) return;
      setState('failed');
      setErrorMessage(t(messageForApiError(error, strings)));
    } finally {
      if (id === requestId.current) setExtending(null);
    }
  }

  function submit() {
    const next = new URLSearchParams();
    if (values.origin) next.set('from', encodePlace(values.origin));
    if (values.destination) next.set('to', encodePlace(values.destination));
    next.set('date', values.date);
    next.set('time', values.time);
    next.set('pace', values.pace);
    setSearchParams(next, { replace: true });
    void search(values, 'replace');
  }

  /** Shifts the query a minute past the edge of what is already shown. */
  function extend(direction: 'earlier' | 'later') {
    const edge =
      direction === 'later' ? journeys[journeys.length - 1] : journeys[0];
    if (!edge) return;

    const minutes = Number(edge.startTime.slice(0, 2)) * 60 +
      Number(edge.startTime.slice(3, 5)) +
      (direction === 'later' ? 1 : -30);

    const wrapped = ((minutes % 1440) + 1440) % 1440;
    const time = `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(
      wrapped % 60,
    ).padStart(2, '0')}`;

    void search({ ...values, date: edge.startDate, time }, direction);
  }

  const showEmpty = searched && state === 'idle' && journeys.length === 0;

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {t(strings.pages.plan.title)}
      </h1>

      <JourneyForm
        values={values}
        onChange={setValues}
        onSubmit={submit}
        validDates={validDates}
        busy={state === 'searching'}
      />

      {/*
        Announced politely so a screen-reader user learns the search finished
        without focus being moved out from under them.
      */}
      <section aria-live="polite" aria-busy={state === 'searching'} className="flex flex-col gap-4">
        <p className="sr-only">
          {state === 'searching'
            ? t(strings.planner.searching)
            : journeys.length > 0
              ? t(strings.planner.resultsFound, { count: journeys.length })
              : ''}
        </p>

        {state === 'failed' && errorMessage !== null && (
          <p className="rounded-card border-danger text-danger border px-4 py-3">
            {errorMessage}
          </p>
        )}

        {/*
          Nothing found is an empty state, not a failure: the search ran, and
          the honest answer is that nothing connects these places then.
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
            <ExtendButton
              direction="earlier"
              onClick={() => extend('earlier')}
              busy={extending === 'earlier'}
            />
            {journeys.map((journey, index) => (
              <Itinerary
                key={`${journey.startDate}-${journey.startTime}-${index}`}
                journey={journey}
              />
            ))}
            <ExtendButton
              direction="later"
              onClick={() => extend('later')}
              busy={extending === 'later'}
            />
            {exhausted !== null && (
              <p role="status" className="text-content-muted text-sm">
                {exhausted}
              </p>
            )}
          </>
        )}
      </section>

      <SectionLinks />
    </PageContainer>
  );
}

function ExtendButton({
  direction,
  onClick,
  busy,
}: {
  direction: 'earlier' | 'later';
  onClick: () => void;
  busy: boolean;
}) {
  const { strings, t } = useLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer self-center px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress disabled:opacity-70"
    >
      {busy
        ? t(strings.planner.searching)
        : t(direction === 'earlier' ? strings.planner.earlier : strings.planner.later)}
    </button>
  );
}
