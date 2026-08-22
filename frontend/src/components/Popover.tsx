import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Focused with Escape, so the visitor lands back where they started. */
  triggerRef: React.RefObject<HTMLElement | null>;
  labelledBy?: string | undefined;
  children: ReactNode;
}

/**
 * A panel anchored under its trigger.
 *
 * Only the plumbing every dropdown needs and none of the semantics: closing on
 * Escape and on a press outside, and returning focus to the trigger when it
 * closes by keyboard. What the panel *is* — a listbox, a grid, a form — is the
 * caller's business, because those carry different roles and different
 * keyboard rules.
 *
 * Not a `<dialog>`: these are not modal, and making them so would inert the
 * page behind a date picker.
 */
export function Popover({
  open,
  onClose,
  triggerRef,
  labelledBy,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      aria-labelledby={labelledBy}
      /* `start-0`, not `left-0`: the panel hangs from the field's leading edge,
         which is the right one in Arabic. */
      className="rounded-card border-border bg-surface-raised shadow-card absolute start-0 top-full z-30 mt-1.5 min-w-full border p-1.5"
    >
      {children}
    </div>
  );
}
