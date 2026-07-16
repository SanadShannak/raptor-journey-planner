function convertDateObjectToDateId(dateObj) {
  // Extracting specific information from date object
  const yyyy = dateObj.getFullYear();

  // Pipeline rule validation: Pad month and day to ensure strictly 2 digits
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");

  // Convert the reconstructed string into a mathematically comparable integer
  return parseInt(`${yyyy}${mm}${dd}`);
}

module.exports = convertDateObjectToDateId;
