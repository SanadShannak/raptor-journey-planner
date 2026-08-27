/**
 * A design token, as a colour MapLibre can actually paint with.
 *
 * The rest of the app names colours the way the stylesheet does — `mode-bus`,
 * `surface` — and lets Tailwind turn that into a class. A GL map cannot: its
 * paint properties take a colour *value*, so somewhere the token has to become
 * one, and this is the only place that happens.
 *
 * Resolved from the live document rather than from a table copied out of
 * `index.css`. A second copy of the palette would be free to drift from the
 * first, and worse, it could not answer the question that actually matters
 * here — which scheme is in force. The tokens are remapped by two rules, a
 * `prefers-color-scheme` query and a `:root[data-theme]` one, so the value of
 * `--color-mode-bus` depends on state that only the document knows.
 *
 * The reading is done through a probe element rather than by asking for the
 * custom property directly. `getPropertyValue('--color-mode-bus')` hands back
 * whatever the token was *authored* as, which in dark mode is the literal text
 * `var(--dark-mode-bus)` — a string, not a colour. Setting `color` on a real
 * element and reading it back makes the browser do the substitution, which is
 * the whole point of asking it.
 *
 * The answer is then converted by **painting it and reading the pixel back**.
 *
 * That is heavier than it looks like it needs to be, and the lighter version
 * is a trap. Every token in this sheet is `oklch()`, which is inside the
 * browser baseline; MapLibre's own colour parser is older and rejects it
 * outright — `line-color: color expected, "oklch(1 0 0)" found`, at which
 * point the layer is dropped and the map draws the basemap and nothing else.
 *
 * The obvious normaliser is `ctx.fillStyle = value` and reading it back, since
 * that historically returned `#rrggbb`. It does not here: Chromium accepts
 * `oklch` and serialises it back *as* `oklch`, so the round trip returns the
 * string unchanged and the whole exercise is a no-op that looks like it
 * worked. Painting one pixel and sampling it goes through the compositor
 * instead, which has to produce real channel values whatever colour space it
 * was given.
 */

/** Where a resolved colour lands when the document cannot answer. */
const FALLBACK = '#666666';

/**
 * One probe and one canvas for the life of the page.
 *
 * Both are cheap to keep and expensive to churn: a fresh element per lookup
 * would force layout on every one, and this runs once per token per scheme.
 * Created lazily so importing the module does nothing in jsdom.
 */
let probe: HTMLSpanElement | null = null;
let canvas: CanvasRenderingContext2D | null = null;
/**
 * Whether asking for a 2D context has already failed.
 *
 * Asked once, not once per lookup. jsdom has no canvas implementation and
 * complains to the console every time one is requested, which turned a test
 * run into pages of the same warning — and a context that was unavailable a
 * moment ago is not going to appear later in the same document.
 */
let canvasUnavailable = false;

function probeElement(): HTMLSpanElement | null {
  if (typeof document === 'undefined') return null;
  if (probe !== null) return probe;

  probe = document.createElement('span');
  /*
   * Out of the layout and out of the accessibility tree. `display: none` would
   * be simpler and is wrong — a hidden element has no computed colour to read.
   */
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;width:0;height:0;pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);
  return probe;
}

function context2d(): CanvasRenderingContext2D | null {
  if (canvas !== null) return canvas;
  if (canvasUnavailable || typeof document === 'undefined') return null;

  let found: CanvasRenderingContext2D | null = null;
  try {
    const element = document.createElement('canvas');
    element.width = 1;
    element.height = 1;
    // Read back on every call, so say so — without it Chromium warns about
    // stalling the GPU on each one.
    found = element.getContext('2d', { willReadFrequently: true });
  } catch {
    found = null;
  }

  if (found === null) {
    canvasUnavailable = true;
    return null;
  }
  canvas = found;
  return canvas;
}

function normalise(value: string): string | null {
  if (value.trim() === '') return null;

  const ctx = context2d();
  if (ctx === null) return null;

  /*
   * Cleared first, because the pixel is reused. `fillStyle` also rejects
   * silently — an unparseable value leaves the previous one standing rather
   * than throwing — so a stale colour would otherwise be returned as though it
   * were this token's.
   */
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);

  let pixel: Uint8ClampedArray;
  try {
    pixel = ctx.getImageData(0, 0, 1, 1).data;
  } catch {
    return null;
  }

  const [r, g, b, a] = pixel;
  if (r === undefined || g === undefined || b === undefined || a === undefined) {
    return null;
  }
  // Nothing was painted at all, which means nothing was understood.
  if (a === 0) return null;

  const hex = (channel: number) => channel.toString(16).padStart(2, '0');
  if (a === 255) return `#${hex(r)}${hex(g)}${hex(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/**
 * The colour a token currently stands for, in the scheme currently in force.
 *
 * Not cached across calls. The value depends on the document's theme, and a
 * cache would need invalidating on exactly the events the callers already
 * re-render for — so the callers memoise on the resolved scheme instead, which
 * is the thing that actually changes.
 */
export function tokenColor(token: string): string {
  const element = probeElement();
  if (element === null) return FALLBACK;

  element.style.color = '';
  element.style.color = `var(--color-${token})`;

  const computed = window.getComputedStyle(element).color;
  return normalise(computed) ?? FALLBACK;
}
