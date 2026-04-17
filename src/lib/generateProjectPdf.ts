import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, addDays } from "date-fns";
import {
  addFooterToPdf,
  addStandardHeader,
  drawDividerLine,
  buildPdfFilename,
  ensurePageSpace,
  renderInfoRows,
  getStandardHeadStyles,
  DEFAULT_PRODUCT_DIRECTIONS,
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_FONTS,
} from "./pdfUtils";
import { formatTime12, isNoTimeEvent } from "./formatUtils";
import { sanitizeFilename } from "./pdfUtils";

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

export function generateProjectPdf(
  project: ProjectData,
  events: EventData[],
  bulls: BullData[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y = margin;

  // ── Header ──
  y = addStandardHeader(doc, margin, "BeefSynch", "Synchronization Planner");

  // ── Project Info ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
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

  y = renderInfoRows(doc, infoRows, margin, y);
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
      styles: { fontSize: PDF_FONTS.sizeSmall, cellPadding: 5 },
      headStyles: getStandardHeadStyles(),
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
  }

  // ── Synchronization Product Directions ──
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  let dirY = finalY + 36;

  const pageHeight = doc.internal.pageSize.getHeight();
  const boxH = 145; // fixed height for the section
  if (dirY + boxH > pageHeight - 50) {
    doc.addPage();
    dirY = 50;
  }

  const boxX = margin;
  const boxW = pageWidth - margin * 2;
  const boxStartY = dirY - 4;

  // Draw border box (no fill)
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.rect(boxX, boxStartY, boxW, boxH);

  // Section title (bold, underlined)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  const titleText = "Synchronization Product Directions";
  doc.text(titleText, boxX + 14, dirY + 16);
  const titleWidth = doc.getTextWidth(titleText);
  doc.setLineWidth(0.5);
  doc.line(boxX + 14, dirY + 18, boxX + 14 + titleWidth, dirY + 18);
  dirY += 34;

  // GnRH subsection
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.text("GnRH Products:", boxX + 14, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(` ${DEFAULT_PRODUCT_DIRECTIONS.gnrh.products}`, boxX + 14 + doc.getTextWidth("GnRH Products: "), dirY);
  dirY += 15;
  doc.setFont("helvetica", "bolditalic");
  doc.text("Directions:", boxX + 14, dirY);
  doc.setFont("helvetica", "italic");
  doc.text(` ${DEFAULT_PRODUCT_DIRECTIONS.gnrh.directions}`, boxX + 14 + doc.getTextWidth("Directions: "), dirY);
  dirY += 24;

  // PGF subsection
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.text("PGF Products:", boxX + 14, dirY);
  doc.setFont("helvetica", "normal");
  doc.text(` ${DEFAULT_PRODUCT_DIRECTIONS.pgf.products}`, boxX + 14 + doc.getTextWidth("PGF Products: "), dirY);
  dirY += 15;
  doc.setFont("helvetica", "bolditalic");
  doc.text("Directions:", boxX + 14, dirY);
  doc.setFont("helvetica", "italic");
  doc.text(` ${DEFAULT_PRODUCT_DIRECTIONS.pgf.directionsLine1}`, boxX + 14 + doc.getTextWidth("Directions: "), dirY);
  dirY += 13;
  doc.text(DEFAULT_PRODUCT_DIRECTIONS.pgf.directionsLine2, boxX + 14, dirY);
  dirY += 20;

  addFooterToPdf(doc, "BeefSynch by Chuteside Resources");

  // Save
  doc.save(buildPdfFilename("BeefSynch_Report", project.name));
}
