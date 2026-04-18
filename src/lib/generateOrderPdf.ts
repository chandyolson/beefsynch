import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addStandardHeader,
  addFooterToPdf,
  buildPdfFilename,
  getStandardHeadStyles,
  ensurePageSpace,
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_FONTS,
} from "./pdfUtils";
import { sanitizeFilename } from "./pdfUtils";

interface OrderData {
  customer_name: string;
  order_date: string;
  fulfillment_status: string;
  billing_status: string;
  notes: string | null;
  project_name?: string | null;
}

interface OrderItemData {
  units: number;
  custom_bull_name: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
  } | null;
}

interface ReconciliationLine {
  bull_name: string;
  bull_code: string | null;
  units: number;
  source: string;
}

interface ReconciliationData {
  type: "received" | "packed";
  lines: ReconciliationLine[];
  totalOrdered: number;
  totalFulfilled: number;
}

export function generateOrderPdf(order: OrderData, items: OrderItemData[], reconciliation?: ReconciliationData | null) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y: number = margin;

  // Header
  y = addStandardHeader(doc, margin, "BeefSynch", "Semen Order");

  // Customer Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.text(order.customer_name, margin, y);
  y += 22;

  const infoRows: [string, string][] = [
    ["Order Date", format(parseISO(order.order_date), "MMMM d, yyyy")],
    ["Fulfillment", order.fulfillment_status.charAt(0).toUpperCase() + order.fulfillment_status.slice(1)],
    ["Billing", order.billing_status.charAt(0).toUpperCase() + order.billing_status.slice(1)],
  ];

  if (order.project_name) infoRows.push(["Linked Project", order.project_name]);

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 110, y);
    y += PDF_LAYOUT.lineHeight;
  }
  y += 10;

  // Bulls table
  if (items.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Bulls & Units", margin, y);
    y += 8;

    const tableBody = items.map((item) => [
      item.bulls_catalog?.bull_name || item.custom_bull_name || "Unknown",
      item.bulls_catalog?.company || "—",
      item.bulls_catalog?.registration_number || "—",
      String(item.units),
    ]);

    const totalUnits = items.reduce((s, i) => s + i.units, 0);
    tableBody.push(["", "", "Total", String(totalUnits)]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Bull Name", "Company", "Reg #", "Units"]],
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
  }

  // Notes
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  let notesY = finalY + 20;

  if (order.notes) {
    notesY = ensurePageSpace(doc, notesY, 60, margin);
    if (notesY !== finalY + 20) {
      // We added a page, so reset notesY
      notesY = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Notes", margin, notesY);
    notesY += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(order.notes, pageWidth - margin * 2);
    doc.text(lines, margin, notesY);
  }

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC");

  const safeDate = order.order_date.replace(/-/g, "");
  doc.save(buildPdfFilename("BeefSynch_Order", order.customer_name, safeDate));
}
