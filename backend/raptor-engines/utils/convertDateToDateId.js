function convertDateToDateId(dateString) {
  // Cleaning the date string from hyphens
  const cleanDateString = dateString.replaceAll("-", "");
  // radix param '10' to ensure decimal numeral system base
  return parseInt(cleanDateString, 10);
}

module.exports = convertDateToDateId;
