import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addFooterToPdf,
  getStandardHeadStylesDark,
  PDF_LAYOUT,
  sanitizeFilename,
} from "./pdfUtils";
import { formatTime12, isNoTimeEvent } from "./formatUtils";

interface PackInfo {
  status?: string | null;
  pack_type?: string | null;
  tanks?: { tank_number?: string | number | null; tank_name?: string | null } | null;
}

/**
 * Working Worksheet PDF — landscape, single page, printed on colored paper for the
 * field crew. Shows protocol schedule, bulls/semen, products, and blank note lines.
 */
export function generateWorksheetPdf(
  project: any,
  events: any[],
  bulls: any[],
  products: any[],
  packInfo: PackInfo | null,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  /* ── Header ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(project.name || "Project", m, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const subParts = [
    project.cattle_type,
    project.head_count ? `${project.head_count} head` : null,
    project.protocol,
  ].filter(Boolean);
  doc.text(subParts.join("  ·  "), m, 24);

  if (project.breeding_date) {
    doc.setFont("helvetica", "bold");
    doc.text(
      `Breeding Date: ${format(parseISO(project.breeding_date), "MMMM d, yyyy")}`,
      m,
      30,
    );
  }

  // Right side: WORKING WORKSHEET label + print date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("WORKING WORKSHEET", pw - m, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Printed ${format(new Date(), "MMM d, yyyy")}`, pw - m, 24, { align: "right" });
  doc.setTextColor(0);

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 33, pw - m, 33);

  /* ── Two-column body ── */
  const leftX = m;
  const leftW = 150;
  const rightX = leftX + leftW + 8;
  const rightW = pw - m - rightX;
  const bodyTop = 38;

  /* Left: Protocol Schedule */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PROTOCOL SCHEDULE", leftX, bodyTop);

  const breedingDateStr = project.breeding_date || "";
  const eventBody = events.map((ev: any) => {
    const dateStr = ev.event_date ? format(parseISO(ev.event_date), "EEE MMM d") : "—";
    const timeStr = ev.event_time && !isNoTimeEvent(ev.event_name)
      ? formatTime12(ev.event_time)
      : "—";
    const isBreeding = ev.event_date === breedingDateStr;
    return [
      { content: dateStr, styles: { fontStyle: isBreeding ? "bold" as const : "normal" as const } },
      { content: timeStr, styles: { fontStyle: isBreeding ? "bold" as const : "normal" as const } },
      { content: ev.event_name || "", styles: { fontStyle: isBreeding ? "bold" as const : "normal" as const } },
    ];
  });

  autoTable(doc, {
    startY: bodyTop + 2,
    margin: { left: leftX, right: pw - leftX - leftW },
    head: [["Date", "Time", "Event"]],
    body: eventBody.length > 0 ? eventBody : [["—", "—", "No events scheduled"]],
    styles: { fontSize: 10, cellPadding: 2.2, lineColor: [60, 60, 60], lineWidth: 0.2 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 22 },
      2: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const ev = events[data.row.index];
      if (ev && ev.event_date === breedingDateStr) {
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });
  let yLeft = (doc as any).lastAutoTable.finalY + 4;

  /* Right column: Bulls & Semen */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BULLS & SEMEN", rightX, bodyTop);

  const bullBody = bulls.map((b: any) => {
    const name = b.bulls_catalog?.bull_name || b.custom_bull_name || "—";
    const code = b.bulls_catalog?.naab_code || b.bull_code || "";
    return [
      name,
      code,
      { content: b.units != null ? String(b.units) : "—", styles: { halign: "right" as const } },
    ];
  });

  autoTable(doc, {
    startY: bodyTop + 2,
    margin: { left: rightX, right: m },
    head: [[
      "Bull",
      "Code",
      { content: "Units", styles: { halign: "right" as const } },
    ]],
    body: bullBody.length > 0 ? bullBody : [["—", "", "—"]],
    styles: { fontSize: 10, cellPadding: 2.2, lineColor: [60, 60, 60], lineWidth: 0.2 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 22 },
      2: { cellWidth: 16 },
    },
  });
  let yRight = (doc as any).lastAutoTable.finalY + 3;

  if (packInfo) {
    const tankLabel = packInfo.tanks?.tank_name || packInfo.tanks?.tank_number || "—";
    const tankNumber = packInfo.tanks?.tank_number ?? "";
    const status = (packInfo.status || "").replace(/_/g, " ") || "—";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const packLine = `Tank Pack: ${tankLabel}${tankNumber ? ` #${tankNumber}` : ""} — ${status}`;
    doc.text(packLine, rightX, yRight + 2);
    yRight += 6;
  }

  /* Right column: Products */
  const visibleProducts = products.filter((p: any) =>
    (p.delivery_method && p.delivery_method !== "not_yet") ||
    (p.doses ?? 0) > 0 ||
    (p.units_billed ?? 0) > 0,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PRODUCTS", rightX, yRight + 2);

  const formatDosePerUnit = (p: any) => {
    const dpu = p.doses_per_unit;
    const unit = p.unit_label || "unit";
    if (dpu && dpu > 0) return `${dpu}/${unit}`;
    return "—";
  };

  const formatQty = (p: any) => {
    const unitLabel = p.unit_label || "";
    if ((p.units_billed ?? 0) > 0) {
      return `${p.units_billed} ${unitLabel}`.trim();
    }
    const dpu = p.doses_per_unit;
    if ((p.doses ?? 0) > 0 && dpu && dpu > 0) {
      return `${(p.doses / dpu).toFixed(1)} ${unitLabel}`.trim();
    }
    if ((p.doses ?? 0) > 0) return `${p.doses} hd`;
    return "—";
  };

  const productBody = visibleProducts.map((p: any) => [
    p.product_name || "—",
    formatDosePerUnit(p),
    { content: formatQty(p), styles: { halign: "right" as const } },
  ]);

  autoTable(doc, {
    startY: yRight + 4,
    margin: { left: rightX, right: m },
    head: [[
      "Product",
      "Dose/Unit",
      { content: "Qty", styles: { halign: "right" as const } },
    ]],
    body: productBody.length > 0 ? productBody : [["—", "—", "—"]],
    styles: { fontSize: 10, cellPadding: 2.2, lineColor: [60, 60, 60], lineWidth: 0.2 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 26 },
      2: { cellWidth: 24 },
    },
  });
  yRight = (doc as any).lastAutoTable.finalY;

  /* ── Notes ── */
  const yBody = Math.max(yLeft, yRight) + 8;
  const notesAvailable = ph - yBody - 12;
  const lineSpacing = 8;
  const linesToDraw = Math.min(5, Math.max(2, Math.floor(notesAvailable / lineSpacing)));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("NOTES", m, yBody);

  doc.setDrawColor(140);
  doc.setLineWidth(0.2);
  let noteY = yBody + 6;
  for (let i = 0; i < linesToDraw; i++) {
    doc.line(m, noteY, pw - m, noteY);
    noteY += lineSpacing;
  }

  /* ── Footer ── */
  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* ── Save ── */
  const safeName = sanitizeFilename(project.name || "project");
  doc.save(`BeefSynch_Worksheet_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
