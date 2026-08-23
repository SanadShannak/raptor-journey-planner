import { useId, useLayoutEffect, useRef, useState } from 'react';
import { clockMeridiems, formatClockTime, formatNumber, useLocale } from '../../i18n';
import { Popover } from '../../components/Popover';
import { Chevron } from './DateSelect';
import { parseTypedTime } from './parseTypedTime';
import { centerOnOption } from './centerOnOption';

interface Props {
  label: string;
  /** Always 24-hour `HH:mm` — the wire format, whatever is displayed. */
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean | undefined;
}

/** Minute granularity offered in the picker; typing is not restricted to it. */
const MINUTE_STEP = 5;

/**
 * `1 … 12`, in the order a list is read rather than the order a dial is.
 *
 * Starting at 12 is how the hand goes round, and how the hours actually
 * succeed one another — but this is a column you scan, not a face you read, and
 * in a column a 12 above the 1 looks like a sorting mistake.
 */
const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const MINUTES = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, index) => index * MINUTE_STEP,
);

/** The three parts a twelve-hour clock is chosen in. */
interface ClockParts {
  /** 1–12, where 12 is both noon and midnight. */
  hour12: number;
  minute: number;
  pm: boolean;
}

/** Splits a 24-hour `HH:mm` into what the picker's three columns select. */
function toParts(value: string): ClockParts | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return {
    // 0 and 12 both read as "12" on a dial; the meridiem is what tells them
    // apart, which is exactly why it needs its own control.
    hour12: hours % 12 === 0 ? 12 : hours % 12,
    minute: minutes,
    pm: hours >= 12,
  };
}

