/**
 * `/api/cards` — the wallet.
 *
 * Every card belongs to the signed-in account and every call here needs the
 * session cookie, which `client.ts` attaches. There is no public lookup any
 * more: a card number is **minted by the server** when a card is added, so
 * nothing in this module takes one as input except {@link refreshCard}, which
 * uses it to re-read a card the wallet already holds.
 *
 * Like `auth.ts`, this module synthesises the stable `errorCode` the account
 * endpoints do not send. The mapping has to live here because the same bare
 * 400 means "that nickname is taken" on one endpoint and "not enough money"
 * on another, and only the caller knows which it asked.
 */

import type { CardType, CardUsage, TravelCard } from '../types/card';
import { CARD_TYPES } from '../types/card';
import { deleteJson, getJson, patchJson, postJson } from './client';
import { ApiError, isApiError } from './errors';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/** The account already holds as many cards as the server allows. */
export const CARD_LIMIT_REACHED = 'CARD_LIMIT_REACHED';

/** Another of this account's cards is already called that. */
export const DUPLICATE_CARD_NICKNAME = 'DUPLICATE_CARD_NICKNAME';

/** The fare is more than the card holds. */
export const INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE';

/** The amount was rejected: zero, negative, or too many decimal places. */
export const INVALID_AMOUNT = 'INVALID_AMOUNT';

/** No such card on this account. */
export const CARD_NOT_FOUND = 'CARD_NOT_FOUND';

/**
 * How many cards one account may hold.
 *
 * The server is the authority — `addCard` refuses the sixth with a 422 — and
 * this is here so the interface can say so before somebody fills in a form
 * that cannot be submitted. It is **not** enforced client-side: a count read
 * from a list is always a little behind the truth, and the 422 is what
 * actually decides.
 */
export const CARD_LIMIT = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** A movement of the balance, or null when it is too broken to draw a row. */
function toUsage(raw: unknown): CardUsage | null {
  if (!isRecord(raw)) return null;

  const { amount, kind } = raw;

  // A row with no amount or no direction says nothing; a row with no date can
  // still be shown, because the amount is the part being read.
  if (typeof amount !== 'number' || (kind !== 'fare' && kind !== 'topUp')) return null;

  return {
    date: text(raw['date']),
    time: text(raw['time']),
    amount,
    kind,
    description: text(raw['description']),
  };
}

/**
 * An unrecognised card type is **dropped to `Standard`**, not kept.
 *
 * The same reasoning the geocoder applies to transit modes: the type decides
 * what a chooser shows as selected, and a value no control can represent
 * would leave the form unable to describe the card it is editing. `Standard`
 * is the server's own default for a card created without one.
 */
function toCardType(value: unknown): CardType {
  return CARD_TYPES.find((type) => type === value) ?? 'Standard';
}

/**
 * One card, or a rejection.
 *
 * A card without a readable number or balance is not a card with unknown
 * details — it is a response this app cannot read, and saying so beats
 * rendering a tile with a blank where the money goes.
 */
function toCard(raw: unknown): TravelCard {
  const card = isRecord(raw) ? raw : {};

  const id = card['id'];
  const number = card['number'];
  const balance = card['balance'];

  if (typeof id !== 'string' || typeof number !== 'string' || typeof balance !== 'number') {
    throw new ApiError('malformed', 'Card response was not readable.');
  }

  const usages = Array.isArray(card['usages']) ? card['usages'] : [];

  return {
    id,
    number,
    // The server defaults this, so an empty one means it genuinely has no name.
    nickname: typeof card['nickname'] === 'string' ? card['nickname'] : '',
    cardType: toCardType(card['cardType']),
    balance,
    lastUsedDate: text(card['lastUsedDate']),
    usages: usages.map(toUsage).filter((usage): usage is CardUsage => usage !== null),
  };
}

/** Unwraps the `{ data }` envelope every endpoint in this router uses. */
function dataOf(body: unknown): unknown {
  return isRecord(body) ? body['data'] : undefined;
}

/** A 400 carrying field complaints is a validation failure, whatever else it is. */
const rejectedAField = (error: ApiError): boolean =>
  Object.keys(error.fieldErrors).length > 0;

/** Re-throws with the code this endpoint's statuses mean. */
function mapError(error: unknown, forStatus: Record<number, string>): never {
  if (isApiError(error)) {
    const code = error.status === null ? undefined : forStatus[error.status];
    if (code !== undefined) throw error.withCode(code);
  }
  throw error;
}

