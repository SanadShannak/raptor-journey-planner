/**
 * A travel card kept for quick lookup later.
 *
 * Only the number is meaningful — a balance is never stored, because a stored
 * balance would go stale the moment it is spent and there would be nothing on
 * screen to say so. `nickname` is the reader's own name for the card, the same
 * pattern favourites use: null for "the number itself is the name".
 */
export interface SavedCard {
  /** Digits only. The `XXXXX-XXXXX-X` grouping is punctuation for reading it. */
  number: string;
  nickname: string | null;
}

/** How many cards can be kept. Five, the same limit favourites give each kind. */
export const SAVED_CARDS_LIMIT = 5;

/** What makes two saved cards the same one, and the storage/React key for it. */
export function savedCardIdentity(card: SavedCard): string {
  return card.number;
}

/** What to call it: the reader's own name, or the number it came with. */
export function savedCardLabel(card: SavedCard, formattedNumber: string): string {
  const nickname = card.nickname?.trim() ?? '';
  return nickname === '' ? formattedNumber : nickname;
}
