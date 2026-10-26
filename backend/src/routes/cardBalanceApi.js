const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const AppError = require("../utils/AppError");
const Card = require("../models/Card");
const digitsOfCardNumber = require("../utils/digitsOfCardNumber");
const formatCardNumber = require("../utils/formatCardNumber");

/*
 * A card's balance by its number, for anybody — signed in or not.
 *
 * `GET /api/cards/balance/:number` → `{ data: { number, balance } }`
 *
 * Deliberately the balance and nothing else. Card numbers are issued in
 * sequence, so anybody can count through them; what counting can reveal is
 * kept to the one fact a balance check exists to answer. No owner, nickname,
 * card type, last use or history — those stay behind `/api/cards/:number`,
 * which answers only a card's own account.
 *
 * The number may be grouped (`12345-67890-1`, `12345 67890 1`) or not; it is
 * eleven digits either way, or 400 BAD_CARD_NUMBER. An unknown number is 404
 * CARD_NOT_FOUND. Mounted ahead of the signed-in `/api/cards` router, whose
 * `requireAuth` would otherwise refuse it.
 */

/*
 * Ten a minute from one address: plenty for a person checking their own card
 * and a few others, and far too slow to walk the sequence of numbers. On top
 * of the global limit, which allows thirty times as many.
 */
const balanceRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many balance checks. Please slow down."));
  },
});

router.get("/:number", balanceRateLimiter, async (req, res) => {
  const digits = digitsOfCardNumber(req.params.number);
  if (!/^\d{11}$/.test(digits)) {
    throw new AppError(400, "BAD_CARD_NUMBER", "A card number is eleven digits.");
  }

  const card = await Card.findOne({ number: digits }).select("number balance");
  if (!card) {
    throw new AppError(404, "CARD_NOT_FOUND", "Card does not exist.");
  }

  return res.status(200).json({
    data: {
      number: formatCardNumber(card.number),
      balance: Number(card.balance.toFixed(3)),
    },
  });
});

module.exports = router;
