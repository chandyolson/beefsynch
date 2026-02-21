import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, addDays } from "date-fns";

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
  bulls_catalog: { bull_name: string; company: string } | null;
}

const noTimeEvents = ["Return Heat", "Estimated Calving"];

const formatTime12 = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
};

export function generateProjectPdf(
  project: ProjectData,
  events: EventData[],
  bulls: BullData[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 50;
  let y = 50;

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("BeefSynch", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text("Synchronization and Breeding Management", margin, y);
  doc.setTextColor(0);
  y += 6;

  // Divider
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Project Info ──
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

  // ── Bulls & Units ──
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

  // ── Notes ──
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

  // ── Synchronization & Breeding Schedule Table ──
  if (events.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Synchronization and Breeding Schedule", margin, y);
    y += 8;

    const tableBody = events.map((ev) => {
      const isNoTime = noTimeEvents.includes(ev.event_name);
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

  // ── Synchronization Product Directions ──
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  let dirY = finalY + 36;

  const pageHeight = doc.internal.pageSize.getHeight();
  const boxH = 120; // fixed height for the section
  if (dirY + boxH > pageHeight - 50) {
    doc.addPage();
    dirY = 50;
  }

  const boxX = margin;
  const boxW = pageWidth - margin * 2;
  const boxStartY = dirY - 4;

  // Draw background box first
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(boxX, boxStartY, boxW, boxH, 3, 3, "FD");

  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Synchronization Product Directions", boxX + 10, dirY + 16);
  dirY += 30;

  // GnRH subsection
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("GnRH Products:", boxX + 10, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(" Cystorelin, Factorel, Fertagyl", boxX + 10 + doc.getTextWidth("GnRH Products: "), dirY);
  dirY += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Directions:", boxX + 10, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(" Give 2 cc's (mls) Intramuscularly in the neck.", boxX + 10 + doc.getTextWidth("Directions: "), dirY);
  dirY += 20;

  // PGF subsection
  doc.setFont("helvetica", "bold");
  doc.text("PGF Products:", boxX + 10, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(" Lutalyse, Synchsure, Estrumate", boxX + 10 + doc.getTextWidth("PGF Products: "), dirY);
  dirY += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Directions:", boxX + 10, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(" Give 2 cc's (Estrumate, Synchsure) or 5 cc's (Lutalyse) Intramuscularly in the neck.", boxX + 10 + doc.getTextWidth("Directions: "), dirY);
  dirY += 20;

  // Safety note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("\u26A0 Please wear gloves when handling these products.", boxX + 10, dirY);
  const pageCount = doc.getNumberOfPages();
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

  // Save
  const safeName = project.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  doc.save(`${safeName}_BeefSynch_Report.pdf`);
}
