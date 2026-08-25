import type { Journey } from '../../types/journey';

/**
 * The last answer, kept for as long as the tab is open.
 *
 * The planner can now be left — a leg opens the run it is riding — and it
 * restores itself from the address on the way back. Restoring by *asking again*
 * works, and looks like it: the results blink out, a loader appears, and the
 * same journeys come back. Coming back to something you were already looking at
 * should not look like arriving at it for the first time.
 *
 * Keyed by the search's own signature, so the cache can only ever answer the
 * question it was asked. That signature is coordinates, date, time and pace —
 * everything the engine is given — which is exactly what makes the answer
 * deterministic and therefore safe to keep.
 *
 * `sessionStorage`, deliberately, on all three counts it differs by: it dies
 * with the tab, so a timetable that has been recompiled underneath cannot
 * haunt tomorrow; it is not shared between tabs, so two planners cannot answer
 * for each other; and it survives the navigation that this exists for.
 */

const KEY = 'journey-planner:last-search';

/** One entry. Holding a history would spend the quota to answer one question. */
interface Entry {
  signature: string;
  journeys: Journey[];
}

/**
 * Storage is allowed to fail, and not only when it is absent.
 *
 * Safari in private browsing throws on write once the (tiny) quota is reached,
 * and any browser throws when a site's data is blocked. None of that is worth a
 * broken planner, so every path here answers "no cache" instead.
 */
function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function remember(signature: string, journeys: Journey[]): void {
  // Nothing is worth caching about an empty answer: it is cheap to re-ask and
  // the reason it was empty may have been transient.
  if (journeys.length === 0) return;

  try {
    store()?.setItem(KEY, JSON.stringify({ signature, journeys } satisfies Entry));
  } catch {
    // A full quota costs the shortcut and nothing else.
  }
}

/**
 * The answer to this exact question, or null.
 *
 * Read defensively: the value is JSON somebody could have edited, and a
 * malformed entry should cost a request rather than a crash.
 */
export function recall(signature: string): Journey[] | null {
  try {
    const raw = store()?.getItem(KEY);
    if (raw === null || raw === undefined) return null;

    const entry = JSON.parse(raw) as Partial<Entry> | null;
    if (entry === null || entry.signature !== signature) return null;
    if (!Array.isArray(entry.journeys) || entry.journeys.length === 0) return null;

    // A journey without legs is not one this app can draw.
    if (!entry.journeys.every((journey) => Array.isArray(journey?.legs))) return null;

    return entry.journeys;
  } catch {
    return null;
  }
}
