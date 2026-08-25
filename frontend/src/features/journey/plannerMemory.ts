import type { Journey } from '../../types/journey';
import type { JourneyFormValues } from './journeySearch';

/**
 * What the planner was showing when you last left it.
 *
 * The planner is no longer somewhere you only arrive at and leave from. A leg
 * of an itinerary opens the run it is riding, a stop's board opens from the
 * sidebar, and the nav bar goes to stops and cards and back — so "come back to
 * the planner" is an ordinary thing to do many times in a session, and finding
 * the form empty each time is finding your work thrown away.
 *
 * **A module-level value, deliberately, and not storage of any kind.** Which is
 * the whole distinction being drawn: it survives every navigation inside the
 * app, because the tab keeps running the same JavaScript, and it does not
 * survive a reload, because a reload is a new context. That is exactly the
 * bargain wanted — come back to where you were, but ask for a fresh page and
 * get one. `sessionStorage` would get the first half right and the second half
 * wrong: it outlives a refresh, and a timetable answer that outlives a refresh
 * is one nobody asked to keep.
 *
 * The address still carries the search as well, and that is not redundant: this
 * answers "take me back to what I was doing", and the address answers "open
 * this search on a machine that has never seen it". Different questions.
 */
export interface PlannerMemory {
  values: JourneyFormValues;
  journeys: Journey[];
  /** Whether an answer has been given, which is what tells an empty result
      from a form nobody has submitted. */
  searched: boolean;
  /** Which result is open in full, and which is drawn on the map. */
  openIndex: number | null;
  selectedIndex: number | null;
  /** The stop whose board is open in the sidebar. */
  inspectStopId: string | null;
  /** The "no later departures" note, so it does not reappear as an offer. */
  exhausted: string | null;
}

let held: PlannerMemory | null = null;

export function rememberPlanner(memory: PlannerMemory): void {
  held = memory;
}

export function recallPlanner(): PlannerMemory | null {
  return held;
}

/** For tests, which share one module across a file. */
export function forgetPlanner(): void {
  held = null;
}
