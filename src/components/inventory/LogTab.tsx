import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { Search, ClipboardList, BarChart3, PackageCheck, ChevronRight, ChevronDown, Loader2 } from "lucide-react";

import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getBadgeClass } from "@/lib/badgeStyles";
import WeeklySummary from "./WeeklySummary";

const PAGE_SIZE = 1000;

const TYPE_LABELS: Record<string, string> = {
  received: "Received",
  pack_out: "Packed Out",
  unpack_return: "Unpack Return",
  used_in_field: "Used in Field",
  manual_add: "Manually Added",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  adjustment: "Adjustment",
};

const getTypeLabel = (t: string) => TYPE_LABELS[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const getTypeBadgeClass = (t: string) => getBadgeClass('logType', t);

interface TxnRow {
  id: string;
  created_at: string;
  transaction_type: string;
  units_change: number;
  notes: string | null;
  bull_code: string | null;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: { bull_name: string } | null;
  tanks: { tank_name: string | null; tank_number: string } | null;
  shipment_id: string | null;
  tank_pack_id: string | null;
  order_id: string | null;
  customer_id: string | null;
}

type TankGroup = {
  tankKey: string;
  tankName: string;
  tankNumber: string;
  rows: TxnRow[];
  netUnits: number;
};
type DateGroup = {
  date: string;
  displayDate: string;
  tankGroups: TankGroup[];
  untankedRows: TxnRow[];
  totalRows: number;
};

type ContextNames = {
  shipments: Map<string, string>;  // shipment_id → "from [Company] for [Customer]"
  packs: Map<string, string>;      // tank_pack_id → "for [Project Name]"
};

const LogTab = ({ orgId }: { orgId: string }) => {
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [contextNames, setContextNames] = useState<ContextNames>({ shipments: new Map(), packs: new Map() });
  const [subTab, setSubTab] = useState<"timeline" | "summary">("timeline");

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const all: TxnRow[] = [];
    let from = 0;
    let keepGoing = true;
    while (keepGoing) {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("*, tanks!inventory_transactions_tank_id_fkey(tank_name, tank_number), bulls_catalog(bull_name)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) { console.error(error); break; }
      if (data) all.push(...(data as unknown as TxnRow[]));
      if (!data || data.length < PAGE_SIZE) keepGoing = false;
      from += PAGE_SIZE;
    }
    setRows(all);

    // Fetch context names for summaries
    const shipmentIds = [...new Set(all.filter(r => r.shipment_id).map(r => r.shipment_id!))];
    const packIds = [...new Set(all.filter(r => r.tank_pack_id).map(r => r.tank_pack_id!))];

    const shipmentNames = new Map<string, string>();
    const packNames = new Map<string, string>();

    if (shipmentIds.length > 0) {
      const { data: shipData } = await supabase
        .from("shipments")
        .select("id, semen_companies!shipments_semen_company_id_fkey(name), customers!shipments_customer_id_fkey(name)")
        .in("id", shipmentIds);
      if (shipData) {
        for (const s of shipData as any[]) {
          const co = s.semen_companies?.name || "";
          const cust = s.customers?.name || "";
          const parts: string[] = [];
          if (co) parts.push(`from ${co}`);
          if (cust) parts.push(`for ${cust}`);
          shipmentNames.set(s.id, parts.join(" ") || "");
        }
      }
    }

    if (packIds.length > 0) {
      const { data: packData } = await supabase
        .from("tank_packs")
        .select("id, tank_pack_projects(projects(name))")
        .in("id", packIds);
      if (packData) {
        for (const p of packData as any[]) {
          const projNames = (p.tank_pack_projects || [])
            .map((tpp: any) => tpp.projects?.name)
            .filter(Boolean);
          packNames.set(p.id, projNames.length > 0 ? `for ${projNames.join(", ")}` : "");
        }
      }
    }

    setContextNames({ shipments: shipmentNames, packs: packNames });
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalReceived = useMemo(
    () => rows.filter((r) => r.transaction_type === "received").reduce((s, r) => s + r.units_change, 0),
    [rows],
  );
  const totalPackedOut = useMemo(
    () => rows.filter((r) => r.transaction_type === "pack_out").reduce((s, r) => s + r.units_change, 0),
    [rows],
  );

  const typesInData = useMemo(() => {
    const s = new Set(rows.map((r) => r.transaction_type));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") list = list.filter((r) => r.transaction_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const bullName = r.bulls_catalog?.bull_name || r.custom_bull_name || "";
        const tankLabel = r.tanks ? `${r.tanks.tank_name || ""} ${r.tanks.tank_number}` : "";
        return (
          bullName.toLowerCase().includes(q) ||
          tankLabel.toLowerCase().includes(q) ||
          (r.notes || "").toLowerCase().includes(q) ||
          (r.bull_code || "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [rows, typeFilter, search]);

  const grouped = useMemo((): DateGroup[] => {
    const byDate = new Map<string, { tanks: Map<string, TxnRow[]>; untanked: TxnRow[] }>();
    for (const r of filtered) {
      const dateKey = r.created_at.slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, { tanks: new Map(), untanked: [] });
      const bucket = byDate.get(dateKey)!;
      if (r.tanks) {
        const tankKey = `${r.tanks.tank_name || ""}|${r.tanks.tank_number || ""}`;
        if (!bucket.tanks.has(tankKey)) bucket.tanks.set(tankKey, []);
        bucket.tanks.get(tankKey)!.push(r);
      } else {
        bucket.untanked.push(r);
      }
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, bucket]) => {
        const tankGroups: TankGroup[] = Array.from(bucket.tanks.entries())
          .map(([tankKey, rs]) => {
            const first = rs[0];
            return {
              tankKey,
              tankName: first.tanks?.tank_name || "—",
              tankNumber: first.tanks?.tank_number || "",
              rows: rs.sort((a, b) => b.created_at.localeCompare(a.created_at)),
              netUnits: rs.reduce((s, r) => s + r.units_change, 0),
            };
          })
          .sort((a, b) => a.tankName.localeCompare(b.tankName));

        const totalRows = tankGroups.reduce((s, g) => s + g.rows.length, 0) + bucket.untanked.length;
        const displayDate = format(new Date(dateKey + "T12:00:00"), "EEEE, MMM d, yyyy");
        return { date: dateKey, displayDate, tankGroups, untankedRows: bucket.untanked, totalRows };
      });
  }, [filtered]);

  const buildDaySummary = useCallback((dg: DateGroup): string => {
    // Collect all rows for this date
    const allRows = [
      ...dg.tankGroups.flatMap(tg => tg.rows),
      ...dg.untankedRows,
    ];

    const sentences: string[] = [];

    // Group received by shipment
    const receivedByShipment = new Map<string, { bulls: Map<string, number> }>();
    const receivedNoShipment: Map<string, number> = new Map();
    for (const r of allRows) {
      if (r.transaction_type !== "received") continue;
      const bullName = getBullDisplayName(r);
      if (r.shipment_id) {
        if (!receivedByShipment.has(r.shipment_id)) receivedByShipment.set(r.shipment_id, { bulls: new Map() });
        const entry = receivedByShipment.get(r.shipment_id)!;
        entry.bulls.set(bullName, (entry.bulls.get(bullName) || 0) + r.units_change);
      } else {
        receivedNoShipment.set(bullName, (receivedNoShipment.get(bullName) || 0) + r.units_change);
      }
    }
    for (const [shipId, entry] of receivedByShipment) {
      const context = contextNames.shipments.get(shipId) || "";
      const bullList = [...entry.bulls.entries()].map(([b, u]) => `${b} ${u}`).join(", ");
      sentences.push(`Received shipment ${context} (${bullList})`.trim());
    }
    if (receivedNoShipment.size > 0) {
      const bullList = [...receivedNoShipment.entries()].map(([b, u]) => `${b} ${u}`).join(", ");
      sentences.push(`Received inventory (${bullList})`);
    }

    // Group packs by pack_id
    const packsByPack = new Map<string, { bulls: Map<string, number> }>();
    for (const r of allRows) {
      if (r.transaction_type !== "pack_out" || !r.tank_pack_id) continue;
      if (!packsByPack.has(r.tank_pack_id)) packsByPack.set(r.tank_pack_id, { bulls: new Map() });
      const entry = packsByPack.get(r.tank_pack_id)!;
      const bullName = getBullDisplayName(r);
      entry.bulls.set(bullName, (entry.bulls.get(bullName) || 0) + Math.abs(r.units_change));
    }
    for (const [packId, entry] of packsByPack) {
      const context = contextNames.packs.get(packId) || "";
      const bullList = [...entry.bulls.entries()].map(([b, u]) => `${b} ${u}`).join(", ");
      sentences.push(`Packed tank ${context} (${bullList})`.trim());
    }

    // Unpack returns
    const unpackReturns = allRows.filter(r => r.transaction_type === "unpack_return");
    if (unpackReturns.length > 0) {
      const totalUnits = unpackReturns.reduce((s, r) => s + r.units_change, 0);
      sentences.push(`Unpack returned ${totalUnits} units`);
    }

    // Manual adds (not from shipment)
    const manualAdds = allRows.filter(r => r.transaction_type === "manual_add");
    if (manualAdds.length > 0) {
      const totalUnits = manualAdds.reduce((s, r) => s + r.units_change, 0);
      sentences.push(`${manualAdds.length} manual add${manualAdds.length !== 1 ? "s" : ""} (${totalUnits} units)`);
    }

    // Adjustments
    const adjustments = allRows.filter(r => r.transaction_type === "adjustment");
    if (adjustments.length > 0) {
      const net = adjustments.reduce((s, r) => s + r.units_change, 0);
      sentences.push(`${adjustments.length} adjustment${adjustments.length !== 1 ? "s" : ""} (net ${net > 0 ? "+" : ""}${net})`);
    }

    return sentences.join(". ") + (sentences.length > 0 ? "." : "");
  }, [contextNames]);

  const expandAll = () => {
    const allKeys = new Set<string>();
    for (const dg of grouped) {
      for (const tg of dg.tankGroups) allKeys.add(`${dg.date}::${tg.tankKey}`);
    }
    setExpandedGroups(allKeys);
  };

  const collapseAll = () => setExpandedGroups(new Set());

  return (
    <div className="space-y-8">
      {/* Sub-toggle: Timeline | Summary */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSubTab("timeline")}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "timeline"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Timeline
        </button>
        <button
          type="button"
          onClick={() => setSubTab("summary")}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "summary"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Summary
        </button>
      </div>

      {subTab === "timeline" && (
        <>
      <div>
        <h2 className="text-2xl font-bold font-display tracking-tight">Inventory Transaction Log</h2>
        <p className="text-sm text-muted-foreground mt-1">Audit trail for every semen movement</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Transactions" value={rows.length} delay={0} index={0} icon={ClipboardList} />
        <StatCard title="Units Received" value={totalReceived} delay={100} index={1} icon={PackageCheck} />
        <StatCard title="Units Packed Out" value={Math.abs(totalPackedOut)} delay={200} index={2} icon={BarChart3} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bull, tank, or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {typesInData.map((t) => (
              <SelectItem key={t} value={t}>{getTypeLabel(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="font-normal">
          {filtered.length.toLocaleString()} {filtered.length === 1 ? "row" : "rows"}
        </Badge>
      </div>

      {/* Expand / Collapse controls */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs">Expand all</Button>
        <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs">Collapse all</Button>
      </div>

      {/* Grouped layout */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading transactions…
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No transactions"
            description="No transaction history to display."
          />
        ) : (
          <div className="divide-y divide-border/50">
            {grouped.map((dg) => (
              <div key={dg.date}>
                {/* Date header with activity summary */}
                <div className="px-4 py-3 bg-muted/40">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{dg.displayDate}</h3>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {dg.totalRows} {dg.totalRows === 1 ? "transaction" : "transactions"}
                    </Badge>
                  </div>
                  {(() => {
                    const summary = buildDaySummary(dg);
                    return summary ? (
                      <p className="text-xs text-muted-foreground mt-1">{summary}</p>
                    ) : null;
                  })()}
                </div>

                {/* Tank groups within this date */}
                {dg.tankGroups.map((tg) => {
                  const groupKey = `${dg.date}::${tg.tankKey}`;
                  const isExpanded = expandedGroups.has(groupKey);
                  return (
                    <div key={tg.tankKey} className="border-t border-border/30">
                      {/* Tank group header (clickable) */}
                      <button
                        onClick={() => toggleGroup(groupKey)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 text-left transition-colors"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <span className="font-medium text-sm">
                          {tg.tankName}{tg.tankNumber ? ` (#${tg.tankNumber})` : ""}
                        </span>
                        <Badge variant="outline" className="text-xs font-normal">
                          {tg.rows.length} {tg.rows.length === 1 ? "row" : "rows"}
                        </Badge>
                        <span className={cn(
                          "ml-auto text-sm font-medium tabular-nums",
                          tg.netUnits > 0 ? "text-green-400" : tg.netUnits < 0 ? "text-red-400" : "text-muted-foreground"
                        )}>
                          {tg.netUnits > 0 ? `+${tg.netUnits}` : tg.netUnits} units net
                        </span>
                      </button>

                      {/* Expanded transaction rows */}
                      {isExpanded && (
                        <div className="bg-background/50 px-4 pb-3">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/20">
                                <TableHead className="w-[100px]">Time</TableHead>
                                <TableHead className="w-[120px]">Type</TableHead>
                                <TableHead>Bull</TableHead>
                                <TableHead className="w-[100px]">Code</TableHead>
                                <TableHead className="w-[80px] text-right">Units</TableHead>
                                <TableHead>Notes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tg.rows.map((r) => (
                                <TableRow key={r.id}>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {format(new Date(r.created_at), "h:mm a")}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={cn("text-xs font-normal whitespace-nowrap border", getTypeBadgeClass(r.transaction_type))}>
                                      {getTypeLabel(r.transaction_type)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="truncate">{getBullDisplayName(r)}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{r.bull_code || "—"}</TableCell>
                                  <TableCell className={cn("text-right font-medium tabular-nums", r.units_change > 0 ? "text-green-400" : r.units_change < 0 ? "text-red-400" : "")}>
                                    {r.units_change > 0 ? `+${r.units_change}` : r.units_change}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground truncate">{r.notes || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Untanked rows for this date */}
                {dg.untankedRows.length > 0 && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">No specific tank</p>
                    {dg.untankedRows.map((r) => (
                      <div key={r.id} className="flex items-center gap-4 text-sm">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "h:mm a")}</span>
                        <Badge variant="outline" className={cn("text-xs font-normal whitespace-nowrap border", getTypeBadgeClass(r.transaction_type))}>
                          {getTypeLabel(r.transaction_type)}
                        </Badge>
                        <span className={cn("tabular-nums font-medium", r.units_change > 0 ? "text-green-400" : r.units_change < 0 ? "text-red-400" : "")}>
                          {r.units_change > 0 ? `+${r.units_change}` : r.units_change}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{r.notes || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}

      {subTab === "summary" && (
        <WeeklySummary orgId={orgId} onNavigateToTimeline={() => setSubTab("timeline")} />
      )}
    </div>
  );
};

export default LogTab;
