import { useEffect, useId, useState } from 'react';
import { getLines } from '../../api/routes';
import { messageForApiError, modeLabel, useLocale } from '../../i18n';
import type { GtfsRouteType } from '../../types/journey';
import type { LineSummary } from '../../types/route';
import { ModeIcon } from '../journey/modeIcons';
import { modeVisual } from '../journey/modeVisuals';
import { LineBadge } from '../stops/LineBadge';

interface Props {
  /** Every mode this network runs, so the filter offers a stable set. */
  availableModes: GtfsRouteType[];
  onOpen: (lineId: string) => void;
}

/**
 * How long after a keystroke the index is asked again.
 *
 * The search is server-side — it folds diacritics so "hameentie" finds
 * "Hämeentie", which is not something to reimplement here — so every keystroke
 * is a request, and a quarter of a second is the pause that stops a typist from
 * making one per letter. The same settle the map's stop layer uses.
 */
const SETTLE_MS = 250;

/**
 * The lines this network runs.
 *
 * Filtered at the API rather than in the browser, which is the opposite of what
 * the departure boards do — and for a reason. A stop's whole board is already in
 * hand, so narrowing it costs nothing; the line index is 464 entries and ~70 kB
 * for HSL, and the backend already folds diacritics and matches long names.
 *
 * One mode at a time, not a set. `/api/routes` takes a single `mode`, and a
 * multi-select that had to be re-implemented client-side over a server-filtered
 * list would disagree with itself the moment the two filters were both active.
 * So this control is a radio group wearing chips: pressing the active one
 * releases it back to all.
 */
export function LineBrowser({ availableModes, onOpen }: Props) {
  const { strings, t } = useLocale();
  const searchId = useId();
  const modeLabelId = useId();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<GtfsRouteType | null>(null);
  const [lines, setLines] = useState<LineSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const timer = window.setTimeout(() => {
      void getLines({
        q: query,
        ...(mode === null ? {} : { mode }),
        signal: controller.signal,
      })
        .then((answer) => {
          if (controller.signal.aborted) return;
          setLines(answer.lines);
          setErrorMessage(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setLines(null);
          setErrorMessage(t(messageForApiError(error, strings)));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SETTLE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // `t` and `strings` are stable for a locale; the query is what this is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode]);

  const filtered = query !== '' || mode !== null;

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {t(strings.pages.routes.title)}
        </h1>
        <p className="text-content-muted text-sm">{t(strings.routes.browseHint)}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={searchId}
          className="text-content-muted text-xs font-medium tracking-wide uppercase"
        >
          {t(strings.routes.searchLines)}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          /* An example of what goes in the field, on top of its label and never
             instead of one. */
          placeholder={t(strings.routes.searchPlaceholder)}
          className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted hover:border-brand-500 focus-visible:outline-brand-500 w-full border px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>

      {availableModes.length > 1 && (
        /*
          A radio group, because `/api/routes` takes one mode. Chips rather than
          circles, so this row reads as the map's legend does elsewhere — each
          wears the colour its lines wear — but the semantics underneath are the
          honest ones: exactly one of these is true at a time.
        */
        <div role="radiogroup" aria-labelledby={modeLabelId} className="flex flex-col gap-2">
          <span
            id={modeLabelId}
            className="text-content-muted text-xs font-semibold tracking-wide uppercase"
          >
            {t(strings.stops.filterByMode)}
          </span>

          <div className="flex flex-wrap gap-1.5">
            {availableModes.map((option) => {
              const on = mode === option;

              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  // Pressing the chosen one releases it. Without that the group
                  // has no way back to "every mode" once a mode is picked.
                  onClick={() => setMode(on ? null : option)}
                  className={`rounded-control focus-visible:outline-brand-500 flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    on
                      ? `${modeVisual(option).fill} text-on-mode border-transparent`
                      : 'border-border-strong text-content-muted hover:bg-surface-muted'
                  }`}
                >
                  <ModeIcon routeType={option} size={16} />
                  {/* The name beside the silhouette: mode is never carried by
                      shape or colour alone. */}
                  {modeLabel(option, strings)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {errorMessage !== null && (
        <p role="alert" className="rounded-card border-danger text-danger border px-4 py-3 text-sm">
          {errorMessage}
        </p>
      )}

      <p aria-live="polite" aria-busy={loading} className="text-content-muted text-xs">
        {loading
          ? t(strings.routes.loadingLines)
          : lines === null
            ? ''
            : t(strings.routes.lineCount, { count: lines.length })}
      </p>

      {lines !== null && lines.length === 0 && (
        <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
          {/* Their own search emptied it, which they can undo. A feed with no
              lines at all is a different sentence, and not one HSL can produce. */}
          {t(strings.routes.noMatchingLines)}
        </p>
      )}

      <ul className="flex flex-col">
        {(lines ?? []).map((line) => (
          <li key={line.lineId}>
            <button
              type="button"
              onClick={() => onOpen(line.lineId)}
              className="border-border hover:bg-surface-muted focus-visible:outline-brand-500 rounded-control -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 border-b px-2 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <LineBadge
                lineId={line.lineId}
                routeShortName={line.routeShortName}
                routeType={line.routeType}
              />

              {/*
                Sized to its own text rather than stretched. Stretched,
                `dir="auto"` makes the *box* left-to-right for a Latin name, so
                the words sit at the far left of it while the badge stays at the
                right of an Arabic page.
              */}
              <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">
                {line.routeLongName ?? line.routeShortName}
              </span>

              {line.variantCount > 1 && (
                <span className="text-content-muted flex-none text-xs tabular-nums">
                  {t(strings.routes.variantCount, { count: line.variantCount })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {filtered && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setMode(null);
          }}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer self-start px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.routes.clearSearch)}
        </button>
      )}
    </div>
  );
}
