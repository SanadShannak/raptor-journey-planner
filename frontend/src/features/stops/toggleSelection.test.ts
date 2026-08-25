import { describe, expect, it } from 'vitest';
import { toggleSelection } from './toggleSelection';

const ALL = ['bus', 'tram', 'metro'];
const set = (...values: string[]) => new Set(values);
const sorted = (value: ReadonlySet<string>) => [...value].sort();

describe('toggleSelection', () => {
  /*
   * From "everything", a press is a choice of one thing — not a rejection of
   * one. Every option is drawn as on, so "all but tram" is not what pressing
   * tram looks like it should do.
   */
  it('narrows to the one pressed when nothing is chosen yet', () => {
    expect(sorted(toggleSelection(set(), 'tram', ALL))).toEqual(['tram']);
  });

  it('adds and removes once a choice has been made', () => {
    expect(sorted(toggleSelection(set('tram'), 'bus', ALL))).toEqual(['bus', 'tram']);
    expect(sorted(toggleSelection(set('bus', 'tram'), 'bus', ALL))).toEqual(['tram']);
  });

  /*
   * The bug this exists for: choosing every option one at a time leaves you
   * looking at everything, which is the resting state — so it has to *be* the
   * resting state, or the "show all" control never goes away.
   */
  it('is back to resting when every option has been chosen', () => {
    expect(sorted(toggleSelection(set('bus', 'tram'), 'metro', ALL))).toEqual([]);
  });

  // Pressing the last one off would otherwise leave a board with nothing on it.
  it('is back to resting when the last choice is pressed off', () => {
    expect(sorted(toggleSelection(set('tram'), 'tram', ALL))).toEqual([]);
  });
});
