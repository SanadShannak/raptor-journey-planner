import { useEffect, useMemo, useState } from 'react';
import type { MultiPolygon, Feature } from 'geojson';
import type { ServiceArea } from '../types/network';
import { loadServiceArea } from './serviceAreaCache';
import { useTheme } from '../theme';
import { tokenColor } from './tokenColor';
import { useGeoJson, type OverlayLayer } from './useGeoJson';

/**
 * The network's outline: everywhere a journey can start or end.
 *
 * Drawn on every map, beneath everything else on it, so that somebody choosing
 * a point can see before they press whether the planner will take it. It is
 * the planner's own rule, not an approximation of it: inside, a journey is
 * always planned — from the nearest few stops, walking further if it must —
 * and outside, the planner answers "out of the network", and the message says
 * to come back inside the line.
 *
 * An enhancement and nothing more. A map without it — the area failed to load,
 * or the backend is older than the endpoint — is the map as it always was, and
 * the out-of-network message still says what went wrong in words.
 */
export function ServiceAreaLayer() {
  const { resolved } = useTheme();
  const [area, setArea] = useState<ServiceArea | null>(null);

  useEffect(() => {
    let current = true;
    void loadServiceArea().then((loaded) => {
      if (current) setArea(loaded);
    });
    return () => {
      current = false;
    };
  }, []);

  const data = useMemo<Feature<MultiPolygon> | null>(
    () =>
      area === null
        ? null
        : {
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiPolygon', coordinates: area.polygons },
          },
    [area],
  );

  /*
   * Rebuilt when the scheme changes, because the colours are resolved values
   * rather than class names. The fill is barely there — enough to tell inside
   * from outside at a glance without tinting the city it lies over — and the
   * line carries the meaning.
   */
  const layers = useMemo<OverlayLayer[]>(() => {
    void resolved;
    const ink = tokenColor('brand-500');
    return [
      {
        id: 'fill',
        type: 'fill',
        paint: { 'fill-color': ink, 'fill-opacity': 0.05 },
      },
      {
        id: 'edge',
        type: 'line',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ink,
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.25, 14, 2.5],
          'line-dasharray': [3, 2],
        },
      },
    ];
  }, [resolved]);

  useGeoJson('service-area', data, layers, { beneathLabels: true });

  return null;
}
