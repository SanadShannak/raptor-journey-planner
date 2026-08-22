import { useState } from 'react';
import { useLocale } from '../../i18n';
import type { Place } from '../../types/place';

interface Props {
  onLocated: (place: Place) => void;
}

/**
 * Fills the origin from the device's location.
 *
 * Asked for **only** when this button is pressed — never on page load, which
 * would put a permission prompt in front of someone who has not asked for one
 * and teaches them to dismiss it. The field beside it stays fully usable if
 * permission is refused or the fix never arrives.
 *
 * The coordinates go to our own routing API and nowhere else. In particular
 * they are never handed to the geocoder as a search bias, which would send a
 * visitor's position to a third party as a side effect of typing.
 */
export function UseMyLocationButton({ onLocated }: Props) {
  const { strings, t } = useLocale();
  const [state, setState] = useState<'idle' | 'locating' | 'denied' | 'failed'>(
    'idle',
  );

  function locate() {
    if (typeof navigator.geolocation === 'undefined') {
      setState('failed');
      return;
    }

    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState('idle');
        onLocated({
          key: 'my-location',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: t(strings.planner.myLocation),
          context: null,
          kind: 'place',
          stopId: null,
        });
      },
      (error) => {
        setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const message =
    state === 'denied'
      ? t(strings.planner.locationDenied)
      : state === 'failed'
        ? t(strings.planner.locationUnavailable)
        : null;

  return (
    <>
      <button
        type="button"
        onClick={locate}
        disabled={state === 'locating'}
        aria-label={
          state === 'locating'
            ? t(strings.planner.locating)
            : t(strings.planner.useMyLocation)
        }
        className="rounded-control border-border-strong text-content-muted hover:text-content focus-visible:outline-brand-500 inline-flex h-10 w-10 flex-none cursor-pointer items-center justify-center border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>

      {/*
        Announced rather than appearing silently: it is the answer to a press,
        and a refused permission is otherwise invisible.
      */}
      {message !== null && (
        <p role="status" className="text-danger basis-full text-sm">
          {message}
        </p>
      )}
    </>
  );
}
