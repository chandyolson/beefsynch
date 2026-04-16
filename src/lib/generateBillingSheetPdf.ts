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
  returned_units: number | null;
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

    // Inventory Worksheet — vertical layout: one table per bull, sessions as rows
    if (sessionInventory.length > 0) {
      const breedingSessions = sessions.filter((s: any) => {
        const label = (s.session_label || "").toLowerCase();
        return label.includes("breed") || label.includes("ai ") || label === "ai";
      });
      const sortedSessions = [...breedingSessions].sort((a: any, b: any) => {
        const ao = a.sort_order ?? 0;
        const bo = b.sort_order ?? 0;
        if (ao !== bo) return ao - bo;
        return (a.session_date || "").localeCompare(b.session_date || "");
      });

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Inventory tracking", m, y);
      y += 4;

      type BullGroup = {
        bull_name: string;
        bull_code: string | null;
        canisters: Map<string, {
          sessions: Map<string, SessionInventoryCell>;
          returned_units: number | null;
        }>;
      };
      const byBull = new Map<string, BullGroup>();
      for (const inv of sessionInventory) {
        if (!sortedSessions.some((s: any) => s.id === inv.session_id)) continue;

        const bullKey = inv.bull_catalog_id || `name:${inv.bull_name}`;
        if (!byBull.has(bullKey)) {
          byBull.set(bullKey, { bull_name: inv.bull_name, bull_code: inv.bull_code, canisters: new Map() });
        }
        const group = byBull.get(bullKey)!;
        if (!group.canisters.has(inv.canister)) {
          group.canisters.set(inv.canister, { sessions: new Map(), returned_units: null });
        }
        const canGroup = group.canisters.get(inv.canister)!;
        canGroup.sessions.set(inv.session_id, inv);
        if (inv.returned_units != null) {
          canGroup.returned_units = inv.returned_units;
        }
      }

      const bulls = Array.from(byBull.entries()).sort((a, b) =>
        a[1].bull_name.localeCompare(b[1].bull_name)
      );

      for (const [, group] of bulls) {
        const firstSessId = sortedSessions[0]?.id;
        let packedTotal = 0;
        for (const [, canGroup] of group.canisters) {
          const firstCell = firstSessId ? canGroup.sessions.get(firstSessId) : undefined;
          packedTotal += firstCell?.start_units ?? 0;
        }

        const canCount = group.canisters.size;
        const rowsPerCan = sortedSessions.length + 1;
        const estHeight = 10 + (canCount * rowsPerCan * 5.5) + 4;
        if (y + estHeight > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 16;
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        const bullHeader = group.bull_code
          ? `${group.bull_name}  \u00B7  ${group.bull_code}  \u00B7  ${packedTotal} packed`
          : `${group.bull_name}  \u00B7  ${packedTotal} packed`;
        doc.text(bullHeader, m, y);
        y += 2;

        const canisters = Array.from(group.canisters.entries()).sort((a, b) =>
          a[0].localeCompare(b[0], undefined, { numeric: true })
        );

        const body: any[] = [];
        for (const [canister, canGroup] of canisters) {
          const rows = sortedSessions.length + 1;

          sortedSessions.forEach((s: any, sIdx: number) => {
            const cell = canGroup.sessions.get(s.id);
            const sessionLabel = `${s.session_label || "Breed"} \u00B7 ${format(parseISO(s.session_date), "MMM d")}`;
            const row: any[] = [];

            if (sIdx === 0) {
              row.push({ content: canister, rowSpan: rows, styles: { valign: "top" as const, halign: "center" as const, fontStyle: "bold" as const } });
            }

            row.push(sessionLabel);
            row.push({ content: cell?.start_units != null ? String(cell.start_units) : "", styles: { halign: "right" as const } });
            row.push({ content: cell?.end_units != null ? String(cell.end_units) : "", styles: { halign: "right" as const } });
            body.push(row);
          });

          const retRow: any[] = [
            { content: "Returned", styles: { fontStyle: "bold" as const } },
            { content: canGroup.returned_units != null ? String(canGroup.returned_units) : "", colSpan: 2, styles: { halign: "right" as const } },
          ];
          body.push(retRow);
        }

        autoTable(doc, {
          startY: y,
          head: [[
            { content: "Can.", styles: { halign: "center" as const } },
            "Session",
            { content: "Start", styles: { halign: "right" as const } },
            { content: "End", styles: { halign: "right" as const } },
          ]],
          body,
          margin: { left: m, right: m },
          styles: { fontSize: 7, cellPadding: 1.5, minCellHeight: 5.5 },
          headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 12 },
            2: { cellWidth: 18 },
            3: { cellWidth: 18 },
          },
          alternateRowStyles: { fillColor: [250, 250, 250] },
        });
        y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 5;
      }

      // ── Semen usage summary table ──
      if (y + 30 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 16;
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Semen usage summary", m, y);
      y += 2;

      const summaryBody: any[] = [];
      let grandPacked = 0, grandReturned = 0, grandBlown = 0;

      for (const [, group] of bulls) {
        const firstSessId = sortedSessions[0]?.id;
        let packed = 0, returned = 0;
        for (const [, canGroup] of group.canisters) {
          const firstCell = firstSessId ? canGroup.sessions.get(firstSessId) : undefined;
          packed += firstCell?.start_units ?? 0;
          returned += canGroup.returned_units ?? 0;
        }

        const semenLine = semen.find((sl: any) =>
          sl.bull_name === group.bull_name || sl.bull_code === group.bull_code
        );
        const blown = semenLine?.units_blown ?? 0;
        const used = packed - returned - blown;

        grandPacked += packed;
        grandReturned += returned;
        grandBlown += blown;

        summaryBody.push([
          group.bull_name,
          { content: String(packed), styles: { halign: "right" as const } },
          { content: returned > 0 ? String(returned) : "", styles: { halign: "right" as const } },
          { content: blown > 0 ? String(blown) : "", styles: { halign: "right" as const } },
          { content: (returned > 0 || blown > 0) ? String(used) : "", styles: { halign: "right" as const, fontStyle: "bold" as const } },
        ]);
      }

      const grandUsed = grandPacked - grandReturned - grandBlown;
      summaryBody.push([
        { content: "Total", styles: { fontStyle: "bold" as const } },
        { content: String(grandPacked), styles: { halign: "right" as const, fontStyle: "bold" as const } },
        { content: grandReturned > 0 ? String(grandReturned) : "", styles: { halign: "right" as const, fontStyle: "bold" as const } },
        { content: grandBlown > 0 ? String(grandBlown) : "", styles: { halign: "right" as const, fontStyle: "bold" as const } },
        { content: (grandReturned > 0 || grandBlown > 0) ? String(grandUsed) : "", styles: { halign: "right" as const, fontStyle: "bold" as const } },
      ]);

      autoTable(doc, {
        startY: y,
        head: [[
          "Bull",
          { content: "Packed", styles: { halign: "right" as const } },
          { content: "Ret'd", styles: { halign: "right" as const } },
          { content: "Blown", styles: { halign: "right" as const } },
          { content: "Used", styles: { halign: "right" as const } },
        ]],
        body: summaryBody,
        margin: { left: m, right: m },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 8 },
        columnStyles: {
          1: { cellWidth: 18 },
          2: { cellWidth: 18 },
          3: { cellWidth: 18 },
          4: { cellWidth: 18 },
        },
      });

      y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 4;
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(140);
      doc.text("Used = Packed \u2212 Returned \u2212 Blown", m, y);
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");

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
