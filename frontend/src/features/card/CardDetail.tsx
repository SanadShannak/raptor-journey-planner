import { useId, useRef, useState } from 'react';
import {
  formatClockTime,
  formatDate,
  formatMoney,
  formatNumber,
  messageForApiError,
  useLocale,
} from '../../i18n';
import type { CardUsage, TravelCard } from '../../types/card';
import { AMOUNT_PLACES, MINIMUM_AMOUNT } from './amount';
import { AmountForm } from './AmountForm';
import { DeleteCardDialog } from './DeleteCardDialog';
import { addsToTheAmount } from './usage';
import { getWallet, refresh, rename, spend, topUp } from './cardsStore';

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
 * A transparent border on the name, so its focus ring has the chip's shape.
 *
 * It no longer has an edge to match: the type chip sits across the row from
 * the name rather than under it, so the two are at opposite ends and there is
 * nothing to line up. What the border still buys is the ring — a focusable
 * run of plain text otherwise outlines tighter than the bordered chip beside
 * it, and the two read as different kinds of control.
 */
const TEXT_INSET = 'border border-transparent';

/**
 * One card: what is on it, what can be done to it, and what has happened.
 *
 * The identity is drawn as **a card**, in the brand fill, rather than as a row
 * of labelled fields. It is the one object on this page a person already has a
 * picture of — they are holding one — and the shape does the work three
 * headings used to: the name and the type at the top where a card prints them,
 * the balance large because it is the only thing anybody opens this page for,
 * and the number along the bottom where it is read from. `on-brand` on
 * `brand-fill` is a contrast-checked pair in both schemes.
 *
 * The balance is money, so it is printed through `Intl` in whatever the
 * network charges in — `/api/network` says which. How many decimal places that
 * is is a property of the currency rather than a choice: three for a dinar, two
 * for a euro, and hard-coding either would be wrong on half the networks this
 * app can load.
 *
 * There is no arithmetic anywhere in this file, which is the point of the
 * migration: the number on screen is the number in the database, or it is
 * nothing.
 */
