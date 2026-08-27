import { useEffect } from 'react';
import { GeoJSONSource, type FilterSpecification, type LayerSpecification } from 'maplibre-gl';
import type { GeoJSON } from 'geojson';
import { useMap, useMapAlive, useStyleEpoch, useStyleReady } from './mapContext';

/** One drawn layer over a shared source, minus the parts this hook fills in. */
export type OverlayLayer = Omit<LayerSpecification, 'id' | 'source'> & {
  /** Unique within the overlay; the source id is prefixed automatically. */
  id: string;
  filter?: FilterSpecification | undefined;
};

/**
 * A GeoJSON source and the layers drawn from it, kept in step with React.
 *
 * The map's own equivalent of rendering a list: hand it data and a description
 * of how to paint it, and it appears. What it hides is the part a GL map does
 * differently from Leaflet, and the part most likely to be got wrong.
 *
 * **A style swap empties the map.** Sources and layers live inside the style
 * document, so moving from Positron to Dark Matter discards every one of them
 * — silently, since nothing errors and the map simply comes back without the
 * journey on it. `styleEpoch` counts style loads and is a dependency here, so
 * a restyle re-runs this effect and everything is added again.
 *
 * **Order is explicit, not implicit.** Leaflet had panes; here the last layer
 * added sits on top, so a casing must be added before the line it cases. The
 * layers array is drawn in order, and overlays are added in the order their
 * components are mounted.
 *
 * Data changes take the cheap path: `setData` on the existing source rather
 * than a teardown, which is what keeps a vehicle ticking twice a second from
 * rebuilding the map's layer list at the same rate.
 */
export function useGeoJson(
  id: string,
  data: GeoJSON | null,
  layers: readonly OverlayLayer[],
): void {
  const map = useMap();
  const isAlive = useMapAlive();
  const styleEpoch = useStyleEpoch();
  const styleReady = useStyleReady();

  /*
   * Serialised rather than compared by identity. Callers build these arrays
   * inline, so an identity dependency would tear the layers down on every
   * render; the shapes are small and change rarely, which is exactly when
   * stringifying is the cheaper of the two.
   */
  const shape = JSON.stringify(layers);

  useEffect(() => {
    if (data === null) return;

    const specs = JSON.parse(shape) as OverlayLayer[];

    /*
     * A style swap is in flight, so there is nothing to add to yet. This is a
     * dependency rather than a bare guard, which is the whole point: when the
     * swap finishes the flag flips, the effect runs again, and the layers come
     * back. A guard that only returned would lose them for good.
     */
    if (!styleReady) return;

    map.addSource(id, { type: 'geojson', data });
    for (const { id: layerId, ...rest } of specs) {
      map.addLayer({ ...rest, id: `${id}-${layerId}`, source: id } as LayerSpecification);
    }

    return () => {
      /*
       * Two ways these can already be gone, and both throw if asked again: the
       * style may have been replaced, which discards every layer on it, or the
       * map may have been destroyed entirely — which happens *before* this
       * cleanup, not after. A throw here takes the unmount with it. See
       * `MapHandle`.
       */
      if (!isAlive()) return;
      for (const { id: layerId } of specs) {
        const full = `${id}-${layerId}`;
        if (map.getLayer(full) !== undefined) map.removeLayer(full);
      }
      if (map.getSource(id) !== undefined) map.removeSource(id);
    };
    // `data` is applied by the effect below rather than rebuilding the layers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, shape, styleEpoch, styleReady, isAlive, data === null]);

  /* New data into the source that is already there. */
  useEffect(() => {
    if (data === null) return;
    const source = map.getSource(id);
    if (!(source instanceof GeoJSONSource)) return;
    source.setData(data);
  }, [map, id, data, styleEpoch, styleReady]);
}
