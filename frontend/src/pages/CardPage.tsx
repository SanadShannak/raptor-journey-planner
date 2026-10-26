import type { Message } from '../i18n/dictionary';
import { useTour } from '../features/tour';
import { useEffect, useId, useRef, useState } from 'react';
import { Placeholder, PlaceholderGroup } from '../components/Pending';
import { usePageTitle } from '../app/usePageTitle';
import { getNetwork } from '../api/network';
import { CARD_LIMIT } from '../api/cards';
import { useSession } from '../auth';
import { GuestNotice } from '../auth/GuestNotice';
import { BalanceCheck } from '../features/card/BalanceCheck';
import { formatMoney, messageForApiError, useLocale } from '../i18n';
import { AddCardForm } from '../features/card/AddCardForm';
import { CardDetail } from '../features/card/CardDetail';
import { loadCards } from '../features/card/cardsStore';
import { useLoadCards, useWallet } from '../features/card/useCards';

/**
 * The wallet.
 *
 * **This page used to be a public inquiry and is now an account's own cards.**
 * It asked for the number printed on a card somebody was holding and showed
 * that card's balance, with no sign-in — which was the right design for a
 * backend that answered `/api/card/:number` to anyone. That endpoint is gone.
 * Numbers are now minted by the server, a card belongs to the account that
 * created it, and `/api/cards/:number` only ever answers about your own. So
 * the number is no longer a question anybody can ask; it is an answer the
 * server gives.
 *
 * Laid out as the lookup form once was — a fixed column and the detail beside
 * it — because the shape still fits: the left side is the short list of things
 * to choose between, and the right is the one card being read.
 *
 * **Two things on one page.** A balance check by number, which anybody can
 * use and which answers with the balance alone; and the wallet, which is an
 * account's. A guest sees the wallet as it is laid out for an account — its
 * list, empty, and its add form, disabled — with what an account would add
 * said above it, rather than a panel in its place: the page is the same page,
 * and what is missing is shown as missing.
 *
 * Selection is kept in component state rather than in the address. The planner
 * puts its open itinerary in the URL because an itinerary is somewhere to come
 * *back* to, and a card is not: there is nothing to share, nothing to restore,
 * and a card id in a link somebody pastes is one more identifier loose in the
 * world for no gain.
 */
