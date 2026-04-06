/** Convert "HH:mm" to "h:mm AM/PM" */
export const formatTime12 = (time: string): string => {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
};

/** Events that should NOT display a time */
export const isNoTimeEvent = (name: string): boolean => {
  const exact = ["Return Heat", "Estimated Calving"];
  const contains = ["CIDR Insert", "GnRH"];
  return exact.includes(name) || contains.some((k) => name.includes(k));
};
