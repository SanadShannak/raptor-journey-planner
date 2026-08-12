export function formatItineraryTime(startDate, startTime, endDate, endTime) {
  const getFormattedDate = (dateString) => {
    if (!dateString) return null;

    const [year, month, day] = dateString.split("-");
    const targetDate = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    const diffDays = Math.round(diffTime / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
  };

  const start = getFormattedDate(startDate);
  const end = getFormattedDate(endDate);

  if (!start || !end) return `${startTime} - ${endTime}`;

  if (start === "Today" && end === "Today") {
    return `${startTime} - ${endTime}`;
  } else if (start === end) {
    return `${start} at ${startTime} - ${endTime}`;
  } else {
    const startStr =
      start === "Today" ? `${startTime}` : `${start} at ${startTime}`;

    const endStr = end === "Today" ? `${endTime}` : `${end} at ${endTime}`;

    return `${startStr} - ${endStr}`;
  }
}
