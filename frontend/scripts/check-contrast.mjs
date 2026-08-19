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
  ['brand-500', 'surface', AA_UI],
  ['white', 'brand-500', AA_TEXT],
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

function relativeLuminance([l, c, h]) {
  const [r, g, b] = oklchToLinearRgb(l, c, h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Collects `--color-*: oklch(...)` declarations. The stylesheet declares the
 * light scheme first and then redeclares a subset inside the dark media query,
 * so parsing in source order and letting later values win reproduces exactly
 * what the browser resolves for each scheme.
 */
function parseTokens(css) {
  const darkBlockStart = css.indexOf('@media (prefers-color-scheme: dark)');
  const declaration = /--color-([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g;

  const light = { white: [1, 0, 0] };
  const dark = { white: [1, 0, 0] };

  for (const match of css.matchAll(declaration)) {
    const [, name, l, c, h] = match;
    const value = [Number(l), Number(c), Number(h)];
    if (match.index < darkBlockStart) light[name] = value;
    dark[name] = value;
  }
  return { light, dark };
}

const stylesheet = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/styles/index.css',
);
const { light, dark } = parseTokens(readFileSync(stylesheet, 'utf8'));

let failures = 0;

for (const [schemeName, tokens] of [
  ['light', light],
  ['dark', dark],
]) {
  console.log(`\n${schemeName}`);
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

if (failures > 0) {
  console.error(`\n${failures} contrast check(s) failed.`);
  process.exit(1);
}
console.log('\nAll contrast checks passed.');
