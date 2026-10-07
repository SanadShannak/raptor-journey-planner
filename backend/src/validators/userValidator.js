const { param, body } = require("express-validator");

const renameSavedItemValidationRules = [
  param("itemId").isMongoId().withMessage("Invalid item ID format."),
  body("nickname")
    .trim()
    .notEmpty()
    .withMessage("Nickname cannot be empty.")
    .isLength({ max: 40 })
    .withMessage("Nickname cannot exceed 40 characters."),
];

const removeSavedItemValidationRules = [
  param("itemId").isMongoId().withMessage("Invalid item ID format."),
];

const addSavedStopValidationRules = [
  param("stopId").trim().notEmpty().withMessage("Stop ID is required."),
  body("nickname")
    .optional()
    .trim()
    .isLength({ max: 40 })
    .withMessage("Nickname cannot exceed 40 characters."),
];

const addSavedRouteValidationRules = [
  param("lineId").trim().notEmpty().withMessage("Line ID is required."),
  param("patternId")
    .trim()
    .notEmpty()
    .withMessage("Pattern ID is required.")
    .isInt()
    .withMessage("Pattern ID must be a valid integer."),
  body("nickname")
    .optional()
    .trim()
    .isLength({ max: 40 })
    .withMessage("Nickname cannot exceed 40 characters."),
];

const addSavedItineraryValidationRules = [
  body("originLat")
    .notEmpty()
    .withMessage("Origin latitude is required.")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Invalid origin latitude."),
  body("originLon")
    .notEmpty()
    .withMessage("Origin longitude is required.")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Invalid origin longitude."),
  body("destLat")
    .notEmpty()
    .withMessage("Destination latitude is required.")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Invalid destination latitude."),
  body("destLon")
    .notEmpty()
    .withMessage("Destination longitude is required.")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Invalid destination longitude."),

  body("originLabel")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Origin label cannot exceed 50 characters."),
  body("destLabel")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Destination label cannot exceed 50 characters."),
  body("nickname")
    .optional()
    .trim()
    .isLength({ max: 40 })
    .withMessage("Nickname cannot exceed 40 characters."),
  body("pace")
    .optional()
    .trim()
    .isIn(["slow", "calm", "average", "fast"])
    .withMessage("Pace must be 'slow', 'calm', 'average', or 'fast'."),
];

module.exports = {
  renameSavedItemValidationRules,
  removeSavedItemValidationRules,
  addSavedStopValidationRules,
  addSavedRouteValidationRules,
  addSavedItineraryValidationRules,
};
