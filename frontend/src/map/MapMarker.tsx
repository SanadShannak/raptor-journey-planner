import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Marker, type PositionAnchor } from 'maplibre-gl';
import type { Coordinates } from '../types/journey';
import { useMap, useMapAlive } from './mapContext';
import { lngLat } from './coords';

interface Props {
  position: Coordinates;
  /** Which part of the element sits on the point. */
  anchor?: PositionAnchor | undefined;
  offset?: [number, number] | undefined;
  /**
   * Whether the element takes the pointer.
   *
   * Off by default, and that default matters. A marker that accepts clicks
   * swallows them, and a press on empty ground is what the planner's point
   * chooser is for — so a decoration left interactive would quietly eat the
   * gesture that opens it. Leaflet had the same trap and the same answer.
   */
  interactive?: boolean | undefined;
  onClick?: (() => void) | undefined;
  /** Stacking against the other markers; the vehicles ride above the rest. */
  zIndex?: number | undefined;
  children: ReactNode;
}

/**
 * One HTML marker on the map.
 *
 * A GL map draws its own geometry, but a marker is still an ordinary element
 * the map positions — which is what lets these stay React trees rather than
 * the HTML strings Leaflet demanded. The markup builders are still shared with
 * the interface, and now they are shared as JSX where the caller has it.
 *
 * The element belongs to this component and the content is rendered into it
 * through a portal, so a marker re-renders like anything else: no rebuilding
 * the marker to change what is inside it.
 *
 * Markers survive a restyle. They are not part of the style document, so
 * unlike a source or a layer they need no `styleEpoch` — see `mapContext.ts`.
 */
export function MapMarker({
  position,
  anchor = 'center',
  offset,
  interactive = false,
  onClick,
  zIndex,
  children,
}: Props) {
  const map = useMap();
  const isAlive = useMapAlive();
  const element = useMemo(() => document.createElement('div'), []);
  const placed = useRef<Marker | null>(null);
  const [lat, lon] = position;

  useEffect(() => {
    const marker = new Marker({
      element,
      anchor,
      ...(offset === undefined ? {} : { offset }),
    })
      .setLngLat(lngLat([lat, lon]))
      .addTo(map);
    placed.current = marker;

    return () => {
      // Removing a marker unsubscribes it from the map, so a destroyed map
      // makes this throw — and the map is destroyed first. See `MapHandle`.
      if (isAlive()) marker.remove();
      placed.current = null;
    };
    // `lat`/`lon` are deliberately not here: moving a marker is a `setLngLat`
    // below, not a teardown and rebuild. A vehicle ticks several times a
    // second and rebuilding it would restart the halo's animation each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, element, isAlive, anchor, offset?.[0], offset?.[1]]);

  /* Moved, not rebuilt. */
  useEffect(() => {
    placed.current?.setLngLat(lngLat([lat, lon]));
  }, [lat, lon]);

  useEffect(() => {
    element.style.pointerEvents = interactive ? 'auto' : 'none';
    element.style.cursor = onClick === undefined ? '' : 'pointer';
    element.style.zIndex = zIndex === undefined ? '' : String(zIndex);
  }, [element, interactive, onClick, zIndex]);

  useEffect(() => {
    if (onClick === undefined) return;
    const handler = (event: MouseEvent) => {
      /*
       * Or the point chooser opens underneath the page already leaving. A GL
       * map delivers the click to the marker's element and then to the canvas
       * unless the propagation is stopped here.
       */
      event.stopPropagation();
      onClick();
    };
    element.addEventListener('click', handler);
    return () => element.removeEventListener('click', handler);
  }, [element, onClick]);

  return createPortal(children, element);
}
