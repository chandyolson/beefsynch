import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Archive, Users, Building2, Dna, FileText, FileSpreadsheet, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { generateSemenInventoryPdf } from "@/lib/generateSemenInventoryPdf";

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

const SemenInventory = () => {
  const { orgId } = useOrgRole();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [storageFilter, setStorageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("bull_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<"detail" | "grouped">("detail");

  // Fetch inventory with joins
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["semen-inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, customers!tank_inventory_customer_id_fkey(name), tanks!tank_inventory_tank_id_fkey(tank_name, tank_number), bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, company)")
        .eq("organization_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Enriched rows
  const rows = useMemo(() => {
    return inventory.map((item: any) => ({
      id: item.id,
      bullName: item.custom_bull_name || item.bulls_catalog?.bull_name || "—",
      bullCode: item.bull_code || "—",
      customer: item.customers?.name || (item.customer_id ? "Unknown" : "Company"),
      customerId: item.customer_id,
      tankId: item.tank_id,
      tankName: item.tanks?.tank_name || "—",
      tankNumber: item.tanks?.tank_number || "—",
      canister: item.canister,
      subCanister: item.sub_canister || "—",
      units: item.units || 0,
      storageType: item.storage_type || "customer",
      owner: item.owner || null,
      inventoriedAt: item.inventoried_at,
      itemType: item.item_type || "semen",
    }));
  }, [inventory]);

  // Filtered
  const filtered = useMemo(() => {
    let result = rows;

    if (storageFilter !== "all") {
      result = result.filter((r) => r.storageType === storageFilter);
    }
    if (ownerFilter !== "all") {
      result = result.filter((r) => r.owner === ownerFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((r) => r.itemType === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.bullName.toLowerCase().includes(q) ||
          r.bullCode.toLowerCase().includes(q) ||
          r.customer.toLowerCase().includes(q) ||
          r.tankName.toLowerCase().includes(q)
      );
    }

    // Sort
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
  }, [rows, storageFilter, ownerFilter, typeFilter, search, sortKey, sortDir]);

  // Grouped by bull
  const groupedByBull = useMemo(() => {
    if (viewMode !== "grouped") return [];
    const map = new Map<string, { bullName: string; bullCode: string; customers: Map<string, { customer: string; totalUnits: number; tanks: { label: string; tankId: string }[] }>; totalUnits: number }>();

    for (const row of filtered) {
      const key = row.bullName;
      if (!map.has(key)) {
        map.set(key, { bullName: row.bullName, bullCode: row.bullCode, customers: new Map(), totalUnits: 0 });
      }
      const group = map.get(key)!;
      group.totalUnits += row.units;

      const custKey = row.customer;
      if (!group.customers.has(custKey)) {
        group.customers.set(custKey, { customer: custKey, totalUnits: 0, tanks: [] });
      }
      const custGroup = group.customers.get(custKey)!;
      custGroup.totalUnits += row.units;
      const tankLabel = row.tankName !== "—" ? row.tankName : row.tankNumber;
      if (!custGroup.tanks.some(t => t.tankId === row.tankId)) {
        custGroup.tanks.push({ label: tankLabel, tankId: row.tankId });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.bullName.localeCompare(b.bullName));
  }, [filtered, viewMode]);

  // Stats
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const customerUnits = rows.filter((r) => r.customerId).reduce((s, r) => s + r.units, 0);
  const companyUnits = rows.filter((r) => !r.customerId).reduce((s, r) => s + r.units, 0);
  const uniqueBulls = new Set(rows.map((r) => r.bullName)).size;
  const filteredTotal = filtered.reduce((s, r) => s + r.units, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <button
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => toggleSort(sortKeyVal)}
    >
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortKey === sortKeyVal ? "text-foreground" : "text-muted-foreground/50")} />
    </button>
  );

  const handleExportPdf = () => {
    generateSemenInventoryPdf(filtered, { storageFilter, ownerFilter, search });
  };

  const handleExportCsv = () => {
    if (viewMode === "grouped" && groupedByBull.length > 0) {
      const headers = ["Bull Name", "Bull Code", "Customer", "Tanks", "Units"];
      const csvRows: string[] = [headers.join(",")];
      for (const group of groupedByBull) {
        // Bull header row
        csvRows.push([`"${group.bullName}"`, `"${group.bullCode}"`, "", "", group.totalUnits].join(","));
        // Customer sub-rows
        for (const [, cust] of group.customers) {
          csvRows.push(["", "", `"${cust.customer}"`, `"${cust.tanks.join(", ")}"`, cust.totalUnits].join(","));
        }
        csvRows.push(""); // blank separator
      }
      csvRows.push(["", "", "", "TOTAL", filteredTotal].join(","));
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BeefSynch_Semen_Inventory_Grouped_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ["Bull Name", "Bull Code", "Customer", "Tank", "Tank #", "Canister", "Sub-canister", "Units", "Storage Type", "Owner", "Last Inventoried"];
      const csvRows = [
        headers.join(","),
        ...filtered.map((r) =>
          [
            `"${r.bullName}"`,
            `"${r.bullCode}"`,
            `"${r.customer}"`,
            `"${r.tankName}"`,
            `"${r.tankNumber}"`,
            `"${r.canister}"`,
            `"${r.subCanister}"`,
            r.units,
            `"${r.storageType}"`,
            `"${r.owner || ""}"`,
            `"${r.inventoriedAt ? format(new Date(r.inventoriedAt), "yyyy-MM-dd") : ""}"`,
          ].join(",")
        ),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BeefSynch_Semen_Inventory_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-2xl font-bold font-display tracking-tight">Semen Inventory</h2>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportCsv}>
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportPdf}>
              <FileText className="h-4 w-4" /> Export PDF
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Units" value={totalUnits} delay={0} index={0} icon={Archive} />
          <StatCard title="Customer Units" value={customerUnits} delay={100} index={1} icon={Users} />
          <StatCard title="Company Units" value={companyUnits} delay={200} index={2} icon={Building2} />
          <StatCard title="Unique Bulls" value={uniqueBulls} delay={300} index={3} icon={Dna} />
        </div>

        {/* Filters + View Toggle */}
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
            <Input
              placeholder="Search bull, customer, tank…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-36">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="semen">Semen Only</SelectItem>
                <SelectItem value="embryo">Embryos Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("detail")}
              className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "detail" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}
            >
              Detail
            </button>
            <button
              onClick={() => setViewMode("grouped")}
              className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "grouped" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}
            >
              Grouped
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 overflow-x-auto">
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
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      {rows.length === 0 ? "No inventory data." : "No results match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.bullName}
                        {row.itemType === "embryo" && (
                          <Badge variant="outline" className="ml-2 bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.bullCode}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.customer}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.tankName}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.tankNumber}</TableCell>
                      <TableCell>{row.canister}</TableCell>
                      <TableCell>{row.subCanister}</TableCell>
                      <TableCell className="text-right">{row.units}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STORAGE_BADGES[row.storageType] || "bg-muted text-muted-foreground border-border"}>
                          {row.storageType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.owner ? (
                          <Badge variant="outline" className={OWNER_BADGES[row.owner] || "bg-muted text-muted-foreground border-border"}>
                            {row.owner}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.inventoriedAt ? format(new Date(row.inventoriedAt), "MMM d, yyyy") : "—"}
                      </TableCell>
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
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : groupedByBull.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      {rows.length === 0 ? "No inventory data." : "No results match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedByBull.map((group) => (
                    <>
                      {/* Bull header row */}
                      <TableRow key={`bull-${group.bullName}`} className="bg-muted/40 hover:bg-muted/50">
                        <TableCell className="font-semibold">{group.bullName}</TableCell>
                        <TableCell className="text-muted-foreground">{group.bullCode}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-bold">{group.totalUnits}</TableCell>
                      </TableRow>
                      {/* Customer sub-rows */}
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
      </main>
      <AppFooter />
    </div>
  );
};

export default SemenInventory;