import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import {
  Search, Archive, Users, Building2, Dna, FileText, FileSpreadsheet, ArrowUpDown,
  Eye, Trash2, Plus, CalendarIcon, Package, DollarSign, Clock, ShoppingCart,
  PackagePlus, Truck,
  ChevronDown, ChevronUp,
} from "lucide-react";

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

type TabKey = "inventory" | "orders";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
];

// ─── Inventory Tab Constants ───
const STORAGE_BADGES: Record<string, string> = {
  customer: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  communal: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  rental: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  inventory: "bg-purple-500/15 text-purple-400 border-purple-500/30",
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
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("tank_inventory")
          .select("*, customers(name), tanks(tank_name, tank_number)")
          .eq("organization_id", orgId!)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        allRows.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
  });

  // Active packs
  const { data: activePacks = [] } = useQuery({
    queryKey: ["active_packs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("id, packed_at, status, packed_by, pack_type, destination_name, tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number), tank_pack_projects(project_id, projects!tank_pack_projects_project_id_fkey(name)), tank_pack_lines(bull_name, units, field_canister)")
        .eq("organization_id", orgId)
        .in("status", ["packed", "in_field"])
        .order("packed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });


  const [expandedPacks, setExpandedPacks] = useState<Record<string, boolean>>({});
  const togglePackExpand = (id: string) => setExpandedPacks(prev => ({ ...prev, [id]: !prev[id] }));

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

      {/* Active Packs */}
      {activePacks.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-base flex items-center gap-2">
              Active Packs
              <Badge variant="secondary" className="text-xs">{activePacks.length}</Badge>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/pack-tank")} className="gap-1.5">
              <PackagePlus className="h-4 w-4" /> Pack Tank
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Field Tank</TableHead>
                    <TableHead>Projects</TableHead>
                    <TableHead>Bulls</TableHead>
                    <TableHead>Date Packed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activePacks.map((p: any) => {
                    const tankName = p.tanks?.tank_name || p.tanks?.tank_number || "—";
                    const projNames = (p.tank_pack_projects || []).map((pp: any) => pp.projects?.name).filter(Boolean).join(", ");
                    const isShipment = p.pack_type === "shipment";
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{tankName}</TableCell>
                        <TableCell>
                          {isShipment ? (
                            <span className="flex items-center gap-1"><Truck className="h-3 w-3 text-muted-foreground" /> Ship to: {p.destination_name || "—"}</span>
                          ) : (projNames || "—")}
                        </TableCell>
                        <TableCell>
                          {(p.tank_pack_lines || []).length > 0 ? (
                            <div>
                              <button
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => togglePackExpand(p.id)}
                              >
                                {expandedPacks[p.id]
                                  ? <ChevronUp className="h-3 w-3" />
                                  : <ChevronDown className="h-3 w-3" />}
                                {(p.tank_pack_lines as any[]).length} bull{(p.tank_pack_lines as any[]).length !== 1 ? "s" : ""}
                              </button>
                              {expandedPacks[p.id] && (
                                <div className="mt-1 space-y-0.5">
                                  {(p.tank_pack_lines as any[]).map((l: any, idx: number) => (
                                    <div key={idx} className="text-xs text-muted-foreground pl-1">
                                      {l.bull_name}{l.field_canister ? ` — Can. ${l.field_canister}` : ""} — {l.units} units
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{format(new Date(p.packed_at), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30">{p.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/pack/${p.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[160px]"><SortHeader label="Bull Name" sortKeyVal="bull_name" /></TableHead>
                <TableHead className="w-[90px] whitespace-nowrap">Bull Code</TableHead>
                <TableHead className="w-[140px]"><SortHeader label="Customer" sortKeyVal="customer" /></TableHead>
                <TableHead className="w-[120px]"><SortHeader label="Tank" sortKeyVal="tank" /></TableHead>
                <TableHead className="w-[60px] whitespace-nowrap">Tank #</TableHead>
                <TableHead className="w-[55px]">Can.</TableHead>
                <TableHead className="w-[55px] whitespace-nowrap">Sub</TableHead>
                <TableHead className="w-[55px] text-right"><SortHeader label="Units" sortKeyVal="units" /></TableHead>
                <TableHead className="w-[80px] whitespace-nowrap">Storage</TableHead>
                <TableHead className="w-[70px]">Owner</TableHead>
                <TableHead className="w-[100px] whitespace-nowrap">Inventoried</TableHead>
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
                    <TableCell className="font-medium max-w-[160px] truncate">{row.bullName}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.bullCode}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{row.customer}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{row.tankName}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.tankNumber}</TableCell>
                    <TableCell>{row.canister}</TableCell>
                    <TableCell>{row.subCanister}</TableCell>
                    <TableCell className="text-right">{row.units}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STORAGE_BADGES[row.storageType] || "bg-muted text-muted-foreground border-border"}>{row.storageType}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.owner ? <span>{row.owner}</span> : "—"}
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
  const navigate = useNavigate();


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

        {/* Tabs + Receive button */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate("/receive-shipment")} variant="outline" size="sm">
            <Package className="h-4 w-4 mr-2" />
            Receive Shipment
          </Button>
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
        
      </main>
      <AppFooter />
    </div>
  );
};

export default InventoryDashboard;
