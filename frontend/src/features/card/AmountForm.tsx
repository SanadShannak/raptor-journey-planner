import { useId, useState, type FormEvent } from 'react';
import { messageForApiError, useLocale } from '../../i18n';
import type { Message } from '../../i18n/dictionary';
import { amountProblem, toAmountPayload } from './amount';

interface Props {
  /** Labels the field — "Top-up amount", "Fare amount". */
  label: Message;
  /** The submit button. */
  action: Message;
  /** While the request is out. */
  pendingAction: Message;
  /** What to do with a valid amount. Rejects with an `ApiError`. */
  onSubmit: (amount: string) => Promise<void>;
}

/**
 * A money field and its button.
 *
 * It prints no format hint of its own: the rule is the same on both of these
 * and the panel states it once beneath the pair. Twice, under two adjacent
 * fields, it read as two different constraints to compare.
 *
 * One component used twice — topping up and paying a fare are the same form
 * over the same validator, differing only in their words and in which endpoint
 * they post to. Two copies would be two places to keep the `inputMode`, the
 * error wiring and the clearing-on-success in step.
 *
 * The field is cleared only on **success**, which is the half that matters: a
 * refused amount is one the reader is about to correct, and a form that wiped
 * it would make them type it again to change one character.
 */
export function AmountForm({ label, action, pendingAction, onSubmit }: Props) {
  const { strings, t } = useLocale();
  const fieldId = useId();
  const errorId = useId();

  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function messageForProblem(): string | null {
    switch (amountProblem(amount)) {
      case 'empty':
        return t(strings.card.amountRequired);
      case 'shape':
        return t(strings.card.amountMalformed);
      case 'tooSmall':
        return t(strings.card.amountTooSmall);
      case null:
        return null;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    /*
     * Checked on submit, not on every keystroke. Complaining that "2." is
     * malformed while somebody is halfway through typing "2.50" is a complaint
     * about work in progress.
     */
    const local = messageForProblem();
    if (local !== null) {
      setProblem(local);
      return;
    }

    setProblem(null);
    setPending(true);
    try {
      await onSubmit(toAmountPayload(amount));
      setAmount('');
    } catch (error: unknown) {
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {t(label)}
      </label>

      <div className="flex flex-wrap items-start gap-2">
        <input
          id={fieldId}
          /*
            `inputMode="decimal"` rather than `type="number"`. A number input
            would offer spinners, let the wheel change the amount under the
            pointer, and — the one that actually matters here — hand back a
            value the browser has already normalised, when the server's
            decimal-places rule tests the string exactly as it was typed.
          */
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            // The complaint was about the old value; it is not about this one.
            if (problem !== null) setProblem(null);
          }}
          aria-invalid={problem === null ? undefined : true}
          aria-describedby={problem === null ? undefined : errorId}
          placeholder="0.00"
          /*
            **No `dir`.** The field follows the page, so on an Arabic page the
            caret and the placeholder start at the right — the edge every other
            field on that page starts at, and the edge the reader's eye is
            already on.
            
            Pinning it `ltr` was the mistake: it put the caret at the far side
            of a wide field, which reads as a box you have to go and find the
            start of. The digits are unaffected either way — they are weak
            characters and keep their own left-to-right order inside the field
            regardless of which edge it begins at — which is the same reasoning
            the card-number field was documented with before it.
          */
          className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 min-w-0 flex-1 border px-4 py-2.5 font-medium tabular-nums placeholder:font-normal focus-visible:outline-2 focus-visible:outline-offset-2"
        />

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 flex-none cursor-pointer px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t(pending ? pendingAction : action)}
        </button>
      </div>

      {/*
        `polite` rather than `alert`: a mistyped amount is not an emergency,
        and a screen reader should finish its sentence first. The region is
        always present so it is not introduced at the moment it has something
        to say, which some readers miss entirely.
      */}
      <div aria-live="polite">
        {problem !== null && (
          <p id={errorId} className="text-danger text-xs">
            {problem}
          </p>
        )}
      </div>

    </form>
  );
}
