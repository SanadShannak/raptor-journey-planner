import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useLocale } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { paths, stopPath } from '../app/routes';
import { useGoBack } from '../app/useBackStack';
import { backLabel } from '../app/backLabel';
import { getValidDates } from '../api/journey';
import { getNetwork } from '../api/network';
import { nowInZone } from '../i18n';
import { boundsForNetwork, type GeoBounds } from '../config/geocoding';
import type { NetworkStop, StopIdentity } from '../types/stop';
import { StopInspector } from '../features/stops/StopInspector';
import { StopsMap } from '../map/StopsMap';
import { askFor, HOME_VIEW, type ViewRequest } from '../map/viewRequest';
import { ModeIcon } from '../features/journey/modeIcons';
import { modeVisual } from '../features/journey/modeVisuals';
import { modeLabel } from '../i18n';
import type { GtfsRouteType } from '../types/journey';
import { NearbyStopsButton, type At } from '../features/stops/NearbyStopsButton';
import { passesModeFilter } from '../features/stops/stopFilter';
import { toggleSelection } from '../features/stops/toggleSelection';

/**
 * Stops, browsed and inspected.
 *
 * Two panes like the planner, and for the same reason: a stop is a place and a
 * timetable at once, and reading one while looking at the other is the whole
 * task. The sidebar is wider than the planner's — an hour of departures is
 * denser than an itinerary card, and a line number, a destination, a time and a
 * countdown do not fit across 26rem without wrapping.
 *
 * Without a `:stopId` the sidebar is the list of stops the map is currently
 * showing. That list is not decoration: the markers are out of the tab order,
 * so it is the keyboard's way in, and it is the reason they can stay out.
 */
