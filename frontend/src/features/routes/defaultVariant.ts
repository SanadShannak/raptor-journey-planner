import type { LineVariant } from '../../types/route';

/**
 * Which variant to open a line on when the address names none.
 *
 * `/api/routes/:lineId` orders variants **busiest first**, so taking the first
 * one is nearly always right: it is the everyday service rather than a short
 * working or a depot run. The exception is what this function exists for.
 *
 * A line's busiest variant is busiest over the *dataset*, not today. Seasonal
 * and school-term patterns can out-trip the everyday one across a feed while
 * running on none of the days anybody is looking at — so a line the browser
 * lists as "active today" could open on a variant that is not, and the panel
 * would correctly report no service on a line that is running. The list said
 * one thing and the page said another, which is the kind of disagreement a
 * reader resolves by deciding the app is wrong.
 *
 * So: the busiest variant that **runs today**, falling back to the busiest
 * overall. The fallback is not a failure — a line that genuinely runs on no
 * day in the feed has nothing active to offer, and showing its main variant
 * with an honest "does not run today" is the right answer for it.
 *
 * `serviceDates` is on the summary rather than only on the variant in full
 * precisely so this choice can be made without a request per variant.
 *
 * @param today Today on the **network's** clock, or null before
 *   `/api/network` answers. Null falls back to the busiest, because the
 *   browser's idea of today is not the network's and a wrong day here would
 *   pick a wrong variant with more confidence than no day at all.
 */
export function defaultPatternId(
  variants: readonly LineVariant[],
  today: string | null,
): number | null {
  if (variants.length === 0) return null;

  if (today !== null) {
    const active = variants.find((variant) => variant.serviceDates.includes(today));
    if (active !== undefined) return active.patternId;
  }

  return variants[0]?.patternId ?? null;
}
