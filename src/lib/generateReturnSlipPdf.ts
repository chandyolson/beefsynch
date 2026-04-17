import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  addStandardHeader,
  addFooterToPdf,
  buildPdfFilename,
  getStandardHeadStyles,
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_FONTS,
} from "./pdfUtils";
import { sanitizeFilename } from "./pdfUtils";

interface ReturnSlipData {
  fieldTankName: string;
  packedAt: string;
  unpackedAt: string;
  packedBy: string | null;
  unpackedBy: string | null;
  projectNames: string[];
  notes: string | null;
}

interface ReturnSlipLine {
  bullName: string;
  bullCode: string | null;
  unitsPacked: number;
  unitsReturned: number;
  destinationTankName: string;
  destinationCanister: string | null;
}

export function generateReturnSlipPdf(pack: ReturnSlipData, lines: ReturnSlipLine[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y = margin;

  // Header
  y = addStandardHeader(doc, margin, "BeefSynch", "Return Slip");

  // Tank name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.text(pack.fieldTankName, margin, y);
  y += 22;

  // Details
  const infoRows: [string, string][] = [
    ["Date Packed", format(new Date(pack.packedAt), "MMMM d, yyyy")],
    ["Date Unpacked", format(new Date(pack.unpackedAt), "MMMM d, yyyy")],
    ["Packed By", pack.packedBy || "—"],
    ["Unpacked By", pack.unpackedBy || "—"],
    ["Projects", pack.projectNames.join(", ")],
  ];
  if (pack.notes) infoRows.push(["Notes", pack.notes]);

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 120, y);
    y += PDF_LAYOUT.lineHeight;
  }
  y += 10;

  // Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeBody);
  doc.text("Return Summary", margin, y);
  y += 8;

  const tableBody = lines.map(l => [
    l.bullName,
    l.bullCode || "—",
    String(l.unitsPacked),
    String(l.unitsReturned),
    String(l.unitsPacked - l.unitsReturned),
    l.destinationTankName,
    l.destinationCanister || "—",
  ]);

  const totalPacked = lines.reduce((s, l) => s + l.unitsPacked, 0);
  const totalReturned = lines.reduce((s, l) => s + l.unitsReturned, 0);
  const totalUsed = totalPacked - totalReturned;
  tableBody.push(["", "", String(totalPacked), String(totalReturned), String(totalUsed), "", ""]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Bull", "Code", "Packed", "Returned", "Used", "Dest. Tank", "Can."]],
    body: tableBody,
    styles: { fontSize: PDF_FONTS.sizeSmallTiny, cellPadding: 5 },
    headStyles: getStandardHeadStyles(),
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC");

  const safeDate = format(new Date(pack.unpackedAt), "yyyyMMdd");
  doc.save(buildPdfFilename("BeefSynch_ReturnSlip", pack.fieldTankName, safeDate));
}
