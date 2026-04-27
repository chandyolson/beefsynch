import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, FileDown, Pencil, Trash2, Loader2, Package, HandCoins } from "lucide-react";
import { useOrgRole } from "@/hooks/useOrgRole";
import { DirectSaleDialog } from "@/components/orders/DirectSaleDialog";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { generateOrderPdf } from "@/lib/generateOrderPdf";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { OrderShipmentReconciliation } from "@/components/inventory/OrderShipmentReconciliation";
import { fulfillmentColors, billingColors } from "@/lib/badgeStyles";
import { InvoiceOrderModal } from "@/components/orders/InvoiceOrderModal";
import { MarkFulfilledModal } from "@/components/orders/MarkFulfilledModal";

interface OrderRow {
  id: string;
  customer_id: string | null;
  order_date: string;
  fulfillment_status: string;
  billing_status: string;
  project_id: string | null;
  semen_company_id: string | null;
  notes: string | null;
  placed_by: string | null;
  order_type: string;
  invoice_number: string | null;
  invoiced_at: string | null;
  manually_closed_at: string | null;
  manually_closed_by: string | null;
  manually_closed_reason: string | null;
  customers: { name: string; phone: string | null; email: string | null } | null;
}

interface ItemRow {
  id: string;
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    naab_code: string | null;
    breed: string;
  } | null;
}

interface ProjectRef {
  id: string;
  name: string;
}

// Given an array of unpack lines for a pack, return a map of
// "bull key" → total units_returned. Bull key is catalog_id if present,
// otherwise bull_name (to catch custom bulls).
function unpackReturnsByBull(unpackLines: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ul of (unpackLines || [])) {
    const key = ul.bull_catalog_id || ul.bull_name || "";
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (ul.units_returned || 0));
  }
  return map;
}

const SemenOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [packData, setPackData] = useState<any[]>([]);
  const [supplyItems, setSupplyItems] = useState<any[]>([]);
  const [availability, setAvailability] = useState<
    Record<string, { total: number; locations: Array<{ tank: string; canister: string; units: number; owner: string }> }>
  >({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [oRes, iRes] = await Promise.all([
        supabase.from("semen_orders").select("*, customers!semen_orders_customer_id_fkey(name, phone, email)").eq("id", id).single(),
        supabase
          .from("semen_order_items")
          .select("*, bulls_catalog(bull_name, company, registration_number, naab_code, breed)")
          .eq("semen_order_id", id),
      ]);

      if (oRes.error) {
        console.error("Order load error:", oRes.error);
        toast({ title: "Error loading order", description: oRes.error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (oRes.data) {
        setOrder(oRes.data as unknown as OrderRow);
        if (oRes.data.project_id) {
          const { data: pData } = await supabase
            .from("projects")
            .select("id, name")
            .eq("id", oRes.data.project_id)
            .single();
          if (pData) setProject(pData as ProjectRef);
        }
        if (oRes.data.semen_company_id) {
          const { data: cData } = await supabase
            .from("semen_companies")
            .select("name")
            .eq("id", oRes.data.semen_company_id)
            .single();
          if (cData) setCompanyName(cData.name);
        } else {
          setCompanyName(null);
        }
      }
      if (iRes.data) setItems(iRes.data as ItemRow[]);

      // Fetch linked packs (for customer orders filled from inventory)
      const { data: packLinks } = await supabase
        .from("tank_pack_orders")
        .select(`
          tank_pack_id,
          tank_packs(
            id, status, pack_type, packed_at, field_tank_id,
            tanks!tank_packs_field_tank_id_fkey(tank_number, tank_name),
            tank_pack_lines(bull_name, bull_code, bull_catalog_id, units, source_tank_id, source_canister, field_canister,
              tanks!tank_pack_lines_source_tank_id_fkey(tank_number, tank_name)
            ),
            tank_unpack_lines(bull_name, bull_code, bull_catalog_id, units_returned, destination_canister, destination_tank_id,
              tanks!tank_unpack_lines_destination_tank_id_fkey(tank_number, tank_name)
            )
          )
        `)
        .eq("semen_order_id", id);
      setPackData(packLinks || []);

      // Fetch supply items for this order
      const { data: supplyData } = await (supabase as any)
        .from("order_supply_items")
        .select("*")
        .eq("semen_order_id", id)
        .order("created_at");
      setSupplyItems(supplyData ?? []);
    } catch (err: any) {
      console.error("Order detail load failed:", err);
      toast({ title: "Error loading order", description: err?.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  // Fetch availability-in-inventory for each bull on the order
  useEffect(() => {
    if (!items || items.length === 0) return;
    setAvailabilityLoading(true);
    (async () => {
      try {
        const catalogIds = items.filter((i) => i.bull_catalog_id).map((i) => i.bull_catalog_id as string);
        const customNames = items
          .filter((i) => !i.bull_catalog_id && i.custom_bull_name)
          .map((i) => i.custom_bull_name as string);

        const orFilters: string[] = [];
        if (catalogIds.length > 0) orFilters.push(`bull_catalog_id.in.(${catalogIds.join(",")})`);
        if (customNames.length > 0) {
          const safeNames = customNames.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
          orFilters.push(`custom_bull_name.in.(${safeNames})`);
        }
        if (orFilters.length === 0) {
          setAvailability({});
          return;
        }

        const { data, error } = await supabase
          .from("tank_inventory")
          .select("bull_catalog_id, custom_bull_name, canister, units, owner, storage_type, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
          .eq("storage_type", "inventory")
          .in("owner", ["Select", "CATL"])
          .gt("units", 0)
          .or(orFilters.join(","));

        if (error) throw error;

        const mapByKey: Record<string, { total: number; locations: Array<{ tank: string; canister: string; units: number; owner: string }> }> = {};
        for (const row of (data || []) as any[]) {
          const key = row.bull_catalog_id || `custom:${row.custom_bull_name}`;
          if (!mapByKey[key]) mapByKey[key] = { total: 0, locations: [] };
          mapByKey[key].total += row.units;
          mapByKey[key].locations.push({
            tank: row.tanks?.tank_name || row.tanks?.tank_number || "—",
            canister: row.canister || "?",
            units: row.units,
            owner: row.owner,
          });
        }

        const byItemId: Record<string, { total: number; locations: Array<{ tank: string; canister: string; units: number; owner: string }> }> = {};
        for (const item of items) {
          const key = item.bull_catalog_id || `custom:${item.custom_bull_name}`;
          byItemId[item.id] = mapByKey[key] || { total: 0, locations: [] };
        }
        setAvailability(byItemId);
      } catch (err) {
        console.error("Failed to load inventory availability", err);
        setAvailability({});
      } finally {
        setAvailabilityLoading(false);
      }
    })();
  }, [items]);

  const openEdit = () => {
    if (!order) return;
    setEditOpen(true);
  };

  const handleDeleteOrder = async () => {
    if (!id) return;
    setDeletingOrder(true);
    try {
      const { error } = await supabase.from("semen_orders").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Order deleted" });
      navigate("/inventory-dashboard?tab=orders");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingOrder(false);
    }
  };

  const getEditData = (): EditOrderData | null => {
    if (!order) return null;
    return {
      id: order.id,
      customer_id: order.customer_id,
      order_date: order.order_date,
      fulfillment_status: order.fulfillment_status,
      billing_status: order.billing_status,
      project_id: order.project_id,
      semen_company_id: order.semen_company_id,
      notes: order.notes,
      placed_by: order.placed_by,
      order_type: order.order_type,
      inventory_owner: (order as any).inventory_owner ?? null,
      needed_by: (order as any).needed_by ?? null,
      bulls: items.map((i) => ({
        name: i.bulls_catalog?.bull_name || i.custom_bull_name || "",
        catalogId: i.bull_catalog_id,
        naabCode: i.bulls_catalog?.naab_code ?? null,
        units: i.units,
      })),
    };
  };

  const customerName = order?.customers?.name || "—";

  const handleExportPdf = () => {
    if (!order) return;

    const totalOrdered = items.reduce((s, i) => s + (i.units || 0), 0);

    let reconData: {
      type: "packed";
      lines: { bull_name: string; bull_code: string | null; units: number; source: string }[];
      totalOrdered: number;
      totalFulfilled: number;
    } | null = null;

    if (order.order_type === "customer" && packData && packData.length > 0) {
      const lines: { bull_name: string; bull_code: string | null; units: number; source: string }[] = [];
      for (const link of packData) {
        const pack = link.tank_packs;
        if (!pack) continue;
        const returnsByBull = unpackReturnsByBull(pack.tank_unpack_lines || []);
        for (const line of (pack.tank_pack_lines || [])) {
          const srcTank = line.tanks;
          const key = line.bull_catalog_id || line.bull_name || "";
          const returned = returnsByBull.get(key) || 0;
          const used = Math.max(0, (line.units || 0) - returned);
          lines.push({
            bull_name: line.bull_name,
            bull_code: line.bull_code || null,
            units: used,
            source: srcTank ? `${srcTank.tank_number}${srcTank.tank_name ? " — " + srcTank.tank_name : ""}` : "—",
          });
        }
      }
      reconData = {
        type: "packed",
        lines,
        totalOrdered,
        totalFulfilled: lines.reduce((s, l) => s + l.units, 0),
      };
    }

    generateOrderPdf(
      {
        customer_name: customerName,
        order_date: order.order_date,
        fulfillment_status: order.fulfillment_status,
        billing_status: order.billing_status,
        notes: order.notes,
        project_name: project?.name || null,
      },
      items,
      reconData,
      supplyItems,
    );
    toast({ title: "PDF downloaded" });
  };

  const totalUnits = items.reduce((s, i) => s + (i.units || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Order not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Top actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {order.order_type === "customer" && (
              <Button
                size="sm"
                onClick={() => navigate(`/pack-tank?packType=order&orderId=${id}`)}
              >
                <Package className="h-4 w-4 mr-1" /> Fill from Inventory
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/receive-shipment?order=${id}`)}
            >
              <Package className="h-4 w-4 mr-1" /> Receive Shipment
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDown className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Edit Order
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete Order
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Order</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the order for {customerName}. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteOrder}
                    disabled={deletingOrder}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deletingOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display tracking-tight">{customerName}</h1>
            {order.order_type === "inventory" && (
              <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                Inventory Order
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Order Date: {format(parseISO(order.order_date), "MMMM d, yyyy")}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={cn("capitalize text-xs", fulfillmentColors[order.fulfillment_status] || "")}>
              {order.fulfillment_status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className={cn("capitalize text-xs", billingColors[order.billing_status] || "")}>
              {order.billing_status}
            </Badge>
            {order.invoice_number && (
              <Badge variant="outline" className="text-xs">
                #{order.invoice_number}
              </Badge>
            )}
          </div>

          {order.order_type === "customer" && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {order.fulfillment_status === "partially_fulfilled" && (
                <MarkFulfilledModal
                  orderId={order.id}
                  customerName={customerName}
                  unitsOrdered={items.reduce((s, i) => s + (i.units || 0), 0)}
                  unitsFilled={packData.reduce((s: number, link: any) => {
                    const lines = link.tank_packs?.tank_pack_lines || [];
                    return s + lines.reduce((s2: number, l: any) => s2 + (l.units || 0), 0);
                  }, 0)}
                  trigger={<Button size="sm" variant="outline">Mark Fulfilled</Button>}
                  onSuccess={() => load()}
                />
              )}
              {order.billing_status === "unbilled" &&
                ["partially_fulfilled", "fulfilled"].includes(
                  order.fulfillment_status,
                ) && (
                  <InvoiceOrderModal
                    orderId={order.id}
                    customerName={customerName}
                    trigger={<Button size="sm">Invoice</Button>}
                    onSuccess={() => load()}
                  />
                )}
            </div>
          )}
        </div>

        {/* Details card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Customer</span>
              <p className="font-medium">
                {order.customer_id ? (
                  <Link to={`/customers/${order.customer_id}`} className="text-primary hover:underline">
                    {customerName}
                  </Link>
                ) : customerName}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p className="font-medium">{order.customers?.phone || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium">{order.customers?.email || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Order Date</span>
              <p className="font-medium">{format(parseISO(order.order_date), "MMMM d, yyyy")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Placed By</span>
              <p className="font-medium">{order.placed_by || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fulfillment Status</span>
              <p className="font-medium capitalize">{order.fulfillment_status.replace(/_/g, " ")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Billing Status</span>
              <p className="font-medium capitalize">{order.billing_status}</p>
              {order.invoice_number && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Invoice #{order.invoice_number}
                </p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Semen Company</span>
              <p className="font-medium">{companyName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Linked Project</span>
              <p className="font-medium">
                {project ? (
                  <Link to={`/project/${project.id}`} className="text-primary hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Notes</span>
              <p className="font-medium whitespace-pre-wrap">{order.notes || "—"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Bulls & Units card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bulls & Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Bull Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Reg #</TableHead>
                    <TableHead>In Inventory</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No bulls added to this order.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {items.map((item) => {
                        const avail = availability[item.id];
                        const availTotal = avail?.total ?? 0;
                        const ordered = item.units ?? 0;
                        const hasEnough = availTotal >= ordered;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.bulls_catalog?.bull_name || item.custom_bull_name || "Unknown"}{item.bulls_catalog?.naab_code ? ` (${item.bulls_catalog.naab_code})` : ""}
                            </TableCell>
                            <TableCell>{item.bulls_catalog?.company || "—"}</TableCell>
                            <TableCell>
                              {item.bulls_catalog?.registration_number ? (
                                <ClickableRegNumber
                                  registrationNumber={item.bulls_catalog.registration_number}
                                  breed={item.bulls_catalog.breed}
                                />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              {availabilityLoading ? (
                                <span className="text-xs text-muted-foreground">Loading...</span>
                              ) : availTotal === 0 ? (
                                <span className="text-xs font-medium text-destructive">0u — order from stud</span>
                              ) : (
                                <div className="space-y-1">
                                  <div
                                    className={cn(
                                      "text-xs font-semibold",
                                      hasEnough ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                                    )}
                                  >
                                    {availTotal}u available{!hasEnough && ` (need ${ordered - availTotal} more)`}
                                  </div>
                                  <div className="space-y-0.5">
                                    {avail!.locations.map((loc, idx) => (
                                      <div key={idx} className="text-[11px] text-muted-foreground">
                                        {loc.tank} / can {loc.canister} — {loc.units}u ({loc.owner})
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{item.units}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/20 font-bold">
                        <TableCell colSpan={4} className="text-right">Total</TableCell>
                        <TableCell className="text-right">{totalUnits}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Supplies card */}
        {supplyItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Supplies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplyItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-muted-foreground">{item.unit_label || "—"}</TableCell>
                        <TableCell className="text-right">${(Number(item.unit_price) || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${(Number(item.line_total) || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/20 font-bold">
                      <TableCell colSpan={4} className="text-right">
                        Supplies Total
                      </TableCell>
                      <TableCell className="text-right">
                        ${supplyItems.reduce((s: number, i: any) => s + (Number(i.line_total) || 0), 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Packed for this Order (customer orders filled from inventory) */}
        {order.order_type === "customer" && packData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Packed for this Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {packData.map((link: any) => {
                const pack = link.tank_packs;
                if (!pack) return null;
                const fieldTank = pack.tanks;
                const lines = pack.tank_pack_lines || [];
                const unpackLines = pack.tank_unpack_lines || [];
                const hasReturns = unpackLines.length > 0;
                const returnsByBull = unpackReturnsByBull(unpackLines);

                const totalPacked = lines.reduce((s: number, l: any) => s + (l.units || 0), 0);
                const totalReturned = unpackLines.reduce((s: number, l: any) => s + (l.units_returned || 0), 0);
                const totalUsed = totalPacked - totalReturned;

                return (
                  <div key={pack.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {fieldTank ? `${fieldTank.tank_number}${fieldTank.tank_name ? ` — ${fieldTank.tank_name}` : ""}` : "Unknown tank"}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">{pack.status}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Packed {pack.packed_at ? format(new Date(pack.packed_at), "MMM d, yyyy") : ""}
                      </span>
                    </div>

                    <div className="rounded-lg border border-border/50 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Bull</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Source Tank</TableHead>
                            <TableHead>Field Can</TableHead>
                            <TableHead className="text-right">Packed</TableHead>
                            {hasReturns && <TableHead className="text-right">Returned</TableHead>}
                            {hasReturns && <TableHead className="text-right">Used</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line: any, i: number) => {
                            const srcTank = line.tanks;
                            const key = line.bull_catalog_id || line.bull_name || "";
                            const returned = returnsByBull.get(key) || 0;
                            const used = Math.max(0, (line.units || 0) - returned);
                            return (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{line.bull_name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{line.bull_code || "—"}</TableCell>
                                <TableCell className="text-sm">{srcTank ? `${srcTank.tank_number}${srcTank.tank_name ? ` — ${srcTank.tank_name}` : ""}` : "—"}</TableCell>
                                <TableCell className="text-sm">{line.field_canister || "—"}</TableCell>
                                <TableCell className="text-right">{line.units}</TableCell>
                                {hasReturns && (
                                  <TableCell className="text-right text-muted-foreground">{returned || "—"}</TableCell>
                                )}
                                {hasReturns && (
                                  <TableCell className="text-right font-medium">{used}</TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/20 font-bold">
                            <TableCell colSpan={4} className="text-right">Totals</TableCell>
                            <TableCell className="text-right">{totalPacked}</TableCell>
                            {hasReturns && <TableCell className="text-right">{totalReturned}</TableCell>}
                            {hasReturns && <TableCell className="text-right">{totalUsed}</TableCell>}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {hasReturns && (
                      <details className="text-xs text-muted-foreground pl-1">
                        <summary className="cursor-pointer hover:text-foreground">
                          Show unpack detail ({unpackLines.length} return line{unpackLines.length === 1 ? "" : "s"})
                        </summary>
                        <div className="mt-1 space-y-0.5">
                          {unpackLines.map((ul: any, i: number) => (
                            <div key={i} className="flex gap-3">
                              <span className="font-medium text-foreground">{ul.bull_name}</span>
                              <span>{ul.units_returned}u returned</span>
                              <span>→ {ul.tanks ? `${ul.tanks.tank_number}${ul.tanks.tank_name ? ` (${ul.tanks.tank_name})` : ""}` : "unknown tank"}</span>
                              {ul.destination_canister && <span>· can. {ul.destination_canister}</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm px-1">
                      <span className="text-muted-foreground">Ordered: <span className="font-medium text-foreground">{totalUnits}</span></span>
                      <span className="text-muted-foreground">Packed: <span className="font-medium text-foreground">{totalPacked}</span></span>
                      {hasReturns && (
                        <span className="text-muted-foreground">Returned: <span className="font-medium text-foreground">{totalReturned}</span></span>
                      )}
                      {hasReturns && (
                        <span className="text-muted-foreground">Used: <span className="font-medium text-foreground">{totalUsed}</span></span>
                      )}
                      {(() => {
                        const delivered = hasReturns ? totalUsed : totalPacked;
                        if (delivered >= totalUnits) {
                          return <span className="text-emerald-500 font-medium">✓ Fully filled</span>;
                        }
                        return <span className="text-amber-500 font-medium">{totalUnits - delivered} outstanding</span>;
                      })()}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Reconciliation card only applies to inventory orders (POs from semen companies).
            Customer orders are filled by packing from existing tank inventory, which is
            already shown in the "Packed for this Order" card above. */}
        {id && order?.order_type === "inventory" && <OrderShipmentReconciliation orderId={id} />}
      </div>

      <NewOrderDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) load();
        }}
        editData={getEditData()}
      />
      <AppFooter />
    </div>
  );
};

export default SemenOrderDetail;
