const express = require("express");
const router = express.Router();
const validateRequest = require("../middleware/validationMiddleware");
const {
  registerValidationRules,
  loginValidationRules,
  verifyPasswordValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
  changePasswordValidationRules,
  verifyEmailValidationRules,
  resendVerificationValidationRules,
} = require("../validators/authValidator");

const {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  verifyUserPassword,
  resendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
} = require("../controllers/authController");

const requireAuth = require("../middleware/requireAuth");
const arcjetProtect = require("../middleware/arcjetMiddleware");
const emailRateLimiter = require("../middleware/emailRateLimiter");

/*
 * Arcjet guards the routes where a guess costs something or an email goes
 * out — sign-up, login, password checks, verification and reset — and only
 * those. `/me` is asked on every page load to see whether anybody is signed
 * in, and logging out risks nothing — putting them behind Arcjet would spend
 * the free plan's monthly allowance on page views.
 */
router.get("/me", requireAuth, getUserProfile);

router.post(
  "/register",
  emailRateLimiter,
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

/*
 * Email verification and password reset. Arcjet guards the three that send
 * email or accept a token — the ones a script would hammer — and its attempt
 * limit is what stops anybody guessing reset tokens or using this server to
 * flood someone's inbox.
 */
router.post(
  "/verify-email",
  arcjetProtect,
  verifyEmailValidationRules,
  validateRequest,
  verifyEmail,
);
router.post(
  "/verify-email/resend",
  emailRateLimiter,
  arcjetProtect,
  resendVerificationValidationRules,
  validateRequest,
  resendVerification,
);
router.post(
  "/forgot-password",
  emailRateLimiter,
  arcjetProtect,
  forgotPasswordValidationRules,
  validateRequest,
  forgotPassword,
);
router.post(
  "/reset-password",
  arcjetProtect,
  resetPasswordValidationRules,
  validateRequest,
  resetPassword,
);

router.post(
  "/change-password",
  requireAuth,
  arcjetProtect,
  changePasswordValidationRules,
  validateRequest,
  changePassword,
);

module.exports = router;
