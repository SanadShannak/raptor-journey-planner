import { describe, expect, it } from 'vitest';
import { amountProblem, isValidAmount, toAmountPayload } from './amount';

/*
 * These mirror the server's own validator, so the cases worth asserting are
 * the boundaries of its two rules rather than the obvious middle.
 */
describe('amountProblem', () => {
  it('separates an untouched field from a wrong one', () => {
    expect(amountProblem('')).toBe('empty');
    expect(amountProblem('   ')).toBe('empty');
  });

  it('accepts whole numbers and up to three decimal places', () => {
    expect(amountProblem('5')).toBeNull();
    expect(amountProblem('5.5')).toBeNull();
    expect(amountProblem('5.55')).toBeNull();
    // Three, not two: the server takes three on every network, and a dinar
    // has three places, so refusing the last one makes fils untypeable.
    expect(amountProblem('5.555')).toBeNull();
  });

  it('rejects a fourth decimal place', () => {
    expect(amountProblem('5.5555')).toBe('shape');
  });

  it('rejects everything that is not a plain decimal', () => {
    // A sign, a locale's comma, an exponent, padding inside the number.
    expect(amountProblem('-5')).toBe('shape');
    expect(amountProblem('+5')).toBe('shape');
    expect(amountProblem('5,5')).toBe('shape');
    expect(amountProblem('1e3')).toBe('shape');
    expect(amountProblem('5 5')).toBe('shape');
    expect(amountProblem('.5')).toBe('shape');
    expect(amountProblem('5.')).toBe('shape');
  });

  /*
   * Zero is well-formed and still refused, which is why `tooSmall` is its own
   * answer: "that is not a number" would be wrong about what the reader typed.
   */
  it('refuses an amount below the minimum without calling it malformed', () => {
    expect(amountProblem('0')).toBe('tooSmall');
    expect(amountProblem('0.00')).toBe('tooSmall');
    expect(amountProblem('0.009')).toBe('tooSmall');
    expect(amountProblem('0.01')).toBeNull();
  });

  it('agrees with isValidAmount', () => {
    expect(isValidAmount('2.50')).toBe(true);
    expect(isValidAmount('0')).toBe(false);
  });
});

describe('toAmountPayload', () => {
  /*
   * The server's decimal-places rule tests the string it is given, so an
   * amount must reach it in the shape it was typed. Normalising here would
   * mean the rule no longer tests what the reader wrote.
   */
  it('trims and otherwise leaves the digits exactly as typed', () => {
    expect(toAmountPayload('  2.5 ')).toBe('2.5');
    expect(toAmountPayload('2.500')).toBe('2.500');
    expect(toAmountPayload('10')).toBe('10');
  });
});
