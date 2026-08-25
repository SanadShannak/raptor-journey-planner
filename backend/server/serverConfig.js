const pipelineConfig = require("../../offline-data-ingestion-pipeline/pipelineConfig");

const ACTIVE_NETWORK = pipelineConfig.ACTIVE_NETWORK;

module.exports = {
  ACTIVE_NETWORK,

  // Express Server Port
  PORT: process.env.PORT || 3000,

  /*
   * The card store. Environment first, so a hosted cluster's credentials never
   * sit in a file that is committed — the literal below is a local development
   * default and nothing more.
   *
   * Loaded from `backend/.env` by `--env-file-if-exists` in the npm scripts;
   * Node reads it natively, so this costs no dependency.
   */
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
