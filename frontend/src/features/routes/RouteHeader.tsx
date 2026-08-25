import { formatClockTime, useLocale } from '../../i18n';
import { LineBadge } from '../stops/LineBadge';
import type { LineVariantDetail } from '../../types/route';

interface Props {
  variant: LineVariantDetail;
  /**
   * Where the flip goes, or null when there is nowhere to flip to.
   *
   * Resolved by the caller from the line's variants rather than worked out here:
   * a direction only exists if a pattern runs it, and this component sees one
   * pattern. Null is the honest state for a feed with no `direction_id` at all,
   * and for a line that genuinely only runs one way.
   */
  onFlip: (() => void) | null;
}

/**
 * Who this line is, and which way round it is being shown.
 *
 * The designation wears its mode, as it does on every board — the same badge,
 * unlinked, because pressing it would lead here. Under it the long name, which
 * is the operator's own description of the route and often the only place the
 * middle of the line is named at all.
 *
 * Then where this variant runs, as one message rather than two labels with an
 * arrow between them: word order differs between languages, and a sentence
 * assembled from fragments cannot follow it.
 *
 * The span is the line's **lifetime** span across every service day, not the
 * chosen day's, so it is worded as a property of the line. Saying "runs 05:37
 * to 21:09" beside a date would read as a claim about that date.
 */
export function RouteHeader({ variant, onFlip }: Props) {
  const { locale, strings, t } = useLocale();

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
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <LineBadge
          lineId={variant.lineId}
          routeShortName={variant.routeShortName}
          routeType={variant.routeType}
        />
        {/*
          No `dir="auto"` on the box. It resolves from the first strong
          character, so a Latin route name would turn the whole heading
          left-to-right and strand it at the far side of an Arabic page. The box
          follows the document; bidi still renders the name itself correctly
          inside it.
        */}
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight text-balance">
          {variant.routeLongName ?? variant.routeShortName}
        </h1>
      </div>

      {/*
        Where this variant runs, and the way back. The two sit on one line
        because the flip acts on exactly this sentence — it is what turns
        "Telakkakatu to Pohjolanaukio" into the other one.
      */}
      {(variant.originStopName !== null || variant.terminusStopName !== null) && (
        <div className="flex items-center gap-2">
          <p dir="auto" className="text-content min-w-0 flex-1 text-sm font-medium">
            {t(strings.routes.originToTerminus, {
              origin: variant.originStopName ?? '',
              terminus: variant.terminusStopName ?? '',
            })}
          </p>

          {onFlip !== null && (
            <button
              type="button"
              onClick={onFlip}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex flex-none cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {/*
                Mirrors in RTL: two arrows pointing opposite ways still have a
                leading one, and which end leads is what the page's direction
                decides.
              */}
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="rtl:-scale-x-100"
              >
                <path d="M3 7h11l-3-3M17 13H6l3 3" />
              </svg>
              {t(strings.routes.flipDirection)}
            </button>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <ul className="text-content-muted flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {facts.map((fact) => (
            <li
              key={fact}
              className="rounded-control bg-surface-muted px-2 py-0.5 tabular-nums"
            >
              {fact}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
