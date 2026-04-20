import jsPDF from "jspdf";

export function generateTankLabelPdf(bullName: string, units: number) {
  // DYMO 30327 file folder label: 3-7/16" × 9/16" = 248pt × 40pt (landscape)
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [40, 248] });

  const labelW = 248;
  const margin = 4;

  // Font sizes — significantly bigger than before
  const BULL_FONT = 22;   // was 9pt
  const UNITS_FONT = 26;  // was 10pt

  // Reserve horizontal space on the right for the units text
  const unitsText = `${units}u`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(UNITS_FONT);
  const unitsWidth = doc.getTextWidth(unitsText);
  const unitsReserve = unitsWidth + margin * 2;

  // Baseline y: optically centered for the taller of the two fonts
  // For a 40pt-tall label, baseline around y=29 gives visual center with room for descenders
  const baselineY = 29;

  // Draw units on the right, right-aligned
  doc.text(unitsText, labelW - margin, baselineY, { align: "right" });

  // Draw bull name on the left, left-aligned, truncated to fit
  doc.setFontSize(BULL_FONT);
  const maxNameWidth = labelW - margin * 2 - unitsReserve;
  let name = bullName || "";
  if (doc.getTextWidth(name) > maxNameWidth) {
    while (name.length > 3 && doc.getTextWidth(name + "…") > maxNameWidth) {
      name = name.slice(0, -1);
    }
    name += "…";
  }
  doc.text(name, margin, baselineY);

  // Open in new tab for printing
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
