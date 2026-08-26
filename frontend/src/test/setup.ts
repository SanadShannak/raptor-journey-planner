import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * Neither runtime gives us a working `localStorage` here: Node 26 defines a
 * global that stays inert unless the process was started with
 * --localstorage-file, and this jsdom version does not expose one on `window`.
 *
 * Browsers have neither problem, so rather than bending the application code
 * around the test environment, the environment gets a minimal in-memory
 * Storage. Each test file runs in its own worker, so state cannot leak between
 * files; `beforeEach` hooks clear it between tests within a file.
 */
class MemoryStorage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, String(value));
  }
}

// Installed unconditionally: merely *reading* Node's inert global emits an
// ExperimentalWarning, so there is no way to feature-detect it quietly.
const storage = new MemoryStorage() as unknown as Storage;
for (const target of new Set<object>([globalThis, window])) {
  Object.defineProperty(target, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

/*
 * jsdom implements <dialog> as an element but not its modal behaviour, so
 * showModal() and close() are simply missing. Same reasoning as the storage
 * shim above: the environment is made to behave like a browser rather than the
 * application being written around a gap in the test runtime.
 *
 * Only the parts under test are modelled — the `open` state, which is what
 * makes the dialog visible to queries, and the `close` event React listens for.
 * Focus trapping and inertness are real browser behaviour that cannot be
 * meaningfully faked here, and are not what these tests assert.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
      returnValue?: string,
    ) {
      this.open = false;
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.dispatchEvent(new Event('close'));
    };
  }
}

/*
 * Two more gaps, in the same spirit as the storage shim above: the environment
 * is made to behave like a browser rather than the application being written
 * around what jsdom happens to implement.
 *
 * `RootLayout.test.tsx` renders the real planner, and the planner renders a
 * map — so both of these are reached by the existing suite, not only by tests
 * that are about the map.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  // Never fires: nothing in jsdom has a size to observe in the first place.
  class NoopResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = NoopResizeObserver;
}

/*
 * jsdom lays nothing out, so a real scroll has nowhere to go — but its own
 * `scrollTo` logs "not implemented" instead of quietly doing nothing. Replaced
 * with a no-op here; a test that cares what it was called with reassigns its
 * own, as `useFollowInView.test.tsx` does, which simply overrides this one.
 */
window.scrollTo = (() => {}) as typeof window.scrollTo;

if (typeof window.matchMedia !== 'function') {
  // Answers "no" to every query, which is the right default for a preference
  // nobody expressed. A test that cares stubs its own.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/*
 * jsdom lays nothing out, so it implements no scrolling at all and
 * `Element.prototype.scrollIntoView` is simply absent. Anything that calls it
 * throws mid-render, which turns "the list did not scroll" — a thing that
 * cannot be observed here anyway — into "the component did not render".
 *
 * A no-op rather than a spy: no test asserts on scrolling, because there is no
 * viewport to scroll within.
 */
if (typeof Element !== 'undefined' && Element.prototype.scrollIntoView === undefined) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom is reused across tests in a file, so mounted trees must be torn down.
afterEach(cleanup);
