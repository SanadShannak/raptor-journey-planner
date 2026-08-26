import { useEffect, useSyncExternalStore } from 'react';
import { checkService, getService, subscribeToHealth, type Service } from './backendHealth';

/**
 * Starts the one probe the whole app shares.
 *
 * Mounted once, in the layout every page passes through — the same place
 * `useTrackNavigationDepth` is — so nothing else has to remember to kick it
 * off, and it runs exactly once per load rather than once per page that
 * happens to care about the answer.
 */
export function useStartHealthCheck(): void {
  useEffect(() => {
    checkService();
    // Deliberately once: a route change is not a reason to ask again, only a
    // reload is, and `checkService` itself is how a retry asks on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * The shared answer, and the way to ask again.
 *
 * Subscribed rather than read, so a component rerenders the moment the probe
 * settles instead of waiting for some unrelated state change to notice.
 */
export function useBackendHealth(): { service: Service; retry: () => void } {
  const service = useSyncExternalStore(subscribeToHealth, getService);
  return { service, retry: checkService };
}
