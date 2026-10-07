import { useRef, useState } from 'react';
import {
  formatClockTime,
  formatDate,
  formatMoney,
  messageForApiError,
  useLocale,
} from '../../i18n';
import type { CardUsage, TravelCard } from '../../types/card';
import { AmountForm } from './AmountForm';
import { discardCard, getWallet, refresh, rename, spend, topUp } from './cardsStore';

interface Props {
  card: TravelCard;
  /** What the network charges in, or null before `/api/network` answers. */
  currency: string | null;
  /** Called once the card is gone, so the page can move focus and selection. */
  onDiscarded: () => void;
}

/** The longest nickname the server's rename rule accepts. */
const NICKNAME_LIMIT = 40;

/**
 * One card: what is on it, what can be done to it, and what has happened.
 *
 * The balance is money, so it is printed through `Intl` in whatever the
 * network charges in — `/api/network` says which. How many decimal places that
 * is is a property of the currency rather than a choice: three for a dinar,
 * two for a euro, and hard-coding either would be wrong on half the networks
 * this app can load.
 *
 * Topping up and paying a fare are both here because both are now things the
 * *server* does — the balance is calculated there and this panel only ever
 * displays what came back. There is no local arithmetic anywhere in this file,
 * which is the point of the migration: the number on screen is the number in
 * the database, or it is nothing.
 */
