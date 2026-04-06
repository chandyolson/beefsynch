import { format, parseISO, addDays } from "date-fns";
import { formatTime12, isNoTimeEvent } from "@/lib/formatting";

interface ProjectData {
  name: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  notes: string | null;
}

interface EventData {
  event_name: string;
  event_date: string;
  event_time: string | null;
}

interface BullData {
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: { bull_name: string; company: string; registration_number: string } | null;
}

const esc = (v: string | number) => {
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
};

export function generateProjectCsv(
  project: ProjectData,
  events: EventData[],
  bulls: BullData[]
) {
  const headers = [
    "Project Name", "Cattle Type", "Protocol", "Head Count",
    "Breeding Date", "Breeding Time", "Status", "Estimated Calving",
    "Return Heat", "Notes", "Event Name", "Event Date", "Event Time",
    "Bull Name", "Registration Number", "Company", "Units",
  ];

  const breedingDisplay = project.breeding_date
    ? format(parseISO(project.breeding_date), "M/d/yyyy")
    : "";
  const breedingTimeDisplay = project.breeding_time
    ? formatTime12(project.breeding_time)
    : "";
  const estimatedCalving = project.breeding_date
    ? format(addDays(parseISO(project.breeding_date), 280), "M/d/yyyy")
    : "";

  // Find Return Heat date from events
  const returnHeatEvent = events.find((e) => e.event_name === "Return Heat");
  const returnHeat = returnHeatEvent
    ? format(parseISO(returnHeatEvent.event_date), "M/d/yyyy")
    : "";

  const projectFields = [
    project.name, project.cattle_type, project.protocol,
    project.head_count, breedingDisplay, breedingTimeDisplay,
    project.status, estimatedCalving, returnHeat,
    project.notes ?? "",
  ];

  const blank10 = Array(10).fill("");
  const blank7 = Array(7).fill("");

  const rows: string[][] = [];
  let firstRow = true;

  // Event rows
  for (const ev of events) {
    const isNoTime = isNoTimeEvent(ev.event_name);
    const eventFields = [
      ev.event_name,
      format(parseISO(ev.event_date), "M/d/yyyy"),
      isNoTime || !ev.event_time ? "" : formatTime12(ev.event_time),
    ];
    const prefix = firstRow ? projectFields : blank10;
    rows.push([...prefix, ...eventFields, "", "", "", ""].map((v) => esc(v)));
    firstRow = false;
  }

  // Bull rows
  for (const b of bulls) {
    const bullName = b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "Unknown";
    const regNum = b.bulls_catalog ? b.bulls_catalog.registration_number : "";
    const company = b.bulls_catalog ? b.bulls_catalog.company : "";
    const bullFields = [bullName, regNum, company, b.units];
    const prefix = firstRow ? projectFields : blank10;
    rows.push([...prefix, "", "", "", ...bullFields].map((v) => esc(v)));
    firstRow = false;
  }

  // If no events and no bulls, just one row with project info
  if (rows.length === 0) {
    rows.push([...projectFields, "", "", "", "", "", "", ""].map((v) => esc(v)));
  }

  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const safeName = project.name.replace(/\s+/g, "_");
  const dateStr = project.breeding_date
    ? format(parseISO(project.breeding_date), "M_d_yyyy")
    : "NoDate";
  a.download = `${safeName}_BeefSynch_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
