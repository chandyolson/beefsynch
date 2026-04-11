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
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Search, MoreHorizontal, Download, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const Unpacks = () => {
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: unpacks = [], isLoading } = useQuery({
    queryKey: ["unpacks", orgId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("tank_packs")
        .select(`
          id, unpacked_at, unpacked_by, field_tank_id, packed_at,
          tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number),
          tank_unpack_lines(id, units_returned, destination_tank_id, bull_name,
            tanks!tank_unpack_lines_destination_tank_id_fkey(tank_name, tank_number)),
          tank_pack_projects(project_id,
            projects!tank_pack_projects_project_id_fkey(name))
        `)
        .eq("organization_id", orgId)
        .eq("status", "unpacked")
        .order("unpacked_at", { ascending: false })
        .range(0, 999);

      if (dateFrom) query = query.gte("unpacked_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("unpacked_at", end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return unpacks;
    const q = search.toLowerCase();
    return unpacks.filter((row: any) => {
      const fieldTank = row.tanks as any;
      const tankLabel = (fieldTank?.tank_name || fieldTank?.tank_number || "").toLowerCase();
      const projects = (row.tank_pack_projects as any[]) || [];
      const projNames = projects.map((p: any) => (p.projects?.name || "").toLowerCase()).join(" ");
      const unpackedBy = (row.unpacked_by || "").toLowerCase();
      return tankLabel.includes(q) || projNames.includes(q) || unpackedBy.includes(q);
    });
  }, [unpacks, search]);

  const getRowStats = (row: any) => {
    const lines = (row.tank_unpack_lines as any[]) || [];
    const totalReturned = lines.reduce((s: number, l: any) => s + (l.units_returned || 0), 0);
    const destTanks = new Set<string>();
    for (const l of lines) {
      const t = l.tanks as any;
      if (t) destTanks.add(t.tank_name || t.tank_number || "Unknown");
    }
    return {
      lineCount: lines.length,
      totalReturned,
      returnedTo: destTanks.size > 0 ? Array.from(destTanks).join(", ") : "—",
    };
  };

  const fieldTankLabel = (row: any) => {
    const t = row.tanks as any;
    return t?.tank_name || t?.tank_number || "—";
  };

  const handleDelete = async (packId: string) => {
    setDeletingId(packId);
    try {
      // Delete unpack lines
      const { error: lineErr } = await supabase
        .from("tank_unpack_lines")
        .delete()
        .eq("tank_pack_id", packId);
      if (lineErr) throw lineErr;

      // Reset parent pack
      const { error: packErr } = await supabase
        .from("tank_packs")
        .update({ status: "in_field", unpacked_at: null, unpacked_by: null })
        .eq("id", packId);
      if (packErr) throw packErr;

      toast({
        title: "Unpack reversed",
        description: "Parent pack returned to 'in field' status.",
      });
      queryClient.invalidateQueries({ queryKey: ["unpacks"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = ["Unpacked Date", "Field Tank", "Pack ID", "Returned To", "Lines", "Units Returned", "Unpacked By"];
    const rows = filtered.map((row: any) => {
      const stats = getRowStats(row);
      return [
        row.unpacked_at ? format(new Date(row.unpacked_at), "yyyy-MM-dd HH:mm") : "",
        fieldTankLabel(row),
        row.id,
        stats.returnedTo,
        stats.lineCount,
        stats.totalReturned,
        row.unpacked_by || "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unpacks-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = search.trim() || dateFrom || dateTo;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Unpacks</h1>
            <p className="text-sm text-muted-foreground">All field tank returns and used-in-field records</p>
          </div>
          <Button variant="outline" onClick={handleExportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tank, project, unpacker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

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
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading unpacks…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {hasFilters
                  ? "No unpacks match your filters."
                  : "No unpacks yet. Unpacks happen from a pack's detail page after a pack returns from the field."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unpacked Date</TableHead>
                      <TableHead>Field Tank</TableHead>
                      <TableHead>Original Pack</TableHead>
                      <TableHead>Returned To</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Units Returned</TableHead>
                      <TableHead>Unpacked By</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row: any) => {
                      const stats = getRowStats(row);
                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/pack/${row.id}`)}
                        >
                          <TableCell>
                            {row.unpacked_at ? format(new Date(row.unpacked_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="font-medium">{fieldTankLabel(row)}</TableCell>
                          <TableCell>
                            <button
                              className="text-primary hover:underline text-sm"
                              onClick={(e) => { e.stopPropagation(); navigate(`/pack/${row.id}`); }}
                            >
                              {row.packed_at ? format(new Date(row.packed_at), "MMM d") : row.id.slice(0, 8)}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm">{stats.returnedTo}</TableCell>
                          <TableCell className="text-right">{stats.lineCount}</TableCell>
                          <TableCell className="text-right">{stats.totalReturned}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.unpacked_by || "—"}</TableCell>
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm("Delete this unpack record? This will remove the record but will NOT automatically reverse inventory transactions.")) {
                                      handleDelete(row.id);
                                    }
                                  }}
                                >
                                  {deletingId === row.id ? "Deleting…" : "Delete"}
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

export default Unpacks;
