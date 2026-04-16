import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

function fmt$(v: number | null) {
  if (v == null) return "$0.00";
  return `$${v.toFixed(2)}`;
}

interface SessionInventoryCell {
  id?: string;
  billing_id?: string;
  session_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  canister: string;
  start_units: number | null;
  end_units: number | null;
  sort_order?: number | null;
}

export function generateBillingSheetPdf(
  project: any,
  billing: any,
  products: any[],
  semen: any[],
  sessions: any[],
  labor: any[],
  totals: { productsTotal: number; semenTotal: number; laborTotal: number; grandTotal: number },
  sessionInventory: SessionInventoryCell[] = [],
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

  // Page 2: Field Sessions + Inventory Worksheet
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
      head: [["Date", "Event", "Time", "Head", "Crew", "Notes"]],
      body: sessBody,
      margin: { left: m, right: m },
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 7 },
      columnStyles: { 3: { halign: "right" } },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 12) + 8;

    // Inventory Worksheet
    if (sessionInventory.length > 0) {
      const sortedSessions = [...sessions].sort((a: any, b: any) => {
        const ao = a.sort_order ?? 0;
        const bo = b.sort_order ?? 0;
        if (ao !== bo) return ao - bo;
        return (a.session_date || "").localeCompare(b.session_date || "");
      });

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Inventory Tracking", m, y);
      y += 4;

      // Group inventory rows by bull
      const byBull = new Map<string, { bull_name: string; bull_code: string | null; rows: Map<string, Map<string, SessionInventoryCell>> }>();
      for (const inv of sessionInventory) {
        const bullKey = inv.bull_catalog_id || `name:${inv.bull_name}`;
        if (!byBull.has(bullKey)) {
          byBull.set(bullKey, { bull_name: inv.bull_name, bull_code: inv.bull_code, rows: new Map() });
        }
        const group = byBull.get(bullKey)!;
        if (!group.rows.has(inv.canister)) {
          group.rows.set(inv.canister, new Map());
        }
        group.rows.get(inv.canister)!.set(inv.session_id, inv);
      }

      const bulls = Array.from(byBull.entries()).sort((a, b) =>
        a[1].bull_name.localeCompare(b[1].bull_name)
      );

      for (const [, group] of bulls) {
        const rowCount = group.rows.size;
        const tableHeight = 12 + rowCount * 6 + 8;
        if (y + tableHeight > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 16;
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        const header = group.bull_code
          ? `${group.bull_name}  \u00B7  ${group.bull_code}`
          : group.bull_name;
        doc.text(header, m, y);
        y += 2;

        // Two-row header: Row 1 has Can./Packed with rowSpan, session dates with colSpan
        const headRow1: any[] = [
          { content: "Can.", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
          { content: "Packed", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
        ];
        for (const s of sortedSessions) {
          headRow1.push({
            content: format(parseISO(s.session_date), "MMM d"),
            colSpan: 2,
            styles: { halign: "center" as const },
          });
        }
        const headRow2: any[] = [];
        for (let i = 0; i < sortedSessions.length; i++) {
          headRow2.push({ content: "Start", styles: { halign: "center" as const, fontSize: 6 } });
          headRow2.push({ content: "End", styles: { halign: "center" as const, fontSize: 6 } });
        }

        const canisters = Array.from(group.rows.keys()).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );

        const body: any[] = [];
        for (const canister of canisters) {
          const sessMap = group.rows.get(canister)!;
          const firstSess = sortedSessions[0];
          const firstCell = firstSess ? sessMap.get(firstSess.id) : undefined;
          const packed = firstCell?.start_units ?? "";

          const row: any[] = [
            { content: canister, styles: { halign: "center" as const } },
            { content: String(packed), styles: { halign: "right" as const } },
          ];
          for (const s of sortedSessions) {
            const cell = sessMap.get(s.id);
            row.push({
              content: cell?.start_units != null ? String(cell.start_units) : "",
              styles: { halign: "right" as const },
            });
            row.push({
              content: cell?.end_units != null ? String(cell.end_units) : "",
              styles: { halign: "right" as const },
            });
          }
          body.push(row);
        }

        autoTable(doc, {
          startY: y,
          head: [headRow1, headRow2],
          body,
          margin: { left: m, right: m },
          styles: { fontSize: 7, cellPadding: 1.5, minCellHeight: 6 },
          headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 7 },
          alternateRowStyles: { fillColor: [250, 250, 250] },
        });
        y = ((doc as any).lastAutoTable?.finalY ?? y + 12) + 5;
      }
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(140);
      doc.text("Inventory worksheet not yet generated. Generate one on the Billing page to populate this section.", m, y);
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");
    }
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
