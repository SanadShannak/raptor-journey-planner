/**
 * The silhouettes, as markup rather than as JSX.
 *
 * They have two renderers. React draws them wherever the interface does, and
 * the map needs the same shapes as raw markup, because Leaflet builds a custom
 * marker from an HTML string and never from a React tree. Written twice they
 * would be two hand-copied sets of path data, free to drift the moment one of
 * them is adjusted — so they are written once here and both renderers read the
 * same constants.
 *
 * Their own file because they are data, not components: exporting them beside
 * one costs the module its fast refresh.
 */

/** The same attributes as {@link base}, for markup assembled by hand. */
export const ICON_SVG_ATTRIBUTES =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/**
 * A walking figure mid-stride.
 *
 * A recognisable gait — leading knee bent, trailing leg extended, arms
 * counter-swinging — is what makes it read as walking rather than as a stick
 * figure falling over.
 */
export const WALK_ICON_MARKUP = `
  <circle cx="12.5" cy="3.8" r="2.1" fill="currentColor" stroke="none" />
  <path d="M10.5 22l1.2-5.4-2.4-2.6.9-4.6" />
  <path d="M14.6 22l-1.1-4.3-1.8-1.1" />
  <path d="M10.2 9.4L13 8.2l2.1 2.4 2.4.9" />
  <path d="M10.2 9.4L8 11.2 6.6 14" />
`;

/**
 * Waiting, as the same figure sitting down.
 *
 * It was an hourglass, which is a metaphor for time rather than a picture of
 * what you are doing — and beside a walking figure and a vehicle it was the one
 * icon in the set with nobody in it. Same build as the walker, at rest on a
 * bench.
 */
export const SEATED_ICON_MARKUP = `
  <circle cx="9" cy="4.4" r="2.1" fill="currentColor" stroke="none" />
  <path d="M9 7.6v5.6h5.6" />
  <path d="M14.6 13.2v5.4" />
  <path d="M9 10l3.3 1.9" />
  <path d="M4.6 13.2h4.4M6 13.2v5.4" />
`;

/**
 * One silhouette per family, so the shape alone distinguishes them.
 *
 * Every one is built on the same body-and-wheels proportion so they read as a
 * set, and differs in the single feature that identifies the vehicle: a tram's
 * pantograph, a metro's tunnel, a train's split windscreen, a ferry's hull.
 */
export const MODE_ICON_MARKUP: Record<string, string> = {
  ferry: `
    <path d="M2.5 19c1.7 0 1.7 1.4 3.4 1.4S7.6 19 9.3 19s1.7 1.4 3.4 1.4S14.4 19 16.1 19s1.7 1.4 3.4 1.4" />
    <path d="M4.6 17.2L6.2 11h11.6l1.6 6.2" />
    <path d="M8.8 11V7.4h6.4V11M12 7.4V4.2" />
  `,
  train: `
    <rect x="5" y="2.8" width="14" height="12.6" rx="3.4" />
    <path d="M12 2.8v6.4M5 9.2h14M7.5 21.2l2.6-3.4M16.5 21.2l-2.6-3.4" />
    <circle cx="8.6" cy="12.6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="12.6" r="1.1" fill="currentColor" stroke="none" />
  `,
  metro: `
    <path d="M3 20.5V12a9 9 0 0118 0v8.5" />
    <rect x="7.6" y="9" width="8.8" height="7.6" rx="1.8" />
    <path d="M7.6 12.8h8.8M7.6 20.5h8.8" />
  `,
  tram: `
    <rect x="5.6" y="4.6" width="12.8" height="12.4" rx="2.2" />
    <path d="M5.6 11h12.8M8.6 20.6l2.2-3.6M15.4 20.6l-2.2-3.6" />
    <path d="M12 4.6V2.2M8.8 2.2h6.4" />
    <circle cx="8.6" cy="14" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="14" r="1.1" fill="currentColor" stroke="none" />
  `,
  bus: `
    <rect x="3.4" y="3.6" width="17.2" height="12.8" rx="2.6" />
    <path d="M3.4 10.8h17.2M7 20.4v-4M17 20.4v-4" />
    <circle cx="7.6" cy="13.6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="16.4" cy="13.6" r="1.1" fill="currentColor" stroke="none" />
  `,
};

/** The markup for a family, falling back the way `visualForFamily` does. */
export function modeIconMarkup(family: string): string {
  return MODE_ICON_MARKUP[family] ?? (MODE_ICON_MARKUP['bus'] as string);
}

