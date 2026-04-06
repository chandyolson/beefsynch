import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, addDays } from "date-fns";
import type { BulkProjectData, BulkEventData, BulkBullData } from "./generateBulkCsv";
import { formatTime12, isNoTimeEvent } from "@/lib/formatting";

function addFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      "BeefSynch by Chuteside Resources",
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 30,
      { align: "center" }
    );
  }
}

function renderProjectPage(
  doc: jsPDF,
  project: BulkProjectData,
  events: BulkEventData[],
  bulls: BulkBullData[]
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 50;
  let y = 50;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(0);
  doc.text("BeefSynch", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text("Synchronization Planner", margin, y);
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Project info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(project.name, margin, y);
  y += 22;

  const breedingDisplay = project.breeding_date
    ? format(parseISO(project.breeding_date), "MMMM d, yyyy")
    : "—";
  const breedingTimeDisplay = project.breeding_time
    ? formatTime12(project.breeding_time)
    : "";
  const estimatedCalving = project.breeding_date
    ? format(addDays(parseISO(project.breeding_date), 280), "MMMM d, yyyy")
    : "—";

  const infoRows: [string, string][] = [
    ["Cattle Type", project.cattle_type],
    ["Protocol", project.protocol],
    ["Head Count", String(project.head_count)],
    ["Breeding Date", breedingDisplay + (breedingTimeDisplay ? ` at ${breedingTimeDisplay}` : "")],
    ["Status", project.status],
    ["Estimated Calving", estimatedCalving],
  ];

  doc.setFontSize(10);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 110, y);
    y += 15;
  }
  y += 10;

  // Bulls
  if (bulls.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Bulls and Semen", margin, y);
    y += 16;
    doc.setFontSize(10);
    for (const b of bulls) {
      const name = b.bulls_catalog
        ? `${b.bulls_catalog.bull_name} (${b.bulls_catalog.company})`
        : b.custom_bull_name ?? "Unknown";
      doc.setFont("helvetica", "normal");
      doc.text(`${name} — ${b.units} units`, margin + 10, y);
      y += 14;
    }
    y += 20;
  }

  // Notes
  if (project.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Notes", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(project.notes, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 10;
  }

  // Schedule table
  if (events.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Synchronization and Breeding Schedule", margin, y);
    y += 8;

    const tableBody = events.map((ev) => {
      const isNoTime = isNoTimeEvent(ev.event_name);
      return [
        ev.event_name,
        format(parseISO(ev.event_date), "EEEE, MMMM d, yyyy"),
        isNoTime || !ev.event_time ? "—" : formatTime12(ev.event_time),
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Event", "Date", "Time"]],
      body: tableBody,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
  }

  // Product directions
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  let dirY = finalY + 36;
  const pageHeight = doc.internal.pageSize.getHeight();
  const boxH = 145;
  if (dirY + boxH > pageHeight - 50) {
    doc.addPage();
    dirY = 50;
  }

  const boxX = margin;
  const boxW = pageWidth - margin * 2;
  const boxStartY = dirY - 4;

  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.rect(boxX, boxStartY, boxW, boxH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  const titleText = "Synchronization Product Directions";
  doc.text(titleText, boxX + 14, dirY + 16);
  const titleWidth = doc.getTextWidth(titleText);
  doc.setLineWidth(0.5);
  doc.line(boxX + 14, dirY + 18, boxX + 14 + titleWidth, dirY + 18);
  dirY += 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("GnRH Products:", boxX + 14, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(" Cystorelin, Factrel, Fertagyl, Ovacyst", boxX + 14 + doc.getTextWidth("GnRH Products: "), dirY);
  dirY += 15;
  doc.setFont("helvetica", "bolditalic");
  doc.text("Directions:", boxX + 14, dirY);
  doc.setFont("helvetica", "italic");
  doc.text(" Give 2 cc's intramuscularly in the neck.", boxX + 14 + doc.getTextWidth("Directions: "), dirY);
  dirY += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PGF Products:", boxX + 14, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(" Lutalyse, Prostamate, Synchsure, Estrumate", boxX + 14 + doc.getTextWidth("PGF Products: "), dirY);
  dirY += 15;
  doc.setFont("helvetica", "bolditalic");
  doc.text("Directions:", boxX + 14, dirY);
  doc.setFont("helvetica", "italic");
  const pgfDirText = " Give 2 cc's (Estrumate, Synchsure) or 5 cc's (Lutalyse, Prostamate)";
  doc.text(pgfDirText, boxX + 14 + doc.getTextWidth("Directions: "), dirY);
  dirY += 13;
  doc.text("intramuscularly in the neck.", boxX + 14, dirY);
}

export function generateBulkPdf(
  projects: BulkProjectData[],
  eventsByProject: Record<string, BulkEventData[]>,
  bullsByProject: Record<string, BulkBullData[]>,
  projectIds: string[]
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 50;

  // ── Cover page ──
  let y = 80;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(0);
  doc.text("BeefSynch — Bulk Export", margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(format(new Date(), "MMMM d, yyyy"), margin, y);
  doc.setTextColor(0);
  y += 10;
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${projectIds.length} project${projectIds.length > 1 ? "s" : ""} included`, margin, y);
  y += 24;

  // Summary table
  const summaryBody = projectIds.map((pid, idx) => {
    const p = projects[idx];
    if (!p) return ["—", "—", "—", "—", "—", "—"];
    return [
      p.name,
      p.cattle_type,
      p.protocol,
      String(p.head_count),
      p.breeding_date ? format(parseISO(p.breeding_date), "MMM d, yyyy") : "—",
      p.status,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Project Name", "Type", "Protocol", "Head", "Breeding Date", "Status"]],
    body: summaryBody,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // ── Per-project pages ──
  projectIds.forEach((pid, idx) => {
    const project = projects[idx];
    if (!project) return;
    doc.addPage();
    renderProjectPage(doc, project, eventsByProject[pid] || [], bullsByProject[pid] || []);
  });

  addFooters(doc);

  const today = format(new Date(), "M_d_yyyy");
  doc.save(`BeefSynch_Export_${projectIds.length}_Projects_${today}.pdf`);
}
