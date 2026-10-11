/**
 * Dismissed for the rest of this visit, by account.
 *
 * A module-level value, like the planner's memory: it outlives navigation
 * inside the app and not a reload. Hiding the banner is "not now", not
 * "never" — the address is still unconfirmed, and the next visit says so
 * again. Keyed by account so somebody else signing in on the same tab is
 * still told about theirs.
 */
let dismissedFor: string | null = null;

export function bannerDismissedFor(): string | null {
  return dismissedFor;
}

export function dismissBannerFor(accountId: string): void {
  dismissedFor = accountId;
}

/** For tests, which share one module across a file. */
export function forgetBannerDismissal(): void {
  dismissedFor = null;
}
