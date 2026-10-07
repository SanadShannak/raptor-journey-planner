function convertDateIdToDateObject(dateId) {
  // Enforce string format for precise character slicing and extraction
  const dateIdString = String(dateId);

  // Extracting specific information from raw data
  const year = dateIdString.slice(0, 4);
  const month = dateIdString.slice(4, 6);
  const day = dateIdString.slice(6, 8);

  // Reconstruct extracted segments into a standard date string format
  const dateString = `${year}-${month}-${day}`;

  return new Date(dateString);
}

module.exports = convertDateIdToDateObject;
