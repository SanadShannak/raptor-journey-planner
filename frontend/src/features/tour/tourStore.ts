import type { TourId } from './tours';

/**
 * Which tour is running, which step it is on, and which tours this browser
 * has already seen.
 *
 * A module-level store with listeners, the same shape as `backendHealth.ts`
 * and the favourites store: the tour is started from a page, replayed from
 * the header, and drawn by a host mounted once in the layout, and none of
 * those is the parent of the others.
 *
 * **"Seen" lives in `localStorage`, deliberately.** Unlike the planner's
 * memory, this is a fact about the visitor rather than about one visit: the
 * tour is for somebody new, and somebody who reloads is not new. It is not
 * kept on the account either — a person signing in on a second device has
 * not seen *that* device's pages yet, and most visitors never sign in.
 */

const SEEN_KEY = 'tours-seen';

interface TourState {
  /** The running tour, or null when none is. */
  active: TourId | null;
  /** Index into the running tour's steps. */
  step: number;
  /** The tour belonging to the page on screen, which the header replays. */
  page: TourId | null;
}

let state: TourState = { active: null, step: 0, page: null };

const listeners = new Set<() => void>();

function commit(next: TourState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeToTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTourState(): TourState {
  return state;
}

/*
 * Storage can be missing or refuse outright — a private window, blocked site
 * data — and a tour is not worth an exception over. Unreadable reads as
 * "nothing seen", which at worst shows a tour twice.
 */
function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

export function hasSeenTour(id: TourId): boolean {
  return readSeen().includes(id);
}

function markSeen(id: TourId): void {
  const seen = readSeen();
  if (seen.includes(id)) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]));
  } catch {
    // Not remembered, so it may be offered again. Nothing else to do.
  }
}

export function startTour(id: TourId): void {
  commit({ ...state, active: id, step: 0 });
}

export function goToStep(step: number): void {
  if (state.active === null) return;
  commit({ ...state, step });
}

/**
 * Ends the running tour, finished or skipped alike.
 *
 * Both count as seen. Somebody who pressed "Skip" has answered the question
 * the tour was asking, and offering it again on their next visit would be
 * asking twice.
 */
export function endTour(): void {
  if (state.active !== null) markSeen(state.active);
  commit({ ...state, active: null, step: 0 });
}

/** Records which page is on screen, so the header knows what to replay. */
export function setTourPage(page: TourId | null): void {
  if (state.page === page) return;
  commit({ ...state, page });
}

/** For tests: forget the running tour and everything seen. */
export function forgetTours(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // Nothing stored to forget.
  }
  commit({ active: null, step: 0, page: null });
}
