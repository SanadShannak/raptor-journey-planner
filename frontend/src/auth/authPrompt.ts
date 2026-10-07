/**
 * Which sign-in form is open, if any.
 *
 * A module-level store for the same reason the session is one: the dialog is
 * opened from places that cannot reach each other. The header's two buttons,
 * the navigation panel's copies of them on a phone, and an {@link AccountGate}
 * standing in for a page's content are all asking for the same dialog, and the
 * element itself is rendered once in `AppHeader` so it survives navigation
 * between the pages that ask for it.
 *
 * Opening it is deliberately *not* navigation. Signing in is something done
 * over the top of whatever was already on screen, so it leaves no history
 * entry and the back button is unaffected — which is also why the mode is not
 * in the URL.
 */

export type AuthMode = 'logIn' | 'signUp';

let mode: AuthMode | null = null;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

export function subscribeToAuthPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthPrompt(): AuthMode | null {
  return mode;
}

/** Opens one of the two forms, or switches between them. */
export function requestAuth(next: AuthMode): void {
  if (mode === next) return;
  mode = next;
  announce();
}

export function dismissAuth(): void {
  if (mode === null) return;
  mode = null;
  announce();
}

/** For tests, which share one module across a file. */
export function forgetAuthPrompt(): void {
  mode = null;
  announce();
}
