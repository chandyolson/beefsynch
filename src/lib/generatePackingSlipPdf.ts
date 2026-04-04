import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface PackSlipData {
  fieldTankName: string;
  packedAt: string;
  packedBy: string | null;
  projectNames: string[];
  notes: string | null;
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
  const margin = 50;
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("BeefSynch", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text("Packing Slip", margin, y);
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(pack.fieldTankName, margin, y);
  y += 22;

  const infoRows: [string, string][] = [
    ["Date Packed", format(new Date(pack.packedAt), "MMMM d, yyyy")],
    ["Packed By", pack.packedBy || "—"],
    ["Projects", pack.projectNames.join(", ")],
  ];
  if (pack.notes) infoRows.push(["Notes", pack.notes]);

  doc.setFontSize(10);
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
  doc.setFontSize(13);
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
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("BeefSynch by Chuteside, LLC", pageWidth / 2, doc.internal.pageSize.getHeight() - 30, { align: "center" });
  }

  const safeName = pack.fieldTankName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const safeDate = format(new Date(pack.packedAt), "yyyyMMdd");
  doc.save(`BeefSynch_PackSlip_${safeName}_${safeDate}.pdf`);
}
