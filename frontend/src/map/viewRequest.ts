/**
 * Somewhere the visitor asked the map to look.
 *
 * Carries an `id` so that asking twice moves twice. Without it, pressing "near
 * me" after panning away would produce an identical object, no effect would
 * re-run, and the button would appear to be broken — which is exactly what a
 * request is not: it is an action, not a state to settle into.
 */
export type ViewTarget = { kind: 'home' } | { kind: 'at'; lat: number; lon: number };

export type ViewRequest = ViewTarget & { id: number };

/** The opening request, before anyone has asked for anything. */
export const HOME_VIEW: ViewRequest = { id: 0, kind: 'home' };

/** The same target, asked for again — a fresh id, so the map actually moves. */
export function askFor(previous: ViewRequest, target: ViewTarget): ViewRequest {
  return { ...target, id: previous.id + 1 };
}
