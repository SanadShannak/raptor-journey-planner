import { useId, useState } from 'react';
import { formatClockTime, useLocale } from '../../i18n';
import type { LineVariant } from '../../types/route';

interface Props {
  variants: LineVariant[];
  /** Which one is on screen, so the list can say where you already are. */
  currentPatternId: number;
  onSelect: (patternId: number) => void;
}

/**
 * The other stop sequences this same line runs.
 *
 * A line is one designation over several patterns: the two directions, and
 * usually short workings that turn back early — HSL's tram 1 has four, and its
 * rail H has thirty-nine. Riders think of all of those as the same line, which
 * is why they belong here as alternatives rather than as separate entries in
 * the index.
 *
 * Collapsed by default. The everyday service is the one that arrives first
 * (`variants` comes back busiest-first), so it is the one already on screen, and
 * a reader who wanted the 05:13 depot run will go looking. Opening it by
 * default would put thirty-nine rows between the header and the stops for a
 * choice almost nobody makes.
 *
 * Ordinary disclosure rather than `<details>`: the state is needed to word the
 * control, and a `<summary>` cannot be labelled differently open and closed
 * without script anyway.
 */
export function VariantPicker({ variants, currentPatternId, onSelect }: Props) {
  const { locale, strings, t } = useLocale();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // One variant is not a choice, and there is nothing to call an alternative.
  if (variants.length < 2) return null;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-start text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span>
          {t(open ? strings.routes.hideAlternatives : strings.routes.showAlternatives)}
        </span>
        {/* A chevron turns rather than mirrors: down and up are the same in
            both directions of reading. */}
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`text-content-muted flex-none transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-2">
          <h2 className="text-content-muted text-xs font-semibold tracking-wide uppercase">
            {t(strings.routes.alternativeRoutes)}
          </h2>

          <ul className="flex flex-col">
            {variants.map((variant) => {
              const current = variant.patternId === currentPatternId;

              const facts = [
                t(strings.routes.stopCount, { count: variant.stopCount }),
                variant.tripCount === null
                  ? null
                  : t(strings.routes.tripCount, { count: variant.tripCount }),
                variant.firstDeparture === null || variant.lastDeparture === null
                  ? null
                  : t(strings.routes.operatingSpan, {
                      first: formatClockTime(variant.firstDeparture, locale),
                      last: formatClockTime(variant.lastDeparture, locale),
                    }),
              ].filter((fact): fact is string => fact !== null);

              return (
                <li key={variant.patternId}>
                  <button
                    type="button"
                    onClick={() => onSelect(variant.patternId)}
                    /*
                      The one on screen is still a button and still reachable.
                      Disabling it would take it out of the tab order, so a
                      keyboard reader arriving at this list could not tell which
                      row they are already looking at — which is the one thing
                      the list is here to say. Pressing it is a no-op the host
                      absorbs.
                    */
                    aria-current={current ? 'true' : undefined}
                    className={`border-border hover:bg-surface-muted focus-visible:outline-brand-500 rounded-control -mx-2 flex w-[calc(100%+1rem)] cursor-pointer flex-col gap-0.5 border-b px-2 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      current ? 'bg-surface-muted' : ''
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span dir="auto" className="min-w-0 flex-1 text-sm font-medium">
                        {variant.headsign !== null
                          ? t(strings.routes.towards, { destination: variant.headsign })
                          : t(strings.routes.originToTerminus, {
                              origin: variant.originStopName ?? '',
                              terminus: variant.terminusStopName ?? '',
                            })}
                      </span>
                      {current && (
                        <span className="text-content-muted flex-none text-xs">
                          {t(strings.routes.currentVariant)}
                        </span>
                      )}
                    </span>

                    {facts.length > 0 && (
                      <span className="text-content-muted text-xs tabular-nums">
                        {/*
                          Joined with a middot rather than translated glue. A
                          separator is punctuation, not a word, so it needs no
                          locale of its own — and building one sentence out of
                          three would be exactly the concatenation to avoid.
                        */}
                        {facts.join(' · ')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
