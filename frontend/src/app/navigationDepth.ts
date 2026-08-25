/**
 * How deep into the app you have gone, so "back" can be a step and not a guess.
 *
 * The browser's history already *is* a stack, and `navigate(-1)` already walks
 * it one entry at a time. The one thing it cannot tell you is whether the entry
 * behind the current one belongs to this app at all — a run opened from a
 * pasted link has somebody else's page behind it, or nothing, and stepping back
 * there means leaving. So every in-app push is counted, and a back control only
 * steps when the count says there is somewhere of ours to step to. When it does
 * not, it goes to the top of its own section instead.
 *
 * A module-level value for the same reason the planner's memory is one: it
 * survives every navigation inside the app, because the tab keeps running the
 * same JavaScript, and it does not survive a reload — after which the entries
 * behind us are once again somebody else's business.
 *
 * Counted rather than read off `history.length`, which includes every other
 * site the tab has visited and never goes down.
 */

let depth = 0;

/**
 * Subscribers, because the count is read *during render* — a back control has
 * to word itself for where it is about to go — while it changes in an effect,
 * one render later. A plain module variable would have every control showing
 * the previous page's answer.
 */
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

export function subscribeToDepth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDepth(): number {
  return depth;
}

/** A new entry of ours, pushed on top. */
export function pushed(): void {
  depth += 1;
  announce();
}

/**
 * An entry stepped off — ours or, at zero, the one that put us here.
 *
 * Clamped, because the very first render counts as a pop: a router reports the
 * initial location that way, and there is nothing behind it to have left.
 */
export function popped(): void {
  const next = Math.max(0, depth - 1);
  if (next === depth) return;
  depth = next;
  announce();
}

/** Whether there is an entry of ours behind this one. */
export function canGoBack(): boolean {
  return depth > 0;
}

/** For tests, which share one module across a file. */
export function forgetDepth(): void {
  depth = 0;
  announce();
}
