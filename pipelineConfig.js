module.exports = {
  //To switch networks, just change this string to whatever city/network you want to use the parsing pipeline with, for example, 'hsl'->'amman'
  ACTIVE_NETWORK: "hsl",

  // Structural rules & requirements for ingesting data
  rules: {
    requiredFiles: ["stops.text"],
    requiredStopHeaders: ["stop_id", "stop_name", "stop_lat", "stop_lon"],
  },
};
