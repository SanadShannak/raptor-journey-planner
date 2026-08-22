import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface Props<T extends string> {
  /** Names the control and states its current value, for a screen reader. */
  label: string;
  /** What the closed button shows — usually an icon of the current value. */
  trigger: ReactNode;
  options: readonly MenuOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}

/**
 * A button that opens a short list of mutually exclusive choices.
 *
 * Built rather than pulled in: the behaviour is small and specific, and a menu
 * library would arrive with a styling system this project does not use.
 *
 * The items are `menuitemradio` because these are settings — one is always
 * chosen, and `aria-checked` says which. A plain `menuitem` would announce them
 * as actions and leave the current value unstated.
 *
 * Focus is managed rather than left to the browser: opening moves focus to the
 * checked item, arrows move between items, and Escape closes and puts focus
 * back on the button. Without that last part the keyboard lands at the top of
 * the document and the visitor loses their place.
 */
export function MenuButton<T extends string>({
  label,
  trigger,
  options,
  value,
  onSelect,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const buttonId = useId();

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  /*
   * Opening focuses the current choice, so the arrow keys start from where the
   * visitor already is rather than from the top of the list.
   */
  useEffect(() => {
    if (!open) return;
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    itemRefs.current[index]?.focus();
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      // Escape returns focus; Tab is the visitor deliberately moving on, so the
      // menu closes but leaves focus wherever they were heading.
      if (event.key === 'Escape') close(true);
      if (event.key === 'Tab') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function moveFocus(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length;
    itemRefs.current[next]?.focus();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {trigger}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          /*
           * `end-0`, not `right-0`: the menu hangs from the button's trailing
           * edge, which is the left one in Arabic.
           */
          className="rounded-card border-border bg-surface-raised shadow-card absolute end-0 top-full z-20 mt-1 flex min-w-44 flex-col gap-0.5 border p-1"
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onSelect(option.value);
                close(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus(index, 1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(index, -1);
                }
              }}
              className="rounded-control text-content hover:bg-surface-muted focus-visible:outline-brand-500 aria-checked:text-brand-500 flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-start text-sm aria-checked:font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <span aria-hidden="true" className="flex w-4 justify-center">
                {option.icon}
              </span>
              <span className="flex-1">{option.label}</span>
              {/*
                A tick as well as weight and colour, because the current choice
                must never be signalled by colour alone.
              */}
              <span aria-hidden="true" className="w-4">
                {option.value === value ? (
                  <svg
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
