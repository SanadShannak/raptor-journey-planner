import { describe, expect, it } from 'vitest';
import type { Map as GlMap } from 'maplibre-gl';
import { Map as StubMap } from './../test/mapStub';
import { showMoreLabels } from './labelDensity';

/** A basemap in CARTO's own order: place names under the street names. */
function cartoLike() {
  const map = new StubMap({} as never);
  for (const [id, type] of [
    ['background', 'background'],
    ['place_suburbs', 'symbol'],
    ['place_city_r6', 'symbol'],
    ['roadname_sec', 'symbol'],
    ['roadname_pri', 'symbol'],
  ] as const) {
    map.addLayer({ id, type, source: 'carto' });
  }
  map.setLayerZoomRange('roadname_sec', 15, 24);
  return map;
}

const order = (map: StubMap) => map.getStyle().layers.map((layer) => layer.id);

describe('showMoreLabels', () => {
  it('names streets earlier than the basemap does', () => {
    const map = cartoLike();
    showMoreLabels(map as unknown as GlMap);
    expect(map.getLayer('roadname_sec')).toMatchObject({ minzoom: 13, maxzoom: 24 });
  });

  /*
   * Labels are placed from the top layer down. Left under the streets, the
   * district names lost every collision once streets were named this early.
   */
  it('puts place names above street names, keeping their own order', () => {
    const map = cartoLike();
    showMoreLabels(map as unknown as GlMap);
    expect(order(map)).toEqual([
      'background',
      'roadname_sec',
      'roadname_pri',
      'place_suburbs',
      'place_city_r6',
    ]);
  });

  it('leaves a style without those layers alone', () => {
    const map = new StubMap({} as never);
    map.addLayer({ id: 'route-line', type: 'line', source: 'route' });
    showMoreLabels(map as unknown as GlMap);
    expect(order(map)).toEqual(['route-line']);
  });
});
