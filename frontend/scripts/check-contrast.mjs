/**
 * Verifies that the design tokens in src/styles/index.css meet WCAG 2.1 AA
 * contrast in both colour schemes.
 *
 * Token values are parsed straight out of the stylesheet, so this cannot drift
 * from what ships. The pairs below say which combinations the UI actually
 * uses — add a pair whenever a new foreground/background combination appears.
 *
 * Run with `npm run check:contrast`. Exits non-zero on any failure.
 * Zero dependencies; oklch conversion is inlined.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AA_TEXT = 4.5; // WCAG 1.4.3, body text
const AA_UI = 3.0; // WCAG 1.4.11, UI component boundaries and large text

/** Foreground, background, and the threshold the pair must clear. */
const PAIRS = [
  ['content', 'surface', AA_TEXT],
  ['content', 'surface-muted', AA_TEXT],
  ['content', 'surface-raised', AA_TEXT],
  ['content-muted', 'surface', AA_TEXT],
  ['content-muted', 'surface-muted', AA_TEXT],
  ['content-muted', 'surface-raised', AA_TEXT],
  ['danger', 'surface', AA_TEXT],
  ['danger', 'surface-raised', AA_TEXT],
  ['success', 'surface', AA_TEXT],
  ['success', 'surface-raised', AA_TEXT],
  ['brand-500', 'surface', AA_TEXT],
  ['brand-500', 'surface-raised', AA_TEXT],
  ['content', 'brand-50', AA_TEXT],
  ['content', 'brand-100', AA_TEXT],
  // The filled control, and the label on it. Both schemes fill with a
  // different lightness, so this is checked through the tokens rather than
  // against a hardcoded white.
  ['brand-fill', 'surface', AA_UI],
  ['on-brand', 'brand-fill', AA_TEXT],
  // The orange is a fill, never text: `accent` is only ever checked with
  // `on-accent` written on it, and `accent-strong` is the one allowed on a
  // surface.
  ['on-accent', 'accent', AA_TEXT],
  ['accent-strong', 'surface', AA_TEXT],
  // App chrome is its own surface, so anything placed on a bar is checked
  // against the bar rather than against the page.
  ['on-chrome', 'chrome', AA_TEXT],
  ['accent', 'chrome', AA_TEXT],
  ['chrome-border', 'chrome', AA_UI],
  ['border-strong', 'surface', AA_UI],
  ['border-strong', 'surface-raised', AA_UI],
];

function oklchToLinearRgb(lightness, chroma, hue) {
  const h = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(Math.max(channel, 0), 1));
}

const toSrgb = (channel) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

const fromSrgb = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** A token value is either parsed oklch coordinates or parsed sRGB channels. */
function toLinearRgb(value) {
  return value.kind === 'oklch'
    ? oklchToLinearRgb(...value.coords)
    : value.channels.map((channel) => fromSrgb(channel / 255));
}

function oklchToHex(l, c, h) {
  return oklchToLinearRgb(l, c, h)
    .map((channel) => Math.round(Math.min(Math.max(toSrgb(channel), 0), 1) * 255))
    .reduce((hex, channel) => hex + channel.toString(16).padStart(2, '0'), '#');
}

function relativeLuminance(value) {
  const [r, g, b] = toLinearRgb(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE_OKLCH = { kind: 'oklch', coords: [1, 0, 0] };
const WHITE_HEX = { kind: 'srgb', channels: [255, 255, 255] };

/**
 * Collects token declarations from one region of the stylesheet.
 *
 * The stylesheet declares the light palette as `--color-*` and the dark
 * palette as `--dark-*`, each exactly once. Dark only names the tokens that
 * actually differ, so the dark palette is the light one with those applied on
 * top — the same thing the cascade does at runtime.
 */
function parseRegion(css, colorPattern, darkPattern, toValue, white) {
  const light = { white };
  for (const match of css.matchAll(colorPattern)) {
    light[match[1]] = toValue(match);
  }

  const dark = { ...light };
  for (const match of css.matchAll(darkPattern)) {
    dark[match[1]] = toValue(match);
  }

  return { light, dark };
}

const stylesheet = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/styles/index.css',
);
const css = readFileSync(stylesheet, 'utf8');

/*
 * The oklch tokens and the sRGB fallbacks live in separate regions of the
 * file, so each is parsed from its own slice. Splitting at the @supports rule
 * keeps the two palettes from contaminating each other.
 */
const fallbackStart = css.indexOf('@supports not (color: oklch');
if (fallbackStart === -1) {
  console.error('Could not find the @supports fallback block in index.css.');
  process.exit(1);
}

const oklchValue = (m) => ({
  kind: 'oklch',
  coords: [Number(m[2]), Number(m[3]), Number(m[4])],
});

const hexValue = (m) => ({
  kind: 'srgb',
  channels: [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16)),
});

