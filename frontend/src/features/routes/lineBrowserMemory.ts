import type { GtfsRouteType } from '../../types/journey';

/**
 * The search and the mode filter, for as long as the tab lives.
 *
 * The list unmounts when a route is opened, so going back to it used to clear
 * whatever had been typed and ticked — the same "back lands on an empty form"
 * the planner's own memory exists to prevent. A module-level value, like
 * `plannerMemory.ts`: it survives navigation inside the app and not a reload.
 * Tests share it within a file, so `forgetLineBrowser()` belongs in
 * `beforeEach`.
 */
let remembered: { query: string; modes: ReadonlySet<GtfsRouteType> } = {
  query: '',
  modes: new Set(),
};

export function forgetLineBrowser(): void {
  remembered = { query: '', modes: new Set() };
}

export function lineBrowserMemory(): { query: string; modes: ReadonlySet<GtfsRouteType> } {
  return remembered;
}

export function rememberLineBrowser(next: { query: string; modes: ReadonlySet<GtfsRouteType> }): void {
  remembered = next;
}

