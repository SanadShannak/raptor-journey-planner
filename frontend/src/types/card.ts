/**
 * A travel card, as an inquiry answers about one.
 *
 * The balance is a **number in major units** — 1.3 means one dinar three
 * hundred fils — and how many decimals that prints with is a property of the
 * currency rather than of this type. `/api/network` reports which currency,
 * and `formatMoney` asks `Intl` how to write it.
 */
export interface TravelCard {
  /** As printed on the card, grouped: `XXXXX-XXXXX-X`. */
  number: string;
  balance: number;
  /**
   * When the balance was last known to be true, as `YYYY-MM-DD`, or null when
   * the card has never been used. Network-local like every other date here.
   */
  lastUsedDate: string | null;
}
