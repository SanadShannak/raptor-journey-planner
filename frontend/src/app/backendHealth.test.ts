import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as health from '../api/health';
import {
  checkService,
  forgetService,
  getService,
  markServiceUp,
  subscribeToHealth,
} from './backendHealth';

/*
 * A module-level store, so every test starts it fresh and a listener added by
 * one test cannot fire for another.
 */
beforeEach(() => {
  forgetService();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkService', () => {
  it('resolves to up when the probe answers', async () => {
    vi.spyOn(health, 'checkHealth').mockResolvedValue(true);

    checkService();
    expect(getService()).toBe('checking');

    await vi.waitFor(() => expect(getService()).toBe('up'));
  });

  it('resolves to down when the probe does not answer', async () => {
    vi.spyOn(health, 'checkHealth').mockResolvedValue(false);

    checkService();
    await vi.waitFor(() => expect(getService()).toBe('down'));
  });

  /*
   * The property that makes a retry safe to fire while one is already in
   * flight: the earlier probe's answer must never land after a newer one has
   * already resolved things differently.
   */
  it('ignores a stale probe superseded by a newer one', async () => {
    let resolveFirst: (alive: boolean) => void = () => {};
    const first = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const spy = vi.spyOn(health, 'checkHealth');
    spy.mockReturnValueOnce(first);
    spy.mockResolvedValueOnce(true);

    checkService(); // the stale one, still pending
    checkService(); // supersedes it, and resolves immediately to up

    await vi.waitFor(() => expect(getService()).toBe('up'));

    resolveFirst(false); // the stale answer, arriving late
    await Promise.resolve();
    await Promise.resolve();

    expect(getService()).toBe('up');
  });
});

describe('markServiceUp', () => {
  it('answers up immediately, without waiting on a probe', () => {
    markServiceUp();
    expect(getService()).toBe('up');
  });

  /*
   * A probe already in flight when a search succeeds must not later downgrade
   * the answer a real request just proved — the whole reason this exists
   * rather than a caller just calling `checkService` again.
   */
  it('outlives a slower probe that started before it', async () => {
    let resolveProbe: (alive: boolean) => void = () => {};
    vi.spyOn(health, 'checkHealth').mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      }),
    );

    checkService();
    markServiceUp();
    expect(getService()).toBe('up');

    resolveProbe(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(getService()).toBe('up');
  });
});

describe('subscribeToHealth', () => {
  it('announces a change and stops once unsubscribed', async () => {
    vi.spyOn(health, 'checkHealth').mockResolvedValue(true);
    const seen: string[] = [];
    const unsubscribe = subscribeToHealth(() => seen.push(getService()));

    checkService();
    await vi.waitFor(() => expect(getService()).toBe('up'));
    expect(seen).toContain('up');

    unsubscribe();
    const before = seen.length;
    markServiceUp(); // no-op: already up, so nothing to announce anyway
    checkService();
    await vi.waitFor(() => expect(getService()).toBe('checking'));
    expect(seen.length).toBe(before);
  });
});
