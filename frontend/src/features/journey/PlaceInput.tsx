import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from '../../i18n';
import { geocoder } from '../../geocoding';
import type { Place } from '../../types/place';

interface Props {
  label: string;
  /** The chosen place, or null while the field is empty or still being typed. */
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Rendered beside the field — "use my location" on the origin. */
  action?: React.ReactNode;
}

/** How long typing must pause before a lookup is worth making. */
const DEBOUNCE_MS = 250;

/** Below this a query matches too much to be useful. */
const MIN_QUERY_LENGTH = 2;

/**
 * A place field with suggestions.
 *
 * Built as the ARIA combobox pattern rather than a text input with a list
 * underneath: the input owns `role="combobox"`, the suggestions are a
 * `listbox`, and `aria-activedescendant` moves a virtual cursor through them
 * while real focus stays in the input. That is what lets someone keep typing
 * while arrowing through results, which a roving-focus implementation cannot
 * do.
 *
 * Nothing is submitted from free text. A journey needs coordinates, and only a
 * chosen suggestion has them — so picking is mandatory, and the form says so
 * rather than guessing at what was typed.
 */
export function PlaceInput({ label, value, onChange, action }: Props) {
  const { locale, strings, t } = useLocale();

  const [query, setQuery] = useState(value?.label ?? '');
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');

  const inputId = useId();
  const listId = useId();
  const statusId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  /* A chosen place set from outside — the swap button, or a restored URL. */
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setQuery(value?.label ?? '');
    setOpen(false);
  }

  const trimmed = query.trim();
  /*
   * Derived rather than stored. Writing these into state from the effect would
   * paint once with stale suggestions and then again to clear them; deriving
   * means the list is simply not shown, and any suggestions left in state are
   * unreachable until the query is long enough to be worth asking about again.
   */
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;
  // Already the chosen place: no point asking the geocoder to confirm it.
  const alreadyChosen = trimmed === value?.label;
  const dormant = tooShort || alreadyChosen;

  useEffect(() => {
    if (dormant) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus('loading');
      geocoder
        .search(trimmed, { signal: controller.signal, language: locale })
        .then((places) => {
          if (controller.signal.aborted) return;
          setSuggestions(places);
          setActiveIndex(-1);
          setStatus('idle');
          setOpen(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // A geocoder being unreachable must not take the form down with it:
          // the field says so and stays usable.
          setSuggestions([]);
          setStatus('failed');
          setOpen(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, locale, dormant]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(place: Place) {
    onChange(place);
    setQuery(place.label);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open || suggestions.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + delta;
        // Wraps at both ends, so Up from nothing reaches the last suggestion.
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      // Only swallow Enter when it is selecting something; otherwise it must
      // still submit the form.
      const place = suggestions[activeIndex];
      if (place) {
        event.preventDefault();
        choose(place);
      }
    }
  }

  const searching = status === 'loading' && !dormant;
  const showList =
    open && !dormant && (suggestions.length > 0 || status === 'failed');

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-describedby={statusId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // Typing after choosing invalidates the choice: the text no longer
            // stands for a set of coordinates.
            if (value !== null) onChange(null);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          /* Finnish and Arabic place names in one field; let the browser
             decide which way each entry runs. */
          dir="auto"
          className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 min-w-0 flex-1 border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        {action}
      </div>

      {/*
        Announced politely, because it is the answer to typing rather than to a
        deliberate action. Empty most of the time, which keeps it silent.
      */}
      <p id={statusId} aria-live="polite" className="sr-only">
        {searching
          ? t(strings.planner.searching)
          : showList && suggestions.length > 0
            ? t(strings.planner.suggestionsAvailable, {
                count: suggestions.length,
              })
            : ''}
      </p>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="rounded-card border-border bg-surface-raised shadow-card absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto border p-1"
        >
          {status === 'failed' ? (
            <li className="text-content-muted px-3 py-2 text-sm">
              {t(strings.planner.searchUnavailable)}
            </li>
          ) : (
            suggestions.map((place, index) => (
              <li key={place.key}>
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  /* Pointer-down rather than click: a click would land after
                     the input's blur has already closed the list. */
                  onPointerDown={(event) => {
                    event.preventDefault();
                    choose(place);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className="rounded-control hover:bg-surface-muted aria-selected:bg-surface-muted flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-start"
                >
                  <span aria-hidden="true" className="text-content-muted">
                    {place.kind === 'stop' ? <StopIcon /> : <PinIcon />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-sm font-medium">
                      {place.label}
                    </span>
                    {place.context !== null && (
                      <span
                        dir="auto"
                        className="text-content-muted block truncate text-xs"
                      >
                        {place.context}
                      </span>
                    )}
                  </span>
                  {/* Named as well as drawn: a marker that only differs by
                      shape is invisible to a screen reader. */}
                  {place.kind === 'stop' && (
                    <span className="sr-only">{t(strings.planner.isStop)}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const PinIcon = () => (
  <svg {...iconProps}>
    <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const StopIcon = () => (
  <svg {...iconProps}>
    <rect x="4" y="3" width="16" height="14" rx="2" />
    <path d="M4 10h16M7 21v-2M17 21v-2" />
  </svg>
);
