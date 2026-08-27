import { useEffect, useId, useMemo, useState } from 'react';
import { getLines } from '../../api/routes';
import { useBackendHealth } from '../../app/useBackendHealth';
import { messageForApiError, modeLabel, useLocale } from '../../i18n';
import type { GtfsRouteType } from '../../types/journey';
import type { LineSummary } from '../../types/route';
import { ModeIcon } from '../journey/modeIcons';
import { modeVisual } from '../journey/modeVisuals';
import { LineBadge } from '../stops/LineBadge';
import { toggleSelection } from '../stops/toggleSelection';

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
 * The text search is server-side — the backend already folds diacritics and
 * matches long names, which is not something to reimplement here — but the
 * mode filter is not. `/api/routes` takes a single `mode`, while the stop
 * boards' own mode filter is a set with the empty set meaning "all". Sending
 * only one at a time to the API and filtering the rest client-side would give
 * this control two different behaviours depending on how many modes were
 * picked, so the request only ever carries `q`, and every mode on the answer
 * is narrowed here — the same client-side filtering the boards already do,
 * just over a server-searched list instead of a server-fetched stop.
 */
export function LineBrowser({ availableModes, onOpen }: Props) {
  const { strings, t } = useLocale();
  const { service } = useBackendHealth();
  const searchId = useId();
  const modeLabelId = useId();

  const [query, setQuery] = useState('');
  const [modes, setModes] = useState<ReadonlySet<GtfsRouteType>>(new Set());
  const [lines, setLines] = useState<LineSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const timer = window.setTimeout(() => {
      void getLines({ q: query, signal: controller.signal })
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
  }, [query]);

  const shown = useMemo(
    () => (lines ?? []).filter((line) => modes.size === 0 || modes.has(line.routeType)),
    [lines, modes],
  );

  const toggleMode = (mode: GtfsRouteType) =>
    setModes(toggleSelection(modes, mode, availableModes));

  const filtered = query !== '' || modes.size > 0;

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
          Real checkboxes, the same set the stop boards filter by: the empty
          set means every mode, and picking one narrows to it without letting
          go of the others — pressing a second mode adds to the first rather
          than replacing it.
        */
        <fieldset>
          <legend
            id={modeLabelId}
            className="text-content-muted mb-2 text-xs font-semibold tracking-wide uppercase"
          >
            {t(strings.stops.filterByMode)}
          </legend>

          <div className="flex flex-wrap gap-1.5">
            {availableModes.map((option) => {
              const on = modes.size === 0 || modes.has(option);

              return (
                <label
                  key={option}
                  className={`rounded-control focus-within:outline-brand-500 flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-sm font-medium transition-colors focus-within:outline-2 focus-within:outline-offset-2 ${
                    on
                      ? `${modeVisual(option).fill} text-on-mode border-transparent`
                      : 'border-border-strong text-content-muted hover:bg-surface-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMode(option)}
                    className="sr-only"
                  />
                  <ModeIcon routeType={option} size={16} />
                  {/* The name beside the silhouette: mode is never carried by
                      shape or colour alone. */}
                  {modeLabel(option, strings)}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/*
        The backend being down is a fact the shared header already states —
        this only says that *this list* has nothing to show while it is,
        rather than waiting out this request's own timeout to say so.
      */}
      {service === 'down' ? (
        <p role="alert" className="rounded-card border-danger text-danger border px-4 py-3 text-sm">
          {t(strings.status.resultsUnavailable)}
        </p>
      ) : (
        errorMessage !== null && (
          <p role="alert" className="rounded-card border-danger text-danger border px-4 py-3 text-sm">
            {errorMessage}
          </p>
        )
      )}

      <p aria-live="polite" aria-busy={loading && service !== 'down'} className="text-content-muted text-xs">
        {service === 'down'
          ? ''
          : loading
            ? t(strings.routes.loadingLines)
            : lines === null
              ? ''
              : t(strings.routes.lineCount, { count: shown.length })}
      </p>

      {lines !== null && shown.length === 0 && (
        <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
          {/* Their own search emptied it, which they can undo. A feed with no
              lines at all is a different sentence, and not one HSL can produce. */}
          {t(strings.routes.noMatchingLines)}
        </p>
      )}

      <ul className="flex flex-col">
        {shown.map((line) => (
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
                right of an Arabic page. Unstretched it shrinks and truncates
                inside whatever the row leaves it — `min-w-0` overrides a flex
                item's default `min-width: auto`, which would otherwise refuse
                to shrink below the text's own width and stop `truncate` ever
                firing — and sits flush against the badge either way the page
                runs, with the count pushed to the far end by its own margin.
              */}
              <span dir="auto" className="min-w-0 truncate text-sm font-medium">
                {line.routeLongName ?? line.routeShortName}
              </span>

              {/*
                Whether it runs today is worth more on a browse list than how
                many patterns it has — "3 variants" says nothing about whether
                today is one of the days any of them call, which is the actual
                question a reader scanning this list is asking. Takes over the
                same slot rather than sitting beside it, since the two are
                answering different questions about the same line, and a line
                that isn't running today says nothing at all rather than
                falling back to the variant count.

                The dot is decorative — the word "today" beside it is what
                carries the meaning, so colour is never the only signal.
              */}
              {line.activeToday && (
                <span className="bg-surface-muted text-content-muted rounded-control ms-auto flex flex-none items-center gap-1.5 px-2 py-0.5 text-xs font-medium">
                  <span aria-hidden="true" className="bg-success size-1.5 flex-none rounded-full" />
                  {t(strings.routes.activeToday)}
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
            setModes(new Set());
          }}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer self-start px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.routes.clearSearch)}
        </button>
      )}
    </div>
  );
}
