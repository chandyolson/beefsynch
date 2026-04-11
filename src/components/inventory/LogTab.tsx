import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { Search, ClipboardList, BarChart3, PackageCheck } from "lucide-react";

import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 1000;

const TYPE_META: Record<string, { label: string; badgeClass: string }> = {
  received:       { label: "Received",        badgeClass: "bg-green-500/20 text-green-300 border-green-500/30" },
  pack_out:       { label: "Packed Out",       badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  unpack_return:  { label: "Unpack Return",    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  used_in_field:  { label: "Used in Field",    badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  manual_add:     { label: "Manually Added",   badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  transfer_in:    { label: "Transfer In",      badgeClass: "bg-green-500/20 text-green-300 border-green-500/30" },
  transfer_out:   { label: "Transfer Out",     badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  adjustment:     { label: "Adjustment",       badgeClass: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
};

const getTypeLabel = (t: string) => TYPE_META[t]?.label ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const getTypeBadgeClass = (t: string) => TYPE_META[t]?.badgeClass ?? "";

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
}

const LogTab = ({ orgId }: { orgId: string }) => {
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

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

  const getBullDisplay = (r: TxnRow) => r.bulls_catalog?.bull_name || r.custom_bull_name || "—";
  const getTankDisplay = (r: TxnRow) => {
    if (!r.tanks) return "—";
    const name = r.tanks.tank_name || "";
    const num = r.tanks.tank_number || "";
    return name ? `${name} (#${num})` : `#${num}`;
  };

  return (
    <div className="space-y-8">
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

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[170px]">Date</TableHead>
              <TableHead className="w-[110px]">Type</TableHead>
              <TableHead className="w-[180px]">Bull</TableHead>
              <TableHead className="w-[100px]">Bull Code</TableHead>
              <TableHead className="w-[160px]">Tank</TableHead>
              <TableHead className="w-[70px] text-right">Units</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading transactions…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No transactions found</TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs font-normal whitespace-nowrap border", getTypeBadgeClass(r.transaction_type))}>
                      {getTypeLabel(r.transaction_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="truncate">{getBullDisplay(r)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.bull_code || "—"}</TableCell>
                  <TableCell className="truncate text-sm">{getTankDisplay(r)}</TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", r.units_change > 0 ? "text-green-400" : r.units_change < 0 ? "text-red-400" : "")}>
                    {r.units_change > 0 ? `+${r.units_change}` : r.units_change}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate">{r.notes || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default LogTab;
