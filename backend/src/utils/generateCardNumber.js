const Counter = require("../models/Counter");

const generateNextCardNumber = async () => {
  let counter = await Counter.findByIdAndUpdate(
    "cardNumber",
    { $inc: { seq: 1 } },
    { returnDocument: "after" },
  );
  if (!counter) {
    try {
      counter = await Counter.create({ _id: "cardNumber" });
    } catch (error) {
      if (
        error.code === 11000
      ) // 11000 means duplicate key - to handle race conditions
      {
        counter = await Counter.findByIdAndUpdate(
          "cardNumber",
          { $inc: { seq: 1 } },
          { returnDocument: "after" },
        );
      } else throw error;
    }
  }

  const counterString = String(counter.seq);

  return counterString;
};

module.exports = generateNextCardNumber;
