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

// jsdom is reused across tests in a file, so mounted trees must be torn down.
afterEach(cleanup);
