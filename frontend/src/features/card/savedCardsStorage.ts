import { CARD_NUMBER_LENGTH, digitsOf } from './cardNumber';
import type { SavedCard } from './savedCard';

/**
 * Where saved cards are kept, and the only module that knows.
 *
 * The same seam `favouritesStorage.ts` cuts, and for the same reason: moving
 * this onto an account later is a change to this file plus a loading state in
 * the store, not a rewrite of the tile or the page.
 *
 * Device-local, deliberately — sign-in is inert in this app, so anything
 * implying a saved card follows a person between devices would be a promise
 * the product cannot keep. `localStorage` is also user-editable and survives
 * deploys, so the envelope is versioned and every field is checked on the way
 * in; anything unrecognised resolves to an empty list rather than throwing.
 */

const STORAGE_KEY = 'savedCards';

/** Bump when the shape changes; an older or newer envelope reads as empty. */
const VERSION = 1;

interface Envelope {
  version: number;
  items: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseSavedCard(value: unknown): SavedCard | null {
  if (!isRecord(value)) return null;

  const number = value['number'];
  if (typeof number !== 'string' || digitsOf(number).length !== CARD_NUMBER_LENGTH) {
    return null;
  }

  const nickname = value['nickname'];
  if (nickname !== null && typeof nickname !== 'string') return null;

  return { number: digitsOf(number), nickname };
}

/**
 * What is on disk.
 *
 * Never throws. A browser that refuses storage — private browsing, a blocked
 * origin — is answered with an empty list, and the page runs in memory only
 * for that visit rather than failing to render.
 */
export function readSavedCards(): SavedCard[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }

  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(parsed)) return [];
  const envelope = parsed as unknown as Envelope;
  if (envelope.version !== VERSION) return [];
  if (!Array.isArray(envelope.items)) return [];

  const items: SavedCard[] = [];
  for (const entry of envelope.items) {
    const card = parseSavedCard(entry);
    if (card !== null) items.push(card);
  }

  return items;
}

/**
 * Replaces what is on disk.
 *
 * Failure is swallowed on purpose — a full or refused quota must not take
 * down the press that caused it, so the session continues correctly and only
 * the persistence is lost.
 */
export function writeSavedCards(items: readonly SavedCard[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, items } satisfies Envelope),
    );
  } catch {
    /* Nothing useful to do, and nothing worth breaking the page over. */
  }
}

/** Which key a `storage` event has to name for it to be ours. */
export const SAVED_CARDS_STORAGE_KEY = STORAGE_KEY;
