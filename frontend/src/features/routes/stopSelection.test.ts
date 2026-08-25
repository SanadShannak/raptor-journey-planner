import { describe, expect, it } from 'vitest';
import { reconcileSelection, stopsAfter } from './stopSelection';
import type { PatternStop } from '../../types/route';

/*
 * The destination-must-follow-origin rule.
 *
 * Worth its own tests because the interesting cases are the ones a reader
 * causes by accident: moving the origin past a destination they already chose,
 * and landing on the last stop of the line where there is no destination to
 * have.
 */

const stop = (sequence: number, name = `Stop ${sequence}`): PatternStop => ({
  id: `id-${sequence}`,
  name,
  code: null,
  platform: null,
  lat: 60.17,
  lon: 24.94,
  description: null,
  fareZone: null,
  wheelchairAccessible: null,
  sequence,
  distanceFromOriginMeters: null,
});

const LINE = [stop(0), stop(1), stop(2), stop(3)];

/*
 * A pattern whose second stop had no record, so it was dropped. Positions and
 * sequences are then different numbers, and the sequence is the one that
 * matters — it is what a trip's `calls` is indexed by.
 */
const WITH_A_HOLE = [stop(0), stop(2), stop(3)];

describe('stopsAfter', () => {
  it('offers only what the vehicle reaches later', () => {
    expect(stopsAfter(LINE, 1).map((entry) => entry.sequence)).toEqual([2, 3]);
  });

  it('offers nothing beyond the end of the line', () => {
    expect(stopsAfter(LINE, 3)).toEqual([]);
  });

  it('offers everything before anything is chosen', () => {
    expect(stopsAfter(LINE, null)).toHaveLength(4);
  });

  it('counts by sequence, not by position', () => {
    expect(stopsAfter(WITH_A_HOLE, 0).map((entry) => entry.sequence)).toEqual([2, 3]);
  });
});

describe('reconcileSelection', () => {
  /* The question most people came to ask is end to end. */
  it('opens on the two ends of the line', () => {
    expect(reconcileSelection(LINE, null, null)).toEqual({ origin: 0, destination: 3 });
  });

  it('leaves a valid pair alone', () => {
    expect(reconcileSelection(LINE, 1, 2)).toEqual({ origin: 1, destination: 2 });
  });

  /*
   * The ordinary way to break the pair. The destination becomes the next stop
   * along rather than being silently left behind the origin, which would ask
   * for a journey the vehicle does not make.
   */
  it('moves the destination along when the origin overtakes it', () => {
    expect(reconcileSelection(LINE, 2, 1)).toEqual({ origin: 2, destination: 3 });
  });

  it('refuses to let the two be the same stop', () => {
    expect(reconcileSelection(LINE, 2, 2)).toEqual({ origin: 2, destination: 3 });
  });

  /*
   * Null rather than a fallback. The end of the line asks nothing, and pointing
   * the destination back up the line would be a lie about which way it runs.
   */
  it('has no destination once the origin is the last stop', () => {
    expect(reconcileSelection(LINE, 3, 1)).toEqual({ origin: 3, destination: null });
  });

  /* A variant switched underneath the selection: the sequences may not exist. */
  it('falls back to the new line’s ends when a chosen stop is not on it', () => {
    expect(reconcileSelection(WITH_A_HOLE, 1, 1)).toEqual({ origin: 0, destination: 3 });
  });

  it('answers nothing for a line with no stops', () => {
    expect(reconcileSelection([], 0, 1)).toEqual({ origin: null, destination: null });
  });

  it('has no destination on a line of exactly one stop', () => {
    expect(reconcileSelection([stop(0)], null, null)).toEqual({
      origin: 0,
      destination: null,
    });
  });
});
