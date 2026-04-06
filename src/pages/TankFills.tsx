import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, Droplets, Search, Upload, Check, X, FileSpreadsheet } from "lucide-react";
import { format, parseISO, differenceInDays, parse, isValid } from "date-fns";
import Papa from "papaparse";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

/* ── constants ──────────────────────────────────────── */
const TYPE_BADGE: Record<string, string> = {
  customer_tank: "bg-teal-600/20 text-teal-400 border-teal-600/30",
  inventory_tank: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  shipper: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  mushroom: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  rental_tank: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  communal_tank: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  freeze_branding: "bg-muted text-muted-foreground border-border",
};
const STATUS_BADGE: Record<string, string> = {
  wet: "bg-green-600/20 text-green-400 border-green-600/30",
  dry: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  inactive: "bg-muted text-muted-foreground border-border",
  "bad tank": "bg-destructive/20 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",
};
const TYPE_LABELS: Record<string, string> = {
  customer_tank: "Customer Tank", inventory_tank: "Inventory Tank", shipper: "Shipper",
  mushroom: "Mushroom", rental_tank: "Rental Tank", communal_tank: "Communal Tank", freeze_branding: "Freeze Branding",
};
const TANK_TYPES = [
  { value: "all", label: "All Types" },
  { value: "customer_tank", label: "Customer Tank" },
  { value: "inventory_tank", label: "Inventory Tank" },
  { value: "shipper", label: "Shipper" },
  { value: "mushroom", label: "Mushroom" },
  { value: "rental_tank", label: "Rental Tank" },
  { value: "communal_tank", label: "Communal Tank" },
  { value: "freeze_branding", label: "Freeze Branding" },
];
const STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "wet", label: "Wet" },
  { value: "dry", label: "Dry" },
  { value: "out", label: "Out" },
  { value: "unknown", label: "Unknown" },
  { value: "inactive", label: "Inactive" },
  { value: "bad_tank", label: "Bad Tank" },
];

