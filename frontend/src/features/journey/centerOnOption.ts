/**
 * Puts the chosen option in the middle of its scroll container, instantly.
 *
 * Written as a direct `scrollTop` assignment rather than `scrollIntoView`, for
 * two reasons that both showed up as visible bugs.
 *
 * `scrollIntoView` walks *every* scrollable ancestor, so centring an option in
 * a dropdown also scrolled the sidebar the dropdown lives in — the page moved
 * under the visitor as a side effect of opening a menu. Setting `scrollTop`
 * touches one element and nothing above it.
 *
 * And it must be called from a layout effect, not an ordinary one: an effect
 * runs after the browser has painted, so the list appears at the top and jumps
 * a frame later. `useLayoutEffect` runs before that paint, so the list is
 * simply *already* in the right place — which is the difference between
 * "loads centred" and "scrolls to centre".
 *
 * The index is passed rather than read from the DOM so a column whose current
 * value is not exactly on one of its steps — 08:37 against five-minute
 * options — can still open next to where it is, even though nothing is
 * selected.
 */
export function centerOnOption(
  container: HTMLElement | null,
  index: number,
): void {
  if (container === null || index < 0) return;

  const options = container.querySelectorAll<HTMLElement>('[role="option"]');
  const option = options[index];
  if (option === undefined) return;

  /*
   * `offsetTop` is measured from the nearest positioned ancestor, so every
   * caller's scroll container carries `relative`. Without it the offsets are
   * measured from somewhere further up the tree and the maths is silently
   * wrong rather than visibly broken.
   */
  container.scrollTop =
    option.offsetTop - (container.clientHeight - option.offsetHeight) / 2;
}
