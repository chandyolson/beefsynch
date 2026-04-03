import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface TankData {
  tank_name: string | null;
  tank_number: string;
  model: string | null;
}

interface InventoryItem {
  canister: string;
  sub_canister: string | null;
  bull_code: string | null;
  units: number;
  bulls_catalog?: {
    bull_name: string;
    company: string;
    registration_number?: string;
  } | null;
  custom_bull_name?: string | null;
}

interface CustomerData {
  name: string;
  phone: string | null;
  email: string | null;
}

export function generateCustomerInventoryPdf(
  customer: CustomerData,
  tanks: TankData[],
  inventoryByTank: Map<string, InventoryItem[]>,
  tankIds: string[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("BeefSynch — Customer Semen Inventory", pageWidth / 2, y, { align: "center" });
  y += 10;

  // Customer info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(customer.name, 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const contactParts: string[] = [];
  if (customer.phone) contactParts.push(customer.phone);
  if (customer.email) contactParts.push(customer.email);
  if (contactParts.length) {
    doc.text(contactParts.join("  •  "), 14, y);
    y += 5;
  }
  doc.text(`Report Date: ${format(new Date(), "MMMM d, yyyy")}`, 14, y);
  y += 8;

  let grandTotal = 0;

  for (const tankId of tankIds) {
    const tank = tanks.find((t: any) => t.id === tankId) as any;
    if (!tank) continue;
    const items = inventoryByTank.get(tankId) || [];
    const tankTotal = items.reduce((s, i) => s + (i.units || 0), 0);
    grandTotal += tankTotal;

    // Tank subheader
    const tankLabel = tank.tank_name
      ? `${tank.tank_name} — Tank #${tank.tank_number}`
      : `Tank #${tank.tank_number}`;
    const modelStr = tank.model ? ` (${tank.model})` : "";

    if (y > 260) { doc.addPage(); y = 18; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${tankLabel}${modelStr}`, 14, y);
    y += 2;

    const tableBody = items.map((item) => [
      item.canister,
      item.sub_canister || "",
      item.bulls_catalog?.bull_name || item.custom_bull_name || "",
      item.bull_code || "",
      item.bulls_catalog?.company || "",
      String(item.units),
    ]);

    tableBody.push(["", "", "", "", "Tank Total", String(tankTotal)]);

    autoTable(doc, {
      startY: y,
      head: [["Canister", "Sub-can", "Bull", "Bull Code", "Company", "Units"]],
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [41, 41, 41], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 5: { halign: "right" } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        // Bold the total row
        if (data.row.index === tableBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Grand total
  if (y > 270) { doc.addPage(); y = 18; }
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Grand Total: ${grandTotal} units`, 14, y);

  // Save
  const safeName = customer.name.replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = format(new Date(), "yyyy-MM-dd");
  doc.save(`BeefSynch_Inventory_${safeName}_${dateStr}.pdf`);
}
