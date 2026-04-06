import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

function fmt$(v: number | null) {
  if (v == null) return "$0.00";
  return `$${v.toFixed(2)}`;
}

export function generateBillingSheetPdf(
  project: any,
  billing: any,
  products: any[],
  semen: any[],
  sessions: any[],
  labor: any[],
  totals: { productsTotal: number; semenTotal: number; laborTotal: number; grandTotal: number },
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const m = 14;
  let y = 16;

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Breeding Project Billing Sheet", m, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("BeefSynch by Chuteside Resources", pw - m, y, { align: "right" });
  doc.setTextColor(0);
  y += 8;

  // Project info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(project.name, m, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const infoParts = [
    project.protocol,
    project.cattle_type,
    `${project.head_count} head`,
    project.breeding_date ? `Breed: ${format(parseISO(project.breeding_date), "MMM d, yyyy")}` : null,
  ].filter(Boolean);
  doc.text(infoParts.join("  •  "), m, y);
  y += 5;

  if (billing.catl_invoice_number || billing.select_sires_invoice_number) {
    const invParts = [];
    if (billing.catl_invoice_number) invParts.push(`CATL Inv: ${billing.catl_invoice_number}`);
    if (billing.select_sires_invoice_number) invParts.push(`SS Inv: ${billing.select_sires_invoice_number}`);
    doc.text(invParts.join("    "), m, y);
    y += 5;
  }

  doc.text(`Status: ${(billing.status || "draft").toUpperCase()}`, m, y);
  y += 6;

  // Products table
  if (products.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Products", m, y);
    y += 2;

    const prodBody = products.map((p, i) => {
      const prev = i > 0 ? products[i - 1] : null;
      const showDate = !prev || prev.event_date !== p.event_date;
      const showEvt = !prev || prev.protocol_event_label !== p.protocol_event_label || showDate;
      return [
        showDate && p.event_date ? format(parseISO(p.event_date), "MMM d") : "",
        showEvt ? (p.protocol_event_label || "") : "",
        p.product_name,
        String(p.doses),
        `${(p.units_billed ?? p.units_calculated ?? 0).toFixed(1)} ${p.unit_label || ""}`,
        fmt$(p.unit_price),
        fmt$(p.line_total),
      ];
    });
    prodBody.push(["", "", "", "", "", "Subtotal", fmt$(totals.productsTotal)]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Event", "Product", "Doses", "Units", "Price", "Total"]],
      body: prodBody,
      margin: { left: m, right: m },
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 7 },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === prodBody.length - 1) data.cell.styles.fontStyle = "bold";
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Semen table
  if (semen.length > 0) {
    if (y > 220) { doc.addPage(); y = 16; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Semen", m, y);
    y += 2;

    const semBody = semen.map(s => [
      s.bull_name, s.bull_code || "—",
      String(s.units_packed ?? 0), String(s.units_returned ?? 0),
      String(s.units_blown ?? 0), String(s.units_billable ?? 0),
      fmt$(s.unit_price), fmt$(s.line_total),
    ]);
    semBody.push(["", "", "", "", "", "", "Subtotal", fmt$(totals.semenTotal)]);

    autoTable(doc, {
      startY: y,
      head: [["Bull", "Code", "Packed", "Ret'd", "Blown", "Billable", "Price", "Total"]],
      body: semBody,
      margin: { left: m, right: m },
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 7 },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === semBody.length - 1) data.cell.styles.fontStyle = "bold";
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Labor table
  if (labor.length > 0) {
    if (y > 230) { doc.addPage(); y = 16; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Labor", m, y);
    y += 2;

    const labBody = labor.map(l => [l.description, l.labor_dates || "", fmt$(l.amount)]);
    labBody.push(["", "Subtotal", fmt$(totals.laborTotal)]);

    autoTable(doc, {
      startY: y,
      head: [["Description", "Dates", "Total"]],
      body: labBody,
      margin: { left: m, right: m },
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 7 },
      columnStyles: { 2: { halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === labBody.length - 1) data.cell.styles.fontStyle = "bold";
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Grand total
  if (y > 240) { doc.addPage(); y = 16; }
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`GRAND TOTAL: ${fmt$(totals.grandTotal)}`, pw - m, y, { align: "right" });
  y += 10;

  // Page 2: Sessions
  if (sessions.length > 0) {
    doc.addPage();
    y = 16;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Field Sessions", m, y);
    y += 6;

    const sessBody = sessions.map(s => [
      format(parseISO(s.session_date), "MMM d"),
      s.session_label || "",
      s.time_of_day || "",
      s.head_count != null ? String(s.head_count) : "",
      s.crew || "",
      s.notes || "",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Event", "Time", "Head Count", "Crew", "Notes"]],
      body: sessBody,
      margin: { left: m, right: m },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 8 },
      columnStyles: { 3: { halign: "right" } },
    });
  }

  // Notes
  if (billing.notes) {
    y = (doc as any).lastAutoTable?.finalY ?? y;
    y += 10;
    if (y > 240) { doc.addPage(); y = 16; }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", m, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(billing.notes, pw - m * 2);
    doc.text(noteLines, m, y);
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text("BeefSynch by Chuteside, LLC", pw / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    doc.setTextColor(0);
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  doc.save(`BeefSynch_Billing_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
