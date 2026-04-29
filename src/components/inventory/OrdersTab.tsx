import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import {
  Search, Plus, CalendarIcon, Package, DollarSign, Clock, ShoppingCart, ClipboardList, ChevronDown, ChevronRight, Check,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrgRole } from "@/hooks/useOrgRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getBadgeClass } from "@/lib/badgeStyles";

type ChipFilter = "all" | "pending" | "fulfilled" | "invoiced";
type Tier = "pending" | "in_progress" | "fulfilled_invoiced";

// Classify an order into one of the three tiers (or null = excluded from default view).
// "invoiced" proxy: billing_status in ('invoiced','paid'). "not invoiced" = 'unbilled'.
// Note: prompt references invoice_number, but the schema only has billing_status — using that.
const classify = (o: any): Tier | "cancelled" | null => {
  const f = o.fulfillment_status;
  const b = o.billing_status;
  const isInvoiced = b === "invoiced" || b === "paid";

  if (f === "cancelled") return "cancelled";
  if (f === "pending") return "pending";
  if (f === "fulfilled" && !isInvoiced) return "pending"; // fulfilled-but-unbilled = still on plate
  if (f === "fulfilled" && isInvoiced) return "fulfilled_invoiced";
  // partially_fulfilled (and the data-actual spelling partially_filled), ready_to_close, ordered, shipped, backordered
  if (
    f === "partially_fulfilled" ||
    f === "partially_filled" ||
    f === "ready_to_close" ||
    f === "ordered" ||
    f === "shipped" ||
    f === "backordered"
  ) return "in_progress";
  return "in_progress";
};

const OrdersTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const { role } = useOrgRole();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<EditOrderData | null>(null);
  const [search, setSearch] = useState("");
  const [chipFilter, setChipFilter] = useState<ChipFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [subTab, setSubTab] = useState<"customer" | "inventory">("customer");
  const [newOrderDefaultType, setNewOrderDefaultType] = useState<"customer" | "inventory">("customer");
  const [tier3Open, setTier3Open] = useState(false);

  useEffect(() => {
    setSearch("");
    setChipFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  }, [subTab]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["semen_orders", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select("*, customers!semen_orders_customer_id_fkey(id, name), semen_companies!semen_orders_semen_company_id_fkey(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: receivedOrderIds = [] } = useQuery({
    queryKey: ["received_order_ids", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("semen_order_id")
        .eq("organization_id", orgId)
        .eq("status", "confirmed")
        .not("semen_order_id", "is", null);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => r.semen_order_id))];
    },
  });

  const receivedSet = useMemo(() => new Set(receivedOrderIds), [receivedOrderIds]);

  const customerOrders = useMemo(
    () => orders.filter((o: any) => o.order_type === "customer"),
    [orders]
  );
  const inventoryOrders = useMemo(
    () => orders.filter((o: any) => o.order_type === "inventory"),
    [orders]
  );

  const scopedOrders = subTab === "customer" ? customerOrders : inventoryOrders;

  // Apply search + date filters (chip filter handled separately for tier rendering)
  const baseFiltered = useMemo(() => scopedOrders.filter((o: any) => {
    if (search && !(o.customers?.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && isBefore(parseISO(o.order_date), dateFrom)) return false;
    if (dateTo && isAfter(parseISO(o.order_date), dateTo)) return false;
    return true;
  }), [scopedOrders, search, dateFrom, dateTo]);

  // Group into tiers (most-recent first within tier — query already orders by order_date DESC)
  const grouped = useMemo(() => {
    const tier1: any[] = []; // pending / unbilled
    const tier2: any[] = []; // in progress / partially fulfilled
    const tier3: any[] = []; // fulfilled & invoiced
    const cancelled: any[] = [];
    for (const o of baseFiltered) {
      const t = classify(o);
      if (t === "pending") tier1.push(o);
      else if (t === "in_progress") tier2.push(o);
      else if (t === "fulfilled_invoiced") tier3.push(o);
      else if (t === "cancelled") cancelled.push(o);
    }
    if (subTab === "inventory") {
      const sortReceived = (arr: any[]) => arr.sort((a: any, b: any) => {
        const aReceived = receivedSet.has(a.id) ? 1 : 0;
        const bReceived = receivedSet.has(b.id) ? 1 : 0;
        return aReceived - bReceived;
      });
      sortReceived(tier1);
      sortReceived(tier2);
    }
    return { tier1, tier2, tier3, cancelled };
  }, [baseFiltered, subTab, receivedSet]);

  const totalOrders = scopedOrders.length;
  const totalUnits = useMemo(() => scopedOrders.reduce((sum: number, o: any) =>
    sum + (o.semen_order_items?.reduce((s: number, i: any) => s + (i.units || 0), 0) ?? 0), 0), [scopedOrders]);
  const pendingCount = scopedOrders.filter((o: any) => o.fulfillment_status !== "fulfilled").length;
  const unbilledCount = scopedOrders.filter((o: any) => o.billing_status === "unbilled").length;

  const getBullSummary = (items: any[]) => {
    if (!items || items.length === 0) return "—";
    return items.map((i: any) => {
      const name = i.bulls_catalog?.bull_name || i.custom_bull_name || "Unknown";
      return `${name} — ${i.units || 0}`;
    }).join(", ");
  };
  const getOrderUnits = (items: any[]) => items ? items.reduce((s: number, i: any) => s + (i.units || 0), 0) : 0;

  // Render a row (desktop) — extracted for reuse across tiers
  const renderRow = (order: any) => (
    <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/semen-orders/${order.id}`)}>
      <TableCell className="font-medium whitespace-nowrap">{order.customers?.name || (order.order_type === "inventory" ? (order.placed_by ? `Inventory — ${order.placed_by}` : "Inventory Order") : "—")}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{order.semen_companies?.name || "—"}</TableCell>
      <TableCell className="whitespace-nowrap">{format(parseISO(order.order_date), "MMM d, yyyy")}</TableCell>
      <TableCell className="max-w-[250px] truncate">{getBullSummary(order.semen_order_items)}</TableCell>
      <TableCell className="text-right">{getOrderUnits(order.semen_order_items)}</TableCell>
      <TableCell><Badge variant="outline" className={cn("capitalize text-xs", getBadgeClass('orderFulfillment', order.fulfillment_status))}>{order.fulfillment_status}</Badge></TableCell>
      <TableCell><Badge variant="outline" className={cn("capitalize text-xs", getBadgeClass('orderBilling', order.billing_status))}>{order.billing_status}</Badge></TableCell>
      {subTab === "inventory" && (
        <TableCell>
          {order.order_type === "inventory" && receivedSet.has(order.id) && (
            <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30 text-xs gap-1">
              <Check className="h-3 w-3" /> Received
            </Badge>
          )}
        </TableCell>
      )}
    </TableRow>
  );

  // Render a card (mobile) — extracted for reuse across tiers
  const renderCard = (order: any) => {
    const customerName = order.customers?.name
      || (order.order_type === "inventory"
        ? (order.placed_by ? `Inventory — ${order.placed_by}` : "Inventory Order")
        : "—");
    const totalUnitsRow = getOrderUnits(order.semen_order_items);
    return (
      <div
        key={order.id}
        onClick={() => navigate(`/semen-orders/${order.id}`)}
        className="p-4 space-y-3 hover:bg-secondary/50 transition-colors cursor-pointer active:bg-secondary/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground truncate">{customerName}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="outline" className={cn("capitalize text-[10px]", getBadgeClass('orderFulfillment', order.fulfillment_status))}>
                {order.fulfillment_status}
              </Badge>
              <Badge variant="outline" className={cn("capitalize text-[10px]", getBadgeClass('orderBilling', order.billing_status))}>
                {order.billing_status}
              </Badge>
              {order.order_type === "inventory" && receivedSet.has(order.id) && (
                <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px] gap-0.5">
                  <Check className="h-2.5 w-2.5" /> Received
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold tabular-nums leading-none">{totalUnitsRow}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">units</div>
          </div>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-sm">
          {order.semen_companies?.name && (
            <>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Company</div>
              <div className="truncate">{order.semen_companies.name}</div>
            </>
          )}
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Date</div>
          <div>{format(parseISO(order.order_date), "MMM d, yyyy")}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Bulls</div>
          <div className="text-foreground space-y-0.5">
            {(order.semen_order_items || []).map((item: any, idx: number) => (
              <div key={idx} className="text-sm">
                {item.bulls_catalog?.bull_name || item.custom_bull_name || "Unknown"} — {item.units || 0}
              </div>
            ))}
            {(!order.semen_order_items || order.semen_order_items.length === 0) && (
              <div className="text-sm text-muted-foreground">No items</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Tier section component — desktop table version
  const TierSection = ({
    title, rows, defaultOpen, collapsible,
  }: { title: string; rows: any[]; defaultOpen: boolean; collapsible: boolean }) => {
    if (rows.length === 0) return null;
    const isOpen = collapsible ? tier3Open : true;
    return (
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {collapsible ? (
          <button
            onClick={() => setTier3Open(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold text-sm">{title}</span>
              <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs">{rows.length}</Badge>
            </div>
          </button>
        ) : (
          <div className="px-4 py-3 bg-muted/40 flex items-center gap-2">
            <span className="font-semibold text-sm">{title}</span>
            <Badge variant="secondary" className="h-5 px-2 text-xs">{rows.length}</Badge>
          </div>
        )}
        {isOpen && (
          <>
            {/* Desktop */}
            <div className="hidden xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="whitespace-nowrap">Customer Name</TableHead>
                    <TableHead className="whitespace-nowrap">Company</TableHead>
                    <TableHead className="whitespace-nowrap">Order Date</TableHead>
                    <TableHead className="whitespace-nowrap">Bulls</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Total Units</TableHead>
                    <TableHead className="whitespace-nowrap">Fulfillment</TableHead>
                    <TableHead className="whitespace-nowrap">Billing</TableHead>
                    {subTab === "inventory" && <TableHead className="whitespace-nowrap">Received</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>{rows.map(renderRow)}</TableBody>
              </Table>
            </div>
            {/* Mobile */}
            <div className="xl:hidden divide-y divide-border">
              {rows.map(renderCard)}
            </div>
          </>
        )}
      </div>
    );
  };

  // Build the list of orders per chip filter
  const flatList = useMemo(() => {
    if (chipFilter === "pending") return grouped.tier1;
    if (chipFilter === "fulfilled") return grouped.tier3;
    if (chipFilter === "invoiced") return grouped.tier3; // same proxy in this schema
    return [];
  }, [chipFilter, grouped]);

  const showTiers = chipFilter === "all";
  // For "All": cancelled rolls into tier 3 per spec
  const tier3Rows = chipFilter === "all"
    ? [...grouped.tier3, ...grouped.cancelled]
    : grouped.tier3;

  const noResults =
    (showTiers && grouped.tier1.length === 0 && grouped.tier2.length === 0 && tier3Rows.length === 0)
    || (!showTiers && flatList.length === 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold font-display tracking-tight">Semen Orders</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/planning")}>
            <ClipboardList className="h-4 w-4" /> Planning
          </Button>
          <Button className="gap-2" onClick={() => {
            setEditOrder(null);
            setNewOrderDefaultType(subTab);
            setDialogOpen(true);
          }}><Plus className="h-4 w-4" /> New Order</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("customer")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "customer"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Customer Orders
          <Badge variant="secondary" className="h-5 px-2 text-xs">{customerOrders.length}</Badge>
        </button>
        <button
          onClick={() => setSubTab("inventory")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "inventory"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Inventory Orders
          <Badge variant="secondary" className="h-5 px-2 text-xs">{inventoryOrders.length}</Badge>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Orders" value={totalOrders} delay={0} index={0} icon={ShoppingCart} />
        <StatCard title="Total Units" value={totalUnits} delay={100} index={1} icon={Package} />
        <StatCard title="Pending / Open" value={pendingCount} delay={200} index={2} icon={Clock} />
        <StatCard title="Unbilled" value={unbilledCount} delay={300} index={3} icon={DollarSign} />
      </div>

      {/* Filter chips (replaces fulfillment + billing dropdowns) */}
      <div className="flex flex-wrap gap-2 items-center">
        {([
          { key: "all", label: "All" },
          { key: "pending", label: "Pending" },
          { key: "fulfilled", label: "Fulfilled" },
          { key: "invoiced", label: "Invoiced" },
        ] as { key: ChipFilter; label: string }[]).map(chip => (
          <button
            key={chip.key}
            onClick={() => setChipFilter(chip.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              chipFilter === chip.key
                ? "bg-primary text-primary-foreground"
                : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Search + date range */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] max-w-xs relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateFrom && "text-muted-foreground")}><CalendarIcon className="h-4 w-4" />{dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" /></PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateTo && "text-muted-foreground")}><CalendarIcon className="h-4 w-4" />{dateTo ? format(dateTo, "MMM d, yyyy") : "To"}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" /></PopoverContent>
        </Popover>
        {(search || chipFilter !== "all" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setChipFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>Clear</Button>
        )}
      </div>

      {noResults && !isLoading ? (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <EmptyState
            icon={ShoppingCart}
            title={scopedOrders.length === 0
              ? subTab === "customer" ? "No customer orders" : "No inventory orders"
              : "No results"}
            description={scopedOrders.length === 0
              ? subTab === "customer"
                ? "No customer orders to display yet."
                : "No inventory orders to display yet."
              : "No orders match your filters. Try adjusting your filters."}
            action={scopedOrders.length === 0
              ? { label: "Create Order", onClick: () => {
                  setEditOrder(null);
                  setNewOrderDefaultType(subTab);
                  setDialogOpen(true);
                } }
              : undefined}
          />
        </div>
      ) : showTiers ? (
        <div className="space-y-4">
          <TierSection title="Pending / Unbilled" rows={grouped.tier1} defaultOpen collapsible={false} />
          <TierSection title="In Progress / Partially Fulfilled" rows={grouped.tier2} defaultOpen collapsible={false} />
          <TierSection title="Fulfilled & Invoiced" rows={tier3Rows} defaultOpen={false} collapsible />
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* Desktop */}
          <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="whitespace-nowrap">Customer Name</TableHead>
                  <TableHead className="whitespace-nowrap">Company</TableHead>
                  <TableHead className="whitespace-nowrap">Order Date</TableHead>
                  <TableHead className="whitespace-nowrap">Bulls</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total Units</TableHead>
                  <TableHead className="whitespace-nowrap">Fulfillment</TableHead>
                  <TableHead className="whitespace-nowrap">Billing</TableHead>
                  {subTab === "inventory" && <TableHead className="whitespace-nowrap">Received</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>{flatList.map(renderRow)}</TableBody>
            </Table>
          </div>
          {/* Mobile */}
          <div className="xl:hidden divide-y divide-border">
            {flatList.map(renderCard)}
          </div>
        </div>
      )}

      <NewOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editData={editOrder}
        initialOrderType={newOrderDefaultType}
      />
    </div>
  );
};

export default OrdersTab;
