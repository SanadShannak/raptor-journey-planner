import { useState } from 'react';
import { useLocale } from '../../i18n';

/** A position on the ground, as this page needs it. */
export interface At {
  lat: number;
  lon: number;
}

interface Props {
  onLocated: (at: At) => void;
  onMessage: (message: string | null) => void;
}

type State = 'idle' | 'locating' | 'denied' | 'failed';

/**
 * Moves the map to where the visitor actually is.
 *
 * The page opens on the city, not on a permission prompt. A prompt raised
 * before anyone has asked for anything teaches people to dismiss prompts, and
 * a stops page is perfectly usable without ever knowing where you are — so the
 * request belongs behind this button.
 *
 * No exceptions, including a permission already granted: the page rests on the
 * city until somebody asks it not to. An earlier version read the position
 * straight away where the browser had remembered a grant, and the effect was a
 * page that always opened somewhere different from the view it documents.
 *
 * The coordinates never leave the browser. They move the map and nothing else:
 * they are not sent to the geocoder, not put in the URL, and not logged.
 */
export function NearbyStopsButton({ onLocated, onMessage }: Props) {
  const { strings, t } = useLocale();
  const [state, setState] = useState<State>('idle');


  function settle(next: State) {
    setState(next);
    onMessage(
      next === 'denied'
        ? t(strings.planner.locationDenied)
        : next === 'failed'
          ? t(strings.planner.locationUnavailable)
          : null,
    );
  }

  function request() {
    settle('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        settle('idle');
        onLocated({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => settle(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function locate() {
    if (typeof navigator.geolocation === 'undefined') {
      settle('failed');
      return;
    }

    /*
     * The Permissions API is queried where it exists — Safari has never
     * shipped it for geolocation, so its absence is the normal case rather
     * than an old-browser one, and it must not be treated as a failure. A
     * standing refusal is answered here instead of with a call the browser
     * rejects silently, which from the outside looks like a dead button.
     */
    if (navigator.permissions !== undefined) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'denied') {
          settle('denied');
          return;
        }
      } catch {
        // Fall through and let the request itself answer.
      }
    }

    request();
  }

  return (
    <button
      type="button"
      onClick={() => void locate()}
      disabled={state === 'locating'}
      className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex flex-none cursor-pointer items-center gap-1.5 border px-2.5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress disabled:opacity-70"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={state === 'locating' ? 'motion-safe:animate-pulse' : ''}
      >
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
      </svg>
      {t(state === 'locating' ? strings.planner.locating : strings.stops.nearMe)}
    </button>
  );
}
