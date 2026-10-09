const Card = require("../models/Card");
const generateCardNumber = require("../utils/generateCardNumber");
const digitsOfCardNumber = require("../utils/digitsOfCardNumber");
const { networkCurrency } = require("../utils/networkCurrency");
const describeCard = require("../utils/describeCard");

const addCard = async (req, res) => {
  try {
    const user = req.user;
    const { nickname } = req.body;
    const userCards = await Card.find({ user: user._id });
    if (userCards.length === 5)
      return res
        .status(422)
        .json({ message: "Limit of maximum 5 cards per user reached." });

    const formattedNickname = nickname.trim();
    const duplicateCard = await Card.findOne({
      user: user._id,
      nickname: formattedNickname,
    }).collation({ locale: "en", strength: 2 });

    if (duplicateCard) {
      return res.status(400).json({
        message: "Another card the user owns has the same nickname.",
      });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getUserCards = async (req, res) => {
  try {
    const user = req.user;
    const userCards = await Card.find({ user: user._id }).sort({
      createdAt: -1,
    });

    const formattedCards = userCards.map(describeCard);

    return res.status(200).json({ data: formattedCards });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getCardByNumber = async (req, res) => {
  try {
    const user = req.user;
    const { number } = req.params;

    const card = await Card.findOne({ number: digitsOfCardNumber(number) });
    if (!card) return res.status(404).json({ message: "Card does not exist." });

    if (!card.user.equals(user._id)) {
      return res.status(401).json({ message: "You do not own this card" });
    }

    return res.status(200).json({ data: describeCard(card) });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const removeCard = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const card = await Card.findOne({ _id: id, user: user._id });

    if (!card)
      return res
        .status(404)
        .json({ message: "Card not found or unauthorized to delete." });

    if (card.balance > 0)
      return res
        .status(400)
        .json({ message: "Card has active balance. Cannot delete." });

    await Card.deleteOne({ _id: id });

    return res.status(200).json({ message: "Card Removed Successfully", id });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const topUpCard = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { amount } = req.body;
    const topUpAmount = parseFloat(amount);

    const card = await Card.findOne({ _id: id, user: user._id });
    if (!card) return res.status(404).json({ message: "Card not found" });

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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const deductFareFromCard = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { amount } = req.body;
    const fareAmount = parseFloat(amount);

    const card = await Card.findOne({ _id: id, user: user._id });
    if (!card) return res.status(404).json({ message: "Card not found" });

    if (card.balance - fareAmount < 0)
      return res.status(400).json({ message: "Insufficient balance" });

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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const changeCardNickname = async (req, res) => {
  try {
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
      return res.status(400).json({
        message: "Another card the user owns has the same nickname.",
      });
    }

    const card = await Card.findOneAndUpdate(
      { _id: id, user: user._id },
      { $set: { nickname: formattedNickname } },
      { returnDocument: "after" },
    );
    if (!card) return res.status(404).json({ message: "Card does not exist." });

    return res.status(201).json({
      message: "Card nickname changed successfully",
      data: describeCard(card),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
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
