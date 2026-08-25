import { useEffect, useId, useRef, useState } from 'react';
import {
  formatClockTime,
  formatDate,
  formatMoney,
  messageForApiError,
  useLocale,
} from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';
import { getNetwork } from '../api/network';
import { lookupCard } from '../api/card';
import type { CardUsage, TravelCard } from '../types/card';
import {
  cardNumberProblem,
  formatCardNumber,
  isCompleteCardNumber,
} from '../features/card/cardNumber';

type State = 'idle' | 'checking' | 'found' | 'failed';

/**
 * What is on a travel card.
 *
 * Deliberately not behind sign-in. Somebody standing at a machine wanting to
 * know whether they can board does not have an account, and the number printed
 * on the card is the only thing they need to be holding. Nothing is stored: the
 * number lives in this component's state and goes nowhere else, which is also
 * why it is not in the URL.
 *
 * The balance is money, so it is printed through `Intl` in whatever the network
 * charges in — `/api/network` says which. How many decimal places that is is a
 * property of the currency rather than a choice: three for a dinar, two for a
 * euro, and hard-coding either would be wrong on half the networks this app can
 * load.
 */
export default function CardPage() {
  const { locale, strings, t } = useLocale();
  usePageTitle(t(strings.pages.card.title));

  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();

  const [number, setNumber] = useState('');
  const [card, setCard] = useState<TravelCard | null>(null);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);

  const request = useRef<AbortController | null>(null);

  /*
   * Which money to print in. Failing is not worth reporting: `formatMoney`
   * falls back to a bare number, which is still the balance.
   */
  useEffect(() => {
    const controller = new AbortController();

    void getNetwork({ signal: controller.signal })
      .then((info) => {
        if (!controller.signal.aborted) setCurrency(info.currency);
      })
      .catch(() => {});

    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  /*
   * Validated on submit, not on every keystroke. Complaining that a number is
   * too short while somebody is still typing it is complaining about work in
   * progress — the field is incomplete for as long as it takes to fill in.
   */
  function check() {
    const problem = cardNumberProblem(number);
    if (problem !== null) {
      setState('failed');
      setCard(null);
      setErrorMessage(
        t(
          problem === 'empty'
            ? strings.card.numberRequired
            : strings.card.numberIncomplete,
        ),
      );
      return;
    }

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    setState('checking');
    setErrorMessage(null);

    void lookupCard(number, { signal: controller.signal })
      .then((found) => {
        if (controller.signal.aborted) return;
        setCard(found);
        setState('found');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCard(null);
        setState('failed');
        /*
         * Through the shared mapping, which turns `CARD_NOT_FOUND` into "check
         * the digits" and a store that is down into "this part is unavailable"
         * — and never shows the API's own developer-facing English.
         */
        setErrorMessage(t(messageForApiError(error, strings)));
      });
  }

  /** Any change makes the answer on screen stale, so it goes with the change. */
  function changeNumber(next: string) {
    setNumber(formatCardNumber(next));
    if (card !== null || errorMessage !== null) {
      request.current?.abort();
      setCard(null);
      setErrorMessage(null);
      setState('idle');
    }
  }

  const complete = isCompleteCardNumber(number);

  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t(strings.card.inquiryTitle)}
        </h1>
        <p className="text-content-muted max-w-prose">
          {t(strings.card.inquiryIntro)}
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
        className="flex max-w-md flex-col gap-2"
      >
        <label htmlFor={fieldId} className="text-sm font-medium">
          {t(strings.card.numberLabel)}
        </label>

        <div className="flex flex-wrap items-start gap-2">
          <input
            id={fieldId}
            /*
               `inputMode` rather than `type="number"`: a card number is a
               string of digits, not a quantity. A number input would offer
               spinners, drop the leading zero of `01234-…`, and let the wheel
               change it under the pointer.
            */
            inputMode="numeric"
            autoComplete="off"
            value={number}
            onChange={(event) => changeNumber(event.target.value)}
            aria-describedby={errorMessage === null ? hintId : `${errorId} ${hintId}`}
            aria-invalid={state === 'failed' ? true : undefined}
            // Eleven digits and two dashes.
            maxLength={13}
            placeholder="12345-67890-1"
            className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 min-w-0 flex-1 border px-3 py-2 font-medium tabular-nums placeholder:font-normal focus-visible:outline-2 focus-visible:outline-offset-2"
            dir="ltr"
          />

          <button
            type="submit"
            disabled={state === 'checking' || !complete}
            className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 flex-none cursor-pointer px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(state === 'checking' ? strings.card.checking : strings.card.check)}
          </button>
        </div>

        {/* The format, as a hint under the field rather than as its label —
            a placeholder disappears exactly when it is needed. */}
        {/*
          No `dir` here. Forcing the paragraph left-to-right laid the whole
          Arabic sentence out backwards to fix one number inside it; the number
          is isolated in the string instead, where the problem actually is.
        */}
        <p id={hintId} className="text-content-muted text-xs">
          {t(strings.card.numberHint)}
        </p>
      </form>

      {/*
        One live region for the whole answer, so a screen reader is told the
        result once rather than having to go looking for it. `alert` is not used
        even for the failure: a mistyped digit is not an emergency, and this is
        the same region either way.
      */}
      <div aria-live="polite" aria-busy={state === 'checking'} className="max-w-md">
        {state === 'failed' && errorMessage !== null && (
          <p
            id={errorId}
            className="rounded-card border-danger text-danger border px-4 py-3 text-sm"
          >
            {errorMessage}
          </p>
        )}

        {state === 'found' && card !== null && (
          <div className="rounded-card border-border bg-surface-raised shadow-card flex flex-col gap-3 border p-5">
            <p className="text-content-muted text-xs font-semibold tracking-wide uppercase">
              {t(strings.card.balance)}
            </p>

            <p className="text-3xl font-semibold tabular-nums">
              {formatMoney(card.balance, currency, locale)}
            </p>

            <div className="text-content-muted flex flex-col gap-1 text-sm">
              <p className="flex flex-wrap gap-2">
                <span>{t(strings.card.numberLabel)}</span>
                <span className="text-content tabular-nums" dir="ltr">
                  {card.number}
                </span>
              </p>

              {/* One sentence, so one element. A description list here would be
                  a term with nothing to define it against. */}
              <p>
                {card.lastUsedDate === null
                  ? t(strings.card.neverUsed)
                  : t(strings.card.lastUsed, {
                      date: formatDate(card.lastUsedDate, locale, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }),
                    })}
              </p>
            </div>

            {/* Zero is a balance, not a missing one, and it is the one number
                that changes what somebody does next. */}
            {card.balance === 0 && (
              <p className="rounded-control bg-surface-muted text-content px-3 py-2 text-sm">
                {t(strings.card.emptyCard)}
              </p>
            )}

            <Activity usages={card.usages} currency={currency} />
          </div>
        )}
      </div>
    </PageContainer>
  );
}


