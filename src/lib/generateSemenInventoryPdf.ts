import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  getStandardHeadStylesDark,
  PDF_COLORS,
  PDF_FONTS,
} from "./pdfUtils";

interface InventoryRow {
  bullName: string;
  bullCode: string;
  customer: string;
  tankName: string;
  tankNumber: string;
  canister: string;
  subCanister: string;
  units: number;
  storageType: string;
  owner: string | null;
  inventoriedAt: string | null;
}

interface Filters {
  storageFilter: string;
  ownerFilter: string;
  search: string;
}

export function generateSemenInventoryPdf(rows: InventoryRow[], filters: Filters) {
  const doc = new jsPDF({ orientation: "landscape" });
  const today = format(new Date(), "MMM d, yyyy");

  // Header
  doc.setFontSize(PDF_FONTS.sizeMedium);
  doc.text("BeefSynch — Semen Inventory Report", 14, 18);
  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.setTextColor(PDF_COLORS.textGray);
  doc.text(`Generated: ${today}`, 14, 25);

  // Filter info
  const filterParts: string[] = [];
  if (filters.storageFilter !== "all") filterParts.push(`Storage: ${filters.storageFilter}`);
  if (filters.ownerFilter !== "all") filterParts.push(`Owner: ${filters.ownerFilter}`);
  if (filters.search) filterParts.push(`Search: "${filters.search}"`);
  if (filterParts.length > 0) {
    doc.text(`Filters: ${filterParts.join(" | ")}`, 14, 31);
  }

  doc.setTextColor(PDF_COLORS.textNormal);

  const startY = filterParts.length > 0 ? 36 : 30;

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);

  autoTable(doc, {
    startY,
    head: [["Bull Name", "Bull Code", "Customer", "Tank", "Tank #", "Canister", "Sub-can", "Units", "Storage", "Owner", "Last Inventoried"]],
    body: [
      ...rows.map((r) => [
        r.bullName,
        r.bullCode,
        r.customer,
        r.tankName,
        r.tankNumber,
        r.canister,
        r.subCanister,
        r.units.toString(),
        r.storageType,
        r.owner || "",
        r.inventoriedAt ? format(new Date(r.inventoriedAt), "MMM d, yyyy") : "",
      ]),
      ["", "", "", "", "", "", "Total", totalUnits.toString(), "", "", ""],
    ],
    styles: { fontSize: PDF_FONTS.sizeSmallTiny },
    headStyles: getStandardHeadStylesDark(),
    columnStyles: { 7: { halign: "right" } },
  });

  doc.save(`BeefSynch_Semen_Inventory_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
