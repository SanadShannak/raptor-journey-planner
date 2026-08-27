import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, useLocale } from '../i18n';
import { useTheme } from '../theme';
import type { GeoBounds } from '../config/geocoding';
import type { Journey, TransitLeg } from '../types/journey';
import type { Place } from '../types/place';
import { geocoder } from '../geocoding';
import { familyFor, visualForFamily } from '../features/journey/modeVisuals';
import {
  WALK_ICON_MARKUP,
  modeIconMarkup,
} from '../features/journey/modeIconMarkup';
import {
  destinationMarkerMarkup,
  originMarkerMarkup,
} from '../features/journey/placeMarkerMarkup';
import {
  journeyGeometry,
  type BoundingBox,
} from '../features/journey/journeyGeometry';
import { useLegVehicles } from '../features/journey/useLegVehicles';
import { useNetworkNow, VEHICLE_TICK_MS } from '../features/stops/useNetworkNow';
import { nowSeconds } from '../features/routes/vehicleProgress';
import { MapCanvas, FitTo } from './MapCanvas';
import { MapMarker } from './MapMarker';
import { StopLayer } from './StopLayer';
import { VehicleBadge } from './RouteVehicles';
import { useMap, useMapEvent } from './mapContext';
import { useGeoJson } from './useGeoJson';
import {
  lineLayers,
  pointCollection,
  segmentCollection,
  stopCircleLayers,
  type DrawnPoint,
  type DrawnSegment,
} from './journeyLayers';
import { homeViewFor } from './homeView';
import { useReducedMotion } from './useReducedMotion';

/**
 * A journey drawn on the ground.
 *
 * The counterpart to the strip map in the detail panel, and deliberately the
 * same notation: the vehicle's own colour, walking dashed, the ring you start
 * from and the pin you are heading to. Someone who has read one should not have
 * to learn the other.
 *
 * It is an enhancement, never the only route to anything. Every stop, time and
 * change it shows is already written out in the itinerary beside it, which is
 * what lets the markers stay quiet rather than becoming a second, longer set of
 * tab stops competing with the list.
 *
 * The ground it is drawn on — tiles, controls, sizing — belongs to
 * {@link MapCanvas}, which the other two maps share. The paint belongs to
 * `journeyLayers`, shared with the line map. What is left here is the journey.
 */

interface Props {
  /** The journey to draw, or null to rest on the network's area. */
  journey: Journey | null;
  /** Which network, for the tile source. */
  network: string | null;
  /** The network's area, for when there is no journey to show. */
  area: GeoBounds | null;
  /** Takes a point pressed on the map as one end of the search. */
  onPick: (place: Place, end: 'origin' | 'destination') => void;
  /**
   * Gives that point a better name once the geocoder answers.
   *
   * Separate from {@link onPick} because it must not read as a new choice: the
   * coordinates are unchanged, so nothing about the search has moved and
   * nothing on screen should be thrown away for it.
   */
  onRename: (place: Place, end: 'origin' | 'destination') => void;
  /**
   * Takes a stop pressed on the map, so the sidebar can open it.
   *
   * Deliberately not a navigation. The search this page is holding does not
   * live in the URL, so leaving for `/stops/:id` would throw it away and the
   * back button would land on an empty form.
   */
  onStopSelect: (stopId: string) => void;
  /** The stop currently open in the sidebar, drawn as the chosen one. */
  selectedStopId: string | null;
  /**
   * Opens the run a drawn transit leg belongs to.
   *
   * Unlike {@link onStopSelect} this *is* a navigation, and knowingly: the run
   * is a page of its own and cannot be shown in a sidebar that is already
   * holding an itinerary.
   */
  onSelectLeg?: ((leg: TransitLeg) => void) | undefined;
  /**
   * The network's own clock, for placing a ridden leg's vehicle on the map.
   *
   * Null before `/api/network` has answered, which simply means no vehicle is
   * drawn yet rather than one drawn against the wrong city's clock.
   */
  timezone?: string | null | undefined;
}

/** A point somebody pressed. */
interface Pick {
  lat: number;
  lon: number;
}

