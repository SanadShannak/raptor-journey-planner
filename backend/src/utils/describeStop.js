const { getCache } = require("../../memoryCache");
const cache = getCache();

function describeStop(internalStopId) {
  const stop = cache.stops[internalStopId];
  if (!stop) {
    return { id: internalStopId, name: null, code: null, lat: null, lon: null };
  }

  const described = {
    id: stop.gtfs_id,
    name: stop.name,
    code: stop.stop_code ?? null,
    lat: stop.lat,
    lon: stop.lon,
  };

  described.description = stop.desc ?? null;
  described.fareZone = stop.zone ?? null;
  described.platform = stop.platform ?? null;
  described.wheelchairAccessible =
    stop.wheelchair === undefined ? null : stop.wheelchair === 1;

  return described;
}

module.exports = describeStop;
