import { addDays, addHours, format } from "date-fns";

export interface ProtocolEvent {
  event_name: string;
  event_date: string; // yyyy-MM-dd
  event_time: string | null; // HH:mm or null
  display: string; // formatted for preview
}

// Offset in days — decimal portion maps to hours
// .25=6h, .5=12h, .625=15h, .75=18h
function offsetToMs(offset: number): number {
  const wholeDays = Math.floor(Math.abs(offset));
  const fracHours = Math.round((Math.abs(offset) - wholeDays) * 24);
  const sign = offset < 0 ? -1 : 1;
  return sign * (wholeDays * 24 + fracHours) * 60 * 60 * 1000;
}

function applyOffset(base: Date, offsetDays: number): Date {
  return new Date(base.getTime() + offsetToMs(offsetDays));
}

function fmt(d: Date, includeTime: boolean): { event_date: string; event_time: string | null; display: string } {
  return {
    event_date: format(d, "yyyy-MM-dd"),
    event_time: includeTime ? format(d, "HH:mm") : null,
    display: includeTime
      ? format(d, "M/d/yyyy h:mm a")
      : format(d, "M/d/yyyy"),
  };
}

type ProtocolStep = { name: string; offset: number; hasTime: boolean };

const protocolSteps: Record<string, ProtocolStep[]> = {
  // COWS
  "Select Synch CIDR": [
    { name: "GnRH + CIDR Insert", offset: -9.625, hasTime: false },
    { name: "PGF + CIDR Out", offset: -2.625, hasTime: true },
  ],
  "Select Synch TOO": [
    { name: "GnRH", offset: -10, hasTime: false },
    { name: "Bulls In", offset: -6, hasTime: true },
    { name: "PGF", offset: -3, hasTime: true },
  ],
  "Select Synch": [
    { name: "GnRH", offset: -10, hasTime: false },
    { name: "PGF", offset: -3, hasTime: true },
  ],
  // Cows 7&7
  "7&7 Synch_Cows": [
    { name: "PGF + CIDR Insert", offset: -16.75, hasTime: false },
    { name: "GnRH", offset: -9.75, hasTime: false },
    { name: "PGF + CIDR Out", offset: -2.75, hasTime: true },
  ],
  // HEIFERS
  "7 Day CIDR": [
    { name: "GnRH + CIDR Insert", offset: -9.25, hasTime: false },
    { name: "PGF + CIDR Out", offset: -2.25, hasTime: true },
  ],
  // Heifers 7&7
  "7&7 Synch_Heifers": [
    { name: "PGF + CIDR Insert", offset: -16.25, hasTime: false },
    { name: "GnRH", offset: -9.25, hasTime: false },
    { name: "CIDR Out + PGF", offset: -2.25, hasTime: true },
  ],
  MGA: [
    { name: "MGA Start", offset: -35, hasTime: true },
    { name: "MGA End", offset: -22, hasTime: true },
    { name: "PGF", offset: -3, hasTime: true },
  ],
  "14 Day CIDR": [
    { name: "CIDR Insert", offset: -32.75, hasTime: false },
    { name: "CIDR Removed", offset: -18.75, hasTime: true },
    { name: "PGF", offset: -2.75, hasTime: true },
  ],
};

export function calculateProtocolEvents(
  protocol: string,
  cattleType: "Heifers" | "Cows",
  breedingDate: Date,
  breedingTime: string // "HH:mm"
): ProtocolEvent[] {
  const [h, m] = breedingTime.split(":").map(Number);
  const base = new Date(breedingDate);
  base.setHours(h, m, 0, 0);

  // Resolve 7&7 Synch key based on cattle type
  const key = protocol === "7&7 Synch" ? `7&7 Synch_${cattleType}` : protocol;
  const steps = protocolSteps[key];
  if (!steps) return [];

  const events: ProtocolEvent[] = steps.map((step) => {
    const d = applyOffset(base, step.offset);
    const f = fmt(d, step.hasTime);
    return { event_name: step.name, ...f };
  });

  // Timed Breeding Date/Time itself
  const breedFmt = fmt(base, true);
  events.push({ event_name: "Timed Breeding", ...breedFmt });

  // Return Heat = breeding + 20 days (no time)
  const returnHeat = addDays(base, 20);
  const rhFmt = fmt(returnHeat, false);
  events.push({ event_name: "Return Heat", ...rhFmt });

  // Estimated Calving = breeding + 280 days (no time)
  const calving = addDays(base, 280);
  const cFmt = fmt(calving, false);
  events.push({ event_name: "Estimated Calving", ...cFmt });

  return events;
}