/**
 * What has happened to the balance.
 *
 * The balance answers "can I board"; this answers "why is it that". A charge
 * somebody does not recognise is the reason anybody looks a card up twice, so
 * the list leads with where and when rather than with the amount.
 *
 * Direction is never carried by colour alone: every row states its kind in
 * words, and the sign is part of the formatted number rather than a coloured
 * arrow. Green and red here are emphasis on something already said.
 */
function Activity({
  usages,
  currency,
}: {
  usages: CardUsage[];
  currency: string | null;
}) {
  const { locale, strings, t } = useLocale();

  if (usages.length === 0) {
    return (
      <p className="border-border text-content-muted border-t pt-3 text-sm">
        {t(strings.card.noActivity)}
      </p>
    );
  }

  return (
    <section className="border-border flex flex-col gap-2 border-t pt-3">
      <h2 className="text-content-muted text-xs font-semibold tracking-wide uppercase">
        {t(strings.card.activity)}
      </h2>

      <ul className="flex flex-col">
        {usages.map((usage, index) => {
          const topUp = usage.kind === 'topUp';

          return (
            <li
              /*
               * Two taps can share a minute — a machine that charges twice, a
               * card read at a gate and a reader — so the index is part of the
               * key. There is no id on a usage to use instead.
               */
              key={`${usage.date ?? ''}-${usage.time ?? ''}-${index}`}
              className="border-border flex items-baseline gap-3 border-b py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto" className="truncate text-sm font-medium">
                  {usage.description ??
                    t(topUp ? strings.card.topUp : strings.card.unknownPlace)}
                </span>
                <span className="text-content-muted text-xs">
                  {t(topUp ? strings.card.topUp : strings.card.fare)}
                  {usage.date === null
                    ? ''
                    : ` · ${formatDate(usage.date, locale, {
                        day: 'numeric',
                        month: 'short',
                      })}`}
                  {usage.time === null ? '' : ` · ${formatClockTime(usage.time, locale)}`}
                </span>
              </span>

              <span
                className={`flex-none text-sm font-semibold tabular-nums ${
                  topUp ? 'text-success' : 'text-content'
                }`}
              >
                {/*
                  Signed through `Intl`, not by gluing a character on: a
                  locale's minus is not always the ASCII hyphen, and the sign
                  belongs on the side the locale puts it.
                */}
                {formatMoney(topUp ? usage.amount : -usage.amount, currency, locale, {
                  signed: true,
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