export function CardDetail({ card, currency, onDiscarded }: Props) {
  const { locale, strings, t } = useLocale();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.nickname);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /**
   * What to announce after money has moved, or null when nothing has.
   *
   * The balance is the one thing a top-up or a fare actually changes, and it
   * is read silently off a heading — so without this a screen-reader user
   * pressing "Top up" got a cleared field and no confirmation. Announcing just
   * this sentence is what lets the panel around it *not* be a live region:
   * wrapping the whole thing would re-read both forms, the rename and the
   * delete on every change.
   *
   * Kept out of the balance figure itself so the announcement says what
   * happened — "balance is now X" — rather than reading a number with no
   * indication that it moved.
   */
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const nameRef = useRef<HTMLButtonElement>(null);

  function close() {
    setEditing(false);
    nameRef.current?.focus();
  }

  /**
   * Sends the new name, unless there is nothing to send.
   *
   * An unchanged name needs no round trip, and an emptied one is restored
   * rather than sent: the server refuses a blank nickname, and it has no
   * endpoint for going back to the default it once supplied.
   *
   * On a refusal the field closes and the reason is shown beneath, for the
   * same reason `FavouriteCard` does it that way — `onBlur` commits, so a
   * field left open after a failed blur-commit would send the same rejected
   * name again every time focus left it.
   */
  async function commitName() {
    const next = draft.trim();
    if (next === '' || next === card.nickname) {
      setDraft(card.nickname);
      close();
      return;
    }

    setProblem(null);
    setBusy(true);
    close();
    try {
      await rename(card.id, next);
    } catch (error: unknown) {
      setDraft(card.nickname);
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      setBusy(false);
    }
  }

  /** Wraps one of the store's writes with this panel's pending and error state. */
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setProblem(null);
    setBusy(true);
    try {
      await work();
    } catch (error: unknown) {
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves money, then says what the balance became.
   *
   * The new figure is read back out of the **store** rather than computed
   * here: the server owns the arithmetic, and announcing a number this
   * component had worked out itself would be the one figure on screen nobody
   * had verified. `getWallet` is read after the await, so it holds the card
   * the response just replaced.
   *
   * **It deliberately does not catch.** Unlike {@link run}, the rejection is
   * left to propagate, because the caller is an `AmountForm` and that form has
   * somewhere better to put it: beside its own field, with the typed amount
   * still in place. Swallowing it here would report the failure in this
   * panel's region *and* clear the field the reader is about to correct.
   */
  async function moveMoney(work: () => Promise<void>) {
    if (busy) return;
    setAnnouncement(null);
    setProblem(null);
    setBusy(true);
    try {
      await work();
      const updated = getWallet().cards.find((entry) => entry.id === card.id);
      if (updated === undefined) return;
      setAnnouncement(
        t(strings.card.balanceNow, {
          amount: formatMoney(updated.balance, currency, locale),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDiscard() {
    setProblem(null);
    setBusy(true);
    try {
      await discardCard(card.id);
      // Only on success: focus must not leave a card that is still here.
      onDiscarded();
    } catch (error: unknown) {
      setProblem(t(messageForApiError(error, strings)));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border-border bg-surface-raised shadow-card flex flex-col gap-5 border p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-content-muted text-xs font-semibold tracking-wide uppercase">
            {t(strings.card.balance)}
          </p>
          <p className="text-4xl font-semibold tabular-nums">
            {formatMoney(card.balance, currency, locale)}
          </p>
        </div>

        {/* The name is the rename control, the same idiom a favourite card
            uses: pressing it turns it into a field in place, with no pencil to
            find first. */}
        <div className="flex min-w-0 flex-col items-end gap-1">
          {editing ? (
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitName();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraft(card.nickname);
                  close();
                }
              }}
              maxLength={NICKNAME_LIMIT}
              aria-label={t(strings.card.rename)}
              className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 w-48 border px-2 py-1 text-sm font-medium [unicode-bidi:plaintext] focus-visible:outline-2 focus-visible:outline-offset-1 ltr:text-left rtl:text-right"
            />
          ) : (
            <button
              ref={nameRef}
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t(strings.card.renameNamed, { name: card.nickname })}
              className="rounded-control hover:decoration-content-muted focus-visible:outline-brand-500 max-w-48 cursor-text text-sm font-medium underline decoration-transparent decoration-dotted underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {/* See `FavouriteCard` for why this is `plaintext` with a pinned
                  physical alignment rather than `dir="auto"`. */}
              <span className="block truncate [unicode-bidi:plaintext] ltr:text-left rtl:text-right">
                {card.nickname}
              </span>
            </button>
          )}
          <span className="text-content-muted rounded-control bg-surface-muted px-2 py-0.5 text-xs">
            {t(strings.card.types[card.cardType])}
          </span>
        </div>
      </div>

      <div className="text-content-muted flex flex-col gap-1 text-sm">
        <p className="flex flex-wrap gap-2">
          <span>{t(strings.card.numberLabel)}</span>
          {/*
            Pinned left-to-right: a card number is a run of digits and dashes
            that reads the same way round in every language, and the grouping
            is punctuation for reading it aloud.
          */}
          <span className="text-content tabular-nums" dir="ltr">
            {card.number}
          </span>
        </p>

        {/* One sentence, so one element. A description list here would be a
            term with nothing to define it against. */}
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

      {/* Zero is a balance, not a missing one, and it is the one number that
          changes what somebody does next. */}
      {card.balance === 0 && (
        <p className="rounded-control bg-surface-muted text-content px-3 py-2 text-sm">
          {t(strings.card.emptyCard)}
        </p>
      )}

      {/*
        The two money actions, side by side on a wide panel and stacked on a
        narrow one. Deliberately not one form with a direction toggle: a toggle
        that decides whether money arrives or leaves is one mis-set control
        between topping up and spending.
      */}
      <div className="border-border grid gap-5 border-t pt-4 sm:grid-cols-2">
        <AmountForm
          label={strings.card.topUpLabel}
          action={strings.card.topUpAction}
          pendingAction={strings.card.topUpPending}
          onSubmit={(amount) => moveMoney(() => topUp(card.id, amount))}
        />
        <AmountForm
          label={strings.card.fareLabel}
          action={strings.card.fareAction}
          pendingAction={strings.card.farePending}
          onSubmit={(amount) => moveMoney(() => spend(card.id, amount))}
        />
      </div>

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        <button
          type="button"
          onClick={() => void run(() => refresh(card.number))}
          disabled={busy}
          aria-busy={busy || undefined}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t(strings.card.refreshBalance)}
        </button>

        {/*
          Discarding asks first, and the question is the control.

          A card holds money, so losing one to a mis-aimed press is a different
          order of mistake from un-saving a stop — and `<dialog>` for a single
          yes-or-no would mean a focus trap and a background to inert for a
          question that fits on one line. The confirm button takes the
          destructive colour and the cancel sits beside it, so the press that
          undoes the mistake is as easy to reach as the one that makes it.
        */}
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            <span role="alert" className="text-content text-xs">
              {t(strings.card.discardConfirm)}
            </span>
            {/*
              Outlined in `danger` rather than filled with it. There is no
              `on-danger` token, and inventing a fill would mean a new
              foreground/background pair to verify in both schemes for one
              button — where `danger` as *text* on `surface-raised` is already
              a checked combination, and is how the rest of the app states a
              destructive or failed thing. The border and the weight carry the
              emphasis the fill would have.
            */}
            <button
              type="button"
              onClick={() => void confirmDiscard()}
              disabled={busy}
              aria-busy={busy || undefined}
              className="rounded-control border-danger text-danger focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-xs font-semibold hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(strings.card.discardYes)}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.card.discardNo)}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-control text-danger focus-visible:outline-brand-500 ms-auto cursor-pointer px-3 py-1.5 text-xs font-medium underline decoration-transparent decoration-dotted underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t(strings.card.discard)}
          </button>
        )}
      </div>

      {/*
        What went wrong, for whichever control was pressed. One region for the
        panel rather than one per button: only one request is in flight at a
        time — `busy` enforces it — so there is only ever one thing to say.
      */}
      <div aria-live="assertive">
        {problem !== null && (
          <p className="rounded-card border-danger text-danger border px-4 py-3 text-sm">
            {problem}
          </p>
        )}
      </div>

      {/*
        What the balance became, announced and not drawn: the figure is already
        on screen in a size nobody can miss, so a second copy of it would be
        repetition for everyone who can see it and the only confirmation for
        everyone who cannot.
      */}
      <p role="status" className="sr-only">
        {announcement ?? ''}
      </p>

      <Activity usages={card.usages} currency={currency} />
    </div>
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
      <h3 className="text-content-muted text-xs font-semibold tracking-wide uppercase">
        {t(strings.card.activity)}
      </h3>

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
