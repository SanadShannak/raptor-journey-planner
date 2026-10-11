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
/*
 * The new password on a reset follows the same rule as a password chosen at
 * sign-up, so a reset cannot be used to set one the form would refuse.
 */
const forgotPasswordValidationRules = [
  body("email").trim().isEmail().withMessage("Please enter a valid email address"),
];

const resetPasswordValidationRules = [
  body("token").isString().notEmpty().withMessage("Token is required"),
  body("password")
    .trim()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

const verifyEmailValidationRules = [
  body("token").isString().notEmpty().withMessage("Token is required"),
];

const changePasswordValidationRules = [
  body("currentPassword").isString().notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .trim()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

module.exports = {
  changePasswordValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
  verifyEmailValidationRules,
  registerValidationRules,
  loginValidationRules,
  verifyPasswordValidationRules,
};
