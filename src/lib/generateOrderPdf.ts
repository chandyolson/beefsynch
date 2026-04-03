import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

interface OrderData {
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
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

export function generateOrderPdf(order: OrderData, items: OrderItemData[]) {
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
  doc.text("Semen Order", margin, y);
  doc.setTextColor(0);
  y += 6;

  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Customer Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(order.customer_name, margin, y);
  y += 22;

  const infoRows: [string, string][] = [
    ["Order Date", format(parseISO(order.order_date), "MMMM d, yyyy")],
    ["Fulfillment", order.fulfillment_status.charAt(0).toUpperCase() + order.fulfillment_status.slice(1)],
    ["Billing", order.billing_status.charAt(0).toUpperCase() + order.billing_status.slice(1)],
  ];

  if (order.customer_phone) infoRows.push(["Phone", order.customer_phone]);
  if (order.customer_email) infoRows.push(["Email", order.customer_email]);
  if (order.project_name) infoRows.push(["Linked Project", order.project_name]);

  doc.setFontSize(10);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 110, y);
    y += 15;
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
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
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
    if (notesY + 60 > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      notesY = 50;
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

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      "BeefSynch by Chuteside, LLC",
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 30,
      { align: "center" }
    );
  }

  const safeName = order.customer_name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const safeDate = order.order_date.replace(/-/g, "");
  doc.save(`BeefSynch_Order_${safeName}_${safeDate}.pdf`);
}
