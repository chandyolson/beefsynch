import jsPDF from "jspdf";

export function generateTankLabelPdf(bullName: string, units: number) {
  // DYMO 30327 file folder label: nominal 3-7/16" × 9/16" = 248pt × 40pt (landscape)
  // Right side of the label has a tab tang — printable area is narrower than nominal.
  // We keep the PDF at 248pt wide but pull text in from the right to stay inside the
  // printable area on DYMO's driver.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [40, 248] });

  const labelW = 248;
  const labelH = 40;
  // Left margin clears the DYMO tab tang. Right side reserves ~10 characters of
  // whitespace so the label can be folded over onto itself (file-folder style).
  const leftMargin = 14;
  // ~10 characters of whitespace at ~6pt per char of bold helvetica at this size
  const rightFoldReserve = 60;

  // Font sizes — sized so typical bull names fit without truncation
  const BULL_FONT = 14;
  const UNITS_FONT = 16;

  // Build a single combined string and center it within the printable (non-fold) area.
  const unitsText = `${units}`;
  const gap = 10; // gap between bull name and units count

  doc.setFont("helvetica", "bold");

  // Measure units width at its font size
  doc.setFontSize(UNITS_FONT);
  const unitsWidth = doc.getTextWidth(unitsText);

  // Printable area = label width minus left margin minus right fold reserve
  const printableWidth = labelW - leftMargin - rightFoldReserve;

  // Truncate bull name to fit available width (printable minus units minus gap)
  doc.setFontSize(BULL_FONT);
  const maxNameWidth = printableWidth - unitsWidth - gap;
  let name = bullName || "";
  if (doc.getTextWidth(name) > maxNameWidth) {
    while (name.length > 3 && doc.getTextWidth(name + "…") > maxNameWidth) {
      name = name.slice(0, -1);
    }
    name += "…";
  }
  const nameWidth = doc.getTextWidth(name);

  // Center the combined block (name + gap + units) within the printable area
  const totalWidth = nameWidth + gap + unitsWidth;
  const startX = leftMargin + (printableWidth - totalWidth) / 2;

  // Vertically center — baseline roughly at labelH/2 + font/3 for optical centering
  const baselineY = labelH / 2 + UNITS_FONT / 3;

  // Draw bull name (left part of the block)
  doc.setFontSize(BULL_FONT);
  doc.text(name, startX, baselineY);

  // Draw units (right part of the block)
  doc.setFontSize(UNITS_FONT);
  doc.text(unitsText, startX + nameWidth + gap, baselineY);

  // Open in new tab for printing
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
