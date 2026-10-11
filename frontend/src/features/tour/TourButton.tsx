import { useSyncExternalStore } from 'react';
import { useLocale } from '../../i18n';
import { getTourState, startTour, subscribeToTour } from './tourStore';

/**
 * Replays the tour for the page on screen.
 *
 * Shaped like the theme toggle beside it — same box, same border on the bar —
 * because it is the same kind of thing: a setting-sized control about the app
 * rather than about the page's content. Absent on a page with no tour, rather
 * than offering one that would explain somewhere else.
 *
 * `onStart` lets the mobile menu close itself first. The tour points at the
 * page, and a menu panel left open over it would be hiding what it points at.
 */
export function TourButton({ onStart }: { onStart?: (() => void) | undefined }) {
  const { strings, t } = useLocale();
  const { page } = useSyncExternalStore(subscribeToTour, getTourState);

  if (page === null) return null;

  return (
    <button
      type="button"
      data-tour="tour-button"
      onClick={() => {
        onStart?.();
        startTour(page);
      }}
      aria-label={t(strings.tour.open)}
      className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex h-9 cursor-pointer items-center gap-1.5 border px-2.5 text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {/*
        Mirrored in Arabic, where the question mark itself faces the other way
        (؟) — the one place a symbol that is not an arrow still has a
        direction.
      */}
      <svg
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="rtl:-scale-x-100"
      >
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7.9 7.6a2.2 2.2 0 1 1 3 2.05c-.55.22-.9.7-.9 1.3v.35" />
        <circle cx="10" cy="14" r=".6" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
