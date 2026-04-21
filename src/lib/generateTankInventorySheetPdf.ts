import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  PDF_COLORS,
  PDF_FONTS,
  PDF_LAYOUT,
  addFooterToPdf,
  buildPdfFilename,
  ensurePageSpace,
} from "./pdfUtils";

export interface TankSheetMeta {
  tankId: string;
  tankName: string;
  tankNumber: string;
  nitrogenStatus: string;
  locationStatus: string;
  totalCanisters: number | null;
  maxCanisterSeen: number;
}

export interface TankSheetRow {
  canister: string;
  bullName: string;
  bullCode: string;
  units: number;
}

export interface TankWithRows {
  meta: TankSheetMeta;
  rows: TankSheetRow[];
}

/**
 * Internal: draws one tank's count sheet onto an existing jsPDF document,
 * starting at the given Y position. Returns the Y position after the sheet.
 * Used by both the single-tank and bulk variants below.
 */
function drawTankSheet(doc: jsPDF, meta: TankSheetMeta, rows: TankSheetRow[], startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y = startY;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeLargeMedium);
  doc.setTextColor(PDF_COLORS.textNormal);
  doc.text("Tank Inventory Count Sheet", margin, y);
  y += 26;

  // Tank identity
  doc.setFontSize(PDF_FONTS.sizeMedium);
  doc.text(`${meta.tankName} · #${meta.tankNumber}`, margin, y);
  y += 20;

  // Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.setTextColor(PDF_COLORS.textGray);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const totalSlots = meta.totalCanisters ?? Math.max(meta.maxCanisterSeen, 6);
  doc.text(
    `Status: ${meta.nitrogenStatus} · ${meta.locationStatus}   ·   Printed: ${format(new Date(), "MMM d, yyyy h:mm a")}`,
    margin,
    y
  );
  y += 13;
  doc.text(`Total units on file: ${totalUnits.toLocaleString()}   ·   Canisters: ${totalSlots}`, margin, y);
  y += 18;

  // Signature block
  doc.setTextColor(PDF_COLORS.textNormal);
  doc.text("Inventoried by: ______________________________", margin, y);
  doc.text("Date: _________________", pageWidth - margin - 140, y);
  y += 14;
  doc.text("Signature: __________________________________", margin, y);
  y += 20;

  // Divider
  doc.setDrawColor(PDF_COLORS.lineDark);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  // Per-canister sections
  const rowsByCanister = new Map<string, TankSheetRow[]>();
  for (const r of rows) {
    const key = r.canister;
    if (!rowsByCanister.has(key)) rowsByCanister.set(key, []);
    rowsByCanister.get(key)!.push(r);
  }

  for (let n = 1; n <= totalSlots; n++) {
    const key = String(n);
    const canRows = rowsByCanister.get(key) ?? [];
    y = ensurePageSpace(doc, y, 80);

    // Canister heading
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_FONTS.sizeSubhead);
    doc.setTextColor(PDF_COLORS.textNormal);
    const canUnits = canRows.reduce((s, r) => s + r.units, 0);
    const canLabel = canRows.length > 0
      ? `Canister ${n}   ·   ${canUnits} units on file   ·   ${canRows.length} bull${canRows.length !== 1 ? "s" : ""}`
      : `Canister ${n}   ·   OPEN`;
    doc.text(canLabel, margin, y);
    y += 10;

    if (canRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Bull", "NAAB code", "On file", "Found", "Match?", "Notes"]],
        body: canRows
          .slice()
          .sort((a, b) => a.bullName.localeCompare(b.bullName))
          .map((r) => [r.bullName, r.bullCode || "—", String(r.units), "", "", ""]),
        styles: { fontSize: PDF_FONTS.sizeBodyTiny, cellPadding: 4, lineColor: [200, 200, 200], lineWidth: 0.25 },
        headStyles: { fillColor: PDF_COLORS.headFill, textColor: PDF_COLORS.headText, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 170 },
          1: { cellWidth: 75 },
          2: { cellWidth: 50, halign: "right" },
          3: { cellWidth: 50, halign: "center" },
          4: { cellWidth: 50, halign: "center" },
          5: { cellWidth: "auto" },
        },
        margin: { left: margin, right: margin },
        theme: "grid",
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 14;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(PDF_FONTS.sizeBodyTiny);
      doc.setTextColor(PDF_COLORS.textGray);
      doc.text("No inventory on file. If semen found, write below:", margin, y + 10);
      doc.setTextColor(PDF_COLORS.textNormal);

      autoTable(doc, {
        startY: y + 16,
        head: [["Bull", "NAAB code", "Units found", "Notes"]],
        body: [["", "", "", ""], ["", "", "", ""]],
        styles: { fontSize: PDF_FONTS.sizeBodyTiny, cellPadding: 6, lineColor: [200, 200, 200], lineWidth: 0.25, minCellHeight: 22 },
        headStyles: { fillColor: [230, 230, 230], textColor: PDF_COLORS.textGray, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 170 },
          1: { cellWidth: 90 },
          2: { cellWidth: 75 },
          3: { cellWidth: "auto" },
        },
        margin: { left: margin, right: margin },
        theme: "grid",
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 14;
    }
  }

  // Notes block
  y = ensurePageSpace(doc, y, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.text("Notes", margin, y);
  y += 10;
  doc.setDrawColor(PDF_COLORS.lineLight);
  for (let i = 0; i < 4; i++) {
    y += 14;
    doc.line(margin, y, pageWidth - margin, y);
  }

  return y;
}

/**
 * Generate a count sheet for a single tank.
 */
export function generateTankInventorySheetPdf(meta: TankSheetMeta, rows: TankSheetRow[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  drawTankSheet(doc, meta, rows, PDF_LAYOUT.margin);
  addFooterToPdf(doc, `BeefSynch — Tank Inventory Sheet · ${meta.tankName}`);
  doc.save(
    buildPdfFilename(
      "BeefSynch_TankInventory",
      `${meta.tankName}_${meta.tankNumber}`,
      format(new Date(), "yyyyMMdd")
    )
  );
}

/**
 * Generate one combined PDF containing count sheets for multiple tanks,
 * with automatic page breaks between each tank.
 */
export function generateBulkTankInventoryPdf(tanks: TankWithRows[]) {
  if (tanks.length === 0) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  for (let i = 0; i < tanks.length; i++) {
    if (i > 0) doc.addPage();
    drawTankSheet(doc, tanks[i].meta, tanks[i].rows, PDF_LAYOUT.margin);
  }
  addFooterToPdf(doc, `BeefSynch — Bulk Tank Inventory (${tanks.length} tanks)`);
  doc.save(`BeefSynch_TankInventory_All_${format(new Date(), "yyyyMMdd")}.pdf`);
}
