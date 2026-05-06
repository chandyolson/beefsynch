import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addFooterToPdf,
  getStandardHeadStylesDark,
  PDF_LAYOUT,
  sanitizeFilename,
} from "./pdfUtils";
import { formatTime12, isNoTimeEvent } from "./formatUtils";

interface PackInfo {
  status?: string | null;
  pack_type?: string | null;
  tanks?: { tank_number?: string | number | null; tank_name?: string | null } | null;
}

interface SemenSummary {
  bull_name: string;
  bull_code: string | null;
  units_packed: number | null;
  units_blown: number | null;
  units_billable: number | null;
}

interface SessionDetail {
  bull_name: string;
  bull_code: string | null;
  canister: string;
  packed: number;
  /** Keyed by session index (0-based): { start, end } */
  sessions: Record<number, { start: number | null; end: number | null }>;
  returned: number | null;
}

interface BreedingSession {
  id?: string;
  session_label: string | null;
  session_date: string;
  time_of_day: string | null;
  sort_order: number | null;
}

/**
 * Breeding Worksheet PDF — two pages.
 * Page 1 (portrait): protocol schedule, semen billable summary, products.
 * Page 2 (landscape): bull packed summary, session detail grid (S1–S4), notes.
 */
export function generateWorksheetPdf(
  project: any,
  events: any[],
  bulls: any[],
  products: any[],
  packInfo: PackInfo | null,
  /** Optional enhanced data — when provided, the full 2-page worksheet is generated */
  extra?: {
    semenLines?: SemenSummary[];
    breedingSessions?: BreedingSession[];
    sessionDetails?: SessionDetail[];
  },
) {
  const semenLines = extra?.semenLines ?? [];
  const breedingSessions = extra?.breedingSessions ?? [];
  const sessionDetails = extra?.sessionDetails ?? [];
  const hasEnhancedData = semenLines.length > 0;

  /* ════════════════════════════════════════════════
   * PAGE 1 — PORTRAIT — Billable items
   * ════════════════════════════════════════════════ */
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;

  /* ── Header ── */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("CATL RESOURCES", m, 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("Breeding Worksheet", m, 21);

  // Right side: protocol + cattle info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const rightLines: string[] = [];
  if (project.protocol) rightLines.push(project.protocol);
  const cattleParts = [project.cattle_type, project.head_count ? `${project.head_count} head` : null].filter(Boolean);
  if (cattleParts.length) rightLines.push(cattleParts.join(" · "));
  rightLines.forEach((line, i) => doc.text(line, pw - m, 14 + i * 5, { align: "right" }));
  doc.setTextColor(0);

  // Customer name + breeding date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(project.name || "Project", m, 30);

  if (project.breeding_date) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Breeding: ${format(parseISO(project.breeding_date), "MMMM d, yyyy")}`, pw - m, 30, { align: "right" });
    doc.setTextColor(0);
  }

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 34, pw - m, 34);

  let y = 40;

  /* ── Protocol Schedule ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Protocol schedule", m, y);

  const breedingDateStr = project.breeding_date || "";
  const eventBody = events.map((ev: any) => {
    const dateStr = ev.event_date ? format(parseISO(ev.event_date), "M/d") : "—";
    const timeStr = ev.event_time && !isNoTimeEvent(ev.event_name) ? formatTime12(ev.event_time) : "—";
    const isBreeding = ev.event_date === breedingDateStr;
    const style = isBreeding ? "bold" as const : "normal" as const;
    return [
      { content: dateStr, styles: { fontStyle: style } },
      { content: timeStr, styles: { fontStyle: style } },
      { content: ev.event_name || "", styles: { fontStyle: style } },
      "", // Labor — blank for handwriting
    ];
  });
  // Add one blank row for write-ins
  eventBody.push(["", "", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [["Date", "Time", "Event", "Labor"]],
    body: eventBody.length > 1 ? eventBody : [["—", "—", "No events scheduled", ""]],
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 16 },
      2: { cellWidth: "auto" },
      3: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const ev = events[data.row.index];
      if (ev && ev.event_date === breedingDateStr) {
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* ── Semen — Billable Summary ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Semen — billable summary", m, y);

  // Tank info line
  if (packInfo) {
    const tankLabel = packInfo.tanks?.tank_name || packInfo.tanks?.tank_number || "—";
    const totalPacked = semenLines.reduce((s, l) => s + (l.units_packed ?? 0), 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 4;
    doc.text(`Field tank: ${tankLabel}    ·    Total packed: ${totalPacked}    ·    Tank packed ☐    Tank unpacked ☐`, m, y);
  }

  const semenBody = (hasEnhancedData ? semenLines : bulls.map((b: any) => ({
    bull_name: b.bulls_catalog?.bull_name || b.custom_bull_name || "—",
    bull_code: b.bulls_catalog?.naab_code || b.bull_code || "",
    units_packed: b.units ?? null,
    units_blown: null,
    units_billable: null,
  }))).map(sl => [
    sl.bull_name,
    { content: sl.units_packed != null ? String(sl.units_packed) : "", styles: { halign: "center" as const } },
    { content: "", styles: { halign: "center" as const } }, // Used — blank
    { content: sl.units_blown != null ? String(sl.units_blown) : "", styles: { halign: "center" as const } },
    { content: sl.units_billable != null ? String(sl.units_billable) : "", styles: { halign: "center" as const } },
  ]);
  // Add blank rows
  for (let i = 0; i < 2; i++) semenBody.push(["", "", "", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [["Bull", { content: "Packed", styles: { halign: "center" as const } }, { content: "Used", styles: { halign: "center" as const } }, { content: "Blown", styles: { halign: "center" as const } }, { content: "Billable", styles: { halign: "center" as const } }]],
    body: semenBody,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 20 },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* ── Products ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Products", m, y);

  const visibleProducts = products.filter((p: any) =>
    (p.delivery_method && p.delivery_method !== "not_yet") ||
    (p.doses ?? 0) > 0 ||
    (p.units_billed ?? 0) > 0,
  );

  const formatQty = (p: any) => {
    const unitLabel = p.unit_label || "";
    if ((p.units_billed ?? 0) > 0) return `${p.units_billed} ${unitLabel}`.trim();
    const dpu = p.doses_per_unit;
    if ((p.doses ?? 0) > 0 && dpu && dpu > 0) return `${(p.doses / dpu).toFixed(1)} ${unitLabel}`.trim();
    if ((p.doses ?? 0) > 0) return `${p.doses} hd`;
    return "—";
  };

  const productBody = visibleProducts.map((p: any) => [
    p.product_name || "—",
    { content: formatQty(p), styles: { halign: "right" as const } },
    { content: "☐", styles: { halign: "center" as const, fontSize: 12 } },
  ]);
  // Add blank rows with checkboxes
  for (let i = 0; i < 4; i++) productBody.push(["", "", { content: "☐", styles: { halign: "center" as const, fontSize: 12 } }]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [["Product", { content: "Qty", styles: { halign: "right" as const } }, { content: "✓", styles: { halign: "center" as const } }]],
    body: productBody,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 28 },
      2: { cellWidth: 14 },
    },
  });

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* ════════════════════════════════════════════════
   * PAGE 2 — LANDSCAPE — Session detail + notes
   * ════════════════════════════════════════════════ */
  doc.addPage("letter", "landscape");
  const pw2 = doc.internal.pageSize.getWidth();
  const ph2 = doc.internal.pageSize.getHeight();

  /* ── Header recap ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(project.name || "Project", m, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const recapParts = [
    project.protocol,
    project.cattle_type,
    project.head_count ? `${project.head_count} hd` : null,
    project.breeding_date ? `Breeding: ${format(parseISO(project.breeding_date), "MMM d, yyyy")}` : null,
  ].filter(Boolean);
  doc.text(recapParts.join("  ·  "), pw2 - m, 14, { align: "right" });
  doc.setTextColor(0);

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 18, pw2 - m, 18);

  let y2 = 24;

  // Tank info
  if (packInfo) {
    const tankLabel = packInfo.tanks?.tank_name || packInfo.tanks?.tank_number || "—";
    const totalPacked = semenLines.reduce((s, l) => s + (l.units_packed ?? 0), 0) ||
      bulls.reduce((s: number, b: any) => s + (b.units ?? 0), 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Field tank: ${tankLabel}    ·    Total packed: ${totalPacked}`, m, y2);
    y2 += 6;
  }

  /* ── Total packed per bull ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total packed per bull", m, y2);
  y2 += 4;

  const bullSummaries = hasEnhancedData
    ? semenLines.map(sl => ({ name: sl.bull_name, packed: sl.units_packed ?? 0 }))
    : bulls.map((b: any) => ({
        name: b.bulls_catalog?.bull_name || b.custom_bull_name || "—",
        packed: b.units ?? 0,
      }));

  // Draw bull summary pills
  doc.setFontSize(9);
  let pillX = m;
  for (const bs of bullSummaries) {
    const label = `${bs.name}  ${bs.packed}`;
    const textWidth = doc.getTextWidth(label);
    const pillW = textWidth + 8;
    const pillH = 6;
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.roundedRect(pillX, y2, pillW, pillH, 1.5, 1.5);
    doc.setFont("helvetica", "normal");
    doc.text(bs.name, pillX + 3, y2 + 4.2);
    doc.setFont("helvetica", "bold");
    doc.text(String(bs.packed), pillX + 3 + doc.getTextWidth(bs.name + "  "), y2 + 4.2);
    pillX += pillW + 4;
    if (pillX > pw2 - 80) { pillX = m; y2 += pillH + 2; }
  }
  y2 += 10;

  /* ── Session detail grid ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Semen — session detail", m, y2);

  // Session legend
  const sortedBreedingSessions = [...breedingSessions].sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date));
  if (sortedBreedingSessions.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100);
    y2 += 3;
    const legend = sortedBreedingSessions.map((s, i) =>
      `S${i + 1} = ${s.session_label || "session"} (${format(parseISO(s.session_date), "M/d")}${s.time_of_day ? " " + s.time_of_day : ""})`
    ).join("  ·  ");
    doc.text(legend + "  ·  Start/End = tank counts before and after each session.", m, y2);
    doc.setTextColor(0);
    y2 += 2;
  }

  // Build session detail table — columns: Bull | Canister | Packed | S1 start | S1 end | S2 start | S2 end | S3 start | S3 end | S4 start | S4 end | Ret'd
  const maxSessions = 4;
  const sessionHead: any[] = ["Bull", "Canister", { content: "Packed", styles: { halign: "center" as const } }];
  for (let i = 0; i < maxSessions; i++) {
    sessionHead.push({ content: `S${i + 1} start`, styles: { halign: "center" as const } });
    sessionHead.push({ content: `S${i + 1} end`, styles: { halign: "center" as const } });
  }
  sessionHead.push({ content: "Ret'd", styles: { halign: "center" as const } });

  const sessionBody: any[][] = sessionDetails.map(sd => {
    const row: any[] = [
      sd.bull_name,
      sd.canister,
      { content: sd.packed ? String(sd.packed) : "", styles: { halign: "center" as const } },
    ];
    for (let i = 0; i < maxSessions; i++) {
      const sess = sd.sessions[i];
      row.push({ content: sess?.start != null ? String(sess.start) : "", styles: { halign: "center" as const } });
      row.push({ content: sess?.end != null ? String(sess.end) : "", styles: { halign: "center" as const } });
    }
    row.push({ content: sd.returned != null ? String(sd.returned) : "", styles: { halign: "center" as const } });
    return row;
  });

  // If no enhanced session details, fall back to bull list
  if (sessionBody.length === 0) {
    for (const b of bullSummaries) {
      const row: any[] = [b.name, "", { content: String(b.packed), styles: { halign: "center" as const } }];
      for (let i = 0; i < maxSessions * 2 + 1; i++) row.push({ content: "", styles: { halign: "center" as const } });
      sessionBody.push(row);
    }
  }

  // Blank rows for write-ins
  for (let i = 0; i < 4; i++) {
    const blank: any[] = ["", "", ""];
    for (let j = 0; j < maxSessions * 2 + 1; j++) blank.push("");
    sessionBody.push(blank);
  }

  // Column widths — total must fit landscape letter (279mm - 2*12mm margin = 255mm)
  const colStyles: Record<number, any> = {
    0: { cellWidth: 48 },  // Bull
    1: { cellWidth: 18 },  // Canister
    2: { cellWidth: 16 },  // Packed
  };
  for (let i = 0; i < maxSessions * 2; i++) {
    colStyles[3 + i] = { cellWidth: 18 };
  }
  colStyles[3 + maxSessions * 2] = { cellWidth: 16 }; // Ret'd

  autoTable(doc, {
    startY: y2 + 2,
    margin: { left: m, right: m },
    head: [sessionHead],
    body: sessionBody,
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
    columnStyles: colStyles,
  });
  y2 = (doc as any).lastAutoTable.finalY + 6;

  /* ── Notes ── */
  const notesAvailable = ph2 - y2 - 10;
  const lineSpacing = 7;
  const linesToDraw = Math.min(4, Math.max(2, Math.floor(notesAvailable / lineSpacing)));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Notes", m, y2);

  doc.setDrawColor(140);
  doc.setLineWidth(0.2);
  let noteY = y2 + 5;
  for (let i = 0; i < linesToDraw; i++) {
    doc.line(m, noteY, pw2 - m, noteY);
    noteY += lineSpacing;
  }

  /* ── Footer on both pages ── */
  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* ── Save ── */
  const safeName = sanitizeFilename(project.name || "project");
  doc.save(`BeefSynch_Breeding_Worksheet_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
