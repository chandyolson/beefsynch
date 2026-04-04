import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

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
  const margin = 40;
  let y = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("BeefSynch — Breeding Session Sheet", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
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
    styles: { fontSize: 8, cellPadding: 6, minCellHeight: 24 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", fontSize: 7, halign: "center" },
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
    doc.setFontSize(10);
    doc.text("Notes:", margin, notesY);
    notesY += 14;
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    for (let i = 0; i < 4; i++) {
      doc.line(margin, notesY, pageWidth - margin, notesY);
      notesY += 18;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("BeefSynch by Chuteside, LLC", pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }

  const safeName = pack.fieldTankName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const safeDate = format(new Date(pack.packedAt), "yyyyMMdd");
  doc.save(`BeefSynch_SessionSheet_${safeName}_${safeDate}.pdf`);
}
