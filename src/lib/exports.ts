import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
import { format } from "date-fns";

/**
 * Defines one column in an exported CSV / PDF.
 * `value` receives a row and returns the cell content as string/number.
 * Return null or undefined for blank cells (rendered as empty string).
 */
export type ExportColumn<T> = {
  label: string;
  value: (row: T) => string | number | null | undefined;
  /** Optional column width hint for PDF (in points). autoTable will auto-size if omitted. */
  pdfWidth?: number;
};

/**
 * Configuration for exporting a list to CSV or PDF.
 */
export type ExportConfig<T> = {
  /** Big title at the top of the PDF (e.g., "Tank List") */
  title: string;
  /** Optional subtitle line, typically a description of active filters (e.g., "All Types • Search: 'PETE' • 12 records") */
  subtitle?: string;
  /** Filename prefix in snake_case. Date stamp + extension appended automatically. e.g., "tanks" → tanks_20260415.csv */
  filenameBase: string;
  /** Column definitions, in the order they should appear */
  columns: ExportColumn<T>[];
  /** Optional override. Default: portrait if ≤6 columns, landscape if more. */
  orientation?: "portrait" | "landscape";
};

const todayStamp = () => format(new Date(), "yyyyMMdd");
const todayHuman = () => format(new Date(), "MMM d, yyyy");
const buildFilename = (base: string, ext: "csv" | "pdf") =>
  `${base}_${todayStamp()}.${ext}`;

const cellString = <T,>(col: ExportColumn<T>, row: T): string => {
  const v = col.value(row);
  if (v === null || v === undefined) return "";
  return String(v);
};

/**
 * Generate and download a CSV file.
 * - UTF-8 with BOM so Excel handles special characters (é, ñ, etc.) correctly.
 * - Comma-delimited.
 * - All fields quoted by papaparse to handle commas/quotes/newlines safely.
 */
export function exportToCsv<T>(config: ExportConfig<T>, rows: T[]): void {
  const headers = config.columns.map((c) => c.label);
  const data = rows.map((row) => config.columns.map((c) => cellString(c, row)));
  const csv = Papa.unparse(
    { fields: headers, data },
    { quotes: true, delimiter: ",", newline: "\r\n" }
  );
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, buildFilename(config.filenameBase, "csv"));
}

/**
 * Generate and download a PDF file.
 * Uses jsPDF + jspdf-autotable for the table layout.
 */
export function exportToPdf<T>(config: ExportConfig<T>, rows: T[]): void {
  const orientation =
    config.orientation ?? (config.columns.length > 6 ? "landscape" : "portrait");
  const doc = new jsPDF({ orientation, unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36; // half-inch

  // Header line
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(config.title, margin, 50);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`BeefSynch • ${todayHuman()}`, pageWidth - margin, 50, {
    align: "right",
  });

  if (config.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(config.subtitle, margin, 68);
  }
  doc.setTextColor(0);

  const head = [config.columns.map((c) => c.label)];
  const body = rows.map((row) =>
    config.columns.map((c) => cellString(c, row))
  );

  const columnStyles: Record<number, { cellWidth: number }> = {};
  config.columns.forEach((c, i) => {
    if (c.pdfWidth) columnStyles[i] = { cellWidth: c.pdfWidth };
  });

  autoTable(doc, {
    head,
    body,
    startY: config.subtitle ? 80 : 68,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [38, 70, 83], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles,
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 20,
        { align: "center" }
      );
    },
  });

  doc.save(buildFilename(config.filenameBase, "pdf"));
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
