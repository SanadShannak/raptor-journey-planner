/**
 * A travel card, as an inquiry answers about one.
 *
 * The balance is a **number in major units** — 1.3 means one dinar three
 * hundred fils — and how many decimals that prints with is a property of the
 * currency rather than of this type. `/api/network` reports which currency,
 * and `formatMoney` asks `Intl` how to write it.
 */
/**
 * One movement of the balance.
 *
 * `amount` is a **magnitude** and is never negative. Which way the money went
 * is `kind`, because a sign cannot tell a top-up from a refund — both are money
 * arriving — and a display that wants "−1.300" builds it from the two.
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
  /** As printed on the card, grouped: `XXXXX-XXXXX-X`. */
  number: string;
  balance: number;
  /**
   * When the balance was last known to be true, as `YYYY-MM-DD`, or null when
   * the card has never been used. Network-local like every other date here.
   */
  lastUsedDate: string | null;
  /**
   * What has happened to the balance, **newest first**, capped by the backend.
   *
   * Empty is a real answer for a card nobody has used, and is not the same as
   * a card whose history was never kept — but from here they look alike, so
   * the page says "nothing yet" rather than claiming the card is unused.
   */
  usages: CardUsage[];
}
