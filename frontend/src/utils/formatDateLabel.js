export function formatDateLabel(dateString) {
  if (!dateString) return "Select date";

  const [year, month, day] = dateString.split("-");
  const targetDate = new Date(year, month - 1, day);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = targetDate - today;
  const diffDays = Math.round(diffTime / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  return targetDate
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
    })
    .replace(",", "/");
}
