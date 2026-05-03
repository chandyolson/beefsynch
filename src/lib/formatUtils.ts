/**
 * Shared formatting utilities used across PDF/CSV generators
 */

/**
 * Convert 24-hour time to 12-hour format with AM/PM
 * @param time Time string in "HH:mm" or "HH:mm:ss" format
 * @returns Formatted time string like "2:30 PM"
 */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Determine if an event should not have a time displayed
 * Used for all-day events like "Return Heat", "Estimated Calving", or events with "CIDR Insert" or "GnRH"
 * @param name Event name
 * @returns True if event should be treated as no-time (all-day)
 */
export function isNoTimeEvent(name: string): boolean {
  const exact = ["Return Heat", "Estimated Calving"];
  const contains = ["CIDR Insert", "GnRH"];
  return exact.includes(name) || contains.some((k) => name.includes(k));
}

/**
 * Escape a value for safe CSV output
 * Wraps values containing commas, quotes, or newlines and escapes internal quotes
 * @param value String or number to escape
 * @returns Safe CSV-escaped string
 */
export function escapeCSV(value: string | number): string {
  const s = String(value);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Format a dollar amount
 * @param value Number to format, or null
 * @returns Formatted string like "$123.45"
 */
export function formatDollar(value: number | null): string {
  if (value == null) return "$0.00";
  return `$${value.toFixed(2)}`;
}

