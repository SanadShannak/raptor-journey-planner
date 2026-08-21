import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, type UnitFormatContext } from './units';
import { formatClockTime } from './translate';
import { translate } from './translate';
import { en } from './en';
import { ar } from './ar';
import type { Locale } from './dictionary';

const context = (locale: Locale): UnitFormatContext => ({
  locale,
  strings: locale === 'en' ? en : ar,
  t: (message, values) => translate(message, locale, values),
});

describe('formatDuration', () => {
  it('reads as minutes below an hour', () => {
    expect(formatDuration(33, context('en'))).toBe('33 min');
    expect(formatDuration(59, context('en'))).toBe('59 min');
  });

  it('drops the minutes when there are none', () => {
    expect(formatDuration(60, context('en'))).toBe('1 h');
    expect(formatDuration(120, context('en'))).toBe('2 h');
  });

  it('combines hours and minutes in one message', () => {
    expect(formatDuration(85, context('en'))).toBe('1 h 25 min');
    expect(formatDuration(1439, context('en'))).toBe('23 h 59 min');
  });

  it('uses the Arabic abbreviations', () => {
    expect(formatDuration(33, context('ar'))).toBe('33 د');
    expect(formatDuration(85, context('ar'))).toBe('1 س 25 د');
  });

  it('survives zero and negatives rather than rendering nonsense', () => {
    expect(formatDuration(0, context('en'))).toBe('0 min');
    expect(formatDuration(-5, context('en'))).toBe('0 min');
  });
});

describe('formatDistance', () => {
  it('reads as metres below a kilometre', () => {
    expect(formatDistance(50, context('en'))).toBe('50 m');
    expect(formatDistance(950, context('en'))).toBe('950 m');
  });

  it('switches to kilometres with one decimal', () => {
    expect(formatDistance(1000, context('en'))).toBe('1.0 km');
    expect(formatDistance(1250, context('en'))).toBe('1.3 km');
    expect(formatDistance(12500, context('en'))).toBe('12.5 km');
  });

  it('uses Arabic units with Latin digits', () => {
    expect(formatDistance(950, context('ar'))).toBe('950 م');
    expect(formatDistance(1250, context('ar'))).toBe('1.3 كم');
  });
});

describe('formatClockTime', () => {
  /*
   * 24-hour in both languages is a product decision, not a default: the API
   * returns 24-hour values and a 12-hour clock makes 00:40 easy to misread as
   * the wrong end of the day.
   */
  it('is 24-hour in both locales', () => {
    expect(formatClockTime('18:03', 'en')).toBe('18:03');
    expect(formatClockTime('18:03', 'ar')).toBe('18:03');
    expect(formatClockTime('00:40', 'en')).toBe('00:40');
  });

  it('accepts the seconds form the API takes on input', () => {
    expect(formatClockTime('18:03:00', 'en')).toBe('18:03');
  });

  it('returns anything unparseable unchanged rather than inventing a time', () => {
    expect(formatClockTime('not a time', 'en')).toBe('not a time');
    expect(formatClockTime('', 'en')).toBe('');
  });
});
