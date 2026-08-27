import { useId, useMemo, useState } from 'react';
import { formatDate, useLocale } from '../../i18n';
import type { Dictionary, Message } from '../../i18n/dictionary';
import type { LineVariant } from '../../types/route';
import { serviceRange, standingOn, type ServiceStanding } from './daySpan';

interface Props {
  variants: LineVariant[];
  /** Which one is on screen, so the list can say where you already are. */
  currentPatternId: number;
  /** The day to judge each variant against. Null before the clock is known. */
  day: string | null;
  onSelect: (patternId: number) => void;
}

/** The order the groups read in: what you can ride, then what you cannot yet. */
const ORDER: ServiceStanding[] = ['running', 'onOtherDays', 'upcoming', 'past', 'unknown'];

function headingFor(standing: ServiceStanding, strings: Dictionary): Message {
  switch (standing) {
    case 'running':
      return strings.routes.runningNow;
    case 'onOtherDays':
      return strings.routes.runsOnOtherDays;
    case 'upcoming':
      return strings.routes.startingLater;
    case 'past':
      return strings.routes.noLongerRunning;
    default:
      return strings.routes.noServiceDays;
  }
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
 * **Grouped by whether they run.** Flat, thirty-nine variants are a set of
 * equally plausible wrong answers: seven of tram H's do not start until later
 * in the feed's window, and nothing on screen said so. Sorted by the day being
 * looked at rather than by a hardcoded today, so the grouping agrees with the
 * timetable the reader is holding.
 *
 * Each is named by its sign and dated by its **calendar** range rather than by
 * its clock. Two short workings both running "05:13 to 06:53" are told apart by
 * the months they cover, not by the hours.
 *
 * Collapsed by default. The everyday service arrives first — `variants` comes
 * back busiest-first — so it is already on screen, and opening thirty-nine rows
 * between the header and the stops serves a choice almost nobody makes.
 *
 * Ordinary disclosure rather than `<details>`: the state is needed to word the
 * control, and a `<summary>` cannot be labelled differently open and closed
 * without script anyway.
 */
export function VariantPicker({ variants, currentPatternId, day, onSelect }: Props) {
  const { locale, strings, t } = useLocale();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const groups = useMemo(() => {
    const byStanding = new Map<ServiceStanding, LineVariant[]>();
    for (const variant of variants) {
      const standing = standingOn(variant.serviceDates, day);
      const bucket = byStanding.get(standing);
      if (bucket === undefined) byStanding.set(standing, [variant]);
      else bucket.push(variant);
    }
    // Order is fixed rather than insertion-based, so the list does not reshuffle
    // as the chosen day moves across a variant's first service date.
    return ORDER.map((standing) => ({
      standing,
      variants: byStanding.get(standing) ?? [],
    })).filter((group) => group.variants.length > 0);
  }, [variants, day]);

  // One variant is not a choice, and there is nothing to call an alternative.
  if (variants.length < 2) return null;

  const dated = (isoDate: string) =>
    formatDate(isoDate, locale, { day: 'numeric', month: 'short' });

  return (
    /*
      `items-stretch` so the panel is exactly as wide as the control that opens
      it. In a flex column that is the default, and it is stated because the
      panel reading wider than its own trigger was the thing that looked wrong.
    */
    <section className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex w-full cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-start text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
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
        /*
          Bordered and bounded. A line can have thirty-nine of these, which
          unbounded pushes the stops off the panel entirely — so the list
          scrolls inside its own box rather than lengthening the page.
        */
        <div
          id={panelId}
          className="rounded-control border-border-strong bg-surface flex max-h-96 w-full flex-col gap-3 overflow-y-auto border p-3"
        >
          <h2 className="text-content-muted text-xs font-semibold tracking-wide uppercase">
            {t(strings.routes.alternativeRoutes)}
          </h2>

          {groups.map((group) => (
            <section key={group.standing} className="flex flex-col gap-1">
              {/*
                A heading per group, and only where there is more than one — on
                a line whose variants all run, "Running now" over every row says
                nothing worth the space.
              */}
              {groups.length > 1 && (
                <h3 className="text-content-muted border-border border-b pb-1 text-xs font-semibold">
                  {t(headingFor(group.standing, strings))}
                </h3>
              )}

              <ul className="flex flex-col">
                {group.variants.map((variant) => {
                  const current = variant.patternId === currentPatternId;
                  const range = serviceRange(variant.serviceDates);

                  const facts = [
                    t(strings.routes.stopCount, { count: variant.stopCount }),
                    range === null
                      ? t(strings.routes.noServiceDays)
                      : t(strings.routes.serviceRange, {
                          from: dated(range.from),
                          to: dated(range.to),
                        }),
                  ];

                  return (
                    <li key={variant.patternId}>
                      <button
                        type="button"
                        onClick={() => onSelect(variant.patternId)}
                        /*
                          The one on screen is still a button and still
                          reachable. Disabling it would take it out of the tab
                          order, so a keyboard reader arriving here could not
                          tell which row they are already looking at — which is
                          the one thing the list is here to say. Pressing it is a
                          no-op the host absorbs.
                        */
                        aria-current={current ? 'true' : undefined}
                        className={`border-border hover:bg-surface-muted focus-visible:outline-brand-500 rounded-control -mx-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer flex-col gap-0.5 border-b px-1.5 py-2 text-start last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                          current ? 'bg-surface-muted' : ''
                        }`}
                      >
                        <span className="flex items-baseline gap-2">
                          {/*
                            Both ends, always — never the destination alone.

                            These are variants of one line, so a great many of
                            them share a headsign: tram 1 has two patterns both
                            signed "Käpylä", told apart only by the fact that one
                            starts at the depot and the other four stops further
                            down. "towards Käpylä" twice is a list you cannot
                            choose from.

                            The arrow is drawn rather than written, and mirrors
                            with the page. A "→" character is bidi-neutral, so in
                            an Arabic panel full of Latin stop names it lands
                            wherever the surrounding runs put it — which is not
                            reliably between the two names, and not reliably
                            pointing the way the reader is reading. An SVG
                            flipped by `rtl:-scale-x-100` is neither.

                            Not a translated sentence assembled from pieces: both
                            operands are proper nouns out of the feed and the
                            connector is a glyph. The spoken version underneath
                            is one message with two placeholders, as it must be.
                          */}
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                            <span dir="auto" className="min-w-0 truncate">
                              {variant.originStopName ?? ''}
                            </span>
                            <svg
                              viewBox="0 0 20 20"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="text-content-muted flex-none rtl:-scale-x-100"
                            >
                              <path d="M3 10h13M11 5l5 5-5 5" />
                            </svg>
                            <span dir="auto" className="min-w-0 truncate">
                              {variant.terminusStopName ?? ''}
                            </span>
                            <span className="sr-only">
                              {t(strings.routes.originToTerminus, {
                                origin: variant.originStopName ?? '',
                                terminus: variant.terminusStopName ?? '',
                              })}
                            </span>
                          </span>
                          {current && (
                            <span className="text-content-muted flex-none text-xs">
                              {t(strings.routes.currentVariant)}
                            </span>
                          )}
                        </span>

                        <span className="text-content-muted text-xs tabular-nums">
                          {/*
                            Joined with a middot rather than translated glue. A
                            separator is punctuation, not a word, so it needs no
                            locale of its own — and building one sentence out of
                            three would be exactly the concatenation to avoid.
                          */}
                          {facts.join(' · ')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
