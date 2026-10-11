const AppError = require("../utils/AppError");
const Card = require("../models/Card");
const generateCardNumber = require("../utils/generateCardNumber");
const digitsOfCardNumber = require("../utils/digitsOfCardNumber");
const { networkCurrency } = require("../utils/networkCurrency");
const describeCard = require("../utils/describeCard");

const addCard = async (req, res) => {
  const user = req.user;
  const { nickname } = req.body;
  const userCards = await Card.find({ user: user._id });
  if (userCards.length === 5)
    throw new AppError(422, "CARD_LIMIT_REACHED", "Limit of maximum 5 cards per user reached.");

  const formattedNickname = nickname.trim();
  const duplicateCard = await Card.findOne({
    user: user._id,
    nickname: formattedNickname,
  }).collation({ locale: "en", strength: 2 });

  if (duplicateCard) {
    throw new AppError(400, "DUPLICATE_CARD_NICKNAME", "Another card the user owns has the same nickname.");
  }

  const cardNumber = await generateCardNumber();

  const newCard = await Card.create({
    user: user._id,
    number: cardNumber,
    nickname: formattedNickname || "My Transit Card",
    cardType: req.body.cardType || "Standard",
  });

  return res.status(201).json({
    message: "Card created successfully",
    data: describeCard(newCard),
  });
};

const getUserCards = async (req, res) => {
  const user = req.user;
  const userCards = await Card.find({ user: user._id }).sort({
    createdAt: -1,
  });

  const formattedCards = userCards.map(describeCard);

  return res.status(200).json({ data: formattedCards });
};

const getCardByNumber = async (req, res) => {
  const user = req.user;
  const { number } = req.params;

  const card = await Card.findOne({ number: digitsOfCardNumber(number) });
  if (!card) {
    throw new AppError(404, "CARD_NOT_FOUND", "Card does not exist.");
  }

  if (!card.user.equals(user._id)) {
    // Somebody else's card is answered exactly like a missing one: saying
      // "not yours" would confirm to a stranger that the number is real.
      throw new AppError(404, "CARD_NOT_FOUND", "Card does not exist.");
  }

  return res.status(200).json({ data: describeCard(card) });
};

const removeCard = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const card = await Card.findOne({ _id: id, user: user._id });

  if (!card)
    throw new AppError(404, "CARD_NOT_FOUND", "Card not found or unauthorized to delete.");

  if (card.balance > 0)
    throw new AppError(400, "CARD_HAS_BALANCE", "Card has active balance. Cannot delete.");

  await Card.deleteOne({ _id: id });

  return res.status(200).json({ message: "Card Removed Successfully", id });
};

const topUpCard = async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { amount } = req.body;
  const topUpAmount = parseFloat(amount);

  const card = await Card.findOne({ _id: id, user: user._id });
  if (!card) throw new AppError(404, "CARD_NOT_FOUND", "Card not found");

  card.balance = Number((card.balance + topUpAmount).toFixed(3));
  card.lastUsedAt = new Date();

  card.usages.push({
    at: new Date(),
    amount: topUpAmount,
    kind: "topUp",
    description: `Top up with amount ${networkCurrency()} ${topUpAmount.toFixed(3)}`,
  });

  const updatedCard = await card.save();

  return res.status(200).json({
    message: "Card Topped Up Successfully",
    data: describeCard(updatedCard),
  });
};

const deductFareFromCard = async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { amount } = req.body;
  const fareAmount = parseFloat(amount);

  const card = await Card.findOne({ _id: id, user: user._id });
  if (!card) throw new AppError(404, "CARD_NOT_FOUND", "Card not found");

  if (card.balance - fareAmount < 0)
    throw new AppError(400, "INSUFFICIENT_BALANCE", "Insufficient balance");

  card.balance = Number((card.balance - fareAmount).toFixed(3));
  card.lastUsedAt = new Date();

  card.usages.push({
    at: new Date(),
    amount: fareAmount,
    kind: "fare",
    description: `Deducted fare with amount ${networkCurrency()} ${fareAmount.toFixed(3)}`,
  });

  const updatedCard = await card.save();

  return res.status(200).json({
    message: "Fare deducted Successfully",
    data: describeCard(updatedCard),
  });
};

const changeCardNickname = async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { nickname } = req.body;
  const formattedNickname = nickname.trim();

  const duplicateCard = await Card.findOne({
    user: user._id,
    _id: { $ne: id },
    nickname: formattedNickname,
  }).collation({ locale: "en", strength: 2 });

  if (duplicateCard) {
    throw new AppError(400, "DUPLICATE_CARD_NICKNAME", "Another card the user owns has the same nickname.");
  }

  const card = await Card.findOneAndUpdate(
    { _id: id, user: user._id },
    { $set: { nickname: formattedNickname } },
    { returnDocument: "after" },
  );
  if (!card) throw new AppError(404, "CARD_NOT_FOUND", "Card does not exist.");

  return res.status(201).json({
    message: "Card nickname changed successfully",
    data: describeCard(card),
  });
};

module.exports = {
  addCard,
  getUserCards,
  getCardByNumber,
  removeCard,
  topUpCard,
  deductFareFromCard,
  changeCardNickname,
};
