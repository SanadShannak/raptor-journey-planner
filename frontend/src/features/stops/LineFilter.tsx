import { useLocale } from '../../i18n';
import type { ServingLine } from '../../types/stop';
import { ModeIcon } from '../journey/modeIcons';
import { modeVisual } from '../journey/modeVisuals';

interface Props {
  lines: ServingLine[];
  /** Empty means every line, which is not the same as none of them. */
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
}

/**
 * Narrows a board to the lines somebody cares about.
 *
 * Filtering happens here rather than at the API, which takes no line parameter
 * on either stop endpoint. That is the right place for it anyway: the whole
 * board is already in hand, so toggling a line is instant and costs no request.
 *
 * The empty set means *all*, not *none*. A filter that starts by hiding
 * everything is a puzzle, and there is no state in which a reader wants an
 * empty board they did not ask for — pressing the last selected line off
 * returns to showing everything.
 *
 * Real checkboxes rather than buttons with `aria-pressed`. This is a set of
 * independent choices, which is what a checkbox group is; a screen reader then
 * announces the count and the state without being told to.
 */
export function LineFilter({ lines, selected, onChange }: Props) {
  const { strings, t } = useLocale();

  if (lines.length < 2) return null;

  const toggle = (lineId: string) => {
    const next = new Set(selected);
    if (!next.delete(lineId)) next.add(lineId);
    onChange(next);
  };

  return (
    <fieldset>
      {/*
        A legend does not participate in the fieldset's flex layout — it is
        taken out of flow and placed on the border box — so the gap that would
        space it from the chips never applies to it. The margin is the thing
        that actually works here.
      */}
      <legend className="text-content-muted mb-2 text-xs font-semibold tracking-wide uppercase">
        {t(strings.stops.filterByLine)}
      </legend>

      <div className="flex flex-wrap gap-1.5">
        {lines.map((line) => {
          const on = selected.size === 0 || selected.has(line.lineId);

          return (
            <label
              key={line.lineId}
              className={`rounded-control flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-sm font-semibold tabular-nums transition-colors focus-within:outline-brand-500 focus-within:outline-2 focus-within:outline-offset-2 ${
                on
                  ? `${modeVisual(line.routeType).fill} text-on-mode border-transparent`
                  : 'border-border-strong text-content-muted hover:bg-surface-muted'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(line.lineId)}
                onChange={() => toggle(line.lineId)}
                // Focus lands on the label's ring via `focus-within`, which
                // keeps the indicator on the thing that looks pressable.
                className="sr-only"
              />
              <ModeIcon routeType={line.routeType} size={15} />
              <span dir="auto">{line.routeShortName}</span>
            </label>
          );
        })}

        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.stops.clearFilter)}
          </button>
        )}
      </div>
    </fieldset>
  );
}