/**
 * Offers a pressed point as one end of the journey.
 *
 * The map is an enhancement, so this adds no capability the form does not
 * already have — it is the same two fields, reachable by pointing at a place
 * whose name you do not know. Which is the case the form is worst at: you
 * cannot type a name for the corner of a park.
 *
 * **Nothing is looked up until something has been chosen.** Asking the geocoder
 * on the press meant the card opened saying one thing and changed to another a
 * moment later, under the pointer, while somebody was reading it. So the card
 * is only ever the question, and the answer is fetched once it is answered.
 *
 * The place is handed over immediately under the honest name, and renamed in
 * the field if the lookup comes back with something better. That is safe
 * because a name is not part of what is searched: the query is built from
 * coordinates, so a label arriving late changes nothing but the words in the
 * box.
 *
 * The card is a plain element positioned over the map rather than a popup —
 * no open animation to replay, and nothing keyed on a position prop. It sits
 * beside the canvas rather than on it, which is also why it needs no help
 * keeping its own presses away from the map: a click on this element is not a
 * click on the canvas, so the map never hears it. That was not true under
 * Leaflet, where the same card needed `disableClickPropagation` and a timing
 * backstop on top of it.
 */
function PickPoint({
  pick,
  setPick,
  onPick,
  onRename,
}: {
  pick: Pick | null;
  setPick: (pick: Pick | null) => void;
  onPick: Props['onPick'];
  onRename: Props['onRename'];
}) {
  const { locale, strings, t } = useLocale();
  const map = useMap();
  /** The lookup in flight, so a second choice cancels the first. */
  const lookup = useRef<AbortController | null>(null);

  useMapEvent('click', (event) => {
    setPick({ lat: event.lngLat.lat, lon: event.lngLat.lng });
  });

  /*
   * Moving the map dismisses the question. It was asked about a point, and
   * once that point is somewhere else on the screen — or off it — the card is a
   * label for nothing. `movestart` rather than `move`, so it goes at the first
   * sign of the map being driven rather than at the end of it.
   */
  useMapEvent('movestart', () => setPick(null));
  useMapEvent('zoomstart', () => setPick(null));

  useEffect(() => () => lookup.current?.abort(), []);

  if (pick === null) return null;

  const at = map.project([pick.lon, pick.lat]);

  const choose = (end: 'origin' | 'destination') => {
    const { lat, lon } = pick;

    const place: Place = {
      key: `picked-${lat},${lon}`,
      lat,
      lon,
      label: t(strings.planner.selectedLocation),
      context: null,
      kind: 'place',
      stopId: null,
      stopCode: null,
      platform: null,
      modes: null,
    };

    onPick(place, end);
    setPick(null);

    const reverse = geocoder.reverse;
    if (reverse === undefined) return;

    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;

    void reverse(lat, lon, { signal: controller.signal, language: locale })
      .then((named) => {
        if (controller.signal.aborted || named === null) return;
        // Named where it was pressed, not at the centre of whatever matched.
        onRename({ ...named, lat, lon, key: place.key }, end);
      })
      .catch(() => {
        // A geocoder that cannot answer is no reason to disturb the choice
        // that was already made.
      });
  };

  return (
    <div
      className="absolute z-[1000] -translate-x-1/2 -translate-y-full pb-2"
      style={{ left: at.x, top: at.y }}
    >
      <div className="rounded-card border-border bg-surface-raised shadow-card flex flex-col gap-2 border p-3">
        <span className="flex items-start gap-3">
          <span dir="auto" className="text-sm font-semibold">
            {t(strings.planner.selectedLocation)}
          </span>
          <button
            type="button"
            onClick={() => setPick(null)}
            aria-label={t(strings.planner.dismiss)}
            className="text-content-muted hover:text-content focus-visible:outline-brand-500 rounded-control -me-1 -mt-1 ms-auto cursor-pointer p-1 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>

        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => choose('origin')}
            className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 cursor-pointer px-2.5 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.planner.setAsOrigin)}
          </button>
          <button
            type="button"
            onClick={() => choose('destination')}
            className="rounded-control border-border-strong text-content hover:border-brand-500 focus-visible:outline-brand-500 cursor-pointer border px-2.5 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.planner.setAsDestination)}
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * The badge that names a leg, sitting halfway along it.
 *
 * The mode's own colour, with a surface-coloured edge so it holds against any
 * cartography beneath it. Named as well as coloured: the icon carries the mode
 * and the text carries the line, so neither depends on colour alone.
 *
 * Centred on the line it names. It stood above on a pointer for a while, so
 * that a short leg could still be labelled — but a chip floating off the line
 * reads as belonging to whatever it happens to be over, which on a map is
 * usually somebody's building.
 */
