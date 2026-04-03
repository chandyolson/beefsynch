import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { Eye, Trash2, Plus, CalendarIcon, Search, Package, DollarSign, Clock, ShoppingCart } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const fulfillmentColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  backordered: "bg-red-500/20 text-red-300 border-red-500/30",
  "partially filled": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  ordered: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  shipped: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  delivered: "bg-green-500/20 text-green-300 border-green-500/30",
};

const billingColors: Record<string, string> = {
  unbilled: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  invoiced: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
};

const SemenOrders = () => {
  const navigate = useNavigate();
  const { orgId, role } = useOrgRole();
  const queryClient = useQueryClient();
  const canDelete = role === "owner" || role === "admin";

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<EditOrderData | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [billingFilter, setBillingFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Fetch orders with items
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["semen_orders", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select("*, semen_companies(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId!)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("semen_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semen_orders"] });
      toast({ title: "Order deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not delete order.", variant: "destructive" });
    },
  });

  // Filtered orders
  const filtered = useMemo(() => {
    return orders.filter((o: any) => {
      if (search && !o.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (fulfillmentFilter !== "all" && o.fulfillment_status !== fulfillmentFilter) return false;
      if (billingFilter !== "all" && o.billing_status !== billingFilter) return false;
      if (dateFrom && isBefore(parseISO(o.order_date), dateFrom)) return false;
      if (dateTo && isAfter(parseISO(o.order_date), dateTo)) return false;
      return true;
    });
  }, [orders, search, fulfillmentFilter, billingFilter, dateFrom, dateTo]);

  // Stats
  const totalOrders = orders.length;
  const totalUnits = useMemo(() => orders.reduce((sum: number, o: any) =>
    sum + (o.semen_order_items?.reduce((s: number, i: any) => s + (i.units || 0), 0) ?? 0), 0
  ), [orders]);
  const pendingCount = orders.filter((o: any) => o.fulfillment_status !== "delivered").length;
  const unbilledCount = orders.filter((o: any) => o.billing_status === "unbilled").length;

  const getBullNames = (items: any[]) => {
    if (!items || items.length === 0) return "—";
    return items.map((i: any) => i.bulls_catalog?.bull_name || i.custom_bull_name || "Unknown").join(", ");
  };

  const getOrderUnits = (items: any[]) => {
    if (!items) return 0;
    return items.reduce((s: number, i: any) => s + (i.units || 0), 0);
  };

  const openCreate = () => {
    setEditOrder(null);
    setDialogOpen(true);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold font-display tracking-tight">Semen Orders</h2>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Order
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Orders" value={totalOrders} delay={0} index={0} icon={ShoppingCart} />
          <StatCard title="Total Units" value={totalUnits} delay={100} index={1} icon={Package} />
          <StatCard title="Pending / Open" value={pendingCount} delay={200} index={2} icon={Clock} />
          <StatCard title="Unbilled" value={unbilledCount} delay={300} index={3} icon={DollarSign} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4" />
                {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4" />
                {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Fulfillment" />
            </SelectTrigger>
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
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Billing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Billing</SelectItem>
              <SelectItem value="unbilled">Unbilled</SelectItem>
              <SelectItem value="invoiced">Invoiced</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>

          {(search || fulfillmentFilter !== "all" || billingFilter !== "all" || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFulfillmentFilter("all"); setBillingFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
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
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {orders.length === 0 ? "No semen orders yet." : "No orders match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order: any) => (
                  <TableRow key={order.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium whitespace-nowrap">{order.customer_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{order.semen_companies?.name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(parseISO(order.order_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="max-w-[250px] truncate">{getBullNames(order.semen_order_items)}</TableCell>
                    <TableCell className="text-right">{getOrderUnits(order.semen_order_items)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("capitalize text-xs", fulfillmentColors[order.fulfillment_status] || "")}>
                        {order.fulfillment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("capitalize text-xs", billingColors[order.billing_status] || "")}>
                        {order.billing_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/semen-orders/${order.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete order?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the order for {order.customer_name}. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(order.id)} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
      <NewOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} editData={editOrder} />
      <AppFooter />
    </div>
  );
};

export default SemenOrders;
