import { describe, expect, it } from 'vitest';
import type { LineVariant } from '../../types/route';
import { defaultPatternId } from './defaultVariant';

/** A variant summary, with only the fields this choice reads. */
const variant = (patternId: number, serviceDates: string[]): LineVariant => ({
  patternId,
  directionId: 0,
  headsign: null,
  originStopName: null,
  terminusStopName: null,
  stopCount: 10,
  tripCount: null,
  firstDeparture: null,
  lastDeparture: null,
  serviceDates,
});

const TODAY = '2026-10-08';

describe('defaultPatternId', () => {
  /*
   * The ordinary case, and the reason the fallback is the *first* entry:
   * `/api/routes/:lineId` orders variants busiest first, so it is the everyday
   * service rather than a short working.
   */
  it('takes the busiest variant when it runs today', () => {
    expect(
      defaultPatternId([variant(0, [TODAY]), variant(1, [TODAY])], TODAY),
    ).toBe(0);
  });

  /*
   * **The case this exists for.** A seasonal or school-term pattern can
   * out-trip the everyday one across a whole feed while running on none of the
   * days anybody is looking at — so the busiest variant is not necessarily
   * today's, and a line listed as "active today" would open on one that is not.
   */
  it('skips a busier variant that does not run today', () => {
    expect(
      defaultPatternId(
        [variant(0, ['2026-06-01']), variant(1, [TODAY]), variant(2, [TODAY])],
        TODAY,
      ),
    ).toBe(1);
  });

  /*
   * Not a failure. A line that runs on no day in the feed has nothing active
   * to offer, and its main variant with an honest "does not run today" is the
   * right answer rather than an empty panel.
   */
  it('falls back to the busiest when nothing runs today', () => {
    expect(
      defaultPatternId([variant(7, ['2026-06-01']), variant(8, ['2026-06-02'])], TODAY),
    ).toBe(7);
  });

  /*
   * The browser's today is not the network's, and a wrong day would pick a
   * wrong variant with more confidence than no day at all.
   */
  it('falls back to the busiest before the network clock is known', () => {
    expect(defaultPatternId([variant(3, [TODAY]), variant(4, [TODAY])], null)).toBe(3);
  });

  it('has nothing to offer for a line with no variants', () => {
    expect(defaultPatternId([], TODAY)).toBeNull();
  });

  /* A variant whose services have expired carries an empty list, not null. */
  it('ignores a variant that runs on no day at all', () => {
    expect(defaultPatternId([variant(0, []), variant(1, [TODAY])], TODAY)).toBe(1);
  });
});
