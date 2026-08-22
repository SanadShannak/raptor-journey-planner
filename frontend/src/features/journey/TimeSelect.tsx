import { useEffect, useId, useRef, useState } from 'react';
import { formatClockTime, useLocale } from '../../i18n';
import { Popover } from '../../components/Popover';
import { Chevron } from './DateSelect';
import { parseTypedTime } from './parseTypedTime';

interface Props {
  label: string;
  /** Always 24-hour `HH:mm` — the wire format, whatever is displayed. */
  value: string;
  onChange: (time: string) => void;
}

/** Every quarter hour, which is how people actually name a departure. */
const STEP_MINUTES = 15;

/**
 * Picks a departure time.
 *
 * Typed *or* chosen, because both are faster depending on what someone wants:
 * "in about an hour" is a scroll, "the 07:42" is four keystrokes. The field is
 * a real text input, so typing needs no mouse first.
 *
 * The value is always 24-hour on the wire; only the display follows the
 * locale, and a chosen date is shown alongside a crossing-midnight arrival
 * elsewhere so a 12-hour clock cannot be read as the wrong end of the day.
 */
export function TimeSelect({ label, value, onChange }: Props) {
  const { locale, strings, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const display = value === '' ? '' : formatClockTime(value, locale);

  // Scrolls the current time into view when the list opens, so the list starts
  // where the visitor already is rather than at midnight.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'center' });
  }, [open]);

  function commit(raw: string) {
    const parsed = parseTypedTime(raw);
    if (parsed !== null) onChange(parsed);
    setDraft(null);
  }

  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += STEP_MINUTES) {
    options.push(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
        minutes % 60,
      ).padStart(2, '0')}`,
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label
        id={labelId}
        htmlFor={`${labelId}-input`}
        className="text-content-muted text-xs font-medium tracking-wide uppercase"
      >
        {label}
      </label>

      <div className="rounded-control border-border-strong bg-surface focus-within:border-brand-500 flex items-center gap-2 border ps-3 pe-1">
        <ClockIcon />
        <input
          id={`${labelId}-input`}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? display}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setDraft(value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(event.currentTarget.value);
              inputRef.current?.blur();
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="focus-visible:outline-none min-w-0 flex-1 bg-transparent py-2.5 text-sm font-medium"
        />
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t(strings.planner.chooseTime)}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className="rounded-control hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer p-1.5 focus-visible:outline-2"
        >
          <Chevron open={open} />
        </button>
      </div>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={inputRef}
        labelledBy={labelId}
      >
        <div
          ref={listRef}
          role="listbox"
          aria-labelledby={labelId}
          className="grid max-h-72 grid-cols-2 gap-0.5 overflow-y-auto"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="rounded-control hover:bg-surface-muted aria-selected:bg-brand-50 aria-selected:text-brand-700 px-3 py-1.5 text-sm tabular-nums aria-selected:font-semibold"
            >
              {formatClockTime(option, locale)}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

const ClockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    className="text-accent-strong flex-none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
