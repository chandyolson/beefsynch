import jsPDF from "jspdf";
import { format } from "date-fns";

interface LabelData {
  fieldTankName: string;
  packedAt: string;
  projectNames: string[];
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
  doc.setFontSize(10);
  let projText = pack.projectNames.join(", ");
  if (doc.getTextWidth(projText) > 272) {
    while (doc.getTextWidth(projText + "...") > 272 && projText.length > 10) {
      projText = projText.slice(0, -1);
    }
    projText += "...";
  }
  doc.text(projText, m, y);
  y += 13;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${pack.fieldTankName} — ${format(new Date(pack.packedAt), "MMM d, yyyy")}`, m, y);
  y += 8;

  doc.setDrawColor(160);
  doc.setLineWidth(0.3);
  doc.line(m, y, 288 - m, y);
  y += 8;

  doc.setFontSize(7);
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

  const safeName = pack.fieldTankName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const safeDate = format(new Date(pack.packedAt), "yyyyMMdd");
  doc.save(`BeefSynch_Label_${safeName}_${safeDate}.pdf`);
}
