import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../auth';
import { useLocale } from '../i18n';

/**
 * Who is signed in, and the way out.
 *
 * A disclosure rather than a dialog, the same choice `PrimaryNav` makes and for
 * the same reason: it sits over the bar and closes on Escape or on a press
 * outside, and it owes no focus trap, no `aria-modal` and no inert background
 * for what is one line of text and one button.
 *
 * The name is the trigger. There is nothing else an account offers here yet —
 * no profile to edit, no settings of its own — so a menu holding a single item
 * would be a level of nesting around one control. Putting the name on the
 * button is also what makes the bar say *which* account is signed in, which is
 * the question somebody actually has when two people share a machine.
 */
export function AccountMenu() {
  const { strings, t } = useLocale();
  const { account, logOut } = useSession();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Return focus to what opened it, or it lands back at the document top.
      toggleRef.current?.focus();
    };

    /*
     * A press anywhere else closes it. `pointerdown` rather than `click` so it
     * closes on the way down, before the thing that was pressed reacts —
     * otherwise pressing a navigation link left the panel open over the next
     * page for a frame.
     */
    const onPointerDown = (event: PointerEvent) => {
      const wrapper = wrapperRef.current;
      if (wrapper !== null && event.target instanceof Node && wrapper.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (account === null) return null;

  async function signOutNow() {
    if (pending) return;
    setPending(true);
    try {
      /*
       * `logOut` never rejects — the cookie it clears is the server's, and the
       * app has already forgotten the account by the time the request settles,
       * so there is no failure a reader could act on. The panel simply closes.
       */
      await logOut();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={wrapperRef} className="hidden md:block">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome flex h-9 max-w-44 cursor-pointer items-center gap-2 border px-3 text-sm font-medium leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="sr-only">{t(strings.account.menuLabel)}</span>
        {/*
          A name comes from a person, so it can be in either script whatever
          the page's language is — the same pairing `FavouriteCard` documents:
          `plaintext` so an over-long name is truncated at its own end rather
          than having its front eaten, and a pinned physical alignment so the
          box stays where the bar put it.
        */}
        <span
          aria-hidden="true"
          className="block truncate [unicode-bidi:plaintext] ltr:text-left rtl:text-right"
        >
          {account.name}
        </span>
        {/* Points down, and down is down in both directions: not mirrored. */}
        <svg
          viewBox="0 0 20 20"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`flex-none transition-transform ${open ? '-rotate-180' : ''}`}
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {/*
        Anchored to the end edge with logical positioning, so it hangs from the
        trailing corner in English and the leading one in Arabic rather than
        off the side of the window.
      */}
      <div
        id={panelId}
        hidden={!open}
        className="rounded-card border-border bg-surface text-content shadow-card absolute end-4 top-full z-20 mt-1 flex w-60 flex-col gap-2 border p-3 lg:end-8"
      >
        <p className="text-content-muted text-xs">{t(strings.account.signedInAs)}</p>
        {/* The email rather than the name: it is what identifies the account,
            and the name is already on the button that opened this. */}
        <p
          dir="ltr"
          className="text-content truncate text-sm font-medium ltr:text-left rtl:text-right"
        >
          {account.email}
        </p>

        <button
          type="button"
          onClick={() => void signOutNow()}
          disabled={pending}
          aria-busy={pending || undefined}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 mt-1 cursor-pointer border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t(pending ? strings.account.loggingOut : strings.account.logOut)}
        </button>
      </div>
    </div>
  );
}
