const { getCache } = require("../../memoryCache");
const cache = getCache();
const { lineIdFor } = require("./lineIdentity");

const linesById = (() => {
  const lines = new Map();

  cache.routes.forEach((route, patternId) => {
    if (!route?.stop_ids?.length) return;

    const lineId = lineIdFor(route);
    if (!lines.has(lineId)) {
      lines.set(lineId, {
        lineId,
        routeShortName: route.short_name,
        routeType: route.route_type,
        routeLongName: route.long_name ?? null,
        patterns: [],
      });
    }

    const line = lines.get(lineId);
    if (line.routeLongName === null && route.long_name !== undefined) {
      line.routeLongName = route.long_name;
    }
    line.patterns.push({ patternId, route });
  });

  return lines;
})();

function resolveLine(lineId) {
  const line = linesById.get(lineId);
  if (!line) return null;
  return line;
}

function resolveVariant(line, patternId) {
  patternId = Number.parseInt(patternId, 10);
  const pattern = line.patterns.find(
    (candidate) => candidate.patternId === patternId,
  );
  if (!pattern) return null;

  return pattern;
}

module.exports = { resolveLine, resolveVariant };