/** Reassembles the three columns into the 24-hour value that goes on the wire. */
function fromParts({ hour12, minute, pm }: ClockParts): string {
  const base = hour12 % 12;
  const hours = pm ? base + 12 : base;
  return `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Picks a departure time.
 *
 * Typed *or* chosen, because both are faster depending on what someone wants:
 * "the 07:42" is four keystrokes, "some time this afternoon" is a look at a
 * list. The field is a real text input, so typing needs no mouse first, and it
 * accepts far more than it displays — `9`, `930`, `9.30`, `9:30 pm`.
 *
 * The list is a twelve-hour dial rather than a flat run of every quarter hour:
 * an hour column, a minute column, and a meridiem that does not scroll because
 * it has two entries and scrolling two entries is absurd. A flat list of
 * 24-hour times made the visitor read the very thing the display deliberately
 * hides from them.
 *
 * Picking never moves focus into the text input. It used to, and the input's
 * focus handler then seeded its draft from the *previous* value — so choosing
 * a time appeared to select it and then quietly put the old one back. Focus
 * stays on what was pressed; **Done** closes and hands focus to the trigger.
 *
 * Nothing leaves the picker until it is closed. Three columns make one time
 * between them, and reporting each column as it moves means the hour lands
 * first and a search runs for 4:54 on the way to 5:30. The columns write to a
 * pending time that the field shows immediately; **Done**, a click outside, or
 * Escape are what hand it over.
 *
 * The value is always 24-hour on the wire; only the display follows the
 * locale, and a chosen date is shown alongside a crossing-midnight arrival
 * elsewhere so a 12-hour clock cannot be read as the wrong end of the day.
 */
export function TimeSelect({ label, value, onChange, disabled }: Props) {
  const { locale, strings, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  /** What the columns have chosen so far, before it is handed over. */
  const [pending, setPending] = useState<ClockParts | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const parts = pending ?? toParts(value) ?? { hour12: 12, minute: 0, pm: false };
  /*
   * The pending time wins in the field, so moving a column still shows an
   * immediate answer — what it does not do is start a search.
   */
  const shown = pending !== null ? fromParts(pending) : value;
  const display = shown === '' ? '' : formatClockTime(shown, locale);

  const hourIndex = HOURS_12.indexOf(parts.hour12);
  /*
   * The nearest step rather than an exact match: a typed 08:37 selects no
   * minute option, but the column should still open at 35 rather than at the
   * top of the hour.
   */
  const minuteIndex = Math.min(
    MINUTES.length - 1,
    Math.round(parts.minute / MINUTE_STEP),
  );

  // Before the browser paints, so the columns are simply already where the
  // visitor is rather than scrolling there once the panel is on screen.
  useLayoutEffect(() => {
    if (!open) return;
    centerOnOption(hourListRef.current, hourIndex);
    centerOnOption(minuteListRef.current, minuteIndex);
  }, [open, hourIndex, minuteIndex]);

  function commit(raw: string) {
    /*
     * Unchanged text must never change the value. It matters because the field
     * shows a formatted time rather than the one on the wire, so a focus and a
     * blur with nothing typed round-trips through the parser — and any locale
     * whose meridiem it could not read would quietly move the time by twelve
     * hours for the crime of being clicked on.
     */
    if (raw !== display) {
      const parsed = parseTypedTime(raw, clockMeridiems(locale));
      if (parsed !== null) onChange(parsed);
    }
    // Typing wins over a half-made choice in the columns.
    setPending(null);
    setDraft(null);
  }

  /** Applies one column's choice, leaving the other two as they are. */
  function setPart(change: Partial<ClockParts>) {
    setPending({ ...parts, ...change });
    // The typed draft is stale the moment the list is used; dropping it here
    // is what lets the field show the new value instead of the old one.
    setDraft(null);
  }

  /** Hands over whatever the columns settled on, if it is anything new. */
  function handOver() {
    if (pending === null) return;
    const next = fromParts(pending);
    setPending(null);
    if (next !== value) onChange(next);
  }

  function close() {
    handOver();
    setOpen(false);
    triggerRef.current?.focus();
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

      <div className="rounded-control border-border-strong bg-surface focus-within:border-brand-500 flex items-stretch overflow-hidden border ps-3">
        <span className="flex flex-none items-center">
          <ClockIcon />
        </span>
        <input
          id={`${labelId}-input`}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled ?? false}
          value={draft ?? display}
          onChange={(event) => setDraft(event.target.value)}
          /*
           * Seeded with what the field was *showing*, not the 24-hour value
           * behind it. Clicking into "4:54 PM" and being handed "16:54" is the
           * one moment the wire format is allowed to surface, and it made the
           * field look like it had changed on its own.
           */
          onFocus={() => setDraft(display)}
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
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-medium focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t(strings.planner.chooseTime)}
          disabled={disabled ?? false}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          /*
             Nothing around the caret — no divider, no hover fill. The date
             field beside this one is a single button, so its caret can have
             neither, and two fields side by side had two different ideas
             about what a disclosure arrow looks like.
          */
          className="text-content-muted focus-visible:outline-brand-500 me-1 flex w-8 flex-none cursor-pointer items-center justify-center self-stretch focus-visible:-outline-offset-2 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Chevron open={open} />
        </button>
      </div>

      <Popover
        open={open}
        onClose={() => {
          handOver();
          setOpen(false);
        }}
        triggerRef={triggerRef}
        labelledBy={labelId}
      >
        <div className="flex gap-1">
          <ScrollColumn
            ref={hourListRef}
            label={t(strings.planner.hour)}
            options={HOURS_12.map((hour) => ({
              key: hour,
              text: formatNumber(hour, locale),
              selected: hour === parts.hour12,
            }))}
            onPick={(hour) => setPart({ hour12: hour })}
          />

          <ScrollColumn
            ref={minuteListRef}
            label={t(strings.planner.minute)}
            options={MINUTES.map((minute) => ({
              key: minute,
              text: String(minute).padStart(2, '0'),
              selected: minute === parts.minute,
            }))}
            onPick={(minute) => setPart({ minute })}
          />

          {/*
            Two entries, so no scrolling: a rail of full-height buttons that
            are always both visible. It is a `radiogroup` rather than a
            `listbox` because it is a choice between two states of one value,
            which is what arrow keys and a screen reader's "1 of 2" describe.
          */}
          <div
            role="radiogroup"
            aria-label={t(strings.planner.meridiem)}
            className="flex flex-none flex-col gap-1"
          >
            {[false, true].map((pm) => (
              <button
                key={pm ? 'pm' : 'am'}
                type="button"
                role="radio"
                aria-checked={parts.pm === pm}
                onClick={() => setPart({ pm })}
                className="rounded-control border-border-strong hover:bg-surface-muted aria-checked:bg-brand-fill aria-checked:text-on-brand aria-checked:border-brand-fill focus-visible:outline-brand-500 flex-1 cursor-pointer border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t(pm ? strings.planner.pm : strings.planner.am)}
              </button>
            ))}
          </div>
        </div>

        {/*
          An explicit close, because three columns cannot close on a pick —
          choosing an hour is rarely the whole answer. It also gives keyboard
          users one predictable way out that leaves focus on the trigger.
        */}
        <div className="border-border mt-1.5 flex justify-end border-t pt-1.5">
          <button
            type="button"
            onClick={close}
            className="rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.planner.done)}
          </button>
        </div>
      </Popover>
    </div>
  );
}

interface ColumnOption {
  key: number;
  text: string;
  selected: boolean;
}

/**
 * One scrolling column of the dial.
 *
 * A `listbox` of `option`s, so a screen reader announces "3 of 12" and the
 * selected entry, rather than reading twelve unrelated buttons.
 */
function ScrollColumn({
  ref,
  label,
  options,
  onPick,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  label: string;
  options: ColumnOption[];
  onPick: (key: number) => void;
}) {
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      /* `relative` so the centring helper's `offsetTop` is measured from
         this container and not from something further up the page. */
      className="relative max-h-56 flex-1 overflow-y-auto"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="option"
          aria-selected={option.selected}
          onClick={() => onPick(option.key)}
          className="rounded-control hover:bg-surface-muted aria-selected:bg-brand-50 aria-selected:text-brand-700 w-full cursor-pointer px-3 py-1.5 text-center text-sm tabular-nums aria-selected:font-semibold"
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

const ClockIcon = () => (
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
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
