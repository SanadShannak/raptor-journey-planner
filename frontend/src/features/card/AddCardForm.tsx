import { useId, useState, type FormEvent } from 'react';
import { CARD_LIMIT } from '../../api/cards';
import { messageForApiError, useLocale } from '../../i18n';
import { CARD_TYPES, type CardType, type TravelCard } from '../../types/card';
import { createCard } from './cardsStore';

interface Props {
  /** Whether there is room for another. The server decides; this explains first. */
  full: boolean;
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
export function AddCardForm({ full, onAdded }: Props) {
  const { strings, t } = useLocale();
  const nameId = useId();
  const typeId = useId();
  const errorId = useId();

  const [nickname, setNickname] = useState('');
  const [cardType, setCardType] = useState<CardType>('Standard');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
      onAdded(card);
    } catch (error: unknown) {
      setProblem(t(messageForApiError(error, strings)));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="rounded-card border-border bg-surface-raised flex flex-col gap-3 border p-4"
    >
      <h2 className="text-base font-semibold tracking-tight">
        {t(strings.card.addTitle)}
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-sm font-medium">
          {t(strings.card.nicknameLabel)}
        </label>
        <input
          id={nameId}
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
          className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 border px-3 py-2 text-sm [unicode-bidi:plaintext] focus-visible:outline-2 focus-visible:outline-offset-2 ltr:text-left rtl:text-right"
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
          className="rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
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
  );
}
