const express = require("express");
const router = express.Router();

const Card = require("../db/models/Card");
const { isCardStoreReady } = require("../db/client");
const {
  isoDateInNetwork,
  wallClockInNetwork,
} = require("../utils/networkTime");

/*
 * Travel-card inquiry.
 *
 * The only part of this server backed by a database rather than by the compiled
 * feed, and the only part that can be unavailable on its own. Everything else
 * answers from RAM.
 */

/** Eleven digits, as printed. The grouping is not part of the number. */
const CARD_NUMBER_DIGITS = 11;

/**
 * The digits of whatever was asked for.
 *
 * `12345-67890-1`, `12345 67890 1` and `12345678901` are the same card. The
 * grouping exists so a person can read a long number off a card without losing
 * their place, and rejecting two of those three spellings rejects people for
 * punctuation rather than for being wrong.
 */
function digitsOf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** The stored digits, grouped the way the card prints them. */
function formatCardNumber(digits) {
  return `${digits.slice(0, 5)}-${digits.slice(5, 10)}-${digits.slice(10)}`;
}

/**
 * How much history one lookup carries.
 *
 * A balance is the question; the history is context for it. Enough to see the
 * last few days of travel and recognise a charge, not an account statement —
 * and a cap here keeps the response small however long a card has been in use.
 */
const MAX_USAGES = 20;

/** One movement of the balance, on the network's clock. */
function describeUsage(usage) {
  const when = wallClockInNetwork(usage.at);

  return {
    date: when?.date ?? null,
    time: when?.time ?? null,
    /*
     * A magnitude, exactly as stored. The sign is not applied here because it
     * is not a property of the amount — `kind` says which way the money went,
     * and a client that wants "−1.300" can build it from the two. Baking a
     * minus in would also make a refund and a top-up indistinguishable.
     */
    amount: usage.amount,
    kind: usage.kind,
    description: usage.description ?? null,
  };
}

/**
 * The public shape of a card.
 *
 * A presenter, like `formatItinerary` is for a journey: the store keeps digits
 * and an instant, and the wire carries the grouping a person reads and a date on
 * the network's own clock. Neither of those belongs in the database, and the
 * conversion belongs in exactly one place.
 */
function describeCard(card) {
  /*
   * Newest first, sorted here rather than trusted from the document. Nothing
   * stops a writer pushing an older tap onto the end, and a history that is
   * only *usually* ordered is one a reader cannot rely on.
   */
  const usages = [...(card.usages ?? [])]
    .filter((usage) => usage?.at instanceof Date)
    .sort((a, b) => b.at - a.at);

  /*
   * Derived from the history when there is one, so the summary and the list
   * can never disagree. `lastUsedAt` remains the answer for a card whose
   * history predates this field or was never kept.
   */
  const lastUsedAt = usages[0]?.at ?? card.lastUsedAt;

  return {
    number: formatCardNumber(card.number),
    balance: card.balance,
    lastUsedDate: isoDateInNetwork(lastUsedAt),
    usages: usages.slice(0, MAX_USAGES).map(describeUsage),
  };
}

/*
 * One card's balance.
 * GET /api/card/:number
 */
router.get("/:number", async (req, res) => {
  try {
    const digits = digitsOf(req.params.number);

    /*
     * Validated before the store is asked. A malformed number is the client's
     * mistake and is answered as one — and it also keeps arbitrary input from
     * reaching a query, which is the habit worth having whether or not this
     * particular driver would be fooled by it.
     */
    if (digits.length !== CARD_NUMBER_DIGITS) {
      return res.status(400).json({
        errorCode: "BAD_CARD_NUMBER",
        error: `A card number is ${CARD_NUMBER_DIGITS} digits, optionally grouped as XXXXX-XXXXX-X.`,
      });
    }

    /*
     * Answered before querying, so a store that is down reads as "this feature
     * is unavailable" rather than as a broken card. Without it the query waits
     * for a server selection timeout and then fails as a 500, which says the
     * wrong thing to both the reader and whoever is reading the logs.
     */
    if (!isCardStoreReady()) {
      return res.status(503).json({
        errorCode: "CARD_STORE_UNAVAILABLE",
        error: "The card store is not available.",
      });
    }

    // `await`. Without it this is a Query object — which is always truthy, so
    // every lookup "succeeded" and serialised the query itself as the card.
    const card = await Card.findOne({ number: digits }).lean();

    if (!card) {
      /*
       * A 404 with a body, and a `return`. An Express handler that falls off
       * the end sends nothing at all, and the client waits for its own timeout
       * rather than being told the card does not exist.
       */
      return res.status(404).json({
        errorCode: "CARD_NOT_FOUND",
        error: "No card with that number.",
      });
    }

    return res.json(describeCard(card));
  } catch (error) {
    /*
     * Logged in full, reported as a code. `error.message` from a driver names
     * collections, hosts and sometimes credentials, and it is developer-facing
     * English that no interface should be putting in front of a person.
     */
    console.error("[Card Endpoint Error]:", error);
    return res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve the card.",
    });
  }
});

module.exports = router;
