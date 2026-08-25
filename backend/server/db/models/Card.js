const mongoose = require("mongoose");

/**
 * A travel card and what is on it.
 *
 * The number is stored as **digits only**, with no grouping. The
 * `XXXXX-XXXXX-X` form printed on the card is punctuation for a human reading
 * it aloud, not part of the identity, so keeping it here would mean the same
 * card fails to be found because somebody typed it without the dashes. The
 * router normalises on the way in and groups again on the way out, which is the
 * same split the rest of this server uses: store the value, present the format.
 */
const cardSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      /*
       * Unique, and therefore indexed — which the lookup needs anyway. Without
       * it two documents can claim the same card and `findOne` returns
       * whichever Mongo reaches first, silently.
       */
      unique: true,
      trim: true,
      match: [/^\d{11}$/, "A card number is eleven digits"],
    },

    /**
     * In major units — 1.3 is one dinar three hundred fils.
     *
     * `Number`, not `String`. As a string it sorts and compares
     * lexicographically, so "9" is greater than "10" and `min` does not apply
     * at all: Mongoose's `min` is a numeric validator, and on a string path it
     * is simply not enforced. A balance that can go negative without complaint
     * is the one bug this field exists to prevent.
     *
     * A default makes `required` unreachable — the default satisfies it before
     * validation runs — so it is not claimed here. A new card is empty.
     */
    balance: {
      type: Number,
      default: 0,
      min: [0, "Balance cannot be negative"],
    },

    /** When the card was last tapped. Absent on a card never used. */
    lastUsedAt: { type: Date, default: null },

    /**
     * What has happened to the balance, newest first.
     *
     * Embedded rather than a collection of its own, which is the right trade
     * while a history is short: it is always read with the card and never
     * without it, so a separate collection would be a join for no benefit.
     * The trade stops paying when a card accumulates thousands of taps — a
     * document has a 16 MB ceiling and the whole array is loaded on every
     * lookup — and at that point this becomes a `CardUsage` collection keyed
     * by card number.
     *
     * `amount` is a **magnitude**, never signed. Direction lives in `kind`,
     * because a sign cannot tell a top-up from a refund and both are money
     * arriving; the presenter applies the sign for display.
     */
    usages: [
      {
        _id: false,
        at: { type: Date, required: true },
        amount: {
          type: Number,
          required: true,
          min: [0, "An amount is a magnitude; direction is `kind`"],
        },
        kind: {
          type: String,
          required: true,
          enum: ["fare", "topUp"],
        },
        /** Where it happened — a line, a stop, a machine. Null when unknown. */
        description: { type: String, default: null },
      },
    ],
  },
  /*
   * `createdAt` and `updatedAt`, which cost nothing and are the first thing
   * anybody wants when a balance looks wrong.
   */
  { timestamps: true },
);

module.exports = mongoose.model("Card", cardSchema);
