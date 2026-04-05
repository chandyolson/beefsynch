import jsPDF from "jspdf";

export function generateTankLabelPdf(bullName: string, units: number) {
  // DYMO 30327 file folder label: 3-7/16" × 9/16" = 248pt × 40pt
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [40, 248] });
  const m = 4;
  const midY = 24;

  // Bull name — left aligned, bold, truncate if needed
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let name = bullName;
  const maxNameWidth = 248 - m * 2 - 40; // leave room for units on right
  if (doc.getTextWidth(name) > maxNameWidth) {
    while (doc.getTextWidth(name + "…") > maxNameWidth && name.length > 3) {
      name = name.slice(0, -1);
    }
    name += "…";
  }
  doc.text(name, m, midY);

  // Units — right aligned, bold
  doc.setFontSize(10);
  doc.text(`${units}u`, 248 - m, midY, { align: "right" });

  // Open in new tab for printing
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
