import jsPDF from "jspdf";

export function generateTankLabelPdf(bullName: string, units: number) {
  // DYMO 30327 file folder label: nominal 3-7/16" × 9/16" = 248pt × 40pt (landscape)
  // Right side of the label has a tab tang — printable area is narrower than nominal.
  // We keep the PDF at 248pt wide but pull text in from the right to stay inside the
  // printable area on DYMO's driver.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [40, 248] });

  const labelW = 248;
  const labelH = 40;
  // Symmetric inner margins — pulled in on both sides to clear the DYMO tab tang
  // and give the centered text room to breathe.
  const sideMargin = 18;

  // Font sizes — sized so typical bull names fit without truncation
  const BULL_FONT = 14;
  const UNITS_FONT = 16;

  // Build a single combined string and center it horizontally + vertically.
  const unitsText = `${units}`;
  const gap = 10; // gap between bull name and units count

  doc.setFont("helvetica", "bold");

  // Measure units width at its font size
  doc.setFontSize(UNITS_FONT);
  const unitsWidth = doc.getTextWidth(unitsText);

  // Truncate bull name to fit available width (label minus margins minus units minus gap)
  doc.setFontSize(BULL_FONT);
  const maxNameWidth = labelW - sideMargin * 2 - unitsWidth - gap;
  let name = bullName || "";
  if (doc.getTextWidth(name) > maxNameWidth) {
    while (name.length > 3 && doc.getTextWidth(name + "…") > maxNameWidth) {
      name = name.slice(0, -1);
    }
    name += "…";
  }
  const nameWidth = doc.getTextWidth(name);

  // Center the combined block (name + gap + units) horizontally
  const totalWidth = nameWidth + gap + unitsWidth;
  const startX = (labelW - totalWidth) / 2;

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