export default function CardPage() {
  const { locale, strings, t } = useLocale();
  usePageTitle(t(strings.pages.card.title));
  useTour('card');
  /*
   * Names the list of cards for a screen reader, by pointing it at the heading
   * already above it rather than repeating the words in an `aria-label`. Two
   * lists sit on this page — the cards and the open card's activity — so an
   * unnamed one leaves a reader to work out which they have landed in.
   */
  const listHeadingId = useId();

  useLoadCards();
  const { status, cards, error, answered } = useWallet();
  const { signedIn, checking } = useSession();

  const [currency, setCurrency] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

    return () => controller.abort();
  }, []);

  /*
   * Which card is open, resolved against the list rather than trusted.
   *
   * The selection is an id and the list is fetched, so the two can disagree —
   * a card removed in another tab, or a sign-out and back in as somebody else.
   * Resolving on every render means a stale id simply falls back to the first
   * card instead of leaving the panel blank, and it also gives the page its
   * "first card is open on arrival" behaviour with no effect to run.
   */
  const selected =
    cards.find((card) => card.id === selectedId) ?? cards[0] ?? null;

  const full = cards.length >= CARD_LIMIT;

  /*
   * Where focus goes when the open card is discarded — otherwise it falls to
   * the body and a keyboard reader is dropped at the top of the document with
   * no idea what happened.
   */
  const afterDiscarded = () => {
    setSelectedId(null);
    headingRef.current?.focus();
  };

  return (
    /*
      Full width, with the same gutters `FavouritesPage` uses, rather than the
      capped column every prose page gets — a balance and an activity list have
      somewhere to spread out.
    */
    <div className="flex w-full flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div data-tour="card-intro" className="flex flex-col gap-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          /*
            Focused only by code — after something on the page is removed, so
            a screen reader is told where it now is — never by tabbing, so it
            draws no outline. One here spanned the whole width of the page,
            boxing the heading in as though it were a control.
          */
          className="text-3xl font-semibold tracking-tight outline-none"
        >
          {t(strings.card.walletTitle)}
        </h1>
        <p className="text-content-muted max-w-prose">
          {t(strings.card.walletIntro)}
        </p>
      </div>

      <div className="max-w-xl">
        <BalanceCheck currency={currency} />
      </div>

      {/*
        Only while the session is being checked is there nothing to show: whose
        wallet this is, if anybody's, is not known yet.
      */}
      {checking ? (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            {t(strings.account.checking)}
          </p>
          <div className="flex max-w-[26rem] flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {t(strings.card.myCardsTitle)}
            </h2>
            <CardRowsPlaceholder />
          </div>
        </div>
      ) : !signedIn ? (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[26rem_1fr]">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  {t(strings.card.myCardsTitle)}
                </h2>
                <p className="text-content-muted text-xs tabular-nums">
                  {t(strings.favourites.countOfLimit, { count: 0, limit: CARD_LIMIT })}
                </p>
              </div>
              <p className="rounded-card border-border bg-surface-muted text-content-muted border px-3 py-2.5 text-sm">
                {t(strings.card.guestNoCards)}
              </p>
            </section>
            <GuestNotice message={strings.card.guestNotice} />
            <AddCardForm locked full={false} hasCards={false} onAdded={() => {}} />
          </div>
        </div>
      ) : (
        <>
        {status === 'failed' ? (
          <div
            role="alert"
            className="rounded-card border-danger text-danger flex flex-wrap items-center gap-x-3 gap-y-2 border px-4 py-3 text-sm"
          >
            <span>{t(messageForApiError(error, strings))}</span>
            <button
              type="button"
              onClick={() => void loadCards()}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 cursor-pointer px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.planner.retryConnection)}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[26rem_1fr]">
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    id={listHeadingId}
                    className="text-lg font-semibold tracking-tight"
                  >
                    {t(strings.card.myCardsTitle)}
                  </h2>
                  <p className="text-content-muted text-xs tabular-nums">
                    {t(strings.favourites.countOfLimit, {
                      count: cards.length,
                      limit: CARD_LIMIT,
                    })}
                  </p>
                </div>

                {/*
                  `aria-busy` only on the *first* load. `loading` is also the
                  state during a refetch, and a list that announced itself busy
                  every time a top-up came back would interrupt constantly.
                */}
                <div
                  aria-busy={
                    status === 'loading' && !answered ? true : undefined
                  }
                >
                  {cards.length === 0 ? (
                    /*
                      "No cards yet" is a claim about the account, and not one
                      this page can make until an answer has arrived. Once one
                      has, it stands while the page asks again — so coming back
                      to a wallet with nothing in it says so at once rather
                      than drawing placeholders on every visit.
                    */
                    answered ? (
                      <p className="rounded-card border-border bg-surface-muted text-content-muted motion-safe:animate-content-in border px-3 py-2.5 text-sm">
                        {t(strings.card.noCards)}
                      </p>
                    ) : (
                      <CardRowsPlaceholder label={strings.card.loadingCards} />
                    )
                  ) : (
                    <ul
                      aria-labelledby={listHeadingId}
                      className="motion-safe:animate-content-in flex flex-col gap-2"
                    >
                      {cards.map((card) => {
                        const open = selected?.id === card.id;
                        return (
                          <li key={card.id}>
                            {/*
                              A button rather than a link: choosing which card
                              to read changes what this page shows and is not
                              somewhere to navigate to. `aria-current` says
                              which one is open, which a pressed state alone
                              would leave to colour.
                            */}
                            <button
                              type="button"
                              onClick={() => setSelectedId(card.id)}
                              aria-current={open ? 'true' : undefined}
                              className={`rounded-card focus-visible:outline-brand-500 flex w-full cursor-pointer items-center justify-between gap-3 border px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 ${
                                open
                                  ? 'border-brand-500 bg-surface-raised'
                                  : 'border-border bg-surface hover:bg-surface-muted'
                              }`}
                            >
                              <span className="flex min-w-0 flex-col">
                                {/* See `FavouriteCard` for why a name that may
                                    be in the other script needs `plaintext`
                                    *and* a pinned physical alignment. */}
                                <span className="block truncate text-sm font-medium [unicode-bidi:plaintext] ltr:text-left rtl:text-right">
                                  {card.nickname}
                                </span>
                                <span
                                  className="text-content-muted text-xs tabular-nums"
                                  dir="ltr"
                                >
                                  {card.number}
                                </span>
                              </span>
                              <span className="flex-none text-sm font-semibold tabular-nums">
                                {formatMoney(card.balance, currency, locale)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              {/*
                Above the list on a phone. There the page is one column, and
                below the list this sat between the cards and the open card's
                details — so choosing a card meant scrolling past a form to
                read about it. Beside the details, from `lg`, it goes back under
                the list it adds to.

                Moved with `order` rather than by rendering it twice: one form,
                so a half-typed card number survives the window being turned.
              */}
              <div className="max-lg:order-first">
                <AddCardForm
                  full={full}
                  hasCards={cards.length > 0}
                  onAdded={(card) => setSelectedId(card.id)}
                />
              </div>
            </div>

            {/*
              **Not** a live region, which it was at first and should not be.

              The panel is full of controls now — two amount forms, a rename, a
              delete — and a live region announces everything inside it on
              every change, so topping up read the whole panel back and
              switching cards did it again. What actually changed is the
              balance, so `CardDetail` announces that one sentence itself.
            */}
            <div>
              {selected !== null && (
                <CardDetail
                  /*
                    Keyed on the card, so switching cards starts the panel from
                    scratch: its rename field, its confirmation and its two
                    amount forms all belong to one particular card, and
                    carrying a half-typed fare across to another would be a
                    number aimed at the wrong balance.
                  */
                  key={selected.id}
                  card={selected}
                  currency={currency}
                  onDiscarded={afterDiscarded}
                />
              )}
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}

/** Two rows the shape of a card in the list, while the list is on its way. */
function CardRowsPlaceholder({ label }: { label?: Message | undefined }) {
  return (
    <PlaceholderGroup label={label} className="flex flex-col gap-2">
      {[0, 1].map((row) => (
        <span
          key={row}
          className="rounded-card border-border flex items-center justify-between gap-3 border px-3 py-2.5"
        >
          <span className="flex flex-1 flex-col gap-1.5">
            <Placeholder className="h-4 w-1/2" />
            <Placeholder className="h-3 w-1/3" />
          </span>
          <Placeholder className="h-5 w-16" />
        </span>
      ))}
    </PlaceholderGroup>
  );
}