export default function StopsPage() {
  const { locale, strings, t } = useLocale();
  const { stopId } = useParams<{ stopId: string }>();
  const navigate = useNavigate();

  /*
   * The same stack the lines page walks. A stop reached from a run, from a
   * journey, or from three of each in turn steps back the way it came; the
   * index is only for a stop opened cold.
   */
  const back = useGoBack(paths.stops);

  /**
   * The address this entry came from, for naming the way back.
   *
   * Read defensively and only ever as an in-app path: history state is session
   * data rather than user input, but it is still the sort of value that should
   * not be able to become an outbound link.
   */
  const at = useLocation();
  const state = at.state as { back?: unknown } | null;
  const cameFrom =
    typeof state?.back === 'string' && state.back.startsWith('/') ? state.back : null;

  const [validDates, setValidDates] = useState<string[]>([]);
  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);

  /** The stop the inspector resolved, which is what the map frames. */
  const [focused, setFocused] = useState<StopIdentity | null>(null);
  const [visible, setVisible] = useState<NetworkStop[]>([]);
  const [belowZoom, setBelowZoom] = useState(false);

  /**
   * The modes chosen, and every mode this network runs.
   *
   * A selection with **empty meaning all**, the same as the line filter inside
   * a stop — so a press does the same thing in both: from the resting state it
   * narrows to what was pressed, and choosing every one of them is the resting
   * state again.
   */
  const [modes, setModes] = useState<ReadonlySet<GtfsRouteType>>(new Set());
  const [networkModes, setNetworkModes] = useState<GtfsRouteType[]>([]);
  /** Where the visitor last asked the map to look. Starts on the city. */
  const [view, setView] = useState<ViewRequest>(HOME_VIEW);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  const goToLocation = useCallback((at: At) => {
    setView((previous) => askFor(previous, { kind: 'at', lat: at.lat, lon: at.lon }));
    setLocationMessage(null);
  }, []);

  /*
   * Back to the city, from wherever the map has ended up. The counterpart to
   * "near me", and the reason it exists: a page that had moved to the
   * visitor's position had no way back to the view it opens on.
   */
  const goHome = useCallback(() => {
    setView((previous) => askFor(previous, { kind: 'home' }));
  }, []);

  /*
   * Named as a stop, and with the code printed on the pole where there is one —
   * a tab reading "Pasila" is one of six a visitor may have open.
   */
  usePageTitle(
    focused === null
      ? t(strings.pages.stops.documentTitle)
      : focused.code === null
        ? t(strings.stops.documentTitle, { name: focused.name })
        : t(strings.stops.documentTitleWithCode, {
            name: focused.name,
            code: focused.code,
          }),
  );

  useEffect(() => {
    const controller = new AbortController();

    /*
     * The same pair the planner needs, for the same reasons: the network states
     * which clock a countdown is measured against, and the valid dates say
     * which days a timetable can be asked for. Neither depends on the other.
     */
    void Promise.allSettled([
      getNetwork({ signal: controller.signal }),
      getValidDates({ signal: controller.signal }),
    ]).then(([networkResult, datesResult]) => {
      if (controller.signal.aborted) return;

      if (datesResult.status === 'fulfilled') setValidDates(datesResult.value);
      if (networkResult.status === 'fulfilled') {
        setTimezone(networkResult.value.timezone);
        setNetwork(networkResult.value.network);
        setBounds(boundsForNetwork(networkResult.value.network));
        setNetworkToday(nowInZone(networkResult.value.timezone).date);
        // Every mode this network runs, so the filter offers a set that does
        // not move as the map does. It rides along with the timezone rather
        // than costing a request of its own.
        setNetworkModes(networkResult.value.modes);
      }
    });

    return () => controller.abort();
  }, []);

  /*
   * The resolved stop belongs to the id in the URL, so it is dropped the moment
   * that changes — otherwise the map holds the last stop's position while the
   * next one loads, which reads as the marker jumping somewhere wrong and back.
   *
   * Adjusted during render rather than in an effect: an effect would paint that
   * wrong frame first and then correct it, which is the exact thing being
   * avoided. Same shape as `PrimaryNav` closing itself on a navigation.
   */
  const [lastStopId, setLastStopId] = useState(stopId);
  if (stopId !== lastStopId) {
    setLastStopId(stopId);
    setFocused(null);
  }

  const openStop = useCallback(
    (id: string) => {
      // The return address every other stop link carries, so a stop reached
      // from the index or from the map can name the way back rather than
      // falling through to the bare word.
      void navigate(stopPath(id), {
        state: { back: `${at.pathname}${at.search}` },
      });
    },
    [navigate, at.pathname, at.search],
  );

  const onVisibleStopsChange = useCallback((stops: NetworkStop[]) => {
    setVisible(stops);
  }, []);

  /*
   * One predicate, used twice: the map draws what survives it and the list
   * shows the same set. Filtering only the sidebar would leave markers on the
   * map for stops the list had just hidden.
   *
   * Memoised because the map holds it as an effect dependency — a fresh
   * function each render would re-thin every marker on every keystroke.
   */
  const matches = useCallback(
    (stop: NetworkStop) => passesModeFilter(stop, modes),
    [modes],
  );

  const shown = useMemo(
    () =>
      visible
        .filter(matches)
        .sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true })),
    [visible, matches, locale],
  );

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      <div className="border-border flex w-full flex-none flex-col border-e lg:min-h-0 lg:w-[30rem] lg:overflow-y-auto xl:w-[34rem]">
        {stopId === undefined ? (
          <StopBrowser
            stops={shown}
            totalInView={visible.length}
            availableModes={networkModes}
            belowZoom={belowZoom}
            modes={modes}
            onModesChange={setModes}
            onOpen={openStop}
            onLocated={goToLocation}
            onHome={goHome}
            locationMessage={locationMessage}
            onLocationMessage={setLocationMessage}
          />
        ) : (
          <StopInspector
            stopId={stopId}
            timezone={timezone}
            validDates={validDates}
            networkToday={networkToday}
            onBack={back.go}
            backLabel={t(
              back.stepping ? backLabel(cameFrom, strings) : strings.stops.backToStops,
            )}
            onResolved={setFocused}
          />
        )}
      </div>

      <section
        aria-label={t(strings.planner.mapLabel)}
        className="bg-surface-muted relative order-first h-56 shrink-0 lg:order-none lg:h-auto lg:flex-1"
        /*
          `flex-1` on this element clobbered its own `h-56` on the narrow
          layout: Tailwind's flex-1 sets `flex-basis: 0%`, and on mobile the
          containing column has no defined height for it to grow into, so
          the section collapsed to nothing — the map was never drawn, not
          merely small. `shrink-0` gives the explicit height back its say;
          `lg:flex-1` restores the grow behaviour once the desktop layout
          pins the page and there is real space to fill.
        */
      >
        <StopsMap
          network={network}
          area={bounds}
          focused={focused}
          onStopSelect={openStop}
          /*
            A stop is wanted but has not loaded. Without this the map cannot
            tell that from the index, and takes the chance to go home.
          */
          pending={stopId !== undefined && focused === null}
          filter={matches}
          onVisibleStopsChange={onVisibleStopsChange}
          onBelowZoomChange={setBelowZoom}
          view={view}
        />
      </section>
    </div>
  );
}

/**
 * The stops the map is showing, as a list you can reach without a pointer.
 *
 * Three states rather than two. "Nothing here" and "you are too far out to be
 * shown anything" look identical on the map — both are an empty layer — and
 * only one of them is fixed by moving closer, so they are never worded the
 * same. A third is the reader's own doing: filters that match nothing.
 *
 * The search is over the stops already fetched for this view, not the network.
 * `/api/stops` answers by bounding box and there is no search-by-name endpoint
 * to ask, so the field says what it searches rather than implying the whole
 * city is in scope.
 */
