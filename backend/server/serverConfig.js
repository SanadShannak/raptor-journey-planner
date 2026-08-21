const pipelineConfig = require("../../offline-data-ingestion-pipeline/pipelineConfig");

const ACTIVE_NETWORK = pipelineConfig.ACTIVE_NETWORK;

module.exports = {
  ACTIVE_NETWORK,

  // Express Server Port
  PORT: process.env.PORT || 3000,

  // Timezone mapping for accurate live departure boards regardless of where the server is hosted
  NETWORK_TIMEZONES: {
    hsl: "Europe/Helsinki",
    sydney: "Australia/Sydney",
    amman: "Asia/Amman",
  },

  // Default pagination / response limits
  DEFAULT_DEPARTURES_LIMIT: 20,
};
