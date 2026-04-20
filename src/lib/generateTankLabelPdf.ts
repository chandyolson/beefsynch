import jsPDF from "jspdf";

export function generateTankLabelPdf(bullName: string, units: number) {
  // DYMO 30327 file folder label: nominal 3-7/16" × 9/16" = 248pt × 40pt (landscape)
  // Right side of the label has a tab tang — printable area is narrower than nominal.
  // We keep the PDF at 248pt wide but pull text in from the right to stay inside the
  // printable area on DYMO's driver.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [40, 248] });

  const labelW = 248;
  const leftMargin = 4;
  const rightMargin = 14; // pulled inward so units don't clip on the tab tang

  // Font sizes — much bigger than pre-v21 (9pt / 10pt) while still fitting
  const BULL_FONT = 20;   // was 22 in first pass
  const UNITS_FONT = 22;  // was 26 in first pass — trimmed so "100u" clears the right edge

  // Reserve horizontal space on the right for the units text (measured, not fixed)
  const unitsText = `${units}u`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(UNITS_FONT);
  const unitsWidth = doc.getTextWidth(unitsText);
  const unitsReserve = unitsWidth + 8; // 8pt gap between bull name and units

  // Baseline y: optically centered for the taller font with room for descenders
  const baselineY = 29;

  // Draw units on the right, right-aligned, pulled inward by rightMargin
  doc.text(unitsText, labelW - rightMargin, baselineY, { align: "right" });

  // Draw bull name on the left, left-aligned, truncated to fit
  doc.setFontSize(BULL_FONT);
  const maxNameWidth = labelW - leftMargin - rightMargin - unitsReserve;
  let name = bullName || "";
  if (doc.getTextWidth(name) > maxNameWidth) {
    while (name.length > 3 && doc.getTextWidth(name + "…") > maxNameWidth) {
      name = name.slice(0, -1);
    }
    name += "…";
  }
  doc.text(name, leftMargin, baselineY);

  // Open in new tab for printing
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
