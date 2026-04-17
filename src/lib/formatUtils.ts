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

/**
 * Format a date in MMMM d, yyyy format (e.g., "January 15, 2026")
 * Helper for common date formatting patterns in exports
 * @param dateStr ISO date string or Date object
 * @returns Formatted date string
 */
export function formatDateLong(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const month = d.toLocaleString("en-US", { month: "long" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Format a date in MMM d, yyyy format (e.g., "Jan 15, 2026")
 * @param dateStr ISO date string or Date object
 * @returns Formatted date string
 */
export function formatDateShort(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Format a date in M/d/yyyy format (e.g., "1/15/2026")
 * @param dateStr ISO date string or Date object
 * @returns Formatted date string
 */
export function formatDateSlash(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Format a date in yyyyMMdd format (e.g., "20260115")
 * @param dateStr ISO date string or Date object
 * @returns Formatted date string
 */
export function formatDateCompact(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Format a date in yyyy-MM-dd format (e.g., "2026-01-15")
 * @param dateStr ISO date string or Date object
 * @returns Formatted date string
 */
export function formatDateISO(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a date in M_d_yyyy format (e.g., "1_15_2026")
 * Used for filenames
 * @param dateStr ISO date string or Date object
 * @returns Formatted date string
 */
export function formatDateFilenameSeparator(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}_${day}_${year}`;
}
