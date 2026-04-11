import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Search, MoreHorizontal, Download, CalendarIcon, X, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  in_field: { label: "In Field", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  unpacked: { label: "Unpacked", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
};

const TYPE_BADGE: Record<string, string> = {
  project: "Project",
  shipment: "Shipment",
  order: "Order",
  pickup: "Pickup",
};

const Packs = () => {
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // TODO: switch to paginated loop if pack count exceeds 500 in production
  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["packs", "all", orgId, statusFilter, typeFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("tank_packs")
        .select(`
          id, packed_at, packed_by, status, pack_type, destination_name, field_tank_id, notes,
          tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number),
          tank_pack_lines(id, units),
          tank_pack_projects(project_id, projects!tank_pack_projects_project_id_fkey(name)),
          tank_pack_orders(semen_order_id, semen_orders(customer_name))
        `)
        .eq("organization_id", orgId)
        .order("packed_at", { ascending: false })
        .range(0, 999);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter !== "all") query = query.eq("pack_type", typeFilter);
      if (dateFrom) query = query.gte("packed_at", format(dateFrom, "yyyy-MM-dd"));
      if (dateTo) query = query.lte("packed_at", format(dateTo, "yyyy-MM-dd") + "T23:59:59");

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return packs;
    const q = search.toLowerCase();
    return packs.filter((row: any) => {
      const fieldTank = row.tanks as any;
      const tankLabel = (fieldTank?.tank_name || fieldTank?.tank_number || "").toLowerCase();
      const dest = (row.destination_name || "").toLowerCase();
      const packedBy = (row.packed_by || "").toLowerCase();
      const projects = (row.tank_pack_projects as any[]) || [];
      const projNames = projects.map((p: any) => (p.projects?.name || "").toLowerCase()).join(" ");
      const orders = (row.tank_pack_orders as any[]) || [];
      const orderNames = orders.map((o: any) => (o.semen_orders?.customer_name || "").toLowerCase()).join(" ");
      return tankLabel.includes(q) || dest.includes(q) || packedBy.includes(q) || projNames.includes(q) || orderNames.includes(q);
    });
  }, [packs, search]);

  const fieldTankLabel = (row: any) => {
    const t = row.tanks as any;
    return t?.tank_name || t?.tank_number || "—";
  };

  const getDestination = (row: any): string => {
    if (row.pack_type === "shipment") return row.destination_name || "—";
    if (row.pack_type === "order") {
      const orders = (row.tank_pack_orders as any[]) || [];
      if (orders.length === 0) return "—";
      const first = orders[0]?.semen_orders?.customer_name || "—";
      return orders.length > 1 ? `${first} (+${orders.length - 1} more)` : first;
    }
    // project
    const projects = (row.tank_pack_projects as any[]) || [];
    if (projects.length === 0) return "—";
    const first = projects[0]?.projects?.name || "—";
    return projects.length > 1 ? `${first} (+${projects.length - 1} more)` : first;
  };

  const getLineStats = (row: any) => {
    const lines = (row.tank_pack_lines as any[]) || [];
    return {
      count: lines.length,
      units: lines.reduce((s: number, l: any) => s + (l.units || 0), 0),
    };
  };

  const handleDelete = async (packId: string) => {
    setDeletingId(packId);
    try {
      const { error } = await supabase.from("tank_packs").delete().eq("id", packId);
      if (error) throw error;
      toast({ title: "Pack deleted", description: "Pack and related records have been removed." });
      queryClient.invalidateQueries({ queryKey: ["packs"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = ["Packed Date", "Field Tank", "Type", "Destination", "Lines", "Units", "Status", "Packed By", "Notes"];
    const rows = filtered.map((row: any) => {
      const stats = getLineStats(row);
      return [
        row.packed_at ? format(new Date(row.packed_at), "yyyy-MM-dd") : "",
        fieldTankLabel(row),
        row.pack_type || "",
        `"${getDestination(row)}"`,
        stats.count,
        stats.units,
        row.status || "",
        row.packed_by || "",
        `"${(row.notes || "").replace(/"/g, '""')}"`,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = search.trim() || statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Packs</h1>
            <p className="text-sm text-muted-foreground">All packing operations across the org</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={() => navigate("/pack-tank")} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Pack Tank
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search destination, tank, project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="in_field">In Field</SelectItem>
              <SelectItem value="unpacked">Unpacked</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="shipment">Shipment</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading packs…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {hasFilters
                  ? "No packs match your filters. Try adjusting or clearing filters."
                  : "No packs yet. Click '+ Pack Tank' to create one."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Packed Date</TableHead>
                      <TableHead>Field Tank</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Packed By</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row: any) => {
                      const stats = getLineStats(row);
                      const statusStyle = STATUS_BADGE[row.status] || STATUS_BADGE.cancelled;
                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/pack/${row.id}`)}
                        >
                          <TableCell>
                            {row.packed_at ? format(new Date(row.packed_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="font-medium">{fieldTankLabel(row)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {TYPE_BADGE[row.pack_type] || row.pack_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{getDestination(row)}</TableCell>
                          <TableCell className="text-right">{stats.count}</TableCell>
                          <TableCell className="text-right">{stats.units}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", statusStyle.className)}>
                              {statusStyle.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.packed_by || "—"}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/pack/${row.id}`)}>
                                  View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/pack/${row.id}`)}>
                                  Report
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm(
                                      row.status === "in_field"
                                        ? "⚠ WARNING: This pack is currently in the field. Deleting it will leave field tank inventory in an inconsistent state. Delete anyway?"
                                        : "Delete this pack? This will remove the pack record but will NOT automatically reverse inventory transactions."
                                    )) {
                                      handleDelete(row.id);
                                    }
                                  }}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <AppFooter />
    </div>
  );
};

export default Packs;
