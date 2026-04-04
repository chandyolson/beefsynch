import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

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
  const margin = 50;
  let y = 50;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("BeefSynch", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text("Return Slip", margin, y);
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Tank name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
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

  doc.setFontSize(10);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 120, y);
    y += 15;
  }
  y += 10;

  // Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
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
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
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

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("BeefSynch by Chuteside, LLC", pageWidth / 2, doc.internal.pageSize.getHeight() - 30, { align: "center" });
  }

  const safeName = pack.fieldTankName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const safeDate = format(new Date(pack.unpackedAt), "yyyyMMdd");
  doc.save(`BeefSynch_ReturnSlip_${safeName}_${safeDate}.pdf`);
}
