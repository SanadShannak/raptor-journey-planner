function describeLine(line) {
  return {
    lineId: line.lineId,
    routeShortName: line.routeShortName,
    routeType: line.routeType,
    routeLongName: line.routeLongName,
  };
}

module.exports = describeLine;
