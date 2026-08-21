/**
 * Reads an optional GTFS column.
 *
 * Feeds disagree about how to write "no value". The spec says an empty field;
 * HSL writes a single space, which is why `stop_code` arrives as `" "` for 122
 * stops and `parent_station` for most of them. Both mean absent, and a raw
 * truthiness check (`row.stop_code ? … : null`) treats a space as a value.
 *
 * Everything optional goes through here so that decision is made once.
 *
 * @param {unknown} raw Value straight off the CSV row.
 * @returns {string|null} The trimmed value, or null when the field is blank.
 */
function optionalValue(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Same, for a column that should be a whole number.
 *
 * @param {unknown} raw Value straight off the CSV row.
 * @returns {number|null} The parsed integer, or null when blank or unparseable.
 */
function optionalInteger(raw) {
  const value = optionalValue(raw);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

module.exports = { optionalValue, optionalInteger };
