/**
 * Which network this server is serving.
 *
 * Configuration, not source: the same image serves Helsinki or Sydney
 * depending on the compiled feed mounted beside it, so the answer belongs to
 * the deployment rather than to the code. That is why it is read from the
 * environment first.
 *
 * The fallback is the pipeline's own value, and it is the *development*
 * answer: on a machine with the repo checked out, the feed on disk was
 * compiled by that config, so asking it is asking the thing that actually
 * decided. It is required lazily so a deployed image -- which sets the
 * variable and does not ship the pipeline -- never needs the file to exist.
 *
 * Unset and unavailable is a hard stop rather than a default. Guessing "hsl"
 * is how a server quietly reads one city's folders while another city's feed
 * sits beside it, and nothing about that failure points at its cause.
 */
function resolveActiveNetwork() {
  const fromEnvironment = process.env.ACTIVE_NETWORK?.trim();
  if (fromEnvironment) return fromEnvironment;

  try {
    return require("../../offline-data-ingestion-pipeline/pipelineConfig")
      .ACTIVE_NETWORK;
  } catch {
    throw new Error(
      "ACTIVE_NETWORK is not set and the pipeline config is not available. " +
        "Set ACTIVE_NETWORK in the environment (it must match the " +
        "<network>-processed-data folder mounted into this server).",
    );
  }
}

const ACTIVE_NETWORK = resolveActiveNetwork();

module.exports = {
  ACTIVE_NETWORK,

  // Express Server Port
  PORT: process.env.PORT || 3000,

  MONGO_URI:
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journey_planner_db",

  // Timezone mapping for accurate live departure boards regardless of where the server is hosted
  NETWORK_TIMEZONES: {
    hsl: "Europe/Helsinki",
    sydney: "Australia/Sydney",
    amman: "Asia/Amman",
  },

  // Default pagination / response limits
  DEFAULT_DEPARTURES_LIMIT: 20,
};
