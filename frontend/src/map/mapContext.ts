import { createContext, useContext, useEffect, useRef } from 'react';
import type { Map as GlMap, MapEventType } from 'maplibre-gl';

/**
 * The map instance, and how many times its style has been (re)loaded.
 *
 * Both, together, because a GL map has a lifecycle Leaflet did not: **setting a
 * style throws away every source and layer on it.** The tiles are one document
 * and the journey drawn over them is another, and swapping the first discards
 * the second — so anything that adds a source has to add it again afterwards,
 * and needs telling when afterwards is.
 *
 * That is what `styleEpoch` is. It counts style loads, and every hook that owns
 * a source lists it as a dependency, which turns "re-add my layers when the
 * scheme changes" into ordinary React: the effect re-runs because a value it
 * depends on changed.
 *
 * Markers do not need it. A marker is an HTML element the map positions, not
 * something inside the style document, so it survives a restyle untouched.
 */
export interface MapHandle {
  map: GlMap;
  styleEpoch: number;
}

export const MapContext = createContext<MapHandle | null>(null);

function useHandle(): MapHandle {
  const value = useContext(MapContext);
  if (value === null) {
    throw new Error('Map hooks must be called inside a MapCanvas.');
  }
  return value;
}

/**
 * The map this component is drawn on.
 *
 * Throws rather than returning null. Every caller is a child of `MapCanvas`,
 * which renders none of them until the map exists — so a null here is a
 * component mounted somewhere it cannot work, and a clear failure beats a
 * silent no-op that looks like a drawing bug.
 */
export function useMap(): GlMap {
  return useHandle().map;
}

/** How many times the style has loaded. See {@link MapHandle}. */
export function useStyleEpoch(): number {
  return useHandle().styleEpoch;
}

/**
 * One map event, subscribed for as long as the component is mounted.
 *
 * The handler is kept in a ref rather than listed as a dependency, so a caller
 * writing its handler inline — which all of them do — does not resubscribe on
 * every render.
 */
export function useMapEvent<T extends keyof MapEventType>(
  type: T,
  handler: (event: MapEventType[T]) => void,
): void {
  const map = useMap();
  const latest = useRef(handler);

  /*
   * Updated in an effect rather than during render. Writing a ref while
   * rendering is a side effect, and under StrictMode's double render it
   * happens twice — harmless here, but the rule that catches it is worth
   * keeping on, so this takes the boring path.
   */
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    const listener = (event: MapEventType[T]) => latest.current(event);
    map.on(type, listener);
    return () => {
      map.off(type, listener);
    };
  }, [map, type]);
}
