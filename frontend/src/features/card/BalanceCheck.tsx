import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { PendingLabel } from '../../components/Pending';
import { pendingButtonClass } from '../../components/pendingButtonClass';
import { checkCardBalance, type CardBalance } from '../../api/cards';
import { formatMoney, messageForApiError, useLocale } from '../../i18n';
import { cardNumberProblem, formatCardNumber } from './cardNumber';

/** A number in the printed form, for the hint under the field. */
const EXAMPLE = '12345-67890-1';

/**
 * The balance on any card, by its number — for anybody, signed in or not.
 *
 * The one thing on the card page a guest can do. It answers with the balance
 * and nothing else, because the server does: whose card it is, what it is
 * called and where it was used stay with the account it belongs to.
 *
 * The number is grouped as it is typed (`12345-67890-1`), which is how it is
 * printed and read aloud, and checked here before it is sent: a short number
 * is a question the server would only refuse. The answer is spoken as one
 * sentence through a live region, and the balance itself is drawn large
 * beside the number it belongs to — so an answer to a *previous* number can
 * never be read as this one's.
 */
export function BalanceCheck({ currency }: { currency: string | null }) {
  const { locale, strings, t } = useLocale();
  const fieldId = useId();
  const hintId = useId();
  const problemId = useId();

  const [number, setNumber] = useState('');
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<CardBalance | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (cardNumberProblem(number) !== null) {
      setAnswer(null);
      setProblem(t(strings.card.balanceCheckIncomplete));
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setProblem(null);
    setPending(true);
    try {
      const found = await checkCardBalance(number, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAnswer(found);
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setAnswer(null);
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <section
      data-tour="card-balance"
      aria-labelledby={`${fieldId}-title`}
      className="rounded-card border-border bg-surface-raised flex flex-col gap-3 border p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${fieldId}-title`} className="text-lg font-semibold tracking-tight">
          {t(strings.card.balanceCheckTitle)}
        </h2>
        <p className="text-content-muted text-sm">{t(strings.card.balanceCheckIntro)}</p>
      </div>

      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {t(strings.card.numberLabel)}
        </label>
        <div className="flex flex-wrap items-stretch gap-2">
          <input
            id={fieldId}
            value={number}
            onChange={(event) => {
              setNumber(formatCardNumber(event.target.value));
              if (problem !== null) setProblem(null);
            }}
            /*
              `inputMode` rather than `type="number"`: a card number is a
              string of digits, not a quantity, and a number input would offer
              to step it up and down and drop its grouping.
            */
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={EXAMPLE.length}
            placeholder={EXAMPLE}
            aria-invalid={problem === null ? undefined : true}
            aria-describedby={problem === null ? hintId : `${hintId} ${problemId}`}
            /*
              Digits read left to right in either language, so the field is
              LTR; its box stays aligned with the label, which follows the page.
            */
            dir="ltr"
            className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 min-w-0 flex-1 basis-48 border px-4 py-2.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 ltr:text-left rtl:text-right"
          />
          <button
            type="submit"
            aria-busy={pending || undefined}
            className={`rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${pendingButtonClass(pending)}`}
          >
            <PendingLabel pending={pending}>
              {t(pending ? strings.card.balanceChecking : strings.card.balanceCheckAction)}
            </PendingLabel>
          </button>
        </div>
        <p id={hintId} className="text-content-muted text-xs">
          {/*
            Isolated left-to-right inside the sentence: in Arabic, a grouped
            number's hyphens let bidi reorder its groups, and the example read
            "1-67890-12345".
          */}
          {t(strings.card.balanceCheckHint, { example: `\u2066${EXAMPLE}\u2069` })}
        </p>
      </form>

      {/*
        One region for both outcomes, so whichever arrives is read out; the
        error is also tied to the field by `aria-describedby`.
      */}
      <div aria-live="polite">
        {problem !== null && (
          <p id={problemId} className="text-danger text-sm">
            {problem}
          </p>
        )}
        {answer !== null && (
          <div className="rounded-control bg-surface-muted motion-safe:animate-content-in flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <p className="sr-only">
              {t(strings.card.balanceCheckResult, {
                number: answer.number,
                balance: formatMoney(answer.balance, currency, locale),
              })}
            </p>
            <span aria-hidden="true" className="text-content-muted text-sm tabular-nums" dir="ltr">
              {answer.number}
            </span>
            <span aria-hidden="true" className="text-2xl font-semibold tabular-nums">
              {formatMoney(answer.balance, currency, locale)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
