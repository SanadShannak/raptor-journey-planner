import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recall, remember } from './journeyCache';
import type { Journey } from '../../types/journey';

/*
 * A cache that can only ever answer the question it was asked, and that would
 * rather answer nothing than answer wrongly.
 */

const journey = (startTime: string): Journey =>
  ({ startDate: '2026-09-10', startTime, endDate: '2026-09-10', endTime: '10:00',
     totalDurationMinutes: 20, legs: [] }) as unknown as Journey;

beforeEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('the journey cache', () => {
  it('gives back what it was given, for the same search', () => {
    remember('sig-a', [journey('09:40')]);

    expect(recall('sig-a')).toHaveLength(1);
    expect(recall('sig-a')?.[0]?.startTime).toBe('09:40');
  });

  /* The signature is coordinates, date, time and pace — everything the engine
     is given. A different one is a different question and gets no answer. */
  it('answers nothing for a different search', () => {
    remember('sig-a', [journey('09:40')]);

    expect(recall('sig-b')).toBeNull();
  });

  it('holds one answer, not a history', () => {
    remember('sig-a', [journey('09:40')]);
    remember('sig-b', [journey('11:00')]);

    expect(recall('sig-a')).toBeNull();
    expect(recall('sig-b')).toHaveLength(1);
  });

  /* Cheap to re-ask, and the reason it was empty may have been transient. */
  it('does not keep an empty answer', () => {
    remember('sig-a', []);

    expect(recall('sig-a')).toBeNull();
  });

  it('answers nothing before anything has been kept', () => {
    expect(recall('sig-a')).toBeNull();
  });

  /* The value is JSON somebody could have edited. A mangled entry should cost
     a request, never a crash. */
  it('answers nothing for a mangled entry', () => {
    sessionStorage.setItem('journey-planner:last-search', '{ not json');
    expect(recall('sig-a')).toBeNull();

    sessionStorage.setItem(
      'journey-planner:last-search',
      JSON.stringify({ signature: 'sig-a', journeys: [{ startTime: '09:40' }] }),
    );
    // No legs is not a journey this app can draw.
    expect(recall('sig-a')).toBeNull();
  });

  /*
   * Safari in a private window throws on write once its tiny quota is reached,
   * and any browser throws when site data is blocked. Neither is worth a broken
   * planner.
   */
  it('survives storage that throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => remember('sig-a', [journey('09:40')])).not.toThrow();
    expect(recall('sig-a')).toBeNull();
  });
});
