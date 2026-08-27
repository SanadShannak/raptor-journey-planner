import { SAVED_CARDS_LIMIT, type SavedCard } from './savedCard';
import {
  readSavedCards,
  SAVED_CARDS_STORAGE_KEY,
  writeSavedCards,
} from './savedCardsStorage';

/**
 * Every saved card, for the whole app.
 *
 * A module-level store with a set of listeners, the same shape
 * `favouritesStore.ts` uses — no state library, consistent with everything
 * else here. New cards are appended rather than unshifted, so saving one
 * never disturbs an arrangement somebody made on purpose.
 */

let items: readonly SavedCard[] = readSavedCards();

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function commit(next: readonly SavedCard[]): void {
  items = next;
  writeSavedCards(next);
  announce();
}

export function subscribeToSavedCards(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The list as it stands. Returns the held array, never a fresh one. */
export function getSavedCards(): readonly SavedCard[] {
  return items;
}

export function isCardSaved(number: string): boolean {
  return items.some((card) => card.number === number);
}

export function hasRoomForAnotherCard(): boolean {
  return items.length < SAVED_CARDS_LIMIT;
}

/**
 * Saves one, unless it is already saved or the list is full.
 *
 * Returns whether it was added, so a caller can explain a refusal rather than
 * appearing to do nothing.
 */
export function addSavedCard(card: SavedCard): boolean {
  if (isCardSaved(card.number)) return false;
  if (!hasRoomForAnotherCard()) return false;

  commit([...items, card]);
  return true;
}

export function removeSavedCard(number: string): void {
  const next = items.filter((card) => card.number !== number);
  if (next.length === items.length) return;
  commit(next);
}

/** Adds it, or removes it if it is already there. Returns the new state. */
export function toggleSavedCard(card: SavedCard): boolean {
  if (isCardSaved(card.number)) {
    removeSavedCard(card.number);
    return false;
  }
  return addSavedCard(card);
}

/**
 * Renames one, or clears the name back to the number it came with.
 *
 * A name of only spaces is stored as null rather than as whitespace, so an
 * emptied field reliably restores the bare number instead of leaving a tile
 * that looks untitled.
 */
export function renameSavedCard(number: string, nickname: string): void {
  const trimmed = nickname.trim();
  const next = items.map((card) =>
    card.number === number ? { ...card, nickname: trimmed === '' ? null : trimmed } : card,
  );
  commit(next);
}

/** Another tab changed the list. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== SAVED_CARDS_STORAGE_KEY) return;
    items = readSavedCards();
    announce();
  });
}

/** For tests, which share one module across a file. */
export function forgetSavedCards(): void {
  items = [];
  writeSavedCards(items);
  announce();
}
