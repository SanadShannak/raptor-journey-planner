import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  Marker,
  Polyline,
  useMap,
  useMapEvent,
  useMapEvents,
} from 'react-leaflet';
import { formatDuration, useLocale } from '../i18n';
import type { GeoBounds } from '../config/geocoding';
import type { Journey, TransitLeg } from '../types/journey';
import type { Place } from '../types/place';
import { geocoder } from '../geocoding';
import { visualForFamily } from '../features/journey/modeVisuals';
import {
  ICON_SVG_ATTRIBUTES,
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
import { MapCanvas, FitTo } from './MapCanvas';
import { StopLayer } from './StopLayer';
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
 * {@link MapCanvas}, which the stops map shares. What is left here is the
 * journey itself, and one Leaflet fact shapes it: **a path's `className` is
 * applied when it is created and never updated.** So colour, which never
 * changes for a given leg, is a class; width and opacity, which do change when
 * a line is highlighted, are options.
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
   * holding an itinerary. The cost is the planner's search, which does not live
   * in the URL — the same link in the itinerary beside this can be middle-
   * clicked to keep both, which this cannot.
   */
  onSelectLeg?: ((leg: TransitLeg) => void) | undefined;
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
 * on the press meant the popup opened saying one thing and changed to another
 * a moment later, under the pointer, while somebody was reading it — a name
 * arriving is not worth a popup rewriting itself. So the popup is only ever the
 * question, and the answer is fetched once the question has been answered.
 *
 * The place is handed over immediately under the honest name, and renamed in
 * the field if the lookup comes back with something better. That is safe
 * because a name is not part of what is searched: the query is built from
 * coordinates, so a label arriving late changes nothing but the words in the
 * box. And a coordinate is a perfectly good end of a journey whether or not
 * anybody can name it, which is why a geocoder with no reverse lookup, or
 * nothing to say about that spot, costs the place its label and nothing else.
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
  /** When a choice was last made. See the click handler. */
  const chosenAt = useRef(0);

  useMapEvents({
    click: (event) => {
      /*
       * A backstop, and named as one.
       *
       * Pressing the card's own buttons should never reach here: the element
       * is registered with Leaflet's `disableClickPropagation`, which is what
       * its own controls use and what makes `Map._handleDOMEvent` skip a click
       * whose target sits inside. Three separate readings of that machinery
       * said the press could not get through, and three fixes built on that
       * reading did not hold — so this stops trusting the reading. A click in
       * the same breath as a choice is that choice, not a new question.
       */
      if (Date.now() - chosenAt.current < 400) return;
      setPick({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
    /*
     * Moving the map dismisses the question. It was asked about a point, and
     * once that point is somewhere else on the screen — or off it — the card
     * is a label for nothing. `movestart` rather than `move`, so it goes at the
     * first sign of the map being driven rather than at the end of it.
     */
    movestart: () => setPick(null),
    zoomstart: () => setPick(null),
  });

  useEffect(() => () => lookup.current?.abort(), []);

  /*
   * Leaflet's own popup is not used for this.
   *
   * It brought an open animation, a lifecycle keyed on a `position` prop, and
   * an `openOn` that runs again whenever that prop changes identity — and the
   * question kept re-asking itself as it was answered. A plain element
   * positioned over the map has none of that: it appears where it is put, it
   * goes when the state does, and there is no animation left to replay.
   *
   * It still has to tell Leaflet not to treat presses on it as presses on the
   * map, which is what `disableClickPropagation` is for.
   */
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return;
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
  }, []);

  if (pick === null) return null;

  const at = map.latLngToContainerPoint([pick.lat, pick.lon]);

  const choose = (end: 'origin' | 'destination') => {
    const { lat, lon } = pick;
    chosenAt.current = Date.now();

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
      ref={attach}
      // Above every Leaflet pane, the highest of which is 700.
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
 * Built as a string because Leaflet makes a marker from markup and never from
 * a React tree — and the silhouette inside it comes from the same constants
 * the interface draws, so the two can never drift apart.
 *
 * The mode's own colour, with a surface-coloured edge so it holds against any
 * tile beneath it. Named as well as coloured: the icon carries the mode and
 * the text carries the line, so neither depends on colour alone.
 */
function legBadge(family: string | null, label: string): L.DivIcon {
  const walking = family === null;
  const tint = walking
    ? 'bg-surface-raised text-content'
    : `${visualForFamily(family).fill} text-on-mode`;
  const icon = walking ? WALK_ICON_MARKUP : modeIconMarkup(family);

  /*
   * Centred on the line it names.
   *
   * It stood above on a pointer for a while, so that a short leg could still be
   * labelled — but a chip floating off the line reads as belonging to whatever
   * it happens to be over, which on a map is usually somebody's building. On
   * the line it is unambiguous, and the legs too short to carry one are walks,
   * which are the ones worth losing.
   *
   * The width is whatever the label needs, which is why this is a transform and
   * not an `iconAnchor`: Leaflet wants that in pixels, and nothing here knows
   * how wide "Kehärata" is until the browser has laid it out.
   *
   * `left` rather than `start`: the anchor is a point on the ground, placed by
   * projection in physical pixels, and the map does not flip with the document.
   */
  return L.divIcon({
    className: 'journey-badge',
    html: `<span class="${tint} rounded-control shadow-card ring-surface absolute top-0 left-0 flex w-max -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 px-2 py-1 text-sm font-bold ring-2"><svg ${ICON_SVG_ATTRIBUTES} width="18" height="18">${icon}</svg>${label}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** The pin, built from the same path the form and the strip map draw. */
const destinationIcon = L.divIcon({
  className: 'journey-marker',
  html: `<svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true" class="text-brand-500">${destinationMarkerMarkup('fill-surface')}</svg>`,
  iconSize: [38, 38],
  // The point of a pin is its tip, which is the bottom of the box.
  iconAnchor: [19, 38],
});

interface Badge {
  key: string;
  point: L.LatLngExpression;
  icon: L.DivIcon;
  /** The leg's two ends, for asking how much room it has on screen. */
  ends: [L.LatLngExpression, L.LatLngExpression];
  /** Transit before walking, when only one of the two can be shown. */
  rank: number;
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
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvent('zoomend', () => setZoom(map.getZoom()));

  const shown = useMemo(() => {
    // `zoom` is not read here: it is the signal that every projection below
    // has moved, which is exactly when this has to be worked out again.
    void zoom;

    const placed: L.Point[] = [];
    const keep: Badge[] = [];
    /** How far apart two badges must sit before both are worth drawing. */
    const MIN_GAP = 76;
    /**
     * How much of the screen a walk must occupy to be worth labelling.
     *
     * A badge sits on its line, so on a leg shorter than the badge it covers
     * both ends and the line between them — you cannot see the thing you are
     * being told about.
     *
     * Only walks are held to it. Which line you are on is what a map is being
     * asked, so a ride keeps its badge at any size; a walk's own length is
     * already written out in the itinerary beside the map, so losing it until
     * there is room costs nothing that is not said elsewhere.
     */
    const MIN_WALK_SPAN = 64;

    for (const badge of [...badges].sort((a, b) => a.rank - b.rank)) {
      const [from, to] = badge.ends;
      const walking = badge.rank !== 0;
      if (
        walking &&
        map.latLngToLayerPoint(from).distanceTo(map.latLngToLayerPoint(to)) <
          MIN_WALK_SPAN
      ) {
        continue;
      }

      const at = map.latLngToLayerPoint(badge.point);
      if (placed.every((other) => at.distanceTo(other) >= MIN_GAP)) {
        placed.push(at);
        keep.push(badge);
      }
    }
    return keep;
  }, [badges, map, zoom]);

  return (
    <>
      {shown.map((badge) => (
        <Marker key={badge.key} position={badge.point} icon={badge.icon} interactive={false} />
      ))}
    </>
  );
}

/** Where you start: the same three rings the form and the strip map draw. */
const originIcon = L.divIcon({
  className: 'journey-marker',
  html: `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" class="text-mode-tram">${originMarkerMarkup('fill-surface')}</svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export function JourneyMap({
  journey,
  network,
  area,
  onPick,
  onRename,
  onStopSelect,
  selectedStopId,
  onSelectLeg,
}: Props) {
  const locale = useLocale();
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

  /*
   * Every drawn key is scoped to the journey, so a change of journey brings a
   * fresh set of layers rather than restyling the last one.
   *
   * That is not tidiness. A path's `className` is applied when Leaflet creates
   * the element and never touched again, while `setStyle` reaches only the
   * options — so a reused layer keeps the class it was born with. Moving from a
   * journey that starts by bus to one that starts by tram repainted nothing:
   * the second wore the first one's colours the whole way down. Remounting is
   * what makes the colours belong to the journey being shown.
   */
  const scope =
    journey === null
      ? 'none'
      : `${journey.startDate}-${journey.startTime}-${journey.endTime}`;

  /*
   * The journey when there is one, the network's area otherwise. Memoised
   * because it is an effect's dependency, and a fresh array each render would
   * re-frame the map on every keystroke elsewhere on the page.
   */
  const box = useMemo<BoundingBox | null>(() => geometry?.bounds ?? null, [geometry]);

  const home = useMemo(() => homeViewFor(network, area), [network, area]);

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
          key: `${scope}-badge-${segment.key}`,
          point: segment.midpoint,
          ends: segment.ends,
          icon: legBadge(segment.family, label),
          rank: segment.kind === 'transit' ? 0 : 1,
        },
      ];
    });
  }, [geometry, journey, scope, locale]);

  return (
    <MapCanvas network={network}>
      {/* Drawn under everything the journey puts on the map. */}
      <StopLayer
        onStopHover={() => setPick(null)}
        onStopSelect={onStopSelect}
        selectedStopId={selectedStopId}
      />

      <PickPoint pick={pick} setPick={setPick} onPick={onPick} onRename={onRename} />
      <FitTo box={box} home={home} animate={!reduceMotion} />

      {geometry?.segments.map((segment) => {
        const walking = segment.kind === 'walk';
        const ink =
          segment.family === null ? '' : visualForFamily(segment.family).stroke;

        /*
         * A ridden leg opens its own run; a walk has none to open.
         *
         * The press is stopped from reaching the map, or the pin chooser opens
         * underneath the page that is already on its way — Leaflet delivers a
         * click to the layer *and* to the map unless a handler says otherwise.
         */
        const ridden = journey?.legs[segment.legIndex];
        const follow =
          onSelectLeg === undefined || ridden === undefined || ridden.mode !== 'TRANSIT'
            ? undefined
            : (event: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(event);
                onSelectLeg(ridden);
              };

        // Both strokes take the press: the casing is the wider of the two and
        // is what makes a six-pixel line a target worth aiming at.
        const pressable =
          follow === undefined
            ? { interactive: false as const }
            : { interactive: true as const, eventHandlers: { click: follow } };

        return (
          /*
           * Drawn twice. The casing underneath is the page's own surface
           * colour, which is what keeps a dark blue bus line from disappearing
           * into dark water, and a pale one from washing out over a light map.
           * It is ordinary transit cartography and it leaves the colour itself
           * untouched.
           */
          <Fragment key={`${scope}-${segment.key}`}>
            <Polyline
              positions={segment.path}
              className="stroke-surface"
              pathOptions={{ weight: walking ? 8 : 10, opacity: 0.9 }}
              {...pressable}
            />
            <Polyline
              positions={segment.path}
              className={ink}
              pathOptions={{
                weight: walking ? 3 : 6,
                opacity: 1,
                // A walk is a straight line the engine measured as the crow
                // flies, so it is dashed here exactly as it is in the strip
                // map — the drawing says it is an estimate.
                ...(walking ? { dashArray: '1 9', lineCap: 'round' as const } : {}),
              }}
              {...pressable}
            />
          </Fragment>
        );
      })}

      {geometry?.calls.map((call) => (
        <CircleMarker
          key={`${scope}-${call.key}`}
          center={call.point}
          radius={6}
          className={`${call.family === null ? '' : visualForFamily(call.family).stroke} fill-surface`}
          pathOptions={{ weight: 3, opacity: 1, fillOpacity: 1 }}
          interactive={false}
        />
      ))}

      {/*
        The stops ridden through. Small and quiet — they are information rather
        than a decision, and the itinerary lists them in words. Drawn before
        the badges so a badge is never lost behind one.
      */}
      {geometry?.passed.map((stop) => (
        <CircleMarker
          key={`${scope}-${stop.key}`}
          center={stop.point}
          radius={3.5}
          className={`${stop.family === null ? '' : visualForFamily(stop.family).stroke} fill-surface`}
          pathOptions={{ weight: 2, opacity: 1, fillOpacity: 1 }}
          interactive={false}
        />
      ))}

      {/* The badge naming each leg, halfway along it by length. */}
      <LegBadges badges={badges} />

      {geometry?.origin && (
        <Marker position={geometry.origin} icon={originIcon} interactive={false} />
      )}

      {geometry?.destination && (
        <Marker position={geometry.destination} icon={destinationIcon} interactive={false} />
      )}
    </MapCanvas>
  );
}
