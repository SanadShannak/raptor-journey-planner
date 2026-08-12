export function convertMetersToDistance(totalMeters) {
  const km = Math.floor(totalMeters / 1000);
  const meters = totalMeters % 1000;

  const kmPart = km > 0 ? `${km} km` : "";
  const metersPart = meters > 0 ? `${meters} m` : "";

  if (km === 0) return metersPart;
  return `${Number.parseFloat(`${km}.${meters}`)} km`.trim();
}
