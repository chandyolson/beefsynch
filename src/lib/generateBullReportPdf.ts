import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface BullReportRow {
  bullName: string;
  company: string;
  registrationNumber: string;
  totalUnits: number;
  projectCount: number;
  projectNames: string;
  breedingDates: string;
  cattleTypes: string;
}

export interface BullReportStats {
  totalBulls: number;
  totalUnits: number;
  totalProjects: number;
  totalHead: number;
}

export interface BullReportFilters {
  fromDate: string;
  toDate: string;
  cattleType: string;
  protocol: string;
  company: string;
  search: string;
}

export function generateBullReportPdf(
  rows: BullReportRow[],
  stats: BullReportStats,
  filters: BullReportFilters
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("BeefSynch — Bull Report", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  const fromLabel = filters.fromDate
    ? format(new Date(filters.fromDate + "T00:00:00"), "MMM d, yyyy")
    : "—";
  const toLabel = filters.toDate
    ? format(new Date(filters.toDate + "T00:00:00"), "MMM d, yyyy")
    : "—";
  doc.text(`Breeding Date Range: ${fromLabel} to ${toLabel}`, margin, y);
  y += 14;

  const appliedFilters: string[] = [];
  if (filters.cattleType !== "All") appliedFilters.push(`Cattle Type: ${filters.cattleType}`);
  if (filters.protocol !== "All Protocols") appliedFilters.push(`Protocol: ${filters.protocol}`);
  if (filters.company !== "All Companies") appliedFilters.push(`Company: ${filters.company}`);
  if (filters.search) appliedFilters.push(`Search: "${filters.search}"`);

  if (appliedFilters.length > 0) {
    doc.text(`Filters: ${appliedFilters.join(" | ")}`, margin, y);
    y += 14;
  }

  doc.setTextColor(0);
  y += 4;

  // ── Divider ──
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  // ── Stat cards summary ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const statItems = [
    ["Total Bulls in Use", String(stats.totalBulls)],
    ["Total Semen Units", String(stats.totalUnits)],
    ["Total Projects", String(stats.totalProjects)],
    ["Total Head in Range", String(stats.totalHead)],
  ];
  const colW = (pageWidth - margin * 2) / 4;
  for (let i = 0; i < statItems.length; i++) {
    const x = margin + i * colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(statItems[i][0], x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(statItems[i][1], x, y + 16);
  }
  y += 36;

  // ── Divider ──
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  // ── Table ──
  const tableBody = rows.map((r) => [
    r.bullName,
    r.company || "—",
    r.registrationNumber || "—",
    String(r.totalUnits),
    String(r.projectCount),
    r.projectNames,
    r.breedingDates,
    r.cattleTypes,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Bull Name", "Company", "Reg. #", "Units", "Projects", "Project Names", "Breeding Date(s)", "Cattle Type"]],
    body: tableBody,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 70 },
      2: { cellWidth: 75 },
      3: { cellWidth: 40, halign: "center" },
      4: { cellWidth: 45, halign: "center" },
      5: { cellWidth: 120 },
      6: { cellWidth: 100 },
      7: { cellWidth: 65 },
    },
  });

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      "BeefSynch by Chuteside Resources",
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 24,
      { align: "center" }
    );
  }

  const safeName = `BeefSynch_Bull_Report_${filters.fromDate}_to_${filters.toDate}`.replace(/[^a-zA-Z0-9_]/g, "_");
  doc.save(`${safeName}.pdf`);
}