function StopBrowser({
  stops,
  totalInView,
  availableModes,
  belowZoom,
  modes,
  onModesChange,
  onOpen,
  onLocated,
  onHome,
  locationMessage,
  onLocationMessage,
}: {
  stops: NetworkStop[];
  totalInView: number;
  availableModes: GtfsRouteType[];
  belowZoom: boolean;
  modes: ReadonlySet<GtfsRouteType>;
  onModesChange: (modes: ReadonlySet<GtfsRouteType>) => void;
  onOpen: (stopId: string) => void;
  onLocated: (at: At) => void;
  onHome: () => void;
  locationMessage: string | null;
  onLocationMessage: (message: string | null) => void;
}) {
  const { strings, t } = useLocale();

  const toggleMode = (mode: GtfsRouteType) =>
    onModesChange(toggleSelection(modes, mode, availableModes));

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {t(strings.pages.stops.title)}
        </h1>
        <p className="text-content-muted text-sm">
          {belowZoom ? t(strings.stops.zoomInForStops) : t(strings.stops.browseHint)}
        </p>
      </div>

      {/*
        The two places the map can be sent. Both are always offered: "near me"
        is only a resting place until you pan away from it, and the way back
        has to exist regardless.
      */}
      <div className="flex flex-wrap gap-2">
        <NearbyStopsButton onLocated={onLocated} onMessage={onLocationMessage} />

        <button
          type="button"
          onClick={onHome}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex flex-none cursor-pointer items-center gap-1.5 border px-2.5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {/* A skyline: the city, as opposed to wherever you happen to be. */}
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 20.5h19" />
            <path d="M6 20.5V9.5l5-3v14" />
            <path d="M11 20.5v-9l6.5 3v6" />
          </svg>
          {t(strings.stops.cityCentre)}
        </button>
      </div>

      {locationMessage !== null && (
        <p role="status" className="text-danger text-xs">
          {locationMessage}
        </p>
      )}

      {/*
        Every mode the network runs, always — not the ones that happen to be in
        view. A control whose options appear and vanish as the map pans is one
        you cannot learn, and a mode you had ticked could silently stop being
        offered.
      */}
      {availableModes.length > 1 && (
        <fieldset>
          <legend className="text-content-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            {t(strings.stops.filterByMode)}
          </legend>

          <div className="flex flex-wrap gap-1.5">
            {availableModes.map((mode) => {
              const on = modes.size === 0 || modes.has(mode);

              return (
                /*
                  Every mode starts coloured, because at rest this row is the
                  map's legend — each badge wears the colour its markers wear.
                  Switching one off drains the colour out of it, which is the
                  same thing happening to the map beside it.

                  The state survives without colour too: a filled chip against
                  an outlined one differs in fill and border, not only in hue,
                  so it reads in greyscale and to a colour-blind eye. The
                  checkbox underneath carries it for anything not looking at
                  all.
                */
                <label
                  key={mode}
                  className={`rounded-control focus-within:outline-brand-500 flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-sm font-medium transition-colors focus-within:outline-2 focus-within:outline-offset-2 ${
                    on
                      ? `${modeVisual(mode).fill} text-on-mode border-transparent`
                      : 'border-border-strong text-content-muted hover:bg-surface-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMode(mode)}
                    className="sr-only"
                  />
                  <ModeIcon routeType={mode} size={16} />
                  {/* The name beside the silhouette: mode is never carried by
                      shape or colour alone. */}
                  {modeLabel(mode, strings)}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <p aria-live="polite" className="text-content-muted text-xs">
        {belowZoom
          ? t(strings.stops.zoomInForStops)
          : t(strings.stops.visibleStops, { count: stops.length })}
      </p>

      {!belowZoom && totalInView === 0 && (
        <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
          {t(strings.stops.noStopsHere)}
        </p>
      )}

      {/* Their own filters emptied it, which is a different fact from an empty
          corner of the map — and the fix is theirs rather than the map's. */}
      {!belowZoom && totalInView > 0 && stops.length === 0 && (
        <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
          {t(strings.stops.noMatchingStops)}
        </p>
      )}

      <ul className="flex flex-col">
        {stops.map((stop) => (
          <li key={stop.id}>
            <button
              type="button"
              onClick={() => onOpen(stop.id)}
              /*
                Pulled out into the sidebar's own padding and rounded, so the
                hover reads as a row rather than as a box drawn tightly around
                the icons at one end and the code at the other.
              */
              className="border-border hover:bg-surface-muted focus-visible:outline-brand-500 rounded-control -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 border-b px-2 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {/*
                The modes, as the same silhouettes the marker wears — so a stop
                found in the list and the same stop found on the map read as one
                thing. A stop nothing serves shows none, rather than a guess.
              */}
              <span className="flex flex-none gap-1">
                {stop.modes.map((mode) => (
                  <span key={mode} className={modeVisual(mode).ink}>
                    <ModeIcon routeType={mode} size={16} />
                  </span>
                ))}
              </span>

              {/*
                Sized to the name rather than filling the row.
                
                Stretched, `dir="auto"` made the *box* left-to-right for a
                Latin name, so the name sat at the far left of it — against the
                code — while its icons stayed at the right of an Arabic page,
                with the width of the sidebar in between. Sized to its own text
                it sits beside the icons whichever way the page runs, and the
                code is pushed to the far end by its own margin instead.
              */}
              <span dir="auto" className="min-w-0 truncate font-medium">
                {stop.name}
              </span>

              {stop.code !== null && (
                <span className="text-content-muted ms-auto flex-none text-xs tabular-nums">
                  {stop.code}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {modes.size > 0 && stops.length > 0 && (
        <button
          type="button"
          onClick={() => onModesChange(new Set())}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer self-start px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.stops.showAllModes)}
        </button>
      )}
    </div>
  );
}
