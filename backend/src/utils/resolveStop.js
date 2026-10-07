const { getCache } = require("../../memoryCache");
const cache = getCache();

function resolveStop(gtfsId) {
  const internalStopId = cache.stopMapping[gtfsId];

  return internalStopId;
}

module.exports = resolveStop;
