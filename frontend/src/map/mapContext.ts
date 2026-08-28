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
  /**
   * Whether the style is settled enough to take sources and layers.
   *
   * Deliberately **not** `map.isStyleLoaded()`, which asks a different
   * question than it appears to: it is false while *any* source is still
   * loading, and adding a source is exactly what makes one. So the first
   * overlay to be added turned the answer false and every later one in the
   * same commit was refused — permanently, since nothing it depended on
   * changed again. The stop circles never drew once.
   *
   * This says only "no style swap is in flight", which is the thing that
   * actually makes `addSource` throw.
   */
  styleReady: boolean;
  /**
   * Whether the map is still usable.
   *
   * False from the moment it is torn down, and the reason is an ordering that
   * is easy to get wrong twice.
   *
   * React runs a component's effect cleanups **in the order the effects were
   * declared**, and unmounts a deleted subtree **parent first**. `MapCanvas`
   * creates the map in its first effect, so that effect's cleanup — the one
   * that destroys it — runs before every other cleanup in the map's own
   * component *and* before every cleanup in every child drawn on it. Each of
   * those then politely tidies up after itself against an object that no
   * longer has any internals, and `map.off(…)` throws.
   *
   * A throw in a passive cleanup is not contained: it takes the unmount with
   * it, and what a reader sees is a blank page after navigating away from a
   * map — nowhere near the map, and after the thing that caused it.
   *
   * So teardown is announced rather than discovered, and asked as a question
   * rather than read as a value: a cleanup needs the answer *at the moment it
   * runs*, which is exactly what makes reading a captured `.current` look like
   * the mistake it usually is.
   */
  isAlive: () => boolean;
  /**
   * Whether this is the first framing since the map was created, consuming
   * the answer: the first caller gets `true` and everyone after it `false`.
   *
   * Owned by the map rather than by each component that frames it, and that
   * is the point. Framing is one behaviour with two meanings. The first is not
   * a *movement* — it is the map arriving where it was always supposed to be,
   * because what it should show is not known until the network answers and the
   * journey or line arrives, both of which are after the map exists. A reader
   * who watches that happen sees the page zoom itself on the way in, every
   * time, and nothing is communicated by it.
   *
   * Everything after is a real movement — a stop was pressed, a run is being
   * followed — and should animate, because the point is to show the map went
   * somewhere. Kept per component, each would claim its own free placement:
   * pressing "follow" mounts a different component, and it would snap to the
   * vehicle rather than travelling to it.
   *
   * Callers keep their `prefers-reduced-motion` gate and ask this as well.
   */
  isFirstFraming: () => boolean;
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

/** Whether the style will accept sources and layers. See {@link MapHandle}. */
export function useStyleReady(): boolean {
  return useHandle().styleReady;
}

/** Asks whether this is the map's opening frame. See {@link MapHandle}. */
export function useFirstFraming(): () => boolean {
  return useHandle().isFirstFraming;
}

/**
 * Asks whether the map is still there to be spoken to.
 *
 * Every cleanup that touches the map has to check this. See {@link MapHandle}.
 */
export function useMapAlive(): () => boolean {
  return useHandle().isAlive;
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
  const isAlive = useMapAlive();
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
      // Nothing to unsubscribe from once the map is gone. See `MapHandle`.
      if (!isAlive()) return;
      map.off(type, listener);
    };
  }, [map, type, isAlive]);
}
