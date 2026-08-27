import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useGoBack } from '../app/useBackStack';
import { backLabel } from '../app/backLabel';
import { useLocale, nowInZone } from '../i18n';
import { usePageTitle } from '../app/usePageTitle';
import { linePath, lineVariantPath, paths, stopPath, tripPath } from '../app/routes';
import { getNetwork } from '../api/network';
import { boundsForNetwork, type GeoBounds } from '../config/geocoding';
import type { GtfsRouteType } from '../types/journey';
import type { LineVariantDetail } from '../types/route';
import type { Vehicle } from '../features/routes/vehicleProgress';
import { LineBrowser } from '../features/routes/LineBrowser';
import { RouteInspector } from '../features/routes/RouteInspector';
import { RouteMap } from '../map/RouteMap';

/**
 * Routes, browsed and inspected.
 *
 * Two panes, like the planner and the stops page, and for the same reason: a
 * line is a shape on the ground and a timetable at once, and reading one while
 * looking at the other is the whole task.
 *
 * Without a `:lineId` the sidebar is the index. That is not decoration — a line
 * is otherwise reachable only by pressing a designation on some stop's board,
 * which means you can only find a line if you already know a stop it calls at.
 *
 * The variant lives in a **search param** rather than a path segment. Two
 * reasons: the busiest variant is the right default so the param is usually
 * absent, and a `patternId` is not stable across a pipeline re-run — a stale one
 * should be a link that lands on the line rather than a path that 404s.
 */
