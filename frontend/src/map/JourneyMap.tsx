import { Fragment, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import {
  AttributionControl,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvent,
} from 'react-leaflet';
import { formatDuration, useLocale } from '../i18n';
import { useTheme } from '../theme';
import type { GeoBounds } from '../config/geocoding';
import type { Journey } from '../types/journey';
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
  boxFromGeoBounds,
  journeyGeometry,
  type BoundingBox,
} from '../features/journey/journeyGeometry';
import { tileSourceFor } from './tileSource';
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
 * Two Leaflet facts shape the code below more than they should:
 *
 * - **`MapContainer` freezes its props at mount.** `center`, `zoom`, `bounds`
 *   and every map option are read once and never again. The network's area
 *   arrives after `/api/network` answers, long after that, so all framing is
 *   done imperatively from a child that holds the map instance.
 * - **A path's `className` is applied when it is created and never updated.**
 *   So colour, which never changes for a given leg, is a class; width and
 *   opacity, which do change when a line is highlighted, are options.
 */

interface Props {
  /** The journey to draw, or null to rest on the network's area. */
  journey: Journey | null;
  /** Which network, for the tile source. */
  network: string | null;
  /** The network's area, for when there is no journey to show. */
  area: GeoBounds | null;
}

/** Roughly Helsinki, used only for the instant before anything is known. */
const FALLBACK_CENTRE: L.LatLngExpression = [60.17, 24.94];
const FALLBACK_ZOOM = 11;

/**
 * Frames the map on whatever it is currently showing.
 *
 * `fitBounds` throws on an invalid box, and a journey that collapses to a
 * single point produces a valid but zero-sized one — which Leaflet answers by
 * slamming to its maximum zoom. Hence both the null guard and the `maxZoom`.
 */
function FitTo({ box, animate }: { box: BoundingBox | null; animate: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (box === null) return;
    map.fitBounds(box, { padding: [32, 32], maxZoom: 16, animate });
  }, [map, box, animate]);

  return null;
}

/**
 * Tells the map when its own box changed size.
 *
 * Leaflet's `trackResize` watches the window, not the element. That covers
 * today — the sidebar is a fixed width, so every change to the map's size is
 * also a window resize — but it does not cover the first frame, where a map
 * created before layout settles renders as a grey half-panel. The observer
 * fires once on `observe()`, which fixes exactly that.
 */
function KeepSized() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false, debounceMoveend: true });
      });
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

/**
 * The zoom buttons' names.
 *
 * Leaflet writes these as `title` and `aria-label`, and its own defaults are
 * English. They are set from outside because the control reads them once, when
 * it is created — the same freezing that applies to the map itself.
 */
function ZoomButtonLabels({ zoomIn, zoomOut }: { zoomIn: string; zoomOut: string }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const label = (selector: string, text: string) => {
      const button = container.querySelector(selector);
      if (button === null) return;
      button.setAttribute('title', text);
      button.setAttribute('aria-label', text);
    };
    label('.leaflet-control-zoom-in', zoomIn);
    label('.leaflet-control-zoom-out', zoomOut);
  }, [map, zoomIn, zoomOut]);

  return null;
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

  return L.divIcon({
    className: 'journey-badge',
    /*
     * Pulled back by half its own size so the line runs through its middle.
     * The width is whatever the label needs, which is why this is a transform
     * and not an `iconAnchor`: Leaflet wants that in pixels, and nothing here
     * knows how wide "Kehärata" is until the browser has laid it out.
     *
     * `left` rather than `start`, which is the one place in this app that is
     * right. The anchor is a point on the ground, placed by projection in
     * physical pixels; the map does not flip with the document, so neither can
     * the offset that centres something on it.
     */
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
    const MIN_GAP = 76;

    for (const badge of [...badges].sort((a, b) => a.rank - b.rank)) {
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

export function JourneyMap({ journey, network, area }: Props) {
  const locale = useLocale();
  const { strings, t, direction } = locale;
  const { resolved } = useTheme();
  const reduceMotion = useReducedMotion();

  const tiles = tileSourceFor(network);
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
  const box = useMemo<BoundingBox | null>(() => {
    if (geometry?.bounds) return geometry.bounds;
    return area === null ? null : boxFromGeoBounds(area);
  }, [geometry, area]);

  const badges = useMemo<Badge[]>(() => {
    if (geometry === null || journey === null) return [];

    return geometry.segments.flatMap((segment) => {
      if (segment.midpoint === null) return [];
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
          icon: legBadge(segment.family, label),
          rank: segment.kind === 'transit' ? 0 : 1,
        },
      ];
    });
  }, [geometry, journey, scope, locale]);

  const rtl = direction === 'rtl';

  return (
    <MapContainer
      className="absolute inset-0 h-full w-full"
      center={FALLBACK_CENTRE}
      zoom={FALLBACK_ZOOM}
      zoomControl={false}
      attributionControl={false}
      /*
       * Every one of these is a movement Leaflet runs in JavaScript, which no
       * media query can shorten. `inertia` is the glide that continues after
       * you let go, and is the one most easily forgotten.
       */
      zoomAnimation={!reduceMotion}
      fadeAnimation={!reduceMotion}
      markerZoomAnimation={!reduceMotion}
      inertia={!reduceMotion}
    >
      <TileLayer
        // Two real cartographies rather than one filtered one, so the route
        // colours drawn on top are never distorted.
        url={resolved === 'dark' ? tiles.dark : tiles.light}
        attribution={tiles.attribution}
        maxZoom={tiles.maxZoom}
        detectRetina
      />

      <ZoomControl position={rtl ? 'topright' : 'topleft'} />
      <AttributionControl position={rtl ? 'bottomleft' : 'bottomright'} prefix={false} />
      <ZoomButtonLabels
        zoomIn={t(strings.planner.zoomIn)}
        zoomOut={t(strings.planner.zoomOut)}
      />

      <KeepSized />
      <FitTo box={box} animate={!reduceMotion} />

      {geometry?.segments.map((segment) => {
        const walking = segment.kind === 'walk';
        const ink =
          segment.family === null ? '' : visualForFamily(segment.family).stroke;

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
              interactive={false}
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
              interactive={false}
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
    </MapContainer>
  );
}
