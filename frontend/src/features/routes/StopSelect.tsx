import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Chevron } from '../../components/DateSelect';
import { Popover } from '../../components/Popover';
import { centerOnOption } from '../../components/centerOnOption';
import { useLocale } from '../../i18n';
import type { PatternStop } from '../../types/route';

interface Props {
  label: string;
  /** The chosen stop's `sequence`, or null when there is nothing to choose. */
  value: number | null;
  onChange: (sequence: number) => void;
  stops: PatternStop[];
  disabled?: boolean | undefined;
}

/**
 * Picks one stop of a line.
 *
 * A listbox rather than a native `<select>`, which is what this was.
 *
 * The native control is genuinely good at this — keyboard type-ahead, a
 * platform picker on a phone, a spoken option count — and it was chosen for
 * exactly that. What it cannot do is look like the rest of the app: it draws
 * its own caret, its own focus ring and its own padding, none of which the
 * theme reaches, so two fields sitting under a date picker built the other way
 * were visibly a different control. Consistency won, and everything the native
 * one gave for free is what the markup below has to earn.
 *
 * Keyed and valued by {@link PatternStop.sequence}, not by stop id: a loop
 * route calls at the same stop twice, so an id is not unique down a pattern,
 * and the two calls are genuinely different choices.
 */
export function StopSelect({ label, value, onChange, stops, disabled }: Props) {
  const { strings, t } = useLocale();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const chosenIndex = stops.findIndex((stop) => stop.sequence === value);
  const chosen = stops[chosenIndex];

  /*
   * Opened *at* the chosen stop rather than at the top of the line. A pattern
   * runs to sixty-six stops, so one picked near the end is otherwise off-screen
   * with no sign it is even selected — and a layout effect puts it there before
   * the first paint, so the list never appears to scroll itself.
   */
  useLayoutEffect(() => {
    if (!open) return;
    centerOnOption(listRef.current, chosenIndex);
  }, [open, chosenIndex]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
      <span
        id={labelId}
        className="text-content-muted text-xs font-medium tracking-wide uppercase"
      >
        {label}
      </span>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${labelId}-value`}
        disabled={disabled ?? false}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        /*
          `pe-3` against the caret's own `flex-none`, so the chevron keeps a
          full step of space from the edge. Native selects draw their caret hard
          against the border and that was the tell that these two fields were
          not the same control as the date picker above them.
        */
        className="rounded-control border-border-strong bg-surface hover:border-brand-500 focus-visible:outline-brand-500 flex cursor-pointer items-center gap-2 border py-2.5 ps-3 pe-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          id={`${labelId}-value`}
          dir="auto"
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {chosen?.name ?? ''}
        </span>
        <Chevron open={open} />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        labelledBy={labelId}
      >
        <div
          ref={listRef}
          role="listbox"
          aria-labelledby={labelId}
          /* `relative` so the centring helper measures offsets from here. */
          className="relative max-h-72 overflow-y-auto"
        >
          {stops.map((stop) => (
            <button
              key={stop.sequence}
              type="button"
              role="option"
              aria-selected={stop.sequence === value}
              onClick={() => {
                onChange(stop.sequence);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="rounded-control hover:bg-surface-muted aria-selected:bg-brand-50 aria-selected:text-brand-700 flex w-full cursor-pointer items-baseline gap-2 px-3 py-2 text-start text-sm aria-selected:font-semibold"
            >
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {stop.name}
              </span>
              {/*
                The code printed on the pole, which is what tells six stops
                called "Pasila" apart — the one thing a list of names alone
                cannot do.

                Bare, not "Stop H0446". Every row in this list is a stop, so the
                word is true of all of them and distinguishes none, and it
                doubles the width of a column whose whole job is a short code
                beside a long name. It stays in the spoken version, where there
                is no column to read it off.
              */}
              {stop.code !== null && (
                <span className="text-content-muted flex-none text-xs tabular-nums">
                  <span aria-hidden="true">{stop.code}</span>
                  <span className="sr-only">
                    {t(strings.stops.stopCode, { code: stop.code })}
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