const modern = parseRegion(
  css.slice(0, fallbackStart),
  /--color-([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  /--dark-([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  oklchValue,
  WHITE_OKLCH,
);

const fallback = parseRegion(
  css.slice(fallbackStart),
  /--color-([\w-]+):\s*#([0-9a-f]{6})\b/gi,
  /--dark-([\w-]+):\s*#([0-9a-f]{6})\b/gi,
  hexValue,
  WHITE_HEX,
);

let failures = 0;

function checkPalette(label, palettes) {
  for (const [schemeName, tokens] of Object.entries(palettes)) {
    console.log(`\n${label} · ${schemeName}`);
    for (const [foreground, background, required] of PAIRS) {
      const fg = tokens[foreground];
      const bg = tokens[background];

      if (!fg || !bg) {
        console.log(`  MISSING TOKEN  ${foreground} on ${background}`);
        failures += 1;
        continue;
      }

      const ratio = contrastRatio(fg, bg);
      const passed = ratio >= required;
      if (!passed) failures += 1;
      console.log(
        `  ${passed ? 'pass' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  ` +
          `(need ${required.toFixed(1)})  ${foreground} on ${background}`,
      );
    }
  }
}

checkPalette('oklch', modern);
checkPalette('sRGB fallback', fallback);

/*
 * The fallbacks are meant to be the same colours, not merely colours that also
 * pass. Anything further than a rounding step apart means one palette was
 * edited without the other.
 */
console.log('\nfallback fidelity');
for (const scheme of ['light', 'dark']) {
  for (const [name, value] of Object.entries(modern[scheme])) {
    if (name === 'white') continue;
    const actual = fallback[scheme][name];
    if (!actual) {
      console.log(`  MISSING  ${scheme} --color-${name} has no sRGB fallback`);
      failures += 1;
      continue;
    }
    const expected = oklchToHex(...value.coords);
    const drift = Math.max(
      ...actual.channels.map((channel, i) =>
        Math.abs(channel - parseInt(expected.slice(1 + i * 2, 3 + i * 2), 16)),
      ),
    );
    if (drift > 2) {
      console.log(
        `  DRIFT  ${scheme} --color-${name}: expected ${expected}, found #` +
          actual.channels.map((c) => c.toString(16).padStart(2, '0')).join(''),
      );
      failures += 1;
    }
  }
}
if (failures === 0) console.log('  all fallbacks match their oklch source');

/*
 * Dark mode is reachable through the media query and through the
 * `data-theme` attribute, so the stylesheet maps the dark palette onto the
 * semantic tokens twice. The values are single-source, but the two mapping
 * blocks still have to list the same tokens — a token added to one and not the
 * other produces a theme that differs depending on how it was entered.
 */
console.log('\ndark mapping blocks');
const mappings = [
  ...css.matchAll(/(?::root:not\(\[data-theme='light'\]\)|:root\[data-theme='dark'\])\s*\{([^}]*)\}/g),
].map(([, body]) => [...body.matchAll(/--color-([\w-]+):\s*var\(--dark-[\w-]+\)/g)].map((m) => m[1]));

if (mappings.length !== 2) {
  console.log(`  MISSING  expected 2 dark mapping blocks, found ${mappings.length}`);
  failures += 1;
} else if (mappings[0].join() !== mappings[1].join()) {
  const [viaMedia, viaAttribute] = mappings;
  const only = (a, b) => a.filter((token) => !b.includes(token));
  console.log(
    `  MISMATCH  media query only: [${only(viaMedia, viaAttribute)}], ` +
      `data-theme only: [${only(viaAttribute, viaMedia)}]`,
  );
  failures += 1;
} else {
  console.log(`  both blocks map the same ${mappings[0].length} tokens`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll contrast checks passed.');
