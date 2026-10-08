import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { verifyPassword } from '../../api/auth';
import { messageForApiError, useLocale } from '../../i18n';
import type { TravelCard } from '../../types/card';
import { discardCard } from './cardsStore';

interface Props {
  card: TravelCard;
  /** Called once the card is actually gone. */
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Deleting a card, behind the password.
 *
 * A modal rather than an inline confirmation, and a password rather than a
 * second press, because the two guard different things. The modal makes the
 * question unmissable — it takes focus, inerts the page, and cannot be
 * dismissed by the pointer wandering off. The password answers the question a
 * session cookie cannot: a cookie says this browser was signed in once, not
 * that the person holding the device now is the one who signed it in. A card
 * holds money and the deletion is not reversible, so that distinction is worth
 * one field.
 *
 * `showModal()` gives focus trapping, Escape handling and an inert background
 * without a focus-trap dependency, the same as `AuthDialog` — `<dialog>` sits
 * exactly on the browser baseline (Safari 15.4).
 *
 * The card is named in the question. "Delete this card?" over a page showing
 * five of them is a question about whichever one the reader *thinks* is
 * selected, which is precisely the mistake a confirmation exists to prevent.
 *
 * The password goes to `/api/auth/verify-password`, which takes no email: the
 * account is the one the session cookie names, so there is nothing here that
 * could confirm against somebody else's.
 */
export function DeleteCardDialog({ card, onDeleted, onClose }: Props) {
  const { strings, t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();

  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * The one thing here that is genuine external synchronisation: a <dialog>
   * only becomes modal — trapping focus, inerting the background — when
   * showModal() is called on the element.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (password === '') {
      setProblem(t(strings.auth.passwordRequired));
      return;
    }

    setProblem(null);
    setPending(true);
    try {
      /*
       * Confirmed first, deleted second. The other order would delete the card
       * and then ask, which is not a confirmation.
       */
      await verifyPassword(password);
      await discardCard(card.id);
      onDeleted();
    } catch (error: unknown) {
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="rounded-card bg-surface text-content shadow-card border-border m-auto w-[min(26rem,calc(100vw-2rem))] border p-0 backdrop:bg-black/50"
    >
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-4 p-6"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {/*
            Named, not "this card". The page shows several and the reader is
            about to lose one of them permanently.
          */}
          {t(strings.card.discardTitle, { name: card.nickname })}
        </h2>

        <p className="text-content-muted text-sm">{t(strings.card.discardWarning)}</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="text-sm font-medium">
            {t(strings.card.discardPasswordLabel)}
          </label>
          <input
            id={fieldId}
            type="password"
            // The browser can fill this from the saved sign-in for the site.
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (problem !== null) setProblem(null);
            }}
            aria-invalid={problem === null ? undefined : true}
            aria-describedby={problem === null ? undefined : errorId}
            className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        {/*
          `assertive` because it is the answer to a press inside a modal the
          reader is waiting on, and there is nothing else here for a screen
          reader to be in the middle of.
        */}
        <div aria-live="assertive">
          {problem !== null && (
            <p id={errorId} className="text-danger text-sm">
              {problem}
            </p>
          )}
        </div>

        {/*
          The destructive action is the submit, so Enter from the password
          field does the thing the dialog is for. Cancel comes first in the
          DOM — and therefore in the tab order — so the way out is reached
          before the way through.
        */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.card.discardNo)}
          </button>
          {/*
            Outlined in `danger` rather than filled with it: there is no
            `on-danger` token, and `danger` as text on `surface` is a pair the
            contrast check already verifies in both schemes.
          */}
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="rounded-control border-danger text-danger focus-visible:outline-brand-500 cursor-pointer border px-4 py-2 text-sm font-semibold hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(pending ? strings.card.discardPending : strings.card.discardYes)}
          </button>
        </div>
      </form>
    </dialog>
  );
}
