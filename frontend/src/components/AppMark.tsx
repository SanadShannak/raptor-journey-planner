/**
 * The app's mark: a journey, two stops and the route between them, on a rounded
 * tile, the same drawing as the favicon.
 *
 * Only ever placed on `chrome`, the header and the start screen, so the tile is
 * `on-chrome` and the drawing `chrome`: the contrast-checked pair, inverted.
 */
export function AppMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" aria-hidden="true" className="flex-none">
      <rect width="48" height="48" rx="11" className="fill-on-chrome" />
      <g className="stroke-chrome" strokeWidth="3.4" strokeLinecap="round">
        <path d="M15 17.5v6.2a4 4 0 0 0 4 4h10a4 4 0 0 1 4 4v2.8" strokeDasharray="0.1 6.8" />
        <circle cx="15" cy="13" r="4.6" />
        <circle cx="33" cy="35" r="4.6" />
      </g>
    </svg>
  );
}
