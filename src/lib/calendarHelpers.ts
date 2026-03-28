/** Returns true for events that have no meaningful time component. */
export function isNoTimeEvent(name: string): boolean {
  const exact = ["Return Heat", "Estimated Calving"];
  const contains = ["CIDR Insert", "GnRH"];
  return exact.includes(name) || contains.some((k) => name.includes(k));
}

/** Converts a 24-hour "HH:MM" string to 12-hour "H:MM AM/PM" display. */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}
