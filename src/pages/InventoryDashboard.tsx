import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import {
  Search, Archive, Users, Building2, Dna, FileText, FileSpreadsheet, ArrowUpDown,
  Eye, Trash2, Plus, CalendarIcon, Package, DollarSign, Clock, ShoppingCart,
  Upload, X, CalendarDays, Loader2, Check, AlertTriangle, PackagePlus,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import BullCombobox from "@/components/BullCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { generateSemenInventoryPdf } from "@/lib/generateSemenInventoryPdf";

type TabKey = "inventory" | "orders" | "receive";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "receive", label: "Receive" },
];

// ─── Inventory Tab Constants ───
const STORAGE_BADGES: Record<string, string> = {
  customer: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  communal: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  rental: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  inventory: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};
const OWNER_BADGES: Record<string, string> = {
  CATL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Select: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};
type SortKey = "bull_name" | "customer" | "tank" | "units";
type SortDir = "asc" | "desc";

// ─── Orders Tab Constants ───
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

// ─── Receive Tab Types ───
interface OrderItem {
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  units: number;
  bulls_catalog: { bull_name: string } | null;
}
interface LineItem {
  key: string;
  bullName: string;
  bullCatalogId: string | null;
  units: number;
  tankId: string;
  canister: string;
}
interface BullGroup {
  groupKey: string;
  bullName: string;
  bullCatalogId: string | null;
  items: LineItem[];
}
const emptyLine = (): LineItem => ({
  key: crypto.randomUUID(), bullName: "", bullCatalogId: null, units: 0, tankId: "", canister: "",
});

