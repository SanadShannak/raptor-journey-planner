import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import { MapCanvas } from './MapCanvas';
import { useMap } from './mapContext';
import { forgetWebGlSupport } from './webgl';
import { created, forgetMaps } from '../test/mapStub';

/*
 * What happens when the browser cannot draw a map.
 *
 * These maps are vector — geometry and a stylesheet, drawn on the GPU — so a
 * browser without WebGL2 has no map at all, and MapLibre says so by refusing
 * to construct. Left alone, that error escapes the effect that built it, React
 * unwinds, and the reader loses the *whole page*: the itinerary, the departure
 * board, the stop list, none of which needed a map.
 *
 * That is the failure these guard against, and it is worth being precise about
 * which half matters. The fallback panel is the visible part; the part that
 * earns its keep is everything around the map still being there.
 */

/** Something only a working map could have drawn. */
function Drawn() {
  useMap();
  return <p>drawn on the map</p>;
}

function show() {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <div>
          <h1>the page around it</h1>
          <MapCanvas network="hsl">
            <Drawn />
          </MapCanvas>
        </div>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

/** Takes WebGL away, the way a hardened browser or a blocked driver does. */
function withoutWebGl() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    type: string,
  ) {
    if (type === 'webgl2') return null;
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext);
}

beforeEach(() => {
  forgetMaps();
  forgetWebGlSupport();
});

afterEach(() => {
  vi.restoreAllMocks();
  forgetWebGlSupport();
});

describe('a browser that cannot draw a map', () => {
  it('says so where the map would be', async () => {
    withoutWebGl();
    show();
    await act(async () => {});

    expect(screen.getByText('The map cannot be shown here')).toBeTruthy();
  });

  /*
   * The whole point. A blank page was the old behaviour, and the thing lost
   * was never the map — it was the journey written out beside it.
   */
  it('leaves the rest of the page standing', async () => {
    withoutWebGl();
    show();
    await act(async () => {});

    expect(screen.getByRole('heading', { name: 'the page around it' })).toBeTruthy();
  });

  /* No map means nothing may be drawn on one, and nothing may try. */
  it('draws nothing on a map that does not exist', async () => {
    withoutWebGl();
    show();
    await act(async () => {});

    expect(screen.queryByText('drawn on the map')).toBeNull();
    expect(created).toHaveLength(0);
  });

  /*
   * The probe answers whether a context can be had, which is necessary and not
   * sufficient: a blocklisted driver hands one over and then fails to start a
   * renderer on it. Being wrong that way used to cost the page too.
   */
  it('survives a renderer that refuses to start despite the probe', async () => {
    const { Map: StubMap } = await import('../test/mapStub');
    vi.spyOn(StubMap.prototype, 'resize').mockImplementation(() => {
      throw new Error('renderer would not start');
    });
    // The pool builds the map, and building is what throws for a blocked
    // driver — simulated here at the first call the canvas makes into it.
    vi.spyOn(StubMap.prototype, 'on').mockImplementation(() => {
      throw new Error('renderer would not start');
    });

    show();
    await act(async () => {});

    expect(screen.getByRole('heading', { name: 'the page around it' })).toBeTruthy();
    expect(screen.getByText('The map cannot be shown here')).toBeTruthy();
  });
});

describe('a browser that can', () => {
  it('draws the map and what is on it', async () => {
    show();
    await act(async () => {});

    expect(screen.queryByText('The map cannot be shown here')).toBeNull();
    expect(screen.getByText('drawn on the map')).toBeTruthy();
  });
});
