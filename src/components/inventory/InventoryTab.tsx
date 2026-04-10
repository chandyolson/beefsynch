import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, Archive, Users, Building2, Dna, FileText, FileSpreadsheet, ArrowUpDown,
  Eye, PackagePlus, Truck, ChevronDown, ChevronUp,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { generateSemenInventoryPdf } from "@/lib/generateSemenInventoryPdf";

// ─── Inventory Tab Constants ───
const STORAGE_BADGES: Record<string, string> = {
  customer: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  communal: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  rental: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  inventory: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

type SortKey = "bull_name" | "customer" | "tank" | "units";
type SortDir = "asc" | "desc";

interface InventoryTabProps {
  orgId: string;
  initialOwnerFilter?: "all" | "company" | "customer";
  onFilterReset?: () => void;
}

const InventoryTab = ({ orgId, initialOwnerFilter = "all", onFilterReset }: InventoryTabProps) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [storageFilter, setStorageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState(initialOwnerFilter);

  useEffect(() => {
    setOwnerFilter(initialOwnerFilter);
  }, [initialOwnerFilter]);
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
    if (ownerFilter === "company") {
      result = result.filter((r) => !r.customerId);
    } else if (ownerFilter === "customer") {
      result = result.filter((r) => !!r.customerId);
    } else if (ownerFilter !== "all") {
      result = result.filter((r) => r.owner === ownerFilter);
    }
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
          <Select value={ownerFilter} onValueChange={(v) => { setOwnerFilter(v); onFilterReset?.(); }}>
            <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              <SelectItem value="company">Company Only</SelectItem>
              <SelectItem value="customer">Customer Only</SelectItem>
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

export default InventoryTab;
