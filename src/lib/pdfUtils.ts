import type jsPDF from "jspdf";

/**
 * Standard colors used across all PDF generators
 */
export const PDF_COLORS = {
  // Standard dark header color (most common)
  headFill: [60, 60, 60] as [number, number, number],
  // Alternative darker header (used in billing sheet)
  headFillDark: [41, 37, 36] as [number, number, number],
  // Text colors
  headText: 255,
  textNormal: 0,
  textGray: 100,
  textDimmed: 120,
  textLight: 140,
  // Line colors
  lineDark: 180,
  lineLight: 200,
} as const;

/**
 * Standard PDF layout configuration (margins, gaps, etc.)
 */
export const PDF_LAYOUT = {
  margin: 50,
  marginSmall: 40,
  marginMini: 14,
  gap: 20,
  gapSmall: 6,
  gapMini: 4,
  lineHeight: 15,
  lineHeightSmall: 14,
  footerOffset: 30,
  footerOffsetSmall: 20,
  footerOffsetMini: 8,
} as const;

/**
 * Font size presets used across generators
 */
export const PDF_FONTS = {
  // Sizes
  sizeLarge: 26,
  sizeLargeMedium: 22,
  sizeMedium: 18,
  sizeSubhead: 16,
  sizeBody: 12,
  sizeBodySmall: 11,
  sizeBodyTiny: 10,
  sizeSmall: 9,
  sizeSmallTiny: 8,
  sizeTiny: 7,
  sizeMini: 7.5,
} as const;

/**
 * Default product directions text (GnRH/PGF instructions)
 * Used in project-related PDFs
 */
export const DEFAULT_PRODUCT_DIRECTIONS = {
  gnrh: {
    products: "Cystorelin, Factrel, Fertagyl, Ovacyst",
    directions: "Give 2 cc's intramuscularly in the neck.",
  },
  pgf: {
    products: "Lutalyse, Prostamate, Synchsure, Estrumate",
    directionsLine1: "Give 2 cc's (Estrumate, Synchsure) or 5 cc's (Lutalyse, Prostamate)",
    directionsLine2: "intramuscularly in the neck.",
  },
} as const;

/**
 * Add footer text to all pages of a PDF
 * @param doc The jsPDF document
 * @param text Optional custom footer text. Defaults to "BeefSynch by Chuteside Resources"
 * @param yOffset Optional Y offset from bottom. Defaults to PDF_LAYOUT.footerOffset
 */
export function addFooterToPdf(
  doc: jsPDF,
  text: string = "BeefSynch by Chuteside Resources",
  yOffset: number = PDF_LAYOUT.footerOffset
): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(PDF_FONTS.sizeSmallTiny);
    doc.setTextColor(PDF_COLORS.textLight);
    doc.text(text, pageWidth / 2, pageHeight - yOffset, { align: "center" });
  }
  doc.setTextColor(PDF_COLORS.textNormal);
}

/**
 * Add standard header (title, subtitle, divider)
 * @param doc The jsPDF document
 * @param margin Left/right margin in points
 * @param title Main title text
 * @param subtitle Optional subtitle text
 * @returns The Y position after the header
 */
export function addStandardHeader(
  doc: jsPDF,
  margin: number,
  title: string,
  subtitle?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  // Main title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeLarge);
  doc.setTextColor(PDF_COLORS.textNormal);
  doc.text(title, margin, y);
  y += 18;

  // Subtitle (if provided)
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_FONTS.sizeBodySmall);
    doc.setTextColor(PDF_COLORS.textGray);
    doc.text(subtitle, margin, y);
    doc.setTextColor(PDF_COLORS.textNormal);
    y += 6;
  }

  // Divider line
  doc.setDrawColor(PDF_COLORS.lineDark);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += PDF_LAYOUT.gap;

  return y;
}

/**
 * Draw a horizontal divider line
 * @param doc The jsPDF document
 * @param x1 Start X coordinate
 * @param x2 End X coordinate
 * @param y Y coordinate
 * @param color Optional RGB color array. Defaults to lineDark.
 * @param lineWidth Optional line width. Defaults to 0.5.
 */
export function drawDividerLine(
  doc: jsPDF,
  x1: number,
  x2: number,
  y: number,
  color?: [number, number, number] | number,
  lineWidth: number = 0.5
): void {
  const c = color ?? PDF_COLORS.lineDark;
  if (Array.isArray(c)) {
    doc.setDrawColor(c[0], c[1], c[2]);
  } else {
    doc.setDrawColor(c);
  }
  doc.setLineWidth(lineWidth);
  doc.line(x1, y, x2, y);
}

/**
 * Sanitize a filename by removing unsafe characters
 * @param name The name to sanitize
 * @returns Safe filename string
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
}

/**
 * Build a standard PDF filename with prefix, name, and optional date
 * @param prefix The prefix (e.g., "BeefSynch_Order")
 * @param name The entity name
 * @param date Optional date string (YYYYMMDD format). If not provided, not included.
 * @returns The full filename with .pdf extension
 */
export function buildPdfFilename(prefix: string, name: string, date?: string): string {
  const safeName = sanitizeFilename(name);
  const parts = [prefix, safeName];
  if (date) parts.push(date);
  return `${parts.join("_")}.pdf`;
}

/**
 * Check if there's enough vertical space on the page, and optionally add a page break
 * @param doc The jsPDF document
 * @param currentY Current Y position
 * @param spaceNeeded Space required in points
 * @param resetY Optional Y position to reset to on new page. Defaults to PDF_LAYOUT.margin.
 * @returns The Y position (either currentY or resetY after adding page)
 */
export function ensurePageSpace(
  doc: jsPDF,
  currentY: number,
  spaceNeeded: number,
  resetY: number = PDF_LAYOUT.margin
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = PDF_LAYOUT.margin;

  if (currentY + spaceNeeded > pageHeight - bottomMargin) {
    doc.addPage();
    return resetY;
  }

  return currentY;
}

/**
 * Render a series of label-value info rows
 * @param doc The jsPDF document
 * @param rows Array of [label, value] tuples
 * @param margin Left/right margin
 * @param startY Starting Y position
 * @param labelWidth Width offset for value text (defaults to 110)
 * @returns The Y position after all rows
 */
export function renderInfoRows(
  doc: jsPDF,
  rows: Array<[string, string]>,
  margin: number,
  startY: number,
  labelWidth: number = 110
): number {
  let y = startY;
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);

  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + labelWidth, y);
    y += PDF_LAYOUT.lineHeight;
  }

  return y;
}

/**
 * Get standard header cell styles for autoTable
 * @returns autoTable headStyles configuration object
 */
export function getStandardHeadStyles() {
  return {
    fillColor: PDF_COLORS.headFill,
    textColor: PDF_COLORS.headText,
    fontStyle: "bold" as const,
  };
}

/**
 * Get alternative (darker) header cell styles for autoTable
 * @returns autoTable headStyles configuration object
 */
export function getStandardHeadStylesDark() {
  return {
    fillColor: PDF_COLORS.headFillDark,
    textColor: PDF_COLORS.headText,
    fontStyle: "bold" as const,
  };
}

/**
 * Get standard table theme configuration for autoTable
 * @returns autoTable theme configuration with standard colors and alternating rows
 */
export function getStandardTableTheme() {
  return {
    styles: { fontSize: PDF_FONTS.sizeBodyTiny, cellPadding: 5 },
    headStyles: getStandardHeadStyles(),
    alternateRowStyles: { fillColor: [245, 245, 245] },
  };
}
