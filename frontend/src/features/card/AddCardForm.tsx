import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CARD_LIMIT } from '../../api/cards';
import { messageForApiError, useLocale } from '../../i18n';
import { CARD_TYPES, type CardType, type TravelCard } from '../../types/card';
import { createCard } from './cardsStore';

interface Props {
  /** Whether there is room for another. The server decides; this explains first. */
  full: boolean;
  /**
   * Whether the wallet already holds something.
   *
   * Decides whether the form starts open. An empty wallet has nothing else on
   * it, so the form *is* the page and opening collapsed would hide the only
   * thing to do; once there are cards, the list is what somebody came for and
   * a permanently expanded form pushes it up the page every visit.
   */
  hasCards: boolean;
  /** Hands back the new card so the page can select it. */
  onAdded: (card: TravelCard) => void;
}

/** The longest nickname the server's own rename rule accepts. */
const NICKNAME_LIMIT = 40;

/**
 * Issues a new card.
 *
 * **The number is not asked for, because it is not chosen.** The server mints
 * an eleven-digit number and returns it, so this form collects only the two
 * things a person actually decides: what to call it and what kind it is. That
 * is the whole shape of the change — the page used to ask for a number printed
 * on a card somebody was holding, and now it issues one.
 *
 * The nickname is **required here even though the API documents it as
 * optional**: `POST /api/cards` runs `req.body.nickname.trim()` with no
 * validator in front of it, so a request without one is a 500 rather than a
 * card named by default. Asking for it is both the honest fix available from
 * this side and the better form — a wallet of five cards called "My Transit
 * Card" is not a wallet anybody can use.
 */
export function AddCardForm({ full, hasCards, onAdded }: Props) {
  const { strings, t } = useLocale();
  const nameId = useId();
  const typeId = useId();
  const errorId = useId();
  const panelId = useId();

  const [nickname, setNickname] = useState('');
  const [cardType, setCardType] = useState<CardType>('Standard');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * Whether the reader has decided for themselves, and what they decided.
   *
   * Null means "follow the wallet", which is the state it starts in and stays
   * in until something is pressed: an empty wallet shows the form open because
   * the form *is* the page then, and the first card closes it without anything
   * having to notice that the first card arrived.
   *
   * Derived rather than synchronised, which is what keeps it honest while the
   * list is still loading. `hasCards` is false for the moment before the fetch
   * answers, so a state *initialised* from it would open the form on every
   * visit by an account that has cards, and then need an effect to close it
   * again — a flash, and a rule about when not to steal focus.
   */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? !hasCards;
  const nameRef = useRef<HTMLInputElement>(null);

  /*
   * Focus lands in the first field when the reader opens the form — the point
   * of pressing "Add a card" is to type a name, and leaving focus on the
   * disclosure means a keyboard user has to tab into what they just asked for.
   *
   * Keyed on the *choice* rather than on `open`, so the form an empty wallet
   * opens by itself does not move focus on arrival.
   */
  useEffect(() => {
    if (chosen !== true) return;
    nameRef.current?.focus();
  }, [chosen]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || full) return;

    const trimmed = nickname.trim();
    if (trimmed === '') {
      setProblem(t(strings.card.nicknameRequired));
      return;
    }

    setProblem(null);
    setPending(true);
    try {
      const card = await createCard({ nickname: trimmed, cardType });
      setNickname('');
      setCardType('Standard');
      // Done, so out of the way: an empty form between the reader and the card
      // they just made is the one thing this panel should not be.
      setChosen(false);
      onAdded(card);
    } catch (error: unknown) {
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      setPending(false);
    }
  }

  /*
   * A disclosure, not a dialog: the form sits in normal document flow and
   * pushes the page down rather than overlaying it, so it owes no focus trap,
   * no `aria-modal` and no inert background. Adding a card is an ordinary
   * thing to do on this page, not an interruption of it.
   */
  return (
    <div className="rounded-card border-border bg-surface-raised flex flex-col border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setChosen(!open)}
        className="rounded-card text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-start text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t(strings.card.addTitle)}
        {/* A plus that becomes a minus: the shape says which way the press
            goes, so the state is not carried by position alone. Not
            directional, so it does not mirror in RTL. */}
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="text-content-muted flex-none"
        >
          <path d="M3.5 10h13" />
          {!open && <path d="M10 3.5v13" />}
        </svg>
      </button>

      <form
        id={panelId}
        hidden={!open}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="border-border flex flex-col gap-3 border-t p-4"
      >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-sm font-medium">
          {t(strings.card.nicknameLabel)}
        </label>
        <input
          id={nameId}
          ref={nameRef}
          value={nickname}
          onChange={(event) => {
            setNickname(event.target.value);
            if (problem !== null) setProblem(null);
          }}
          maxLength={NICKNAME_LIMIT}
          autoComplete="off"
          placeholder={t(strings.card.nicknamePlaceholder)}
          aria-invalid={problem === null ? undefined : true}
          aria-describedby={problem === null ? undefined : errorId}
          /*
            `unicode-bidi: plaintext` and a pinned alignment, the same pairing
            `FavouriteCard` documents: a nickname comes from a person, so it
            can be Arabic on an English page or Latin on an Arabic one, and the
            box has to stay where the label is while the text runs whichever
            way it actually runs.
          */
          className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 border px-4 py-2.5 text-sm [unicode-bidi:plaintext] focus-visible:outline-2 focus-visible:outline-offset-2 ltr:text-left rtl:text-right"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={typeId} className="text-sm font-medium">
          {t(strings.card.typeLabel)}
        </label>
        {/*
          A native `<select>`. Four fixed options with no search and no
          multi-select is exactly what it is for, and it brings keyboard
          support, the platform's own picker on a phone, and a real label
          association for nothing.
        */}
        <select
          id={typeId}
          value={cardType}
          onChange={(event) => setCardType(event.target.value as CardType)}
          /*
            `pe-9` leaves the browser's own dropdown arrow somewhere to sit.
            It is drawn inside the padding box at the inline end, so without
            the reserved room a long option name runs underneath it — and
            being logical, the reservation moves to the other side in Arabic
            along with the arrow.
          */
          className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border py-2.5 ps-4 pe-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {CARD_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(strings.card.types[type])}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending || full}
        aria-busy={pending || undefined}
        className="rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t(pending ? strings.card.adding : strings.card.add)}
      </button>

      <div aria-live="polite">
        {problem !== null && (
          <p id={errorId} className="text-danger text-xs">
            {problem}
          </p>
        )}
      </div>

      {/*
        Said before the press rather than only after it. The server refuses the
        sixth card with a 422 and that refusal is the authority, but a button
        that is off for a reason nobody has stated is a button that looks
        broken.
      */}
      {full && (
        <p className="text-content-muted text-xs">
          {t(strings.card.limitReached, { count: CARD_LIMIT })}
        </p>
      )}
      </form>
    </div>
  );
}
