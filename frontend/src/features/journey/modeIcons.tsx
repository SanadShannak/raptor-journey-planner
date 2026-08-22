import type { GtfsRouteType } from '../../types/journey';
import { familyFor } from './modeVisuals';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/**
 * A walking figure mid-stride.
 *
 * Redrawn from the previous version, which read as a stick figure falling
 * over. A recognisable gait — leading knee bent, trailing leg extended, arms
 * counter-swinging — is what makes it read as walking at 18 pixels.
 */
export function WalkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <circle cx="12.5" cy="4" r="2" />
      <path d="M10.5 22l1.2-5.4-2.4-2.6.9-4.6" />
      <path d="M14.6 22l-1.1-4.3-1.8-1.1" />
      <path d="M10.2 9.4L13 8.2l2.1 2.4 2.4.9" />
      <path d="M10.2 9.4L8 11.2 6.6 14" />
    </svg>
  );
}

/** One silhouette per family, so the shape alone distinguishes them. */
export function ModeIcon({
  routeType,
  size = 18,
}: {
  routeType: GtfsRouteType | number | null;
  size?: number;
}) {
  const family = familyFor(routeType);
  const props = { ...base, width: size, height: size, 'aria-hidden': true } as const;

  if (family === 'ferry') {
    return (
      <svg {...props}>
        <path d="M3 18.5c1.6 0 1.6 1.3 3.2 1.3s1.6-1.3 3.2-1.3 1.6 1.3 3.2 1.3 1.6-1.3 3.2-1.3 1.6 1.3 3.2 1.3" />
        <path d="M5 18l1.4-5.6h11.2L19 18" />
        <path d="M9 12.4V9h6v3.4M12 9V6.2" />
      </svg>
    );
  }
  if (family === 'train') {
    return (
      <svg {...props}>
        <rect x="5.5" y="3" width="13" height="12" rx="3" />
        <path d="M5.5 10h13M8 21l2.2-3M16 21l-2.2-3" />
        <circle cx="9" cy="12.6" r=".9" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12.6" r=".9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (family === 'metro') {
    // A tunnel arch: the one thing a metro has that the others do not.
    return (
      <svg {...props}>
        <path d="M3.5 20V12a8.5 8.5 0 0117 0v8" />
        <rect x="8" y="9.5" width="8" height="7" rx="1.5" />
        <path d="M8 20h8" />
      </svg>
    );
  }
  if (family === 'tram') {
    return (
      <svg {...props}>
        <rect x="6" y="4.5" width="12" height="12" rx="2" />
        <path d="M6 11h12M9 20l2-3.5M15 20l-2-3.5M12 4.5V2" />
        <path d="M9 2h6" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <rect x="4" y="4" width="16" height="12" rx="2.5" />
      <path d="M4 11h16M7.5 20v-2M16.5 20v-2" />
      <circle cx="8" cy="13.6" r=".9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13.6" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}
