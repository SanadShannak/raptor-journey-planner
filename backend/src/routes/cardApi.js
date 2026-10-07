const express = require("express");

const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const {
  addCard,
  getUserCards,
  removeCard,
  getCardByNumber,
  topUpCard,
  deductFareFromCard,
  changeCardNickname,
} = require("../controllers/cardController");
const {
  getCardByNumberValidationRules,
  removeCardValidationRules,
  topUpCardValidationRules,
  deductFareFromCardValidationRules,
  changeCardNicknameValidationRules,
} = require("../validators/cardValidator");
const validateRequest = require("../middleware/validationMiddleware");

router.use(requireAuth);

router.get("/", getUserCards);
router.get(
  "/:number",
  getCardByNumberValidationRules,
  validateRequest,
  getCardByNumber,
);
router.post("/", addCard);
router.delete("/:id", removeCardValidationRules, validateRequest, removeCard);
router.post(
  "/:id/top-up",
  topUpCardValidationRules,
  validateRequest,
  topUpCard,
);
router.post(
  "/:id/fare",
  deductFareFromCardValidationRules,
  validateRequest,
  deductFareFromCard,
);
router.patch(
  "/:id",
  changeCardNicknameValidationRules,
  validateRequest,
  changeCardNickname,
);

module.exports = router;
