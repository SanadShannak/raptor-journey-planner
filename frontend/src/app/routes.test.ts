import { describe, expect, it } from 'vitest';
import { linePath, lineVariantPath, stopPath } from './routes';

describe('path builders', () => {
  it('encodes data placed in a path segment', () => {
    expect(stopPath('1020444')).toBe('/stops/1020444');
    // A stop id is feed data, not a literal — it may contain anything.
    expect(stopPath('a/b')).toBe('/stops/a%2Fb');
    expect(linePath('bus-550')).toBe('/routes/bus-550');
    expect(linePath('bus-5 A')).toBe('/routes/bus-5%20A');
  });

  it('puts the variant in a search param so it is linkable', () => {
    expect(lineVariantPath('tram-4T', 51)).toBe('/routes/tram-4T?variant=51');
  });

  /*
   * lineId stays opaque. Two mode slugs contain a hyphen of their own, so any
   * attempt to split one into mode and designation is wrong for them — and the
   * mode always arrives on the response anyway.
   */
  it('passes slugs that contain a hyphen through untouched', () => {
    expect(linePath('cable-tram-1')).toBe('/routes/cable-tram-1');
    expect(linePath('cable-car-7')).toBe('/routes/cable-car-7');
  });
});
