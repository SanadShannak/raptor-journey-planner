const express = require("express");
const router = express.Router();
const validateRequest = require("../middleware/validationMiddleware");
const {
  registerValidationRules,
  loginValidationRules,
  verifyPasswordValidationRules,
} = require("../validators/authValidator");

const {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  verifyUserPassword,
} = require("../controllers/authController");

const requireAuth = require("../middleware/requireAuth");
const arcjetProtect = require("../middleware/arcjetMiddleware");

/*
 * Arcjet guards the three routes where a guess costs something, and only
 * those. `/me` is asked on every page load to see whether anybody is signed
 * in, and logging out risks nothing — putting them behind Arcjet would spend
 * the free plan's monthly allowance on page views.
 */
router.get("/me", requireAuth, getUserProfile);

router.post(
  "/register",
  arcjetProtect,
  registerValidationRules,
  validateRequest,
  registerUser,
);

router.post("/login", arcjetProtect, loginValidationRules, validateRequest, loginUser);

router.post("/logout", logoutUser);

router.post(
  "/verify-password",
  requireAuth,
  arcjetProtect,
  verifyPasswordValidationRules,
  validateRequest,
  verifyUserPassword,
);

module.exports = router;
