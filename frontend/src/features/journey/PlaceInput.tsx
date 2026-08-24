import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from '../../i18n';
import { geocoder } from '../../geocoding';
import type { Place } from '../../types/place';
import type { GeoBounds } from '../../config/geocoding';
import { ModeIcon } from './modeIcons';
import { DestinationMarker, OriginMarker } from './placeMarkers';

interface Props {
  label: string;
  /** Which end this is. Only the marker differs; behaviour is identical. */
  role: 'origin' | 'destination';
  /** The chosen place, or null while the field is empty or still being typed. */
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Restricts suggestions to the network's area. */
  bounds?: GeoBounds | null | undefined;
  /** Rendered flush against the field's end — "use my location" on the origin. */
  action?: React.ReactNode;
  /** Rendered under the field, where an {@link action} reports a problem. */
  note?: React.ReactNode;
  /** Turned off while the routing service is unreachable. */
  disabled?: boolean | undefined;
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
 * chosen suggestion has them — so picking is mandatory. Enter picks: with no
 * cursor moved it takes the first suggestion, which is what someone who typed
 * a name and pressed Enter means, and it is the geocoder's own best answer.
 */
export function PlaceInput({
  label,
  role,
  value,
  onChange,
  bounds,
  action,
  note,
  disabled,
}: Props) {
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

  /*
   * A chosen place set from outside — the swap button, or a restored URL —
   * replaces whatever is typed. Typing over a chosen place also clears it, and
   * that clear arrives back here as a change like any other; see the input's
   * own `onChange` for how the two are told apart.
   */
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
        .search(trimmed, {
          signal: controller.signal,
          language: locale,
          ...(bounds ? { bounds } : {}),
        })
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
  }, [trimmed, locale, dormant, bounds]);

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
    if (event.key === 'Enter' && open && suggestions.length > 0) {
      /*
       * With a cursor moved, Enter takes what it is on. With no cursor moved it
       * takes the first result: someone who typed a name and pressed Enter has
       * named a place, and asking them to arrow down one step to confirm the
       * geocoder's own top answer is a keystroke that buys nothing.
       */
      const place = suggestions[activeIndex >= 0 ? activeIndex : 0];
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
      <label
        htmlFor={inputId}
        className="text-content-muted text-xs font-medium tracking-wide uppercase"
      >
        {label}
      </label>

      {/*
        `items-stretch` and no end padding, so an action button can run the full
        height of the field and share its border rather than floating inside it
        with a sliver of background showing around the outside.
      */}
      <div className="rounded-control border-border-strong bg-surface focus-within:border-brand-500 flex items-stretch overflow-hidden border ps-3">
        <span aria-hidden="true" className="flex flex-none items-center">
          {role === 'origin' ? <OriginMarker /> : <DestinationMarker />}
        </span>
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled ?? false}
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-describedby={statusId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          value={query}
          /*
             An example, on top of the label above — never instead of it. A
             placeholder disappears the moment somebody types, so it cannot
             carry the field's name; what it can do is answer "what sort of
             thing goes here", which for a geocoder field is worth saying
             because an address, a landmark and a stop all work.
          */
          placeholder={t(
            role === 'origin'
              ? strings.planner.originPlaceholder
              : strings.planner.destinationPlaceholder,
          )}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value !== null) {
              /*
               * Typing after choosing invalidates the choice: the text no
               * longer stands for a set of coordinates.
               *
               * `lastValue` is moved in the same breath, because the clear is
               * ours. Without it the null coming back from the parent looked
               * like an outside change, and the sync above answered it by
               * setting the field to that value's label — an empty string. The
               * visible effect was that the first keystroke over a chosen
               * place wiped the whole field instead of appending to it.
               */
              setLastValue(null);
              onChange(null);
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          /*
             No `dir="auto"` here, deliberately, and it is the one input where
             that matters. Auto lets the *field* take the direction of what is
             typed, so a Latin name in an Arabic page flipped the whole box to
             LTR and the text sat against the far edge, away from the marker it
             belongs beside. Inheriting the page's direction anchors the text
             where the field starts, and bidi still renders a Latin name
             left-to-right inside it — the box follows the page, the text
             follows itself.
          */
          /*
             Symmetric padding, deliberately, where everything else here is
             logical. `dir="auto"` means this input resolves its *own*
             direction from what is typed into it — so a Latin name in an
             Arabic page makes the field LTR, and a `pe-2` that was the left
             side a moment ago becomes the right one, leaving the text flush
             against the border it started at.
          */
          className="placeholder:text-content-muted min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-medium placeholder:font-normal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        {action}
      </div>

      {note}

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
                  <SuggestionIcon place={place} />
                  <span className="min-w-0 flex-1">
                    {/* The box follows the page so it stays beside its icon;
                        only the text inside it follows the name. */}
                    <span className="block truncate text-sm font-medium">
                      <span dir="auto">{place.label}</span>
                    </span>
                    <SuggestionDetail place={place} />
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

/**
 * The marker for one suggestion.
 *
 * A stop whose serving modes are known is drawn as that mode, using the same
 * silhouettes the itinerary uses — so the rail platform and the bus stand that
 * share the name "Pasilan asema" are told apart before either is chosen. A
 * stop serving several modes takes the first, because the row has space for one
 * icon and the second line names the rest.
 *
 * Anything unknown keeps the neutral pin. Guessing "bus" for every stop, which
 * is what defaulting does, is worse than the generic marker: it is confidently
 * wrong at the exact moment someone is choosing between platforms.
 */
function SuggestionIcon({ place }: { place: Place }) {
  const mode = place.modes?.[0];

  return (
    <span aria-hidden="true" className="flex-none">
      {place.kind !== 'stop' ? (
        <PinIcon />
      ) : mode === undefined ? (
        <GenericStopIcon />
      ) : (
        <span className={`${modeInk(mode)} block`}>
          <ModeIcon routeType={mode} size={20} />
        </span>
      )}
    </span>
  );
}

/**
 * The second line: where the place is, and — for a stop — how to identify it
 * on the ground.
 *
 * Code and platform earn their space only on a stop, and only when the
 * geocoder supplied them. Six results named "Pasila" are unusable without
 * them; on an address they would be clutter.
 */
function SuggestionDetail({ place }: { place: Place }) {
  const { strings, t } = useLocale();

  const parts: string[] = [];
  if (place.platform !== null) {
    parts.push(t(strings.planner.platform, { platform: place.platform }));
  }
  if (place.stopCode !== null) parts.push(place.stopCode);
  if (place.context !== null) parts.push(place.context);

  if (parts.length === 0) return null;

  return (
    <span className="text-content-muted block truncate text-xs">
      {/*
        Joined with a separator rather than assembled into a sentence: these
        are independent labels, not clauses, so no word order is being
        implied and nothing needs translating as a whole.
      */}
      <span dir="auto">{parts.join(' · ')}</span>
    </span>
  );
}

/** Mode colour for a suggestion marker, mirroring the itinerary's palette. */
function modeInk(routeType: number): string {
  switch (routeType) {
    case 0:
    case 5:
      return 'text-mode-tram';
    case 1:
      return 'text-mode-metro';
    case 2:
    case 7:
    case 12:
      return 'text-mode-train';
    case 4:
    case 6:
      return 'text-mode-ferry';
    default:
      return 'text-mode-bus';
  }
}

const iconProps = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const PinIcon = () => (
  <svg {...iconProps} className="text-content-muted">
    <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

/** A stop the geocoder recognised but could not say anything more about. */
const GenericStopIcon = () => (
  <svg {...iconProps} className="text-content-muted">
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </svg>
);
