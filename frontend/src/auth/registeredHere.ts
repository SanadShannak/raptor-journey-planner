/**
 * Which account, if any, was registered in this browser and has not signed in
 * here since.
 *
 * Registering does not sign anybody in — the address is confirmed first, often
 * from another tab or after a while — so "this person has just made an
 * account" cannot be known at the moment it happens. It is written down
 * instead, and read at the next sign-in: if the account signing in is the one
 * registered here, it is new, and whatever a guest kept in this browser is
 * theirs to keep. See `guestTransfer.ts`.
 *
 * Only the address, lower-cased — enough to recognise the account and nothing
 * more. In `localStorage`, because confirming can take longer than a tab
 * lives. Unreadable storage simply means nothing was registered here.
 */

const STORAGE_KEY = 'registered-here';

export function markRegisteredHere(email: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, email.trim().toLowerCase());
  } catch {
    // Not kept; a later sign-in is then treated like any other.
  }
}

/** Whether this address is the account registered in this browser. */
export function wasRegisteredHere(email: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === email.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function forgetRegisteredHere(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}
