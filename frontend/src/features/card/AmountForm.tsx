import { useId, useState, type FormEvent } from 'react';
import { formatNumber, messageForApiError, useLocale } from '../../i18n';
import type { Message } from '../../i18n/dictionary';
import {
  AMOUNT_PLACES,
  MINIMUM_AMOUNT,
  amountProblem,
  toAmountPayload,
} from './amount';

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
  const { locale, strings, t } = useLocale();
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
            Pinned left-to-right. A decimal amount is a number whose digits and
            point run one way in every locale, and unlike the card-number field
            — which follows the page so its caret starts at the edge the reader
            reads from — this one sits beside a currency figure the page prints
            through `Intl`. Letting the box flip put the caret and the
            placeholder on the opposite side from the balance above it.
          */
          dir="ltr"
          className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 min-w-0 flex-1 border px-3 py-2 font-medium tabular-nums placeholder:font-normal focus-visible:outline-2 focus-visible:outline-offset-2"
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

      {/*
        The format, as a hint rather than as the label — a placeholder
        disappears exactly when it is needed.

        Both numbers are interpolated from the rule's own constants rather than
        written into the sentence, so they are formatted in the locale's digits
        and cannot drift from what `amountProblem` actually enforces. The
        minimum goes through `formatNumber` with its places pinned, or `Intl`
        would render 0.01 as "0" on a locale with no fraction digits by
        default.
      */}
      <p className="text-content-muted text-xs">
        {t(strings.card.amountHint, {
          places: formatNumber(AMOUNT_PLACES, locale),
          minimum: formatNumber(MINIMUM_AMOUNT, locale, {
            minimumFractionDigits: 2,
          }),
        })}
      </p>
    </form>
  );
}
