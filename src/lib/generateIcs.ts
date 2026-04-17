import { format, parseISO } from "date-fns";
import { formatTime12, isNoTimeEvent } from "./formatUtils";

export interface IcsEvent {
  uid: string;
  summary: string;
  eventDate: string; // yyyy-MM-dd
  eventTime: string | null; // HH:mm or HH:mm:ss
  isAllDay: boolean;
  description: string;
  status: "CONFIRMED" | "TENTATIVE";
  categories: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

const formatIcsDate = (dateStr: string, timeStr: string | null, allDay: boolean) => {
  const d = parseISO(dateStr);
  if (allDay || !timeStr) {
    return format(d, "yyyyMMdd");
  }
  const [h, m] = timeStr.split(":").map(Number);
  return `${format(d, "yyyyMMdd")}T${pad(h)}${pad(m)}00`;
};

const formatIcsEndDate = (dateStr: string, timeStr: string | null, allDay: boolean) => {
  const d = parseISO(dateStr);
  if (allDay || !timeStr) {
    // All-day: end is next day
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return format(next, "yyyyMMdd");
  }
  const [h, m] = timeStr.split(":").map(Number);
  // Add 1 hour
  const endH = h + 1;
  return `${format(d, "yyyyMMdd")}T${pad(endH)}${pad(m)}00`;
};

const escapeIcsText = (text: string) => {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
};

// Fold long lines per RFC 5545 (max 75 octets)
const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.substring(0, 75));
  let i = 75;
  while (i < line.length) {
    parts.push(" " + line.substring(i, i + 74));
    i += 74;
  }
  return parts.join("\r\n");
};

export function generateIcsFile(events: IcsEvent[], calName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BeefSynch//Chuteside Resources//EN",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];

  for (const ev of events) {
    const dtStart = formatIcsDate(ev.eventDate, ev.eventTime, ev.isAllDay);
    const dtEnd = formatIcsEndDate(ev.eventDate, ev.eventTime, ev.isAllDay);
    const datePrefix = ev.isAllDay ? ";VALUE=DATE:" : ":";

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(ev.summary)}`));
    lines.push(`DTSTART${datePrefix}${dtStart}`);
    lines.push(`DTEND${datePrefix}${dtEnd}`);
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(ev.description)}`));
    lines.push(`STATUS:${ev.status}`);
    lines.push(`CATEGORIES:${escapeIcsText(ev.categories)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const mapStatus = (status: string): "CONFIRMED" | "TENTATIVE" => {
  if (status === "Tentative") return "TENTATIVE";
  return "CONFIRMED";
};

interface ProjectForIcs {
  id: string;
  name: string;
  protocol: string;
  cattle_type: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
}

export interface EventForIcs {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  project_id?: string;
}

interface BullForIcs {
  bull_name: string;
  registration_number: string;
  units: number;
}

export function buildProjectIcsEvents(
  project: ProjectForIcs,
  events: EventForIcs[],
  bulls: BullForIcs[]
): IcsEvent[] {
  const breedingDisplay = project.breeding_date
    ? `${format(parseISO(project.breeding_date), "M/d/yyyy")}${project.breeding_time ? " " + formatTime12(project.breeding_time) : ""}`
    : "—";

  const bullLines = bulls.length > 0
    ? "Bulls: " + bulls.map((b) => `${b.bull_name} ${b.registration_number} (${b.units} units)`).join(", ")
    : "";

  const descParts = [
    `Protocol: ${project.protocol}`,
    `Cattle Type: ${project.cattle_type}`,
    `Head Count: ${project.head_count}`,
    `Breeding Date: ${breedingDisplay}`,
  ];
  if (bullLines) descParts.push(bullLines);
  const description = descParts.join("\n");

  return events.map((ev) => {
    const isAllDay = isNoTimeEvent(ev.event_name);
    return {
      uid: `${project.id}-${ev.id}@beefsynch`,
      summary: `${project.name} — ${ev.event_name}`,
      eventDate: ev.event_date,
      eventTime: isAllDay ? null : ev.event_time,
      isAllDay,
      description,
      status: mapStatus(project.status),
      categories: project.protocol,
    };
  });
}

export function downloadIcsFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
