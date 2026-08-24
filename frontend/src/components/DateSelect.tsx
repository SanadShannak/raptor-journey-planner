import { useId, useLayoutEffect, useRef, useState } from 'react';
import { formatDate, useLocale } from '../i18n';
import { Popover } from './Popover';
import { centerOnOption } from './centerOnOption';

interface Props {
  label: string;
  value: string;
  onChange: (date: string) => void;
  /** Exactly the days the loaded timetable covers, ascending. */
  options: string[];
  /** Today on the network's clock, so the relative labels are honest. */
  today: string | null;
  disabled?: boolean | undefined;
}

/**
 * Picks a service date.
 *
 * A list rather than a calendar, because the choice is not "any date" — it is
 * one of the sixty-odd days this timetable actually covers. A calendar would
 * show hundreds of days that the engine will refuse, and greying them out
 * still invites the click.
 *
 * The nearest days are named rather than numbered. "Tomorrow" is how someone
 * thinks about the trip they are planning; the date is there underneath for
 * when it matters.
 */
export function DateSelect({
  label,
  value,
  onChange,
  options,
  today,
  disabled,
}: Props) {
  const { locale, strings, t } = useLocale();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const selectedIndex = options.indexOf(value);

  /*
   * Opened *at* the chosen date rather than at the start of the feed's sixty
   * days. Sixty entries means a date two months out is otherwise off-screen
   * with no indication it is even selected — and a layout effect puts it there
   * before the first paint, so the list never appears to scroll itself.
   */
  useLayoutEffect(() => {
    if (!open) return;
    centerOnOption(listRef.current, selectedIndex);
  }, [open, selectedIndex]);

  /**
   * Days either side of today, resolved from the network's clock rather than
   * the browser's — a visitor abroad has a different today, and the timetable
   * belongs to the network.
   */
  function relativeLabel(date: string): string | null {
    if (today === null) return null;
    const dayMs = 86_400_000;
    const a = Date.parse(`${date}T00:00:00Z`);
    const b = Date.parse(`${today}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    const delta = Math.round((a - b) / dayMs);
    if (delta === 0) return t(strings.planner.today);
    if (delta === 1) return t(strings.planner.tomorrow);
    if (delta === -1) return t(strings.planner.yesterday);
    return null;
  }

  const relative = relativeLabel(value);
  /*
   * The weekday is dropped when a relative label is present: "Today" already
   * says which day it is, and both together overflow the field in Arabic,
   * where the words are longer.
   */
  const absolute =
    value === ''
      ? ''
      : formatDate(
          value,
          locale,
          relative !== null
            ? { day: 'numeric', month: 'short' }
            : { weekday: 'short', day: 'numeric', month: 'short' },
        );

  return (
    <div className="relative flex flex-col gap-1.5">
      <span id={labelId} className="text-content-muted text-xs font-medium tracking-wide uppercase">
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
        className="rounded-control border-border-strong bg-surface hover:border-brand-500 focus-visible:outline-brand-500 flex cursor-pointer items-center gap-2 border px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CalendarIcon />
        <span id={`${labelId}-value`} className="min-w-0 flex-1 truncate text-sm font-medium">
          {relative !== null ? `${relative} · ${absolute}` : absolute}
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
          {options.map((date) => {
            const near = relativeLabel(date);
            return (
              <button
                key={date}
                type="button"
                role="option"
                aria-selected={date === value}
                onClick={() => {
                  onChange(date);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="rounded-control hover:bg-surface-muted aria-selected:bg-brand-50 aria-selected:text-brand-700 flex w-full cursor-pointer items-baseline gap-2 px-3 py-2 text-start text-sm aria-selected:font-semibold"
              >
                <span className="flex-1">
                  {formatDate(date, locale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                {near !== null && (
                  <span className="text-content-muted text-xs">{near}</span>
                )}
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}

const CalendarIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    className="text-accent-strong flex-none"
    aria-hidden="true"
  >
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const Chevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-content-muted flex-none transition-transform ${open ? 'rotate-180' : ''}`}
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);