function LegBadge({ family, label }: { family: string | null; label: string }) {
  const walking = family === null;
  const tint = walking
    ? 'bg-surface-raised text-content'
    : `${visualForFamily(family).fill} text-on-mode`;

  return (
    <span
      className={`${tint} rounded-control shadow-card ring-surface flex w-max items-center gap-1.5 px-2 py-1 text-sm font-bold ring-2`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: walking ? WALK_ICON_MARKUP : modeIconMarkup(family),
        }}
      />
      {label}
    </span>
  );
}

interface Badge {
  key: string;
  point: [number, number];
  family: string | null;
  label: string;
  /** The leg's two ends, for asking how much room it has on screen. */
  ends: [[number, number], [number, number]];
  /** Transit before walking, when only one of the two can be shown. */
  rank: number;
  /** Opens the run this badge names, or null on a walk — which has none. */
  follow: (() => void) | null;
}

/**
 * The badges, thinned out so they do not sit on top of each other.
 *
 * Two short legs either side of a change put their midpoints within a few
 * hundred metres, which at a city-wide zoom is a few pixels — and two badges in
 * the same place are less legible than one. So they are measured in *screen*
 * space at the current zoom and dropped where they would collide, which means
 * the set changes as you zoom: the ones that vanish when you pull back are the
 * ones that reappear when you go in.
 *
 * Ridden legs win the ties. Which line you are on is the thing a map is being
 * asked, and a walk's own length is already in the itinerary beside it.
 */
function LegBadges({ badges }: { badges: Badge[] }) {
  const map = useMap();
  const [moved, setMoved] = useState(0);

  useMapEvent('zoomend', () => setMoved((count) => count + 1));
  useMapEvent('moveend', () => setMoved((count) => count + 1));

  const shown = useMemo(() => {
    // Not read: it is the signal that every projection below has moved, which
    // is exactly when this has to be worked out again.
    void moved;

    const placed: { x: number; y: number }[] = [];
    const keep: Badge[] = [];
    /** How far apart two badges must sit before both are worth drawing. */
    const MIN_GAP = 76;
    /**
     * How much of the screen a walk must occupy to be worth labelling.
     *
     * A badge sits on its line, so on a leg shorter than the badge it covers
     * both ends and the line between them — you cannot see the thing you are
     * being told about. Only walks are held to it: which line you are on is
     * what a map is being asked, so a ride keeps its badge at any size.
     */
    const MIN_WALK_SPAN = 64;

    for (const badge of [...badges].sort((a, b) => a.rank - b.rank)) {
      const [from, to] = badge.ends;
      const walking = badge.rank !== 0;
      if (walking) {
        const a = map.project([from[1], from[0]]);
        const b = map.project([to[1], to[0]]);
        if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_WALK_SPAN) continue;
      }

      const at = map.project([badge.point[1], badge.point[0]]);
      if (placed.every((other) => Math.hypot(at.x - other.x, at.y - other.y) >= MIN_GAP)) {
        placed.push({ x: at.x, y: at.y });
        keep.push(badge);
      }
    }
    return keep;
  }, [badges, map, moved]);

  return (
    <>
      {shown.map((badge) => (
        <MapMarker
          key={badge.key}
          position={badge.point}
          /*
           * A walk's badge stays a label. Interactive with nothing to do it
           * would still swallow the press, and the point chooser underneath is
           * what a press on empty ground is for.
           */
          interactive={badge.follow !== null}
          {...(badge.follow === null ? {} : { onClick: badge.follow })}
          zIndex={800}
        >
          <LegBadge family={badge.family} label={badge.label} />
        </MapMarker>
      ))}
    </>
  );
}

/**
 * Opens the run a pressed line belongs to.
 *
 * The line is a GL layer rather than a stack of elements, so a press is
 * answered by asking the map what is under the pointer instead of by a handler
 * hung on each path. That is the better arrangement here: the casing and the
 * stroke are one query rather than two layers each needing the same handler,
 * and the six-pixel stroke is not the target — the casing under it is.
 */