export default function RoutesPage() {
  const { strings, t } = useLocale();
  const { lineId } = useParams<{ lineId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const here = useLocation();

  /**
   * Where "back" goes, when somebody arrived from somewhere with an opinion.
   *
   * The planner sets it, because a reader who pressed a leg of their own
   * itinerary did not come from the line index and should not be sent there.
   * Read defensively and only ever used as an in-app path: history state is
   * session data rather than user input, but it is still the sort of value that
   * should not be able to become an outbound link.
   */
  const cameFrom =
    typeof (here.state as { back?: unknown } | null)?.back === 'string' &&
    (here.state as { back: string }).back.startsWith('/')
      ? (here.state as { back: string }).back
      : null;

  /*
   * One step back up the stack, however deep it goes — and the line index only
   * when there is nothing of ours behind, which is a link opened cold.
   */
  const back = useGoBack(paths.routes);

  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);
  const [networkModes, setNetworkModes] = useState<GtfsRouteType[]>([]);

  /** The variant the inspector resolved, which is what the map draws. */
  const [focused, setFocused] = useState<LineVariantDetail | null>(null);
  /*
   * The vehicles the inspector worked out, so the map draws the same ones the
   * spine does. Computed once, over there, because the day's timetable lives
   * there — two clocks would put one vehicle in two places.
   */
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  /*
   * Only the network, and no `/api/valid-dates`. The days a date control offers
   * here are the *variant's* own service days, which arrive with the variant —
   * the feed's whole window would include days this line does not run.
   */
  useEffect(() => {
    const controller = new AbortController();

    void getNetwork({ signal: controller.signal })
      .then((info) => {
        if (controller.signal.aborted) return;
        setTimezone(info.timezone);
        setNetwork(info.network);
        setBounds(boundsForNetwork(info.network));
        setNetworkToday(nowInZone(info.timezone).date);
        setNetworkModes(info.modes);
      })
      .catch(() => {
        /*
         * Swallowed on purpose. Every panel below reports its own failure in
         * the reader's language, and the only thing lost here is the clock and
         * the mode chips — which degrade to no countdowns and no filter rather
         * than to an error over a page that otherwise works.
         */
      });

    return () => controller.abort();
  }, []);

  const patternParam = search.get('variant');
  const patternId =
    patternParam === null || !/^\d+$/.test(patternParam) ? null : Number(patternParam);

  /*
   * A run to follow, and the day it belongs to. Both or neither: a trip id
   * without its service day cannot be found, and a day without a trip is just
   * the line.
   */
  const tripId = search.get('trip');
  const tripDate = search.get('date');
  const following = tripId !== null && tripDate !== null;

  /*
   * The line's *designation*, not its long name. "Route M1" is what somebody
   * scanning a row of tabs can read; "Eira - Lasipalatsi - Ooppera - Sörnäinen
   * (M) - Käpylä" is thirty characters of corridor before the useful part.
   */
  usePageTitle(
    focused === null
      ? t(strings.pages.routes.documentTitle)
      : t(strings.routes.documentTitle, { line: focused.routeShortName }),
  );

  /*
   * The resolved variant belongs to the line and variant in the URL, so it is
   * dropped the moment either changes — otherwise the map holds the last line's
   * geometry while the next one loads, which reads as the wrong line flashing up.
   *
   * Adjusted during render rather than in an effect: an effect would paint that
   * wrong frame first and then correct it, which is the exact thing being
   * avoided. The same shape as `StopsPage`.
   */
  const key = `${lineId ?? ''}?${patternId ?? ''}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setFocused(null);
    setVehicles([]);
  }

  const openLine = useCallback(
    (id: string) => {
      // So the line can name the way back — "All lines" rather than "Back".
      void navigate(linePath(id), {
        state: { back: `${here.pathname}${here.search}` },
      });
    },
    [navigate, here.pathname, here.search],
  );

  /*
   * Replaces rather than pushes. Flipping direction and picking an alternative
   * are adjustments to the same question, not new ones — pushing them would
   * make the back button walk through every variant somebody tried on the way
   * to the one they wanted, instead of returning to the index.
   */
  const openVariant = useCallback(
    (pattern: number) => {
      if (lineId === undefined) return;
      void navigate(lineVariantPath(lineId, pattern), {
        replace: true,
        // As above: a replace drops state unless it is handed back.
        state: here.state,
      });
    },
    [navigate, lineId, here.state],
  );

  /*
   * Following a run, and stopping. Both replace rather than push, like the
   * variant flip: a lens over the same line is an adjustment to one question,
   * not a new one, and pushing would make the back button walk out through
   * every run somebody glanced at.
   */
  const openTrip = useCallback(
    (trip: { tripId: string; date: string } | null) => {
      if (lineId === undefined) return;
      /*
       * The return address rides along. These are `replace`, and a replace
       * without state drops it — so letting go of a followed run would quietly
       * lose the way back to the itinerary it was opened from.
       */
      const carry = { replace: true, state: here.state } as const;

      if (trip === null) {
        void navigate(
          patternId === null ? linePath(lineId) : lineVariantPath(lineId, patternId),
          carry,
        );
        return;
      }
      void navigate(tripPath(lineId, patternId ?? 0, trip.tripId, trip.date), carry);
    },
    [navigate, lineId, patternId, here.state],
  );

  const openStop = useCallback(
    (id: string) => {
      // The same return address the sidebar's rows carry, so a stop opened from
      // the map names the way back as one opened from the list does.
      void navigate(stopPath(id), {
        state: { back: `${here.pathname}${here.search}` },
      });
    },
    [navigate, here.pathname, here.search],
  );

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      <div className="border-border flex w-full flex-none flex-col border-e lg:min-h-0 lg:w-[30rem] lg:overflow-y-auto xl:w-[34rem]">
        {lineId === undefined ? (
          <LineBrowser availableModes={networkModes} onOpen={openLine} />
        ) : (
          <RouteInspector
            lineId={lineId}
            patternId={patternId}
            timezone={timezone}
            networkToday={networkToday}
            tripId={tripId}
            tripDate={tripDate}
            onSelectVariant={openVariant}
            onSelectTrip={openTrip}
            onBack={back.go}
            /*
              Named from the address it returns to, not from the fact that there
              is one. It used to say "Back to the journey" whenever anything had
              sent us, because the planner was the first thing that ever did —
              so a run opened from a stop's board claimed to go back to a
              journey nobody was on.
            */
            backLabel={t(
              back.stepping ? backLabel(cameFrom, strings) : strings.routes.backToLines,
            )}
            onResolved={setFocused}
            onVehicles={setVehicles}
          />
        )}
      </div>

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

          `isolate` boxes in the map's own stacking order. Its markers,
          controls and overlays carry z-index up to 1000 so that a vehicle
          rides over a line and a control over both, but the map's own
          container never claims a z-index to hold that ordering inside — so
          without this, those numbers compete directly with whatever the rest
          of the page uses, and a value meant to beat a marker beats the
          mobile navigation panel too. `isolation: isolate` gives the map its
          own stacking context, so nothing inside it can out-rank an element
          sitting outside it.
        */
      >
        <RouteMap
          network={network}
          area={bounds}
          variant={focused}
          /*
            A line is wanted but has not loaded. Without this the map cannot
            tell that from the index, and takes the chance to go home.
          */
          pending={lineId !== undefined && focused === null}
          onStopSelect={openStop}
          vehicles={vehicles}
          /*
            Already following one? Then `vehicles` above is narrowed to just
            it, so the one badge the map draws is the one being followed —
            pressing it again is the way out, back to the whole route.

            The day is today, and provably: `vehicles` is only ever non-empty
            when the inspector is showing today, so a vehicle on screen cannot
            belong to any other service day.
          */
          onFollowTrip={
            networkToday === null
              ? null
              : following
                ? () => openTrip(null)
                : (trip) => openTrip({ tripId: trip, date: networkToday })
          }
          /*
            Following a run, the map holds the vehicle rather than the line. A
            corridor with a badge somewhere inside it is not an answer to "where
            is it" — you have to find the badge first.
          */
          chase={following}
        />
      </section>
    </div>
  );
}
