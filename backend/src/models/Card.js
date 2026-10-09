const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{11}$/, "A card number is eleven digits"],
    },
    nickname: { type: String, default: "" },
    cardType: {
      type: String,
      enum: ["Standard", "Student", "Elderly"],
      default: "Standard",
    },
    balance: {
      type: Number,
      default: 0.0,
      min: [0, "Balance cannot be negative"],
    },
    lastUsedAt: { type: Date, default: null },
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
        description: { type: String, default: null },
      },
    ],
  },
  { timestamps: true },
);

const Card = mongoose.model("Card", cardSchema);

module.exports = Card;