function LegLineClicks({
  layers,
  onSelect,
}: {
  layers: string[];
  onSelect: (legIndex: number) => void;
}) {
  const map = useMap();
  const latest = useRef(onSelect);

  // In an effect, not during render — see `useMapEvent` in `mapContext.ts`.
  useEffect(() => {
    latest.current = onSelect;
  });

  useMapEvent('click', (event) => {
    const hit = map.queryRenderedFeatures(event.point, { layers });
    const legIndex = hit[0]?.properties?.['legIndex'];
    if (typeof legIndex !== 'number') return;
    /*
     * Or the point chooser opens underneath the page already leaving. The
     * chooser listens for the same click, so this says the press has been
     * answered.
     */
    event.preventDefault();
    latest.current(legIndex);
  });

  /* The pointer says the line can be pressed. */
  useEffect(() => {
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => {
      map.getCanvas().style.cursor = '';
    };

    for (const layer of layers) {
      map.on('mouseenter', layer, enter);
      map.on('mouseleave', layer, leave);
    }
    return () => {
      for (const layer of layers) {
        map.off('mouseenter', layer, enter);
        map.off('mouseleave', layer, leave);
      }
    };
  }, [map, layers]);

  return null;
}

/** The journey's own geometry, as the two overlays that draw it. */
function JourneyShapes({
  segments,
  points,
  scheme,
}: {
  segments: DrawnSegment[];
  points: DrawnPoint[];
  scheme: string;
}) {
  /*
   * Rebuilt when the scheme changes, because the colours inside are resolved
   * values rather than class names — a token that has been remapped to its
   * dark twin produces different data, not merely a different stylesheet.
   */
  const lines = useMemo(() => {
    void scheme;
    return segmentCollection(segments);
  }, [segments, scheme]);

  const circles = useMemo(() => {
    void scheme;
    return pointCollection(points);
  }, [points, scheme]);

  const linePaint = useMemo(() => {
    void scheme;
    return lineLayers();
  }, [scheme]);

  const circlePaint = useMemo(() => {
    void scheme;
    return stopCircleLayers();
  }, [scheme]);

  useGeoJson('journey-lines', lines, linePaint);
  useGeoJson('journey-stops', circles, circlePaint);

  return null;
}