// ═══════════════════════════════════════════
// INVENTORY TAB
// ═══════════════════════════════════════════
const InventoryTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [storageFilter, setStorageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("bull_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<"detail" | "grouped">("detail");

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["semen-inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, customers!tank_inventory_customer_id_fkey(name), tanks!tank_inventory_tank_id_fkey(tank_name, tank_number), bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, company)")
        .eq("organization_id", orgId)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Active packs
  const { data: activePacks = [] } = useQuery({
    queryKey: ["active_packs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("id, packed_at, status, packed_by, tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number), tank_pack_projects(project_id, projects!tank_pack_projects_project_id_fkey(name))")
        .eq("organization_id", orgId)
        .in("status", ["packed", "in_field"])
        .order("packed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });


  const rows = useMemo(() => inventory.map((item: any) => ({
    id: item.id,
    bullName: item.custom_bull_name || item.bulls_catalog?.bull_name || "—",
    bullCode: item.bull_code || "—",
    customer: item.customers?.name || (item.customer_id ? "Unknown" : "Company"),
    customerId: item.customer_id,
    tankName: item.tanks?.tank_name || "—",
    tankNumber: item.tanks?.tank_number || "—",
    canister: item.canister,
    subCanister: item.sub_canister || "—",
    units: item.units || 0,
    storageType: item.storage_type || "customer",
    owner: item.owner || null,
    inventoriedAt: item.inventoried_at,
  })), [inventory]);

  const filtered = useMemo(() => {
    let result = rows;
    if (storageFilter !== "all") result = result.filter((r) => r.storageType === storageFilter);
    if (ownerFilter !== "all") result = result.filter((r) => r.owner === ownerFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.bullName.toLowerCase().includes(q) || r.bullCode.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) || r.tankName.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      switch (sortKey) {
        case "bull_name": aVal = a.bullName.toLowerCase(); bVal = b.bullName.toLowerCase(); break;
        case "customer": aVal = a.customer.toLowerCase(); bVal = b.customer.toLowerCase(); break;
        case "tank": aVal = a.tankName.toLowerCase(); bVal = b.tankName.toLowerCase(); break;
        case "units": aVal = a.units; bVal = b.units; break;
        default: aVal = ""; bVal = "";
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [rows, storageFilter, ownerFilter, search, sortKey, sortDir]);

  const groupedByBull = useMemo(() => {
    if (viewMode !== "grouped") return [];
    const map = new Map<string, { bullName: string; bullCode: string; customers: Map<string, { customer: string; totalUnits: number; tanks: string[] }>; totalUnits: number }>();
    for (const row of filtered) {
      const key = row.bullName;
      if (!map.has(key)) map.set(key, { bullName: row.bullName, bullCode: row.bullCode, customers: new Map(), totalUnits: 0 });
      const group = map.get(key)!;
      group.totalUnits += row.units;
      const custKey = row.customer;
      if (!group.customers.has(custKey)) group.customers.set(custKey, { customer: custKey, totalUnits: 0, tanks: [] });
      const custGroup = group.customers.get(custKey)!;
      custGroup.totalUnits += row.units;
      const tankLabel = row.tankName !== "—" ? row.tankName : row.tankNumber;
      if (!custGroup.tanks.includes(tankLabel)) custGroup.tanks.push(tankLabel);
    }
    return Array.from(map.values()).sort((a, b) => a.bullName.localeCompare(b.bullName));
  }, [filtered, viewMode]);

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const customerUnits = rows.filter((r) => r.customerId).reduce((s, r) => s + r.units, 0);
  const companyUnits = rows.filter((r) => !r.customerId).reduce((s, r) => s + r.units, 0);
  const uniqueBulls = new Set(rows.map((r) => r.bullName)).size;
  const filteredTotal = filtered.reduce((s, r) => s + r.units, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortHeader = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort(sortKeyVal)}>
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortKey === sortKeyVal ? "text-foreground" : "text-muted-foreground/50")} />
    </button>
  );

  const handleExportPdf = () => generateSemenInventoryPdf(filtered, { storageFilter, ownerFilter, search });

  const handleExportCsv = () => {
    if (viewMode === "grouped" && groupedByBull.length > 0) {
      const headers = ["Bull Name", "Bull Code", "Customer", "Tanks", "Units"];
      const csvRows: string[] = [headers.join(",")];
      for (const group of groupedByBull) {
        csvRows.push([`"${group.bullName}"`, `"${group.bullCode}"`, "", "", group.totalUnits].join(","));
        for (const [, cust] of group.customers) {
          csvRows.push(["", "", `"${cust.customer}"`, `"${cust.tanks.join(", ")}"`, cust.totalUnits].join(","));
        }
        csvRows.push("");
      }
      csvRows.push(["", "", "", "TOTAL", filteredTotal].join(","));
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `BeefSynch_Semen_Inventory_Grouped_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } else {
      const headers = ["Bull Name", "Bull Code", "Customer", "Tank", "Tank #", "Canister", "Sub-canister", "Units", "Storage Type", "Owner", "Last Inventoried"];
      const csvRows = [
        headers.join(","),
        ...filtered.map((r) => [
          `"${r.bullName}"`, `"${r.bullCode}"`, `"${r.customer}"`, `"${r.tankName}"`, `"${r.tankNumber}"`,
          `"${r.canister}"`, `"${r.subCanister}"`, r.units, `"${r.storageType}"`, `"${r.owner || ""}"`,
          `"${r.inventoriedAt ? format(new Date(r.inventoriedAt), "yyyy-MM-dd") : ""}"`,
        ].join(","))
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `BeefSynch_Semen_Inventory_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click(); URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-xl font-bold font-display tracking-tight">Semen Inventory</h3>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportCsv}><FileSpreadsheet className="h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" className="gap-2" onClick={handleExportPdf}><FileText className="h-4 w-4" /> Export PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Units" value={totalUnits} delay={0} index={0} icon={Archive} />
        <StatCard title="Customer Units" value={customerUnits} delay={100} index={1} icon={Users} />
        <StatCard title="Company Units" value={companyUnits} delay={200} index={2} icon={Building2} />
        <StatCard title="Unique Bulls" value={uniqueBulls} delay={300} index={3} icon={Dna} />
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-44">
          <Select value={storageFilter} onValueChange={setStorageFilter}>
            <SelectTrigger><SelectValue placeholder="Storage Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Storage</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="communal">Communal</SelectItem>
              <SelectItem value="rental">Rental</SelectItem>
              <SelectItem value="inventory">Inventory</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              <SelectItem value="CATL">CATL</SelectItem>
              <SelectItem value="Select">Select</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search bull, customer, tank…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button onClick={() => setViewMode("detail")} className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "detail" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>Detail</button>
          <button onClick={() => setViewMode("grouped")} className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "grouped" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>Grouped</button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        {viewMode === "detail" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead><SortHeader label="Bull Name" sortKeyVal="bull_name" /></TableHead>
                <TableHead className="whitespace-nowrap">Bull Code</TableHead>
                <TableHead><SortHeader label="Customer" sortKeyVal="customer" /></TableHead>
                <TableHead><SortHeader label="Tank" sortKeyVal="tank" /></TableHead>
                <TableHead className="whitespace-nowrap">Tank #</TableHead>
                <TableHead>Canister</TableHead>
                <TableHead className="whitespace-nowrap">Sub-can</TableHead>
                <TableHead className="text-right"><SortHeader label="Units" sortKeyVal="units" /></TableHead>
                <TableHead className="whitespace-nowrap">Storage</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="whitespace-nowrap">Last Inventoried</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">{rows.length === 0 ? "No inventory data." : "No results match your filters."}</TableCell></TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium whitespace-nowrap">{row.bullName}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.bullCode}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.customer}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.tankName}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.tankNumber}</TableCell>
                    <TableCell>{row.canister}</TableCell>
                    <TableCell>{row.subCanister}</TableCell>
                    <TableCell className="text-right">{row.units}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STORAGE_BADGES[row.storageType] || "bg-muted text-muted-foreground border-border"}>{row.storageType}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.owner ? <Badge variant="outline" className={OWNER_BADGES[row.owner] || "bg-muted text-muted-foreground border-border"}>{row.owner}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.inventoriedAt ? format(new Date(row.inventoriedAt), "MMM d, yyyy") : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-bold">{filteredTotal}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Bull / Customer</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Tanks</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : groupedByBull.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">{rows.length === 0 ? "No inventory data." : "No results match your filters."}</TableCell></TableRow>
              ) : (
                groupedByBull.map((group) => (
                  <>
                    <TableRow key={`bull-${group.bullName}`} className="bg-muted/40 hover:bg-muted/50">
                      <TableCell className="font-semibold">{group.bullName}</TableCell>
                      <TableCell className="text-muted-foreground">{group.bullCode}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-bold">{group.totalUnits}</TableCell>
                    </TableRow>
                    {Array.from(group.customers.values()).map((cust) => (
                      <TableRow key={`${group.bullName}-${cust.customer}`} className="hover:bg-muted/20">
                        <TableCell className="pl-6 text-muted-foreground">{cust.customer}</TableCell>
                        <TableCell />
                        <TableCell className="text-sm text-muted-foreground">{cust.tanks.join(", ")}</TableCell>
                        <TableCell className="text-right">{cust.totalUnits}</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))
              )}
            </TableBody>
            {groupedByBull.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-bold">{filteredTotal}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// ORDERS TAB
// ═══════════════════════════════════════════
const OrdersTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const { role } = useOrgRole();
  const queryClient = useQueryClient();
  const canDelete = role === "owner" || role === "admin";

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
        .select("*, semen_companies(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("semen_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["semen_orders"] }); toast({ title: "Order deleted" }); },
    onError: () => { toast({ title: "Error", description: "Could not delete order.", variant: "destructive" }); },
  });

  const filtered = useMemo(() => orders.filter((o: any) => {
    if (search && !(o.customer_name || "").toLowerCase().includes(search.toLowerCase())) return false;
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
        <Button className="gap-2" onClick={() => { setEditOrder(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> New Order</Button>
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
              <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">{orders.length === 0 ? "No semen orders yet." : "No orders match your filters."}</TableCell></TableRow>
            ) : (
              filtered.map((order: any) => (
                <TableRow key={order.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium whitespace-nowrap">{order.customer_name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{order.semen_companies?.name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{format(parseISO(order.order_date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="max-w-[250px] truncate">{getBullNames(order.semen_order_items)}</TableCell>
                  <TableCell className="text-right">{getOrderUnits(order.semen_order_items)}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("capitalize text-xs", fulfillmentColors[order.fulfillment_status] || "")}>{order.fulfillment_status}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={cn("capitalize text-xs", billingColors[order.billing_status] || "")}>{order.billing_status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/semen-orders/${order.id}`)}><Eye className="h-4 w-4" /></Button>
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete order?</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently delete the order for {order.customer_name || "this customer"}. This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(order.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
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
      <NewOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} editData={editOrder} />
    </div>
  );
};

// ═══════════════════════════════════════════
// RECEIVE TAB
// ═══════════════════════════════════════════
const ReceiveTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedDate, setReceivedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [orderedQtyMap, setOrderedQtyMap] = useState<Map<string, number>>(new Map());

  const groups: BullGroup[] = useMemo(() => {
    const map = new Map<string, LineItem[]>();
    for (const line of lines) {
      const groupKey = line.bullCatalogId || line.bullName || line.key;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(line);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      groupKey: key, bullName: items[0].bullName, bullCatalogId: items[0].bullCatalogId, items,
    }));
  }, [lines]);

  const { data: orders = [] } = useQuery({
    queryKey: ["semen-orders-list", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("semen_orders").select("id, customer_name, order_date").eq("organization_id", orgId).order("order_date", { ascending: false }).limit(100);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks-list", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("tanks").select("id, tank_name, tank_number, tank_type").eq("organization_id", orgId).order("tank_number");
      return data ?? [];
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    const orderId = searchParams.get("order");
    if (orderId) setSelectedOrderId(orderId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedOrderId || selectedOrderId === "__none") { setOrderedQtyMap(new Map()); return; }
    const order = orders.find((o) => o.id === selectedOrderId);
    if (order) setReceivedFrom(order.customer_name);
    (async () => {
      const { data } = await supabase.from("semen_order_items").select("bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name)").eq("semen_order_id", selectedOrderId);
      if (data && data.length > 0) {
        const items = data as unknown as OrderItem[];
        setLines(items.map((item) => ({
          key: crypto.randomUUID(), bullName: item.bulls_catalog?.bull_name ?? item.custom_bull_name ?? "",
          bullCatalogId: item.bull_catalog_id, units: item.units, tankId: "", canister: "",
        })));
        const qtyMap = new Map<string, number>();
        for (const item of items) {
          const key = item.bull_catalog_id || item.custom_bull_name || "";
          qtyMap.set(key, (qtyMap.get(key) || 0) + item.units);
        }
        setOrderedQtyMap(qtyMap);
      }
    })();
  }, [selectedOrderId, orders]);

  const handleOrderChange = (val: string) => {
    if (val === "__none") { setSelectedOrderId(""); setReceivedFrom(""); setLines([emptyLine()]); setOrderedQtyMap(new Map()); }
    else setSelectedOrderId(val);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Max 10MB allowed", variant: "destructive" }); return; }
    setFile(f);
    if (f.type.startsWith("image/")) setFilePreview(URL.createObjectURL(f));
    else setFilePreview(null);
  };
  const removeFile = () => { setFile(null); if (filePreview) URL.revokeObjectURL(filePreview); setFilePreview(null); };

  const updateLine = (key: string, patch: Partial<LineItem>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const updateBullForGroup = (groupKey: string, bullName: string, bullCatalogId: string | null) => {
    setLines((prev) => prev.map((l) => { const lKey = l.bullCatalogId || l.bullName || l.key; return lKey === groupKey ? { ...l, bullName, bullCatalogId } : l; }));
  };
  const removeLine = (key: string) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  const removeGroup = (group: BullGroup) => { if (groups.length <= 1) return; const keys = new Set(group.items.map((i) => i.key)); setLines((prev) => prev.filter((l) => !keys.has(l.key))); };
  const addSplitToGroup = (group: BullGroup) => {
    const newLine: LineItem = { key: crypto.randomUUID(), bullName: group.bullName, bullCatalogId: group.bullCatalogId, units: 0, tankId: "", canister: "" };
    const lastKey = group.items[group.items.length - 1].key;
    setLines((prev) => { const idx = prev.findIndex((l) => l.key === lastKey); const copy = [...prev]; copy.splice(idx + 1, 0, newLine); return copy; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!receivedFrom.trim()) errs.receivedFrom = "Required";
    if (lines.length === 0) errs.lines = "At least one line item required";
    lines.forEach((l, i) => {
      if (!l.bullName) errs[`line_${i}_bull`] = "Required";
      if (!l.units || l.units < 1) errs[`line_${i}_units`] = "Min 1";
      if (!l.tankId) errs[`line_${i}_tank`] = "Required";
      if (!l.canister.trim()) errs[`line_${i}_canister`] = "Required";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !orgId) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const shipmentId = crypto.randomUUID();

      let documentPath: string | null = null;
      if (file) {
        const path = `${orgId}/${crypto.randomUUID()}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("shipment-documents").upload(path, file);
        if (upErr) throw upErr;
        documentPath = path;
      }

      const { error: shipErr } = await supabase.from("shipments").insert({
        id: shipmentId, organization_id: orgId, semen_order_id: selectedOrderId || null,
        received_from: receivedFrom.trim(), received_date: format(receivedDate, "yyyy-MM-dd"),
        document_path: documentPath, notes: notes.trim() || null, created_by: userId,
      });
      if (shipErr) throw shipErr;

      let totalUnits = 0;
      for (const line of lines) {
        totalUnits += line.units;
        const matchFilter: Record<string, string> = { organization_id: orgId, tank_id: line.tankId, canister: line.canister.trim() };
        if (line.bullCatalogId) matchFilter.bull_catalog_id = line.bullCatalogId;
        else matchFilter.custom_bull_name = line.bullName;

        const { data: existing } = await supabase.from("tank_inventory").select("id, units").match(matchFilter).maybeSingle();
        if (existing) await supabase.from("tank_inventory").update({ units: existing.units + line.units }).eq("id", existing.id);
        else await supabase.from("tank_inventory").insert({
          organization_id: orgId, tank_id: line.tankId, canister: line.canister.trim(),
          bull_catalog_id: line.bullCatalogId, custom_bull_name: line.bullCatalogId ? null : line.bullName,
          units: line.units, storage_type: "inventory",
        });

        await supabase.from("inventory_transactions").insert({
          organization_id: orgId, tank_id: line.tankId, bull_catalog_id: line.bullCatalogId,
          custom_bull_name: line.bullName, units_change: line.units, transaction_type: "received",
          shipment_id: shipmentId, order_id: selectedOrderId || null, performed_by: userId,
          notes: `Received from ${receivedFrom.trim()}`,
        });
      }

      if (selectedOrderId) {
        const [{ data: orderItems }, { data: txns }] = await Promise.all([
          supabase.from("semen_order_items").select("units").eq("semen_order_id", selectedOrderId),
          supabase.from("inventory_transactions").select("units_change").eq("order_id", selectedOrderId).eq("transaction_type", "received").limit(10000),
        ]);
        const totalOrdered = (orderItems ?? []).reduce((s, i) => s + i.units, 0);
        const totalReceived = (txns ?? []).reduce((s, t) => s + t.units_change, 0);
        const newStatus = totalReceived >= totalOrdered ? "delivered" : "partially_filled";
        const { data: currentOrder } = await supabase.from("semen_orders").select("fulfillment_status").eq("id", selectedOrderId).single();
        const statusRank: Record<string, number> = { pending: 0, backordered: 1, ordered: 2, partially_filled: 3, shipped: 4, delivered: 5 };
        if (currentOrder && (statusRank[newStatus] ?? 0) > (statusRank[currentOrder.fulfillment_status] ?? 0))
          await supabase.from("semen_orders").update({ fulfillment_status: newStatus }).eq("id", selectedOrderId);
      }

      toast({ title: "Shipment received", description: `${totalUnits} units added to inventory` });
      if (selectedOrderId) navigate(`/semen-orders/${selectedOrderId}`);
      else navigate("/inventory-dashboard?tab=inventory");
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to receive shipment", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const renderTankSelect = (line: LineItem, lineIndex: number) => (
    <>
      {tanks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tanks found. <Link to="/tanks" className="text-primary hover:underline">Add tanks first.</Link></p>
      ) : (
        <Select value={line.tankId} onValueChange={(v) => updateLine(line.key, { tankId: v })}>
          <SelectTrigger><SelectValue placeholder="Select tank..." /></SelectTrigger>
          <SelectContent>{tanks.map((t) => <SelectItem key={t.id} value={t.id}>{t.tank_name || t.tank_number} ({t.tank_type.replace(/_/g, " ")})</SelectItem>)}</SelectContent>
        </Select>
      )}
      {errors[`line_${lineIndex}_tank`] && <p className="text-xs text-destructive mt-1">{errors[`line_${lineIndex}_tank`]}</p>}
    </>
  );

  const getLineIndex = (key: string) => lines.findIndex((l) => l.key === key);

  const renderAllocationBadge = (group: BullGroup) => {
    const totalAllocated = group.items.reduce((s, l) => s + l.units, 0);
    const orderedKey = group.bullCatalogId || group.bullName;
    const orderedQty = orderedQtyMap.get(orderedKey);
    if (orderedQty != null) {
      const isFull = totalAllocated >= orderedQty;
      const isPartial = totalAllocated > 0 && totalAllocated < orderedQty;
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Ordered: {orderedQty}</span>
          <span className={cn("font-medium", isFull ? "text-primary" : isPartial ? "text-accent-foreground" : "text-destructive")}>
            {isFull && <Check className="inline h-3 w-3 mr-0.5" />}
            {isPartial && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
            {totalAllocated} of {orderedQty} allocated
          </span>
        </div>
      );
    }
    if (totalAllocated > 0) return <span className="text-xs text-muted-foreground">{totalAllocated} allocated</span>;
    return null;
  };

  const renderGroup = (group: BullGroup) => {
    const firstLine = group.items[0];
    const firstIdx = getLineIndex(firstLine.key);
    return (
      <div key={group.groupKey} className="border border-border rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-secondary/40 border-b border-border">
          <div className="flex-1 min-w-0">
            {firstLine.bullName ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground truncate">{group.bullName}</span>
                {group.bullCatalogId && <span className="text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded">Catalog</span>}
                {renderAllocationBadge(group)}
              </div>
            ) : <span className="text-sm text-muted-foreground italic">New bull — select below</span>}
          </div>
          {groups.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeGroup(group)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {!firstLine.bullName && (
          <div className="px-3 py-2 border-b border-border">
            <Label className="text-xs">Bull *</Label>
            <BullCombobox value={firstLine.bullName} catalogId={firstLine.bullCatalogId} onChange={(name, catId) => updateBullForGroup(group.groupKey, name, catId)} />
            {errors[`line_${firstIdx}_bull`] && <p className="text-xs text-destructive mt-1">{errors[`line_${firstIdx}_bull`]}</p>}
          </div>
        )}
        <div className="divide-y divide-border">
          {group.items.map((line) => {
            const idx = getLineIndex(line.key);
            return isMobile ? (
              <div key={line.key} className="p-3 space-y-3 relative">
                {group.items.length > 1 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => removeLine(line.key)}><Trash2 className="h-4 w-4" /></Button>}
                <div className="space-y-1"><Label className="text-xs">Destination Tank *</Label>{renderTankSelect(line, idx)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Canister *</Label>
                    <Input value={line.canister} onChange={(e) => updateLine(line.key, { canister: e.target.value })} placeholder="e.g. 1, 2, A" />
                    {errors[`line_${idx}_canister`] && <p className="text-xs text-destructive">{errors[`line_${idx}_canister`]}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Units *</Label>
                    <Input type="number" min={1} value={line.units || ""} onChange={(e) => updateLine(line.key, { units: parseInt(e.target.value) || 0 })} />
                    {errors[`line_${idx}_units`] && <p className="text-xs text-destructive">{errors[`line_${idx}_units`]}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div key={line.key} className="flex items-start gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">{renderTankSelect(line, idx)}</div>
                <div className="w-28">
                  <Input value={line.canister} onChange={(e) => updateLine(line.key, { canister: e.target.value })} placeholder="Canister" />
                  {errors[`line_${idx}_canister`] && <p className="text-xs text-destructive mt-1">{errors[`line_${idx}_canister`]}</p>}
                </div>
                <div className="w-20">
                  <Input type="number" min={1} value={line.units || ""} onChange={(e) => updateLine(line.key, { units: parseInt(e.target.value) || 0 })} />
                  {errors[`line_${idx}_units`] && <p className="text-xs text-destructive mt-1">{errors[`line_${idx}_units`]}</p>}
                </div>
                {group.items.length > 1 && <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 shrink-0" onClick={() => removeLine(line.key)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            );
          })}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => addSplitToGroup(group)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Split to Another Tank</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h3 className="text-xl font-bold text-foreground">Receive Shipment</h3>
        <p className="text-sm text-muted-foreground">Log incoming semen and add to inventory</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Shipment Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Link to Order (optional)</Label>
              <Select value={selectedOrderId || "__none"} onValueChange={handleOrderChange}>
                <SelectTrigger><SelectValue placeholder="No order — manual entry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No order — manual entry</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.customer_name} — {format(new Date(o.order_date + "T00:00:00"), "MMM d, yyyy")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Received From *</Label>
              <Input value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} placeholder="e.g. Select Sires, ABS Global" className={cn(errors.receivedFrom && "border-destructive")} />
              {errors.receivedFrom && <p className="text-xs text-destructive">{errors.receivedFrom}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Received Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarDays className="mr-2 h-4 w-4" />{format(receivedDate, "PPP")}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={receivedDate} onSelect={(d) => { if (d) { setReceivedDate(d); setCalendarOpen(false); } }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Packing Slip Photo</Label>
              {file ? (
                <div className="flex items-center gap-2 p-2 border border-border rounded-md bg-secondary/50">
                  {filePreview ? <img src={filePreview} alt="Preview" className="h-12 w-12 object-cover rounded" /> : <Package className="h-8 w-8 text-muted-foreground" />}
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <Button variant="ghost" size="icon" onClick={removeFile} type="button"><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer p-2 border border-dashed border-border rounded-md hover:bg-secondary/50 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload photo or PDF</span>
                  <input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.pdf" capture="environment" className="sr-only" onChange={handleFileChange} />
                </label>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this shipment..." rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Inventory Items</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}><Plus className="h-4 w-4 mr-1" /> Add Bull</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {errors.lines && <p className="text-xs text-destructive mb-2">{errors.lines}</p>}
          {!isMobile && groups.some((g) => g.bullName) && (
            <div className="flex items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
              <span className="flex-1">Tank</span><span className="w-28">Canister</span><span className="w-20">Units</span><span className="w-8" />
            </div>
          )}
          {groups.map(renderGroup)}
        </CardContent>
      </Card>

      <div className={isMobile ? "sticky bottom-0 bg-background border-t border-border p-4 -mx-4" : ""}>
        <Button onClick={handleSubmit} disabled={submitting} className={isMobile ? "w-full" : "w-full md:w-auto"} size="lg">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting ? "Processing..." : "Receive & Add to Inventory"}
        </Button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════
const InventoryDashboard = () => {
  const { orgId } = useOrgRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "inventory";

  const setTab = (tab: TabKey) => setSearchParams({ tab }, { replace: true });

  // Badge counts
  const { data: inventoryCount = 0 } = useQuery({
    queryKey: ["inv_dash_inv_count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from("tank_inventory").select("id", { count: "exact", head: true }).eq("organization_id", orgId!);
      return count ?? 0;
    },
  });

  const { data: orderCount = 0 } = useQuery({
    queryKey: ["inv_dash_order_count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from("semen_orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId!);
      return count ?? 0;
    },
  });

  const badgeCounts: Record<TabKey, string> = {
    inventory: inventoryCount.toLocaleString(),
    orders: orderCount.toLocaleString(),
    receive: "",
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight">Semen Inventory Management</h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <Badge variant="secondary" className="font-normal">{inventoryCount.toLocaleString()} inventory rows</Badge>
            <Badge variant="secondary" className="font-normal">{orderCount} orders</Badge>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
              )}
            >
              {label}
              {badgeCounts[key] && (
                <span className={cn(
                  "ml-2 text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {badgeCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {orgId && activeTab === "inventory" && <InventoryTab orgId={orgId} />}
        {orgId && activeTab === "orders" && <OrdersTab orgId={orgId} />}
        {orgId && activeTab === "receive" && <ReceiveTab orgId={orgId} />}
      </main>
      <AppFooter />
    </div>
  );
};

export default InventoryDashboard;
