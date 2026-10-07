function isValidDate(dateString) {
  // Date validator to ensure date format: YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(dateString);
}

function isValidTime(timeString) {
  // Time validator to ensure time format: HH:MM:SS
  const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
  return timeRegex.test(timeString);
}

function isValidWalkingSpeed(walkingSpeedFloat) {
  // Walking speed validator: Ensure it is a number and not 0
  return !isNaN(walkingSpeedFloat) && walkingSpeedFloat > 0;
}

module.exports = {
  isValidDate,
  isValidTime,
  isValidWalkingSpeed,
};
