import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  addFooterToPdf,
  buildPdfFilename,
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_FONTS,
} from "./pdfUtils";

interface SessionSheetData {
  fieldTankName: string;
  packedAt: string;
  projectNames: string[];
}

interface SessionSheetLine {
  bullName: string;
  fieldCanister: string | null;
  units: number;
}

export function generateSessionSheetPdf(pack: SessionSheetData, lines: SessionSheetLine[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.marginSmall;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeMedium);
  doc.text("BeefSynch — Breeding Session Sheet", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.text(`Projects: ${pack.projectNames.join(", ")}`, margin, y);
  y += 14;
  doc.text(`Field Tank: ${pack.fieldTankName}    |    Date Packed: ${format(new Date(pack.packedAt), "MMMM d, yyyy")}`, margin, y);
  y += 20;

  const tableBody = lines.map(l => [
    l.bullName,
    l.fieldCanister || "—",
    String(l.units),
    "", "",
    "", "",
    "", "",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      "Bull Name", "Canister", "Units\nPacked",
      "Sess 1\nStart", "Sess 1\nEnd",
      "Sess 2\nStart", "Sess 2\nEnd",
      "Sess 3\nStart", "Sess 3\nEnd",
    ]],
    body: tableBody,
    styles: { fontSize: PDF_FONTS.sizeSmallTiny, cellPadding: 6, minCellHeight: 24 },
    headStyles: { fillColor: PDF_COLORS.headFill, textColor: PDF_COLORS.headText, fontStyle: "bold" as const, fontSize: PDF_FONTS.sizeTiny, halign: "center" as const },
    columnStyles: {
      0: { cellWidth: 140 },
      1: { cellWidth: 55, halign: "center" },
      2: { cellWidth: 45, halign: "center" },
      3: { cellWidth: 55, halign: "center" },
      4: { cellWidth: 55, halign: "center" },
      5: { cellWidth: 55, halign: "center" },
      6: { cellWidth: 55, halign: "center" },
      7: { cellWidth: 55, halign: "center" },
      8: { cellWidth: 55, halign: "center" },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  let notesY = finalY + 20;

  if (notesY + 80 < doc.internal.pageSize.getHeight() - 40) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_FONTS.sizeBodyTiny);
    doc.text("Notes:", margin, notesY);
    notesY += 14;
    doc.setDrawColor(PDF_COLORS.lineLight);
    doc.setLineWidth(0.3);
    for (let i = 0; i < 4; i++) {
      doc.line(margin, notesY, pageWidth - margin, notesY);
      notesY += 18;
    }
  }

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetSmall);

  const safeDate = format(new Date(pack.packedAt), "yyyyMMdd");
  doc.save(buildPdfFilename("BeefSynch_SessionSheet", pack.fieldTankName, safeDate));
}
