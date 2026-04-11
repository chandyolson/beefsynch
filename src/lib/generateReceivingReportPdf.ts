import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface ReconciliationRow {
  bullName: string;
  ordered_units: number;
  received_units: number;
  delta: number;
  status: string;
}

interface Totals {
  total_ordered: number;
  total_received: number;
  lines_short: number;
  lines_over?: number;
  lines_added: number;
  lines_missing: number;
}

interface ShipmentMeta {
  received_from_name: string | null;
  received_date: string;
  received_by: string | null;
  notes: string | null;
  confirmed_at?: string | null;
}

export const generateReceivingReportPdf = (
  meta: ShipmentMeta,
  reconciliation: ReconciliationRow[],
  totals: Totals,
  isConfirmed: boolean
) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("BeefSynch", 14, 18);
  doc.setFontSize(14);
  doc.text(`Receiving Report${isConfirmed ? "" : " — DRAFT"}`, 14, 28);

  // Metadata
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 38;
  const addMeta = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y);
    y += 6;
  };

  addMeta("Received From", meta.received_from_name || "—");
  addMeta("Received Date", meta.received_date ? format(new Date(meta.received_date + "T00:00:00"), "MMM d, yyyy") : "—");
  addMeta("Received By", meta.received_by || "—");
  if (isConfirmed && meta.confirmed_at) {
    addMeta("Confirmed At", format(new Date(meta.confirmed_at), "MMM d, yyyy h:mm a"));
  }

  y += 4;

  // Reconciliation table
  const statusLabel = (s: string, delta: number) => {
    switch (s) {
      case "match": return "✓ Match";
      case "short": return `⚠ Short (${delta})`;
      case "over": return `+ Over (+${delta})`;
      case "added": return "+ Added";
      case "missing": return "✗ Missing";
      default: return s;
    }
  };

  autoTable(doc, {
    startY: y,
    head: [["Bull", "Ordered", "Received", "Delta", "Status"]],
    body: reconciliation.map((r) => [
      r.bullName,
      r.ordered_units.toString(),
      r.received_units.toString(),
      (r.delta >= 0 ? "+" : "") + r.delta.toString(),
      statusLabel(r.status, r.delta),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [41, 41, 41], textColor: 255 },
  });

  // Totals
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  let ty = finalY + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 14, ty);
  ty += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Total Ordered: ${totals.total_ordered}`, 14, ty); ty += 5;
  doc.text(`Total Received: ${totals.total_received}`, 14, ty); ty += 5;
  doc.text(`Net Difference: ${totals.total_received - totals.total_ordered}`, 14, ty); ty += 5;
  doc.text(`Lines Short: ${totals.lines_short} | Added: ${totals.lines_added} | Missing: ${totals.lines_missing}`, 14, ty);
  ty += 8;

  // Notes
  if (meta.notes) {
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", 14, ty);
    ty += 5;
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(meta.notes, pw - 28);
    doc.text(noteLines, 14, ty);
    ty += noteLines.length * 5;
  }

  // Packing slip note
  ty += 6;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Packing slip photo on file — view in BeefSynch", 14, ty);

  const dateStr = meta.received_date ? format(new Date(meta.received_date + "T00:00:00"), "yyyy-MM-dd") : "unknown";
  const filename = `Receiving Report — ${meta.received_from_name || "Unknown"} — ${dateStr}.pdf`;
  doc.save(filename);
};
