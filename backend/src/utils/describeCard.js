const formatCardNumber = require("./formatCardNumber");
const { isoDateInNetwork, wallClockInNetwork } = require("./networkTime");

const MAX_USAGES = 20;

function describeUsage(usage) {
  const when = wallClockInNetwork(usage.at);
  return {
    date: when?.date ?? null,
    time: when?.time ?? null,
    amount: usage.amount,
    kind: usage.kind,
    description: usage.description ?? null,
  };
}

function describeCard(card) {
  const cardData = card.toObject ? card.toObject() : card;

  const usages = [...(cardData.usages ?? [])]
    .filter((usage) => usage?.at instanceof Date)
    .sort((a, b) => b.at - a.at);

  const lastUsedAt = usages[0]?.at ?? cardData.lastUsedAt;

  return {
    id: cardData._id,
    number: formatCardNumber(cardData.number),
    nickname: cardData.nickname,
    cardType: cardData.cardType,
    balance: Number(cardData.balance.toFixed(3)),
    lastUsedDate: isoDateInNetwork(lastUsedAt),
    usages: usages.slice(0, MAX_USAGES).map(describeUsage),
  };
}

module.exports = describeCard;
