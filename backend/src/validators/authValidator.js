const { body } = require("express-validator");

const registerValidationRules = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .notEmpty()
    .withMessage("Email cannot be empty"),
  body("password")
    .trim()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .notEmpty()
    .withMessage("Password cannot be empty"),
  body("name")
    .trim()
    .isString()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ min: 3, max: 20 })
    .withMessage("Name must be between 3 and 20 characters")
    .matches(/^[a-zA-Z0-9\s]+$/)
    .withMessage("Must be alphanumeric with spaces only"),
];

const loginValidationRules = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .notEmpty()
    .withMessage("Email cannot be empty"),
  body("password")
    .trim()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .notEmpty()
    .withMessage("Password cannot be empty"),
];

const verifyPasswordValidationRules = [
  body("password")
    .trim()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .notEmpty()
    .withMessage("Password cannot be empty"),
];
module.exports = {
  registerValidationRules,
  loginValidationRules,
  verifyPasswordValidationRules,
};
