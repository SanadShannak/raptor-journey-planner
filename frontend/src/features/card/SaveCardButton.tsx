import { useLocale } from '../../i18n';
import { SAVED_CARDS_LIMIT } from './savedCard';
import { hasRoomForAnotherCard, isCardSaved, toggleSavedCard } from './savedCardsStore';
import { useSavedCards } from './useSavedCards';

interface Props {
  /** Digits only — the identity a saved card is keyed on. */
  number: string;
}

/**
 * Keeps a looked-up card in {@link SavedCardTile}'s list, or takes it out.
 *
 * A labelled button rather than a bare star: the star beside a stop or a route
 * sits next to a name that already says what it would save, and a card has
 * nothing beside it but a number, so the control has to say the word itself.
 *
 * Subscribed to the store rather than reading it once, because a tile's own
 * remove control can take this same card back out of the list while this
 * button is on screen, and the two have to agree about it without either
 * causing the other to render directly.
 */
export function SaveCardButton({ number }: Props) {
  const { strings, t } = useLocale();
  useSavedCards();

  const saved = isCardSaved(number);
  const full = !saved && !hasRoomForAnotherCard();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={saved}
        disabled={full}
        onClick={() => toggleSavedCard({ number, nickname: null })}
        className={`rounded-control focus-visible:outline-brand-500 inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          saved
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-border-strong text-content hover:bg-surface-muted'
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          width="15"
          height="15"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 2.6l2.3 4.66 5.15.75-3.73 3.63.88 5.13L10 14.35l-4.6 2.42.88-5.13L2.55 8.01l5.15-.75z" />
        </svg>
        {t(saved ? strings.card.unsave : strings.card.save)}
      </button>

      {full && (
        <p className="text-content-muted text-xs">
          {t(strings.card.limitReached, { count: SAVED_CARDS_LIMIT })}
        </p>
      )}
    </div>
  );
}
