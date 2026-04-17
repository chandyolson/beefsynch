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

interface PackSlipData {
  fieldTankName: string;
  packedAt: string;
  packedBy: string | null;
  projectNames: string[];
  notes: string | null;
  packType?: "project" | "shipment";
  destinationName?: string | null;
  destinationAddress?: string | null;
  trackingNumber?: string | null;
  shippingCarrier?: string | null;
}

interface PackSlipLine {
  bullName: string;
  bullCode: string | null;
  sourceTankName: string;
  sourceCanister: string | null;
  fieldCanister: string | null;
  units: number;
}

export function generatePackingSlipPdf(pack: PackSlipData, lines: PackSlipLine[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y = margin;

  y = addStandardHeader(doc, margin, "BeefSynch", pack.packType === "shipment" ? "Shipping Packing List" : "Packing Slip");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.text(pack.fieldTankName, margin, y);
  y += 22;

  const infoRows: [string, string][] = [
    ["Date Packed", format(new Date(pack.packedAt), "MMMM d, yyyy")],
    ["Packed By", pack.packedBy || "—"],
  ];

  if (pack.packType === "shipment") {
    infoRows.push(["Ship To", pack.destinationName || "—"]);
    if (pack.destinationAddress) {
      infoRows.push(["Address", pack.destinationAddress]);
    }
    if (pack.shippingCarrier) {
      infoRows.push(["Carrier", pack.shippingCarrier]);
    }
    if (pack.trackingNumber) {
      infoRows.push(["Tracking #", pack.trackingNumber]);
    }
  } else {
    infoRows.push(["Projects", pack.projectNames.join(", ") || "—"]);
  }

  if (pack.notes) infoRows.push(["Notes", pack.notes]);

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(value, pageWidth - margin - 170);
    doc.text(wrapped, margin + 110, y);
    y += wrapped.length * 14;
  }
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeBody);
  doc.text("Packed Semen", margin, y);
  y += 8;

  const tableBody = lines.map(l => [
    l.bullName,
    l.bullCode || "—",
    l.sourceTankName,
    l.sourceCanister || "—",
    l.fieldCanister || "—",
    String(l.units),
  ]);
  const totalUnits = lines.reduce((s, l) => s + l.units, 0);
  tableBody.push(["", "", "", "", "Total", String(totalUnits)]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Bull Name", "Code", "Source Tank", "Src Can.", "Field Can.", "Units"]],
    body: tableBody,
    styles: { fontSize: PDF_FONTS.sizeSmall, cellPadding: 5 },
    headStyles: getStandardHeadStyles(),
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC");

  const safeDate = format(new Date(pack.packedAt), "yyyyMMdd");
  doc.save(buildPdfFilename("BeefSynch_PackSlip", pack.fieldTankName, safeDate));
}
