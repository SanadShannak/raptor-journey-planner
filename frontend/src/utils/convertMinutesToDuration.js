export function convertMinutesToDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const hoursPart = hours > 0 ? `${hours} h` : "";
  const minutesPart = minutes > 0 ? `${minutes} min` : "";

  return `${hoursPart} ${minutesPart}`.trim();
}
