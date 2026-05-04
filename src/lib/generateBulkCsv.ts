import { format, parseISO, addDays } from "date-fns";
import { formatTime12, isNoTimeEvent, escapeCSV } from "./formatUtils";
import { getBullDisplayName } from "./bullDisplay";

export interface BulkProjectData {
  name: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  notes: string | null;
  last_contacted_date: string | null;
}

export interface BulkEventData {
  event_name: string;
  event_date: string;
  event_time: string | null;
}

export interface BulkBullData {
  units: number;
  custom_bull_name: string | null;
  bulls_catalog: { bull_name: string; company: string; registration_number: string } | null;
}

export function generateBulkCsv(
  projects: BulkProjectData[],
  eventsByProject: Record<string, BulkEventData[]>,
  bullsByProject: Record<string, BulkBullData[]>,
  projectIds: string[]
): void {
  const headers = [
    "Project Name", "Cattle Type", "Protocol", "Head Count",
    "Breeding Date", "Breeding Time", "Status", "Last Contacted",
    "Estimated Calving", "Notes",
    "Event Name", "Event Date", "Event Time",
    "Bull Name", "Registration Number", "Company", "Units",
  ];

  const allRows: string[][] = [];

  projectIds.forEach((pid, idx) => {
    const project = projects[idx];
    if (!project) return;

    const events = eventsByProject[pid] || [];
    const bulls = bullsByProject[pid] || [];

    const breedingDisplay = project.breeding_date
      ? format(parseISO(project.breeding_date), "M/d/yyyy")
      : "";
    const breedingTimeDisplay = project.breeding_time
      ? formatTime12(project.breeding_time)
      : "";
    const estimatedCalving = project.breeding_date
      ? format(addDays(parseISO(project.breeding_date), 280), "M/d/yyyy")
      : "";
    const lastContacted = project.last_contacted_date
      ? format(parseISO(project.last_contacted_date), "M/d/yyyy")
      : "";

    const projectFields = [
      project.name, project.cattle_type, project.protocol,
      project.head_count, breedingDisplay, breedingTimeDisplay,
      project.status, lastContacted, estimatedCalving,
      project.notes ?? "",
    ];

    const blank10 = Array(10).fill("");
    const maxLines = Math.max(events.length, bulls.length, 1);
    let firstRow = true;

    for (let i = 0; i < maxLines; i++) {
      const prefix = firstRow ? projectFields : blank10;
      firstRow = false;

      const ev = events[i];
      const eventFields = ev
        ? [
            ev.event_name,
            format(parseISO(ev.event_date), "M/d/yyyy"),
            isNoTimeEvent(ev.event_name) || !ev.event_time ? "" : formatTime12(ev.event_time),
          ]
        : ["", "", ""];

      const b = bulls[i];
      const bullFields = b
        ? [
            getBullDisplayName(b),
            b.bulls_catalog ? b.bulls_catalog.registration_number : "",
            b.bulls_catalog ? b.bulls_catalog.company : "",
            b.units,
          ]
        : ["", "", "", ""];

      allRows.push([...prefix, ...eventFields, ...bullFields].map((v) => escapeCSV(v)));
    }

    // Blank separator between projects
    if (idx < projectIds.length - 1) {
      allRows.push(Array(17).fill(""));
    }
  });

  const csv = [headers.map(escapeCSV).join(","), ...allRows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = format(new Date(), "M_d_yyyy");
  a.download = `BeefSynch_Export_${projectIds.length}_Projects_${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
