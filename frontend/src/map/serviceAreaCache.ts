import { getServiceArea } from '../api/network';
import type { ServiceArea } from '../types/network';

/**
 * Asked once per page load, and shared by every map that draws it.
 *
 * Module-level for the reason `mapPool` is: it cannot change while the tab
 * runs the same JavaScript, so a second map page should not ask again. A
 * failure is forgotten, so the next map to mount tries once more rather than
 * every map going without for the rest of the visit.
 */
let pending: Promise<ServiceArea | null> | null = null;

export function loadServiceArea(): Promise<ServiceArea | null> {
  if (pending === null) {
    pending = getServiceArea().catch(() => {
      pending = null;
      return null;
    });
  }
  return pending;
}

/** For tests, where one file's answer must not leak into the next. */
export function forgetServiceArea(): void {
  pending = null;
}
