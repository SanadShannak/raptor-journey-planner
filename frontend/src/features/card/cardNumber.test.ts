import { describe, expect, it } from 'vitest';
import {
  cardNumberProblem,
  digitsOf,
  formatCardNumber,
  isCompleteCardNumber,
} from './cardNumber';

describe('digitsOf', () => {
  /*
   * The groups are punctuation, not meaning. Somebody reading a number off a
   * card may type it with dashes, with spaces, or with neither, and rejecting
   * two of those three is rejecting people for transcription.
   */
  it('takes the digits however they were separated', () => {
    expect(digitsOf('12345-67890-1')).toBe('12345678901');
    expect(digitsOf('12345 67890 1')).toBe('12345678901');
    expect(digitsOf('12345678901')).toBe('12345678901');
  });

  it('stops at eleven, so a stray keystroke cannot lengthen it', () => {
    expect(digitsOf('123456789019999')).toBe('12345678901');
  });

  it('drops letters rather than keeping them', () => {
    expect(digitsOf('12a34')).toBe('1234');
  });
});

describe('formatCardNumber', () => {
  it('groups a whole number as it is printed on the card', () => {
    expect(formatCardNumber('12345678901')).toBe('12345-67890-1');
  });

  /*
   * Runs on every keystroke, so a partial number has to format cleanly — and
   * without a trailing dash, which would sit under the caret and be eaten by
   * the next backspace.
   */
  it('groups a partial number without a dangling separator', () => {
    expect(formatCardNumber('1')).toBe('1');
    expect(formatCardNumber('12345')).toBe('12345');
    expect(formatCardNumber('123456')).toBe('12345-6');
    expect(formatCardNumber('1234567890')).toBe('12345-67890');
    expect(formatCardNumber('12345678901')).toBe('12345-67890-1');
  });

  it('reformats something already grouped rather than doubling its dashes', () => {
    expect(formatCardNumber('12345-67890-1')).toBe('12345-67890-1');
  });

  it('has nothing to show for nothing typed', () => {
    expect(formatCardNumber('')).toBe('');
  });
});

describe('isCompleteCardNumber', () => {
  it('is true only at eleven digits', () => {
    expect(isCompleteCardNumber('12345-67890-1')).toBe(true);
    expect(isCompleteCardNumber('12345-67890')).toBe(false);
  });
});

describe('cardNumberProblem', () => {
  /*
   * Two different facts, and they earn different words: an empty field is work
   * not started, a short one is work half done. "Too short" is the wrong
   * complaint about a field nobody has touched.
   */
  it('tells an empty field apart from an unfinished one', () => {
    expect(cardNumberProblem('')).toBe('empty');
    expect(cardNumberProblem('   ')).toBe('empty');
    expect(cardNumberProblem('12345')).toBe('incomplete');
  });

  it('has no complaint about a whole number', () => {
    expect(cardNumberProblem('12345-67890-1')).toBeNull();
  });
});
