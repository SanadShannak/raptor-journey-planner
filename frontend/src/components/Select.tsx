import { useId, useRef, useState } from 'react';
import { Chevron } from './DateSelect';
import { Popover } from './Popover';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
}

/**
 * A dropdown for a short list of plain choices.
 *
 * The house dropdown, built on the same `Popover` as the date and time pickers
 * and wearing the same trigger, so a field that offers a choice looks the same
 * wherever it appears.
 *
 * A listbox rather than a native `<select>`, for the reason `StopSelect`
 * already documents: the native control is genuinely good — keyboard
 * type-ahead, a platform picker on a phone, a spoken option count — but it
 * draws its own caret, focus ring and padding, and the theme reaches none of
 * them. A `<select>` sitting under a custom date picker is visibly a different
 * control, and its caret sits hard against the border where ours keeps a full
 * step of space. Consistency won; everything the native one gave for free is
 * what the markup below has to earn.
 *
 * `StopSelect` deliberately does **not** use this. Its rows carry a code badge
 * beside the name and it opens scrolled to the chosen stop out of sixty-six —
 * generalising this to cover that would mean a render prop and a centring hook
 * for the sake of one caller each, and a worse version of both. This one is
 * for choices that are a word.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  const chosen = options.find((option) => option.value === value);

  return (
    <div className="relative flex min-w-0 flex-col gap-1.5">
      {/*
        A `<span>` with `aria-labelledby` rather than a `<label htmlFor>`: the
        control is a button, and a label's `for` only associates with a form
        element. The button names itself from the label and its own value, so a
        screen reader reads "Type, Standard" rather than either alone.
      */}
      <span id={labelId} className="text-sm font-medium">
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
          `pe-3` against the chevron's own `flex-none`, so it keeps a full step
          of space from the edge — a native select draws its caret hard against
          the border, and that was the tell that this was not the same control
          as the fields around it.
        */
        className="rounded-control border-border-strong bg-surface hover:border-brand-500 focus-visible:outline-brand-500 flex cursor-pointer items-center gap-2 border py-2.5 ps-4 pe-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          id={`${labelId}-value`}
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {chosen?.label ?? ''}
        </span>
        <Chevron open={open} />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        labelledBy={labelId}
      >
        {/*
          No scroll container and no centring: this is for a handful of
          options, so there is nothing to scroll to. The date and stop pickers
          need both because they run to sixty-six entries.
        */}
        <div role="listbox" aria-labelledby={labelId}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                // Back to the trigger, or focus falls to the body as the
                // option it was on unmounts.
                triggerRef.current?.focus();
              }}
              className="rounded-control hover:bg-surface-muted aria-selected:bg-brand-50 aria-selected:text-brand-700 flex w-full cursor-pointer items-center px-3 py-2 text-start text-sm aria-selected:font-semibold"
            >
              {option.label}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
