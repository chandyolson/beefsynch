import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import {
  Search, Plus, CalendarIcon, Package, DollarSign, Clock, ShoppingCart, ClipboardList,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrgRole } from "@/hooks/useOrgRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getBadgeClass } from "@/lib/badgeStyles";

const OrdersTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const { role } = useOrgRole();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<EditOrderData | null>(null);
  const [search, setSearch] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [billingFilter, setBillingFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["semen_orders", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select("*, customers(id, name), semen_companies(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => orders.filter((o: any) => {
    if (search && !(o.customers?.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (fulfillmentFilter !== "all" && o.fulfillment_status !== fulfillmentFilter) return false;
    if (billingFilter !== "all" && o.billing_status !== billingFilter) return false;
    if (dateFrom && isBefore(parseISO(o.order_date), dateFrom)) return false;
    if (dateTo && isAfter(parseISO(o.order_date), dateTo)) return false;
    return true;
  }), [orders, search, fulfillmentFilter, billingFilter, dateFrom, dateTo]);

  const totalOrders = orders.length;
  const totalUnits = useMemo(() => orders.reduce((sum: number, o: any) =>
    sum + (o.semen_order_items?.reduce((s: number, i: any) => s + (i.units || 0), 0) ?? 0), 0), [orders]);
  const pendingCount = orders.filter((o: any) => o.fulfillment_status !== "delivered").length;
  const unbilledCount = orders.filter((o: any) => o.billing_status === "unbilled").length;

  const getBullNames = (items: any[]) => {
    if (!items || items.length === 0) return "—";
    return items.map((i: any) => i.bulls_catalog?.bull_name || i.custom_bull_name || "Unknown").join(", ");
  };
  const getOrderUnits = (items: any[]) => items ? items.reduce((s: number, i: any) => s + (i.units || 0), 0) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold font-display tracking-tight">Semen Orders</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/planning")}>
            <ClipboardList className="h-4 w-4" /> Planning
          </Button>
          <Button className="gap-2" onClick={() => { setEditOrder(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> New Order</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Orders" value={totalOrders} delay={0} index={0} icon={ShoppingCart} />
        <StatCard title="Total Units" value={totalUnits} delay={100} index={1} icon={Package} />
        <StatCard title="Pending / Open" value={pendingCount} delay={200} index={2} icon={Clock} />
        <StatCard title="Unbilled" value={unbilledCount} delay={300} index={3} icon={DollarSign} />
      </div>

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
        <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Fulfillment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Fulfillment</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="backordered">Backordered</SelectItem>
            <SelectItem value="partially filled">Partially Filled</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
        <Select value={billingFilter} onValueChange={setBillingFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Billing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="unbilled">Unbilled</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        {(search || fulfillmentFilter !== "all" || billingFilter !== "all" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFulfillmentFilter("all"); setBillingFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>Clear</Button>
        )}
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && !isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={ShoppingCart}
                    title={orders.length === 0 ? "No semen orders" : "No results"}
                    description={orders.length === 0 ? "No orders to display yet." : "No orders match your filters. Try adjusting your filters."}
                    action={orders.length === 0 ? { label: "Create Order", onClick: () => { setEditOrder(null); setDialogOpen(true); } } : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order: any) => (
                <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/semen-orders/${order.id}`)}>
                  <TableCell className="font-medium whitespace-nowrap">{order.customers?.name || (order.order_type === "inventory" ? (order.placed_by ? `Inventory — ${order.placed_by}` : "Inventory Order") : "—")}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{order.semen_companies?.name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{format(parseISO(order.order_date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="max-w-[250px] truncate">{getBullNames(order.semen_order_items)}</TableCell>
                  <TableCell className="text-right">{getOrderUnits(order.semen_order_items)}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("capitalize text-xs", getBadgeClass('orderFulfillment', order.fulfillment_status))}>{order.fulfillment_status}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={cn("capitalize text-xs", getBadgeClass('orderBilling', order.billing_status))}>{order.billing_status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <NewOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} editData={editOrder} />
    </div>
  );
};

export default OrdersTab;