const EID_HEADERS = ["eid", "tank_eid", "tank_number", "tank", "number", "id", "tag", "electronic_id"];
const DATE_HEADERS = ["date", "fill_date", "scan_date", "filled", "timestamp"];
const DATE_FORMATS = ["yyyy-MM-dd", "MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "yyyy/MM/dd"];

function tryParseDate(raw: string): Date | null {
  if (!raw) return null;
  for (const fmt of DATE_FORMATS) {
    const d = parse(raw.trim(), fmt, new Date());
    if (isValid(d)) return d;
  }
  const fallback = new Date(raw.trim());
  return isValid(fallback) ? fallback : null;
}

interface BulkRow {
  rowNum: number;
  csvValue: string;
  matchedTank: { id: string; tank_number: string; tank_name: string | null } | null;
  parsedDate: Date | null;
}

/* ── component ──────────────────────────────────────── */
const TankFills = () => {
  const { orgId, userId } = useOrgRole();
  const queryClient = useQueryClient();

  // Quick entry
  const [selectedTankId, setSelectedTankId] = useState<string>("");
  const [fillDate, setFillDate] = useState<Date>(new Date());
  const [fillSaving, setFillSaving] = useState(false);

  // Bulk import
  const fileRef = useRef<HTMLInputElement>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
  const [bulkDate, setBulkDate] = useState<Date>(new Date());
  const [useSingleDate, setUseSingleDate] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("wet");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch tanks
  const { data: tanks = [] } = useQuery({
    queryKey: ["all_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*, customers(name)")
        .eq("organization_id", orgId!)
        .order("tank_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all fills
  const { data: fills = [] } = useQuery({
    queryKey: ["all_tank_fills", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select("tank_id, fill_date")
        .eq("organization_id", orgId!)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Last fill per tank
  const lastFillMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fills) {
      if (!map.has(f.tank_id)) map.set(f.tank_id, f.fill_date);
    }
    return map;
  }, [fills]);

  // Enriched tanks
  const enriched = useMemo(() =>
    tanks.map((t: any) => {
      const lastFill = lastFillMap.get(t.id) || null;
      const daysSince = lastFill ? differenceInDays(new Date(), parseISO(lastFill)) : null;
      return { ...t, customerName: t.customers?.name || null, lastFill, daysSince };
    }),
    [tanks, lastFillMap]
  );

  // Filtered & sorted
  const filtered = useMemo(() => {
    let list = enriched;
    if (typeFilter !== "all") list = list.filter((t: any) => t.tank_type === typeFilter);
    if (statusFilter !== "all") list = list.filter((t: any) => t.status === statusFilter);
    if (overdueOnly) list = list.filter((t: any) => t.daysSince === null || t.daysSince > 90);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t: any) =>
        (t.tank_number || "").toLowerCase().includes(q) ||
        (t.tank_name || "").toLowerCase().includes(q) ||
        (t.customerName || "").toLowerCase().includes(q)
      );
    }
    list.sort((a: any, b: any) => {
      const ad = a.daysSince ?? 99999;
      const bd = b.daysSince ?? 99999;
      return bd - ad;
    });
    return list;
  }, [enriched, typeFilter, statusFilter, overdueOnly, search]);

  // Record single fill
  const handleRecordFill = async () => {
    if (!selectedTankId || !orgId) return;
    setFillSaving(true);
    const { error } = await supabase.from("tank_fills").insert({
      organization_id: orgId,
      tank_id: selectedTankId,
      fill_date: format(fillDate, "yyyy-MM-dd"),
      filled_by: userId,
    });
    setFillSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not record fill.", variant: "destructive" });
    } else {
      const tank = tanks.find((t: any) => t.id === selectedTankId);
      toast({ title: "Fill recorded", description: tank ? `${tank.tank_number} ${tank.tank_name || ""}` : "" });
      queryClient.invalidateQueries({ queryKey: ["all_tank_fills"] });
      setSelectedTankId("");
    }
  };

  // CSV parsing
  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        

        // Detect columns
        let idCol = headers[0];
        for (const h of headers) {
          if (EID_HEADERS.includes(h.toLowerCase().trim())) { idCol = h; break; }
        }
        let dateCol: string | null = null;
        for (const h of headers) {
          if (DATE_HEADERS.includes(h.toLowerCase().trim())) { dateCol = h; break; }
        }
        if (!dateCol && headers.length > 1) dateCol = headers[1];

        const rows: BulkRow[] = (results.data as any[]).map((row, i) => {
          const rawId = (row[idCol] || "").toString().trim();
          const rawDate = dateCol ? (row[dateCol] || "").toString().trim() : "";
          const match = tanks.find((t: any) =>
            (t.eid && t.eid.toLowerCase() === rawId.toLowerCase()) ||
            t.tank_number.toLowerCase() === rawId.toLowerCase()
          );
          return {
            rowNum: i + 1,
            csvValue: rawId,
            matchedTank: match ? { id: match.id, tank_number: match.tank_number, tank_name: match.tank_name } : null,
            parsedDate: tryParseDate(rawDate),
          };
        });

        // Determine if all dates are same or missing
        const validDates = rows.filter(r => r.parsedDate).map(r => format(r.parsedDate!, "yyyy-MM-dd"));
        const uniqueDates = new Set(validDates);
        const needSingle = validDates.length === 0 || uniqueDates.size <= 1;
        setUseSingleDate(needSingle);
        setBulkRows(rows);
      },
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const matchedRows = bulkRows?.filter(r => r.matchedTank) ?? [];
  const unmatchedCount = (bulkRows?.length ?? 0) - matchedRows.length;

  const handleBulkImport = async () => {
    if (!orgId || matchedRows.length === 0) return;
    setBulkImporting(true);
    const inserts = matchedRows.map(r => ({
      organization_id: orgId,
      tank_id: r.matchedTank!.id,
      fill_date: format(useSingleDate || !r.parsedDate ? bulkDate : r.parsedDate, "yyyy-MM-dd"),
      filled_by: userId,
      notes: "Bulk import",
    }));
    const { error } = await supabase.from("tank_fills").insert(inserts);
    setBulkImporting(false);
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Imported ${matchedRows.length} tank fills` });
      setBulkRows(null);
      queryClient.invalidateQueries({ queryKey: ["all_tank_fills"] });
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <h2 className="text-2xl font-bold font-display tracking-tight">Tank Fills</h2>

        {/* Section 1 — Quick Fill Entry */}
        <div className="rounded-lg border border-border/50 p-4 bg-muted/10 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Record Fill</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 min-w-[240px] flex-1 max-w-sm">
              <Label>Tank</Label>
              <Select value={selectedTankId} onValueChange={setSelectedTankId}>
                <SelectTrigger><SelectValue placeholder="Select tank…" /></SelectTrigger>
                <SelectContent>
                  {tanks.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tank_number}{t.tank_name ? ` — ${t.tank_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fill Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(fillDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fillDate} onSelect={(d) => d && setFillDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleRecordFill} disabled={fillSaving || !selectedTankId} className="gap-2">
              <Droplets className="h-4 w-4" /> {fillSaving ? "Saving…" : "Record Fill"}
            </Button>
          </div>
        </div>

        {/* Section 2 — Bulk Import */}
        <div className="rounded-lg border border-border/50 p-4 bg-muted/10 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bulk Import Fills</h3>

          {!bulkRows ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileChange(e.dataTransfer.files?.[0]); }}
              className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload CSV of scanned tank fills</p>
              <p className="text-xs text-muted-foreground">Drag & drop or click to browse (.csv)</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0])} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-sm">
                  <span className="font-medium text-foreground">{matchedRows.length}</span> of{" "}
                  <span className="font-medium text-foreground">{bulkRows.length}</span> rows matched.
                  {unmatchedCount > 0 && (
                    <span className="text-destructive ml-1">{unmatchedCount} unmatched.</span>
                  )}
                </p>
                {useSingleDate && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Fill Date for All:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-[160px] justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {format(bulkDate, "PPP")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={bulkDate} onSelect={(d) => d && setBulkDate(d)} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div className="rounded-lg border border-border/50 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>CSV Value</TableHead>
                      <TableHead>Matched Tank</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-12 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkRows.map((row) => (
                      <TableRow key={row.rowNum} className={!row.matchedTank ? "bg-destructive/5" : ""}>
                        <TableCell className="text-muted-foreground">{row.rowNum}</TableCell>
                        <TableCell className="font-mono text-sm">{row.csvValue}</TableCell>
                        <TableCell>
                          {row.matchedTank ? (
                            <span>{row.matchedTank.tank_number}{row.matchedTank.tank_name ? ` — ${row.matchedTank.tank_name}` : ""}</span>
                          ) : (
                            <span className="text-destructive font-medium">NO MATCH</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {useSingleDate
                            ? format(bulkDate, "MMM d, yyyy")
                            : row.parsedDate
                              ? format(row.parsedDate, "MMM d, yyyy")
                              : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.matchedTank ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-destructive mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={handleBulkImport} disabled={bulkImporting || matchedRows.length === 0} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {bulkImporting ? "Importing…" : `Import ${matchedRows.length} Fills`}
                </Button>
                <Button variant="outline" onClick={() => setBulkRows(null)}>Clear</Button>
              </div>
            </div>
          )}
        </div>

        {/* Section 3 — Overdue Report */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Overdue Tanks Report</h3>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TANK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={overdueOnly} onCheckedChange={setOverdueOnly} id="overdue-toggle" />
              <Label htmlFor="overdue-toggle" className="text-sm">Overdue only</Label>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Tank Number</TableHead>
                  <TableHead>Tank Name</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Fill</TableHead>
                  <TableHead className="text-right">Days Since</TableHead>
                  <TableHead className="text-center">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No tanks match filters.</TableCell></TableRow>
                ) : filtered.map((tank: any) => (
                  <TableRow key={tank.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium whitespace-nowrap">{tank.tank_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{tank.tank_name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{tank.customerName || "Company"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_BADGE[tank.tank_type] || "bg-muted text-muted-foreground border-border"}>
                        {TYPE_LABELS[tank.tank_type] || tank.tank_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[tank.status] || "bg-muted text-muted-foreground border-border"}>
                        {tank.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {tank.lastFill ? format(parseISO(tank.lastFill), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-medium",
                      tank.daysSince !== null && tank.daysSince > 120 && "text-destructive",
                      tank.daysSince !== null && tank.daysSince > 90 && tank.daysSince <= 120 && "text-orange-400",
                    )}>
                      {tank.daysSince !== null ? tank.daysSince : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {tank.daysSince === null ? (
                        <span className="text-xs text-muted-foreground">No fills</span>
                      ) : tank.daysSince > 120 ? (
                        <AlertCircle className="h-4 w-4 text-destructive mx-auto" />
                      ) : tank.daysSince > 90 ? (
                        <AlertTriangle className="h-4 w-4 text-orange-400 mx-auto" />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default TankFills;
