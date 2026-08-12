export const validateAndTimeFormat = (value) => {
  if (!value) return "";

  // 1. Restrict input: allow only numbers and colon
  let cleaned = value.replace(/[^0-9:]/g, "");

  // 2. Prevent multiple colons
  const colonIndex = cleaned.indexOf(":");
  if (colonIndex !== -1) {
    const beforeColon = cleaned.slice(0, colonIndex + 1);
    const afterColon = cleaned.slice(colonIndex + 1).replace(/:/g, "");
    cleaned = beforeColon + afterColon;
  }

  // 3. Auto-format as the user types (e.g., auto-insert colon after 2 digits if none exists)
  if (cleaned.length === 2 && !cleaned.includes(":")) {
    cleaned = cleaned + ":";
  }

  // 4. Enforce maximum length for HH:MM (5 characters)
  if (cleaned.length > 5) {
    cleaned = cleaned.slice(0, 5);
  }

  return cleaned;
};