export function CardDetail({ card, currency, onDiscarded }: Props) {
  const { locale, strings, t } = useLocale();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.nickname);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /**
   * What to announce after money has moved, or null when nothing has.
   *
   * The balance is read silently off the card face, so without this a screen
   * reader user pressing "Top up" got a cleared field and no confirmation.
   * Announcing just this sentence is what lets the panel around it *not* be a
   * live region: wrapping the whole thing would re-read both forms, the rename
   * and the delete on every change.
   */
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const blockedId = useId();

  /**
   * A card with money on it is not thrown away.
   *
   * The balance is the reason: deleting is irreversible and the money goes
   * with it, so the card has to be spent down or the balance moved before it
   * can go. Checked here so the control can explain itself without a round
   * trip, and checked again by the server, which is what actually decides —
   * this figure is only ever as fresh as the last response.
   */
  const blocked = card.balance > 0;

  function close() {
    setEditing(false);
    // Back to the name that opened the field, or focus falls to the body.
    nameRef.current?.focus();
  }

  /**
   * Sends the new name, unless there is nothing to send.
   *
   * Two cases resolve to "leave it alone" rather than to a request. An
   * **unchanged** name needs no round trip. An **emptied** field used to mean
   * "clear the nickname back to the name it came with", and that meaning no
   * longer exists: the server fills an omitted nickname at the moment of
   * saving and has no endpoint for restoring its own default, so a blank is
   * restored locally instead of being sent somewhere it would simply be
   * refused.
   *
   * On a refusal the field **closes** and the reason is shown beneath. Leaving
   * it open would be the obvious alternative and is a trap: `onBlur` commits,
   * so a field still open after a failed blur-commit sends the same rejected
   * name again the next time focus leaves it.
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
   * had verified.
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

  return (
    <div className="rounded-card border-border bg-surface-raised shadow-card flex flex-col gap-5 border p-5 lg:p-6">
      {/*
        The card itself.

        `justify-between` with the balance pushed to the bottom gives it a
        card's proportions without a fixed height that long names would spill
        out of.
      */}
      <div className="rounded-card bg-brand-fill text-on-brand flex flex-col gap-6 p-5">
        {/*
          Name at the leading edge, type at the trailing one.

          Stacked, they were one statement read top to bottom; across the row
          they are two facts the eye can take separately — which is how a card
          is actually read, the name being what you look for and the type being
          what you check. `items-center` rather than `items-start`, because a
          one-line name and a one-line chip on the same row should share a
          centre rather than a top edge.
        */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
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
                /*
                  On its own surface rather than transparent on the fill: a
                  field has to look like one, and `content` on `surface` is the
                  checked pair for text somebody is editing.
                */
                className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-on-brand w-56 max-w-full border px-3 py-1.5 text-base font-semibold [unicode-bidi:plaintext] focus-visible:outline-2 focus-visible:outline-offset-2 ltr:text-left rtl:text-right"
              />
            ) : (
              <button
                ref={nameRef}
                type="button"
                onClick={() => setEditing(true)}
                aria-label={t(strings.card.renameNamed, { name: card.nickname })}
                /*
                  The focus ring is `on-brand`, not `brand-500`: this control
                  sits on the brand fill, so a ring in the brand colour would
                  be nearly invisible against it — the same reason the app bar
                  rings its controls in `on-chrome`.
                */
                className={`rounded-control focus-visible:outline-on-brand cursor-text text-start text-lg font-semibold underline decoration-transparent decoration-dotted underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 ${TEXT_INSET}`}
              >
                {/*
                  `unicode-bidi: plaintext` with a pinned physical alignment,
                  the pairing `FavouriteCard` documents: a nickname comes from
                  a person, so it can be Arabic on an English page or Latin on
                  an Arabic one, and the box must stay where the card put it
                  while the text runs whichever way it actually runs.
                */}
                <span className="block truncate [unicode-bidi:plaintext] ltr:text-left rtl:text-right">
                  {card.nickname}
                </span>
              </button>
            )}

          </div>

          {/*
            `border-current` rather than a token, so the chip is drawn in the
            same ink as the text on it — which is the pair the contrast check
            has already verified, with no second combination to add.

            It takes the corner the issuer mark used to hold. Two marks in one
            corner is clutter, and between a decorative glyph and the fact of
            what kind of card this is, the fact earns the place.
          */}
          <span className="rounded-control inline-flex flex-none items-center border border-current px-1.5 py-0.5 text-xs font-medium">
            {t(strings.card.types[card.cardType])}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex flex-col">
            {/*
              A label by typography rather than by dimming: opacity on text
              would change the contrast of a pair that has been checked at full
              strength.
            */}
            <span className="text-xs font-semibold tracking-wide uppercase">
              {t(strings.card.balance)}
            </span>
            <span className="text-4xl font-semibold tabular-nums">
              {formatMoney(card.balance, currency, locale)}
            </span>
          </div>

          {/*
            Pinned left-to-right: a card number is a run of digits and dashes
            that reads the same way round in every language, and the grouping
            is punctuation for reading it aloud.
          */}
          <p className="text-sm font-medium tracking-wider tabular-nums" dir="ltr">
            <span className="sr-only">{t(strings.card.numberLabel)}</span>
            {card.number}
          </p>
        </div>
      </div>

      <div className="text-content-muted flex flex-wrap items-center justify-between gap-2 text-sm">
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

        <button
          type="button"
          onClick={() => void run(() => refresh(card.number))}
          disabled={busy}
          aria-busy={busy || undefined}
          className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t(strings.card.refreshBalance)}
        </button>
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
      <div className="border-border flex flex-col gap-3 border-t pt-4">
        <div className="grid gap-5 sm:grid-cols-2">
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

        {/*
          The format, once for both fields rather than under each.

          It is the same rule either side, and printed twice it read as two
          different constraints a reader had to compare. Under both, centred on
          the pair, it is one statement about what a money field here accepts.
        */}
        <p className="text-content-muted text-xs">
          {/*
            Both numbers are interpolated from the rule's own constants rather
            than written into the sentence, so they are formatted in the
            locale's digits and cannot drift from what `amountProblem` actually
            enforces. The minimum has its places pinned, or `Intl` renders 0.01
            as "0" on a locale with no fraction digits by default.
          */}
          {t(strings.card.amountHint, {
            places: formatNumber(AMOUNT_PLACES, locale),
            minimum: formatNumber(MINIMUM_AMOUNT, locale, { minimumFractionDigits: 2 }),
          })}
        </p>
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
        on the card face in a size nobody can miss, so a second copy of it
        would be repetition for everyone who can see it and the only
        confirmation for everyone who cannot.
      */}
      <p role="status" className="sr-only">
        {announcement ?? ''}
      </p>

      <Activity usages={card.usages} currency={currency} />

      {/*
        Last, and on its own line. A destructive control among the ones people
        use every visit is a control they eventually press by accident; at the
        end of the panel it is somewhere you go rather than somewhere you pass.
      */}
      <div className="border-border flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t pt-4">
        {/*
          Why it cannot go, stated **before** the press rather than after one.

          A control that is off for an unexplained reason reads as broken, and
          the remedy here is something the reader can act on — the fare field
          is right there. The server is still the authority: it refuses the
          request too, and that refusal maps to this same sentence.
        */}
        {blocked && (
          <p id={blockedId} className="text-content-muted text-xs">
            {t(strings.card.discardNeedsEmpty)}
          </p>
        )}

        {/*
          **Never `disabled`.** A disabled button is unfocusable and screen
          readers skip past it, so the one person who most needs to know why
          the control is off would never find out. It stays focusable, carries
          `aria-disabled`, and is described by the reason beside it — the same
          treatment the favourites star gets.
        */}
        <button
          ref={deleteRef}
          type="button"
          aria-disabled={blocked || undefined}
          aria-describedby={blocked ? blockedId : undefined}
          onClick={() => {
            if (blocked) return;
            setDeleting(true);
          }}
          className={`rounded-control text-danger focus-visible:outline-brand-500 px-3 py-1.5 text-xs font-medium underline decoration-transparent decoration-dotted underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
            blocked
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:decoration-current'
          }`}
        >
          {t(strings.card.discard)}
        </button>
      </div>

      {deleting && (
        <DeleteCardDialog
          card={card}
          onDeleted={onDiscarded}
          onClose={() => {
            setDeleting(false);
            // Back to the control that opened it, or focus falls to the body.
            deleteRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/**
 * What has happened to the balance.
 *
 * The balance answers "can I board"; this answers "why is it that". A charge
 * somebody does not recognise is the reason anybody looks a card up twice, so
 * the row leads with **what kind of movement it was and when**, and the amount
 * closes the line.
 *
 * Direction is never carried by colour alone: every row states its kind in
 * words, and the sign is part of the formatted number rather than a coloured
 * arrow. Green here is emphasis on something already said.
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
          const where = addsToTheAmount(usage) ? usage.description : null;

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
                <span className="text-sm font-medium">
                  {t(topUp ? strings.card.topUp : strings.card.fare)}
                </span>
                <span className="text-content-muted text-xs">
                  {/*
                    Where it happened, when the server said something beyond
                    restating the amount — see `addsToTheAmount`. Joined into
                    the same line as the date rather than given its own, so a
                    row is two lines whether or not there is a place on it.
                  */}
                  {where !== null && (
                    <>
                      {/*
                        `dir="auto"` on the name alone, and the separator
                        outside it. The isolate is there so a Latin place name
                        on an Arabic line — or the reverse — is laid out as
                        what it is without reordering the date after it; the
                        "·" belongs to the line's own direction, so putting it
                        inside the isolate would carry it along with the name.
                      */}
                      <span dir="auto">{where}</span>
                      {usage.date === null && usage.time === null ? '' : ' · '}
                    </>
                  )}
                  {usage.date === null
                    ? ''
                    : formatDate(usage.date, locale, { day: 'numeric', month: 'short' })}
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
