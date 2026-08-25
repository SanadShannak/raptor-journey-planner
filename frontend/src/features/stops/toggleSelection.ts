/**
 * Toggling one option in a filter where **an empty selection means all**.
 *
 * That convention is what lets a filter rest in a state where nothing is
 * hidden without anybody having chosen anything, and it is why the first press
 * on a chip narrows to that one option rather than switching it off: from
 * "everything", picking a thing means picking *that* thing.
 *
 * The rule it exists to enforce is the other end of the same idea. Selecting
 * every option one by one leaves you looking at everything — which is the
 * resting state — so it has to *be* the resting state. Left as a full set it
 * was not: the board showed all of them while the filter still called itself
 * active, and the control offering to clear it never went away.
 */
export function toggleSelection<T>(
  selected: ReadonlySet<T>,
  value: T,
  everything: readonly T[],
): ReadonlySet<T> {
  const next = new Set(selected);

  /*
   * From "all", the first press means "only this one" rather than "all but
   * this one". Every option is drawn as on, so a press is read as a choice of
   * one, not as a rejection of one.
   */
  if (next.size === 0) return new Set([value]);

  if (!next.delete(value)) next.add(value);

  // Everything chosen is nothing chosen. Also covers pressing the last
  // remaining option off, which would otherwise show an empty board.
  return next.size === 0 || next.size === everything.length ? new Set<T>() : next;
}