/** Every card on the account, newest first — the server sorts it. */
export async function listCards(options: CallOptions = {}): Promise<TravelCard[]> {
  const body = await getJson('/api/cards', {
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const data = dataOf(body);
  if (!Array.isArray(data)) {
    throw new ApiError('malformed', 'Card list response carried no cards.');
  }
  return data.map(toCard);
}

export interface AddCardInput {
  /**
   * What to call it. **Required, even though the API calls it optional.**
   *
   * `POST /api/cards` reads `req.body.nickname.trim()` with no validator in
   * front of it, so a request without one is a 500 rather than a card named by
   * default. The form always supplies something, and `addCard` refuses to send
   * nothing rather than letting the server fall over.
   */
  nickname: string;
  cardType?: CardType | undefined;
}

/**
 * Issues a new card on the account.
 *
 * The number comes back from the server; nothing chooses it here.
 */
export async function addCard(
  input: AddCardInput,
  options: CallOptions = {},
): Promise<TravelCard> {
  const nickname = input.nickname.trim();
  if (nickname === '') {
    // Caught here rather than sent: see AddCardInput.
    throw new ApiError('malformed', 'A card needs a name.', {
      code: 'INVALID_SUBMISSION',
    });
  }

  try {
    const body = await postJson('/api/cards', {
      body: { nickname, ...(input.cardType ? { cardType: input.cardType } : {}) },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return toCard(dataOf(body));
  } catch (error: unknown) {
    mapError(error, { 400: DUPLICATE_CARD_NICKNAME, 422: CARD_LIMIT_REACHED });
  }
}

/** Renames one. The server rejects a name another of this account's cards has. */
export async function renameCard(
  id: string,
  nickname: string,
  options: CallOptions = {},
): Promise<TravelCard> {
  try {
    const body = await patchJson(`/api/cards/${encodeURIComponent(id)}`, {
      body: { nickname },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return toCard(dataOf(body));
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400 && rejectedAField(error)) {
      throw error.withCode('INVALID_SUBMISSION');
    }
    mapError(error, { 400: DUPLICATE_CARD_NICKNAME, 404: CARD_NOT_FOUND });
  }
}

/**
 * Discards a card.
 *
 * Returns nothing: the delete response carries only the id it removed, which
 * the caller already had.
 */
export async function removeCard(id: string, options: CallOptions = {}): Promise<void> {
  try {
    await deleteJson(`/api/cards/${encodeURIComponent(id)}`, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error: unknown) {
    mapError(error, { 404: CARD_NOT_FOUND });
  }
}

/**
 * Adds money.
 *
 * The amount is sent as a **string**. The server's validator runs
 * `body("amount").trim()`, which is a no-op on a JSON number but makes the
 * decimal-places rule — `/^\d+(\.\d{1,3})?$/` — a test against whatever
 * express-validator stringified it to. Sending the text the reader typed means
 * the rule tests what they actually wrote.
 */
export async function topUpCard(
  id: string,
  amount: string,
  options: CallOptions = {},
): Promise<TravelCard> {
  try {
    const body = await postJson(`/api/cards/${encodeURIComponent(id)}/top-up`, {
      body: { amount },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return toCard(dataOf(body));
  } catch (error: unknown) {
    mapError(error, { 400: INVALID_AMOUNT, 404: CARD_NOT_FOUND });
  }
}

/**
 * Spends from the card — what a gate or a reader would do.
 *
 * Two different 400s come back here and they need different words. A rejected
 * *amount* names fields; "Insufficient balance" names none, so the absence of
 * field errors is what identifies it. Guessing from the message text would mean
 * matching on the server's English, which is exactly what this app does not do.
 */
export async function payFare(
  id: string,
  amount: string,
  options: CallOptions = {},
): Promise<TravelCard> {
  try {
    const body = await postJson(`/api/cards/${encodeURIComponent(id)}/fare`, {
      body: { amount },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return toCard(dataOf(body));
  } catch (error: unknown) {
    if (isApiError(error) && error.status === 400) {
      throw error.withCode(rejectedAField(error) ? INVALID_AMOUNT : INSUFFICIENT_BALANCE);
    }
    mapError(error, { 404: CARD_NOT_FOUND });
  }
}

/**
 * Re-reads one card by its printed number.
 *
 * What the wallet's per-card refresh calls, so checking one balance does not
 * re-fetch every card and its twenty history rows. The number must arrive
 * **grouped** — `XXXXX-XXXXX-X` — because the server validates the punctuation
 * before stripping it, which is the one place in this app where the dashes are
 * more than presentation. It is passed straight through from a card the wallet
 * is already holding, so it is always in that form.
 *
 * A 401 is deliberately **not** mapped. This endpoint answers 401 both for an
 * expired session and for a card belonging to somebody else, and the second
 * cannot happen here — the number came from this account's own list — so
 * leaving it unmapped lets `isUnauthorized` treat it as what it must be.
 */
export async function refreshCard(
  number: string,
  options: CallOptions = {},
): Promise<TravelCard> {
  try {
    const body = await getJson(`/api/cards/${encodeURIComponent(number)}`, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return toCard(dataOf(body));
  } catch (error: unknown) {
    mapError(error, { 400: CARD_NOT_FOUND, 404: CARD_NOT_FOUND });
  }
}
