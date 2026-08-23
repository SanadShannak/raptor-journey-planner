import { useState } from 'react';
import { useLocale } from '../../i18n';
import type { Place } from '../../types/place';

interface Props {
  onLocated: (place: Place) => void;
  /**
   * Reports what went wrong, already localised, or null once it has not.
   *
   * The button sits *inside* the place field, flush with its border, and a
   * message cannot be rendered there without either overflowing the field or
   * pushing the input out of shape. So the button raises it and the form puts
   * it under the field, where an error belongs.
   */
  onMessage: (message: string | null) => void;
  disabled?: boolean | undefined;
}

type State = 'idle' | 'locating' | 'denied' | 'failed';

/**
 * Fills the origin from the device's location.
 *
 * Asked for **only** when this button is pressed — never on page load, which
 * would put a permission prompt in front of someone who has not asked for one
 * and teaches them to dismiss it. The field beside it stays fully usable if
 * permission is refused or the fix never arrives.
 *
 * The permission is checked before it is used, where the browser offers a way
 * to ask. A standing refusal is answered immediately with an explanation
 * instead of a `getCurrentPosition` call the browser will reject silently —
 * from the outside those two are indistinguishable, and the visitor is left
 * pressing a button that appears to do nothing. Everything else falls through
 * to the request itself, which is what raises the prompt the first time.
 *
 * The coordinates go to our own routing API and nowhere else. In particular
 * they are never handed to the geocoder as a search bias, which would send a
 * visitor's position to a third party as a side effect of typing.
 */
export function UseMyLocationButton({ onLocated, onMessage, disabled }: Props) {
  const { strings, t } = useLocale();
  const [state, setState] = useState<State>('idle');

  /** Moves to a state and publishes the message that goes with it. */
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
          key: 'my-location',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: t(strings.planner.myLocation),
          context: null,
          kind: 'place',
          stopId: null,
          stopCode: null,
          platform: null,
          modes: null,
        });
      },
      (error) => {
        settle(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed');
      },
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
     * than an old-browser one, and it must not be treated as a failure.
     * A rejected query means the same thing: ask and find out.
     */
    if (navigator.permissions !== undefined) {
      try {
        const status = await navigator.permissions.query({
          name: 'geolocation',
        });
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

  /*
   * Flush with the field: no rounding of its own, and a single shared divider
   * instead of a second border. The field clips it, so the outer corner it
   * inherits is the field's.
   */
  return (
    <button
      type="button"
      onClick={() => void locate()}
      disabled={state === 'locating' || (disabled ?? false)}
      aria-label={
        state === 'locating'
          ? t(strings.planner.locating)
          : t(strings.planner.useMyLocation)
      }
      className="border-border-strong text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex w-11 flex-none cursor-pointer items-center justify-center self-stretch border-s focus-visible:-outline-offset-2 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        width="19"
        height="19"
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
    </button>
  );
}
