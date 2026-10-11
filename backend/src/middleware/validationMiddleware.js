const { validationResult } = require("express-validator");
const AppError = require("../utils/AppError");

/**
 * Rejects a request whose fields failed their express-validator rules.
 *
 * Answers 400 `VALIDATION_FAILED`, and keeps express-validator's `errors`
 * array beside the code: the client marks the rejected fields from it, which
 * a code alone cannot tell it.
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(400, "VALIDATION_FAILED", "Some fields were rejected.", {
      errors: errors.array(),
    });
  }
  next();
};

module.exports = validateRequest;
