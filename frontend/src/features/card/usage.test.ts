import { describe, expect, it } from 'vitest';
import type { CardUsage } from '../../types/card';
import { addsToTheAmount } from './usage';

const usage = (amount: number, description: string | null): CardUsage => ({
  date: '2026-10-08',
  time: '00:06',
  amount,
  kind: 'fare',
  description,
});

describe('addsToTheAmount', () => {
  /*
   * The two the server actually writes, copied from live responses. Both
   * restate a figure the row already prints beside them.
   */
  it('rejects the stock descriptions the server writes', () => {
    expect(addsToTheAmount(usage(2.8, 'Deducted fare with amount EUR 2.800'))).toBe(false);
    expect(addsToTheAmount(usage(25.5, 'Top up with amount EUR 25.500'))).toBe(false);
  });

  /*
   * The three-decimal spelling is the one that matters: the server writes
   * `2.800` where the amount is `2.8`, so a naive `String(amount)` comparison
   * would miss every one of them.
   */
  it('matches a figure written with more decimals than the number has', () => {
    expect(addsToTheAmount(usage(10, 'Top up with amount EUR 10.000'))).toBe(false);
    expect(addsToTheAmount(usage(2.5, 'Top up with amount EUR 2.50'))).toBe(false);
  });

  /* What the field is actually for, and what should survive. */
  it('keeps a description that names a place', () => {
    expect(addsToTheAmount(usage(3.3, 'Bus 550'))).toBe(true);
    expect(addsToTheAmount(usage(20, 'Ticket machine, Rautatientori'))).toBe(true);
  });

  it('has nothing to show for a row with no description', () => {
    expect(addsToTheAmount(usage(3.3, null))).toBe(false);
    expect(addsToTheAmount(usage(3.3, '   '))).toBe(false);
  });

  /*
   * The documented cost of the heuristic, pinned so it is a known trade rather
   * than a surprise: a place whose name contains the exact figure is hidden.
   */
  it('hides a real place whose name happens to contain the figure', () => {
    expect(addsToTheAmount(usage(550, 'Bus 550'))).toBe(false);
  });
});
