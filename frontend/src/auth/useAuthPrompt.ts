import { useSyncExternalStore } from 'react';
import {
  getAuthPrompt,
  subscribeToAuthPrompt,
  type AuthMode,
} from './authPrompt';

/**
 * Which sign-in form is open.
 *
 * Subscribed rather than read: the request can come from a page's own content
 * — an {@link AccountGate} — while the dialog itself is rendered by the header,
 * and the two have no other way to agree.
 */
export function useAuthPrompt(): AuthMode | null {
  return useSyncExternalStore(subscribeToAuthPrompt, getAuthPrompt);
}
