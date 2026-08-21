const express = require("express");
const router = express.Router();
// Read from the shared RAM cache rather than a second parse of the same file.
const { getCache } = require("../../memoryCache");
const convertDateIdToDateObject = require("../utils/convertDateIdToDateObject");

const activeServices = getCache().activeServices;

// Computed once at boot and sorted, so the response is a cheap, stable
// ascending list rather than whatever order the object happened to be keyed in.
const validDatesCache = Object.keys(activeServices)
  .sort()
  .map((serviceDateId) => {
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