export function JourneyMap({
  journey,
  network,
  area,
  onPick,
  onRename,
  onStopSelect,
  selectedStopId,
  onSelectLeg,
  timezone = null,
}: Props) {
  const locale = useLocale();
  const { resolved } = useTheme();
  /*
   * The vehicle tick, not the countdown one. This map draws a ridden leg's own
   * vehicle interpolated along its shape, which is exactly what the line's map
   * does — at thirty seconds it crawled in visible steps while the same vehicle
   * on the line's own page moved smoothly.
   */
  const now = useNetworkNow(timezone, VEHICLE_TICK_MS);
  const atSeconds = now === null ? null : nowSeconds(now);
  /*
   * Held here rather than inside the chooser, because two other things now
   * dismiss it: moving the map, and putting the pointer on a stop.
   */
  const [pick, setPick] = useState<Pick | null>(null);
  const reduceMotion = useReducedMotion();

  const geometry = useMemo(
    () => (journey === null ? null : journeyGeometry(journey)),
    [journey],
  );

  const box = useMemo<BoundingBox | null>(() => geometry?.bounds ?? null, [geometry]);
  const home = useMemo(() => homeViewFor(network, area), [network, area]);

  const segments = useMemo<DrawnSegment[]>(
    () =>
      geometry === null
        ? []
        : geometry.segments.map((segment) => ({
            path: segment.path,
            family: segment.family,
            walk: segment.kind === 'walk',
            legIndex: segment.legIndex,
          })),
    [geometry],
  );

  const points = useMemo<DrawnPoint[]>(() => {
    if (geometry === null) return [];
    return [
      ...geometry.passed.map((stop) => ({
        point: stop.point,
        family: stop.family,
        call: false,
      })),
      ...geometry.calls.map((call) => ({
        point: call.point,
        family: call.family,
        call: true,
      })),
    ];
  }, [geometry]);

  const badges = useMemo<Badge[]>(() => {
    if (geometry === null || journey === null) return [];

    return geometry.segments.flatMap((segment) => {
      if (segment.midpoint === null || segment.ends === null) return [];
      const leg = journey.legs[segment.legIndex];
      if (leg === undefined) return [];

      /*
       * A ride is named by its line; a walk has no name, so it is named by
       * what it costs you — which is the thing you would want to know before
       * deciding to take this itinerary at all.
       */
      const label =
        leg.mode === 'TRANSIT'
          ? (leg.routeShortName ?? '')
          : formatDuration(leg.walkDurationMinutes, locale);

      return [
        {
          key: `badge-${segment.key}`,
          point: segment.midpoint,
          ends: segment.ends,
          family: segment.family,
          label,
          rank: segment.kind === 'transit' ? 0 : 1,
          follow:
            onSelectLeg === undefined || leg.mode !== 'TRANSIT'
              ? null
              : () => onSelectLeg(leg),
        },
      ];
    });
  }, [geometry, journey, locale, onSelectLeg]);

  /*
   * The vehicle on a ridden leg, tracked over its whole trip rather than only
   * the stretch this itinerary rides — out from whichever terminus it really
   * set off from, through this rider's own leg, and on to wherever it really
   * finishes, so it is on the map before boarding and after alighting too.
   *
   * Scheduled position, not observed — the same badge `RouteVehicles` draws on
   * a line's own page, and the same honesty applies: the compiled feed carries
   * no live vehicle data.
   */
  const legVehicles = useLegVehicles(journey, atSeconds);

  const selectLeg = (legIndex: number) => {
    const leg = journey?.legs[legIndex];
    if (leg === undefined || leg.mode !== 'TRANSIT' || onSelectLeg === undefined) return;
    onSelectLeg(leg);
  };

  return (
    <MapCanvas network={network}>
      {/* Drawn under everything the journey puts on the map. */}
      <StopLayer
        onStopHover={() => setPick(null)}
        onStopSelect={onStopSelect}
        selectedStopId={selectedStopId}
      />

      <JourneyShapes segments={segments} points={points} scheme={resolved} />

      {onSelectLeg !== undefined && (
        <LegLineClicks
          layers={['journey-lines-casing-ride', 'journey-lines-ride']}
          onSelect={selectLeg}
        />
      )}

      <PickPoint pick={pick} setPick={setPick} onPick={onPick} onRename={onRename} />
      <FitTo box={box} home={home} animate={!reduceMotion} />

      {/* The badge naming each leg, halfway along it by length. */}
      <LegBadges badges={badges} />

      {/* A ridden leg's own vehicle, drawn only while it is actually out. */}
      {legVehicles.map(({ leg, point, bearing }) => (
        <MapMarker
          key={`vehicle-${leg.tripId}`}
          position={point}
          interactive={onSelectLeg !== undefined}
          {...(onSelectLeg === undefined ? {} : { onClick: () => onSelectLeg(leg) })}
          // Above the line and the leg badges, which it is travelling over.
          zIndex={1000}
        >
          <VehicleBadge
            family={familyFor(leg.routeType)}
            bearing={bearing}
            designation={leg.routeShortName}
          />
        </MapMarker>
      ))}

      {/* Where you start: the same three rings the form and strip map draw. */}
      {geometry?.origin && (
        <MapMarker position={geometry.origin}>
          <svg
            viewBox="0 0 24 24"
            width="30"
            height="30"
            aria-hidden="true"
            className="text-mode-tram block"
            dangerouslySetInnerHTML={{ __html: originMarkerMarkup('fill-surface') }}
          />
        </MapMarker>
      )}

      {/* The pin, built from the same path the form and strip map draw. */}
      {geometry?.destination && (
        <MapMarker
          position={geometry.destination}
          // The point of a pin is its tip, which is the bottom of the box.
          anchor="bottom"
        >
          <svg
            viewBox="0 0 24 24"
            width="38"
            height="38"
            aria-hidden="true"
            className="text-brand-500 block"
            dangerouslySetInnerHTML={{
              __html: destinationMarkerMarkup('fill-surface'),
            }}
          />
        </MapMarker>
      )}
    </MapCanvas>
  );
}
