import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  addFooterToPdf,
  drawDividerLine,
  getStandardHeadStyles,
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_FONTS,
} from "./pdfUtils";

export interface BullReportRow {
  bullName: string;
  company: string;
  registrationNumber: string;
  breed: string;
  totalUnits: number;
  projectCount: number;
  projectNames: string;
  breedingDates: string;
  cattleTypes: string;
  source: "Project" | "Order" | "Both";
  details?: { name: string; units: number; date: string; cattleType: string; headCount: number; type: "project" | "order"; id: string }[];
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
  dataSource?: string;
}

export function generateBullReportPdf(
  rows: BullReportRow[],
  stats: BullReportStats,
  filters: BullReportFilters
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.marginSmall;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeLargeMedium);
  doc.text("BeefSynch — Bull Report", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.setTextColor(PDF_COLORS.textGray);
  const fromLabel = filters.fromDate
    ? format(new Date(filters.fromDate + "T00:00:00"), "MMM d, yyyy")
    : "—";
  const toLabel = filters.toDate
    ? format(new Date(filters.toDate + "T00:00:00"), "MMM d, yyyy")
    : "—";
  doc.text(`Date Range: ${fromLabel} to ${toLabel}`, margin, y);
  y += 14;

  const sourceLabel = filters.dataSource === "projects" ? "Projects Only" : filters.dataSource === "orders" ? "Orders Only" : "All Sources (Projects + Orders)";
  doc.text(`Data Source: ${sourceLabel}`, margin, y);
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

  doc.setTextColor(PDF_COLORS.textNormal);
  y += 4;

  // Divider
  drawDividerLine(doc, margin, pageWidth - margin, y, PDF_COLORS.lineDark, 0.5);
  y += 16;

  // Stat cards summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeBodySmall);
  const statItems = [
    ["Total Bulls in Use", String(stats.totalBulls)],
    ["Total Semen Units", String(stats.totalUnits)],
    ["Total Projects/Orders", String(stats.totalProjects)],
    ["Total Head in Range", String(stats.totalHead)],
  ];
  const colW = (pageWidth - margin * 2) / 4;
  for (let i = 0; i < statItems.length; i++) {
    const x = margin + i * colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_FONTS.sizeSmall);
    doc.setTextColor(PDF_COLORS.textDimmed);
    doc.text(statItems[i][0], x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_FONTS.sizeSubhead);
    doc.setTextColor(PDF_COLORS.textNormal);
    doc.text(statItems[i][1], x, y + 16);
  }
  y += 36;

  // Divider
  drawDividerLine(doc, margin, pageWidth - margin, y, PDF_COLORS.lineLight, 0.3);
  y += 12;

  // Table
  const tableBody = rows.map((r) => [
    r.bullName,
    r.company || "—",
    r.registrationNumber || "—",
    String(r.totalUnits),
    r.source,
    String(r.projectCount),
    r.projectNames,
    r.breedingDates,
    r.cattleTypes,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Bull Name", "Company", "Reg. #", "Units", "Source", "Projects", "Project/Order Names", "Date(s)", "Cattle Type"]],
    body: tableBody,
    styles: { fontSize: PDF_FONTS.sizeMini, cellPadding: 3.5, overflow: "linebreak" },
    headStyles: getStandardHeadStyles(),
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 60 },
      2: { cellWidth: 70 },
      3: { cellWidth: 35, halign: "center" },
      4: { cellWidth: 40 },
      5: { cellWidth: 40, halign: "center" },
      6: { cellWidth: 120 },
      7: { cellWidth: 80 },
      8: { cellWidth: 55 },
    },
  });

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", 24);

  const safeName = `BeefSynch_Bull_Report_${filters.fromDate}_to_${filters.toDate}`.replace(/[^a-zA-Z0-9_]/g, "_");
  doc.save(`${safeName}.pdf`);
}
