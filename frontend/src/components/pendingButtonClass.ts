/**
 * The classes a submit button wears while it waits.
 *
 * It is `disabled` while pending, to stop a second press, and the buttons dim
 * when disabled — which made *working* look the same as *refused*. A pending
 * button keeps its full strength and shows the progress cursor instead; the
 * ring says the rest.
 */
export function pendingButtonClass(pending: boolean): string {
  return pending
    ? 'disabled:cursor-progress disabled:opacity-100'
    : 'disabled:cursor-not-allowed disabled:opacity-60';
}
