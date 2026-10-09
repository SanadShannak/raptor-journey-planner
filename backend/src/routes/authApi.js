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
router.get("/me", requireAuth, getUserProfile);

router.post(
  "/register",
  registerValidationRules,
  validateRequest,
  registerUser,
);

router.post("/login", loginValidationRules, validateRequest, loginUser);

router.post("/logout", logoutUser);

router.post(
  "/verify-password",
  requireAuth,
  verifyPasswordValidationRules,
  validateRequest,
  verifyUserPassword,
);

module.exports = router;
