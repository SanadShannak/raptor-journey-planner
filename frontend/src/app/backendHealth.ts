import { checkHealth } from '../api/health';

/**
 * Whether the routing service is answering, for the whole app rather than one
 * page of it.
 *
 * A module-level store, the same shape as `navigationDepth.ts`: this used to
 * be a `PlanPage` state variable, which meant a visitor who opened the app on
 * `/stops` had no way to learn the backend was down until they happened to
 * open the planner — and a search restored from a shared link, on the one
 * page that did know, still had nowhere to *say* so beyond its own form. One
 * store, subscribed to from wherever it needs to be shown or acted on, gives
 * every page the same answer.
 */
export type Service = 'checking' | 'up' | 'down';

let service: Service = 'checking';

/** Distinguishes a probe from a *later* one, so a stale answer cannot land. */
let requestId = 0;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function setService(next: Service): void {
  if (service === next) return;
  service = next;
  announce();
}

export function subscribeToHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getService(): Service {
  return service;
}

/**
 * Asks the probe again, superseding whichever one is already in flight.
 *
 * Safe to call while a probe is running — the earlier one's answer is simply
 * ignored when it arrives, rather than racing to overwrite whatever this one
 * finds.
 */
export function checkService(): void {
  const id = ++requestId;
  setService('checking');

  void checkHealth().then((alive) => {
    if (id !== requestId) return;
    setService(alive ? 'up' : 'down');
  });
}

/**
 * A request that actually succeeded is better proof than any probe: called
 * from the planner when a search comes back, so a slow or unlucky first probe
 * does not go on saying "down" once traffic through the service is proof of
 * the opposite. Bumps `requestId` too, so a probe still in flight from before
 * this cannot later overwrite it with a stale "down".
 */
export function markServiceUp(): void {
  requestId += 1;
  setService('up');
}

/** For tests, which share one module across a file. */
export function forgetService(): void {
  requestId += 1;
  service = 'checking';
  announce();
}
