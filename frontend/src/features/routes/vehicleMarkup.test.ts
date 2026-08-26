import { describe, expect, it } from 'vitest';
import { vehicleMarkup, VEHICLE_SIZE } from './vehicleMarkup';

/*
 * The drawing, as markup — which is the only way to check it, since it has two
 * renderers and neither of them lays anything out in a test.
 */
describe('vehicleMarkup', () => {
  it('turns only the tail, never the silhouette', () => {
    const east = vehicleMarkup('bus', 90, '550');

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
    const markup = vehicleMarkup('tram', 0, '550');

    expect(markup).toContain('stroke-content');
    // Drawn behind the fills, so the join between tail and body has no seam.
    expect(markup.indexOf('stroke-content')).toBeLessThan(markup.indexOf('fill-surface'));
  });

  /*
   * The designation, not the mode's silhouette. On a line's own page every
   * vehicle is the same mode; what a reader needs on a map showing several is
   * *which* line. The mode is still in the colour, and a number is not a hue.
   */
  it('carries the line’s designation', () => {
    expect(vehicleMarkup('bus', 0, '550')).toContain('>550<');
  });

  /*
   * A designation is one to five characters and every one of them has to fit.
   * `textLength` holds the width whatever the size chosen, so an unanticipated
   * one is squeezed rather than allowed to break out of the disc.
   */
  it('fits a long designation inside the disc', () => {
    const long = vehicleMarkup('bus', 0, '996K');

    expect(long).toContain('>996K<');
    expect(long).toContain('textLength="20"');
    // Smaller than a two-character one, so five do not become five slivers.
    const size = (markup: string) => Number(/font-size="(\d+)"/.exec(markup)?.[1]);
    expect(size(long)).toBeLessThan(size(vehicleMarkup('bus', 0, '2')));
  });

  /*
   * A single glyph is nowhere near `LABEL_WIDTH` at its own size, so forcing
   * it out to fill the same width every longer designation is squeezed to
   * stretches the one character sideways instead of holding a width nothing
   * was overflowing.
   */
  it('draws a single character at its own width, unstretched', () => {
    const digit = vehicleMarkup('bus', 0, '7');
    const letter = vehicleMarkup('bus', 0, 'A');

    expect(digit).not.toContain('textLength');
    expect(digit).not.toContain('lengthAdjust');
    expect(letter).not.toContain('textLength');
    expect(letter).not.toContain('lengthAdjust');

    // A two-character designation still gets the squeeze, so it never
    // overflows the disc.
    expect(vehicleMarkup('bus', 0, '56')).toContain('textLength="20"');
  });

  /* A designation is data until it is markup, and this file writes markup. */
  it('escapes a designation that would otherwise be markup', () => {
    expect(vehicleMarkup('bus', 0, 'A&<B')).toContain('A&amp;&lt;B');
  });

  it('wears the mode’s own colour', () => {
    expect(vehicleMarkup('tram', 0, '550')).toContain('text-mode-tram');
    expect(vehicleMarkup('train', 0, '550')).toContain('text-mode-train');
  });

  it('draws at the size it advertises', () => {
    expect(vehicleMarkup('bus', 0, '550')).toContain(`width="${VEHICLE_SIZE}"`);
  });
});
