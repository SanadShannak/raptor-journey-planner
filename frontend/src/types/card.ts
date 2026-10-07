/**
 * A travel card, as the wallet holds one.
 *
 * The balance is a **number in major units** — 1.3 means one dinar three
 * hundred fils — and how many decimals that prints with is a property of the
 * currency rather than of this type. `/api/network` reports which currency,
 * and `formatMoney` asks `Intl` how to write it.
 *
 * Every field here comes from the server and none of it is kept on the device.
 * That is the whole point of the migration: a balance held locally goes stale
 * the moment it is spent, with nothing on screen to say so.
 */

/** What a card is issued as. The server's own enum, and it never changes after. */
export type CardType = 'Standard' | 'Student' | 'Elderly' | 'Virtual';

/** Every type, in the order a chooser offers them. */
export const CARD_TYPES: readonly CardType[] = [
  'Standard',
  'Student',
  'Elderly',
  'Virtual',
];

/**
 * One movement of the balance.
 *
 * `amount` is a **magnitude** and is never negative — the server's schema
 * enforces it. Which way the money went is `kind`, because a sign cannot tell
 * a top-up from a refund — both are money arriving — and a display that wants
 * "−1.300" builds it from the two.
 */
export interface CardUsage {
  /** `YYYY-MM-DD` on the network's clock. Null when the store had no instant. */
  date: string | null;
  /** `HH:mm`, 24-hour on the wire like every other time here. */
  time: string | null;
  amount: number;
  kind: 'fare' | 'topUp';
  /** Where it happened — a line, a machine. Null when the store did not say. */
  description: string | null;
}

export interface TravelCard {
  /**
   * The server's `_id`, and what every write is addressed to.
   *
   * Distinct from {@link number}, which is what is printed on the card and
   * what a person reads out. Only this one identifies the card to the API.
   */
  id: string;
  /** As printed on the card, grouped: `XXXXX-XXXXX-X`. Minted by the server. */
  number: string;
  /** The reader's own name for it. The server defaults it rather than storing ''. */
  nickname: string;
  cardType: CardType;
  balance: number;
  /**
   * When the balance was last known to be true, as `YYYY-MM-DD`, or null when
   * the card has never been used. Network-local like every other date here.
   */
  lastUsedDate: string | null;
  /**
   * What has happened to the balance, **newest first**, capped by the backend
   * at twenty.
   *
   * Empty is a real answer for a card nobody has used, and is not the same as
   * a card whose history was never kept — but from here they look alike, so
   * the page says "nothing yet" rather than claiming the card is unused.
   */
  usages: CardUsage[];
}
