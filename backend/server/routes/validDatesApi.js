const express = require("express");
const router = express.Router();
const serverConfig = require("../serverConfig");

const activeServices = require(
  `../../../processed-data/${serverConfig.ACTIVE_NETWORK}-processed-data/active-services.processed.json`,
);
const convertDateIdToDateObject = require("../utils/convertDateIdToDateObject");

const validDatesCache = Object.keys(activeServices).map((serviceDateId) => {
  const dateObject = convertDateIdToDateObject(serviceDateId);
  const year = dateObject.getFullYear();
  const month = String(dateObject.getMonth() + 1).padStart(2, "0");
  const day = String(dateObject.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
});

router.get("/", (req, res) => {
  res.json(validDatesCache);
});

module.exports = router;

/* example usages: 
http://localhost:3000/api/valid-dates
*/
