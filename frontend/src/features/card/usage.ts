import type { CardUsage } from '../../types/card';

/**
 * Whether a movement's description says anything the row does not already.
 *
 * The field is meant for **where** money moved — a line, a gate, a machine —
 * and a row that has one reads "Fare · Bus 550 · Oct 8". What the server
 * currently puts there instead is a restatement of the row itself:
 * `Deducted fare with amount EUR 2.800`, beside a kind that already says
 * "Fare" and a figure that already says "−€2.80". Printed as written, the
 * amount appeared twice on one line and the sentence crowded out the date.
 *
 * So the description is shown only when it carries something else. The test is
 * **the amount's own digits**: every stock description interpolates them, and a
 * place name does not normally contain the exact figure it cost. Both the
 * plain and the three-decimal spellings are checked, because the server writes
 * `2.800` where the amount is `2.8`.
 *
 * Deliberately a *presentation* decision rather than a correction. Nothing is
 * dropped from the data, the field is still read, and the day the backend puts
 * a stop name there it starts appearing with no change here. If it ever
 * describes a place whose name happens to contain the fare, the cost is one
 * hidden caption — against an amount printed twice on every row otherwise.
 */
export function addsToTheAmount(usage: CardUsage): boolean {
  const description = usage.description?.trim() ?? '';
  if (description === '') return false;

  const { amount } = usage;
  const spellings = [
    String(amount),
    amount.toFixed(1),
    amount.toFixed(2),
    amount.toFixed(3),
  ];

  return !spellings.some((digits) => description.includes(digits));
}
