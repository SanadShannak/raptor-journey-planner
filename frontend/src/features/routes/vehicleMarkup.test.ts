import { describe, expect, it } from 'vitest';
import { vehicleMarkup, VEHICLE_SIZE } from './vehicleMarkup';

/*
 * The drawing, as markup — which is the only way to check it, since it has two
 * renderers and neither of them lays anything out in a test.
 */
describe('vehicleMarkup', () => {
  it('turns only the tail, never the silhouette', () => {
    const east = vehicleMarkup('bus', 90);

    expect(east).toContain('rotate(90.0 32 32)');
    // One rotated group for the tail's outline and one for its fill, and the
    // mode icon in neither: a bus on its side halfway round a bend.
    expect(east.match(/rotate\(90\.0 32 32\)/g)).toHaveLength(2);
  });

  /*
   * The tail is a small shape in the mode's own colour laid over map tiles, and
   * over tiles of a similar tone it simply was not there. `content` is the
   * page's ink — dark on a light scheme, light on a dark one — so it is the
   * opposite of the cartography underneath either way.
   */
  it('outlines the pin in the page’s ink so it reads on a map', () => {
    const markup = vehicleMarkup('tram', 0);

    expect(markup).toContain('stroke-content');
    // Drawn behind the fills, so the join between tail and body has no seam.
    expect(markup.indexOf('stroke-content')).toBeLessThan(markup.indexOf('fill-surface'));
  });

  it('keeps the mode’s silhouette rather than a bare dot', () => {
    expect(vehicleMarkup('ferry', 0)).toContain('text-on-mode');
  });

  it('wears the mode’s own colour', () => {
    expect(vehicleMarkup('tram', 0)).toContain('text-mode-tram');
    expect(vehicleMarkup('train', 0)).toContain('text-mode-train');
  });

  it('draws at the size it advertises', () => {
    expect(vehicleMarkup('bus', 0)).toContain(`width="${VEHICLE_SIZE}"`);
  });
});
