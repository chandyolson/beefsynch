import jsPDF from "jspdf";
import { format } from "date-fns";
import {
  buildPdfFilename,
  PDF_COLORS,
  PDF_FONTS,
} from "./pdfUtils";

interface LabelData {
  fieldTankName: string;
  packedAt: string;
  projectNames: string[];
  packType?: "project" | "shipment";
  destinationName?: string | null;
}

interface LabelLine {
  bullName: string;
  fieldCanister: string | null;
  units: number;
}

export function generatePackingLabelPdf(pack: LabelData, lines: LabelLine[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [144, 288] });
  const m = 8;
  let y = m + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  let headerText = pack.packType === "shipment"
    ? `SHIP TO: ${pack.destinationName || "Unknown"}`
    : pack.projectNames.join(", ");
  if (doc.getTextWidth(headerText) > 272) {
    while (doc.getTextWidth(headerText + "...") > 272 && headerText.length > 10) {
      headerText = headerText.slice(0, -1);
    }
    headerText += "...";
  }
  doc.text(headerText, m, y);
  y += 13;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_FONTS.sizeSmallTiny);
  doc.text(`${pack.fieldTankName} — ${format(new Date(pack.packedAt), "MMM d, yyyy")}`, m, y);
  y += 8;

  doc.setDrawColor(PDF_COLORS.lineLight);
  doc.setLineWidth(0.3);
  doc.line(m, y, 288 - m, y);
  y += 8;

  doc.setFontSize(PDF_FONTS.sizeTiny);
  const maxLines = 6;
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;

  for (const line of displayLines) {
    const canText = line.fieldCanister ? ` — Can ${line.fieldCanister}` : "";
    doc.text(`${line.bullName}${canText} — ${line.units}u`, m, y);
    y += 9;
  }

  if (remaining > 0) {
    doc.setFont("helvetica", "italic");
    doc.text(`... + ${remaining} more (see full slip)`, m, y);
  }

  const safeDate = format(new Date(pack.packedAt), "yyyyMMdd");
  doc.save(buildPdfFilename("BeefSynch_Label", pack.fieldTankName, safeDate));
}
