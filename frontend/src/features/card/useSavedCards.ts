import { useSyncExternalStore } from 'react';
import type { SavedCard } from './savedCard';
import { getSavedCards, subscribeToSavedCards } from './savedCardsStore';

/**
 * The saved list, kept current.
 *
 * Subscribed rather than read, the same reason `useFavourites` is: the list
 * changes outside React — a rename from a tile, a save from the lookup form,
 * or another tab entirely.
 */
export function useSavedCards(): readonly SavedCard[] {
  return useSyncExternalStore(subscribeToSavedCards, getSavedCards);
}
