const { param, body } = require("express-validator");
const { networkCurrency } = require("../utils/networkCurrency");

const getCardByNumberValidationRules = [
  param("number")
    .trim()
    .notEmpty()
    .withMessage("Card number cannot be empty")
    .isLength({ max: 14 })
    .withMessage("Card number must be 14 characters")
    .matches(/^\d{5}-\d{5}-\d{1}$/)
    .withMessage("Card number must match the following format: XXXXX-XXXXX-X"),
];

const removeCardValidationRules = [
  param("id").trim().notEmpty().withMessage("Card ID cannot be empty"),
];

const topUpCardValidationRules = [
  param("id").trim().notEmpty().withMessage("Card ID cannot be empty"),
  body("amount")
    .trim()
    .notEmpty()
    .withMessage("Top up amount cannot be empty")
    .isFloat({ min: 0.01 })
    .withMessage(`Top up amount must be minimum ${networkCurrency()} 0.01`)
    .matches(/^\d+(\.\d{1,3})?$/)
    .withMessage("Top up amount can have a maximum of 3 decimal places."),
];

const deductFareFromCardValidationRules = [
  param("id").trim().notEmpty().withMessage("Card ID cannot be empty"),
  body("amount")
    .trim()
    .notEmpty()
    .withMessage("Fare amount cannot be empty")
    .isFloat({ min: 0.01 })
    .withMessage(`Fare amount must be minimum ${networkCurrency()} 0.01`)
    .matches(/^\d+(\.\d{1,3})?$/)
    .withMessage("Fare amount can have a maximum of 3 decimal places."),
];

const changeCardNicknameValidationRules = [
  param("id").trim().notEmpty().withMessage("Card ID cannot be empty"),
  body("nickname").trim().notEmpty().withMessage("Nickname cannot be empty"),
];

module.exports = {
  getCardByNumberValidationRules,
  removeCardValidationRules,
  topUpCardValidationRules,
  deductFareFromCardValidationRules,
  changeCardNicknameValidationRules,
};
