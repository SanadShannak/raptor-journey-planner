/**
 * The rows whose line is still switched on.
 *
 * An **empty selection means every line**, not none. A filter that starts by
 * hiding everything is a puzzle, and there is no state in which somebody wants
 * an empty board they did not ask for — so switching the last line off returns
 * to showing all of them rather than nothing.
 */
export function keepSelected<T extends { lineId: string }>(
  rows: T[],
  selected: ReadonlySet<string>,
): T[] {
  if (selected.size === 0) return rows;
  return rows.filter((row) => selected.has(row.lineId));
}
