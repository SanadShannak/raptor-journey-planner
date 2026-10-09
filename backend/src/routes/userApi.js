const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const {
  getUserSavedStops,
  addUserSavedStop,
  changeUserSavedStopNickname,
  removeUserSavedStop,
  getUserSavedRoutes,
  addUserSavedRoute,
  changeUserSavedRouteNickname,
  removeUserSavedRoute,
  getUserSavedItineraries,
  addUserSavedItinerary,
  changeUserSavedItineraryNickname,
  removeUserSavedItinerary,
} = require("../controllers/userController");

const {
  renameSavedItemValidationRules,
  removeSavedItemValidationRules,
  addSavedStopValidationRules,
  addSavedRouteValidationRules,
  addSavedItineraryValidationRules,
} = require("../validators/userValidator");

const validateRequest = require("../middleware/validationMiddleware");
router.use(requireAuth);

router.get("/saved-stops", getUserSavedStops);
router
  .route("/saved-stops/:stopId")
  .post(addSavedStopValidationRules, validateRequest, addUserSavedStop);

router
  .route("/saved-stops/:itemId")
  .patch(
    renameSavedItemValidationRules,
    validateRequest,
    changeUserSavedStopNickname,
  )
  .delete(removeSavedItemValidationRules, validateRequest, removeUserSavedStop);

router.get("/saved-routes", getUserSavedRoutes);
router.post(
  "/saved-routes/:lineId/:patternId",
  addSavedRouteValidationRules,
  validateRequest,
  addUserSavedRoute,
);
router
  .route("/saved-routes/:itemId")
  .patch(
    renameSavedItemValidationRules,
    validateRequest,
    changeUserSavedRouteNickname,
  )
  .delete(
    removeSavedItemValidationRules,
    validateRequest,
    removeUserSavedRoute,
  );

router
  .route("/saved-itineraries")
  .get(getUserSavedItineraries)
  .post(
    addSavedItineraryValidationRules,
    validateRequest,
    addUserSavedItinerary,
  );
router
  .route("/saved-itineraries/:itemId")
  .patch(
    renameSavedItemValidationRules,
    validateRequest,
    changeUserSavedItineraryNickname,
  )
  .delete(
    removeSavedItemValidationRules,
    validateRequest,
    removeUserSavedItinerary,
  );

module.exports = router;
