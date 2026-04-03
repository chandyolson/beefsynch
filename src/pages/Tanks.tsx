import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Search, Package, Droplets, Sun, Truck } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  bad_tank: "bg-destructive/20 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const TYPE_LABELS: Record<string, string> = {
  customer_tank: "Customer Tank",
  inventory_tank: "Inventory Tank",
  shipper: "Shipper",
  mushroom: "Mushroom",
  rental_tank: "Rental Tank",
  communal_tank: "Communal Tank",
  freeze_branding: "Freeze Branding",
};

const Tanks = () => {
  const navigate = useNavigate();
  const { orgId, orgName } = useOrgRole();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Add tank dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tankNumber, setTankNumber] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankEid, setTankEid] = useState("");
  const [tankCustomerId, setTankCustomerId] = useState<string>("none");
  const [tankType, setTankType] = useState("customer_tank");
  const [tankStatus, setTankStatus] = useState("wet");
  const [tankModel, setTankModel] = useState("");
  const [tankSerial, setTankSerial] = useState("");
  const [tankDesc, setTankDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch tanks
  const { data: tanks = [], isLoading } = useQuery({
    queryKey: ["all_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*, customers(name)")
        .eq("organization_id", orgId!)
        .order("tank_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch customers for dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch tank fills (latest per tank)
  const { data: fills = [] } = useQuery({
    queryKey: ["tank_fills_all", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select("tank_id, fill_date")
        .eq("organization_id", orgId!)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch inventory sums
  const { data: inventory = [] } = useQuery({
    queryKey: ["tank_inventory_sums", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("tank_id, units")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Computed maps
  const lastFillMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fills) {
      if (!map.has(f.tank_id)) map.set(f.tank_id, f.fill_date);
    }
    return map;
  }, [fills]);

  const unitSumMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      map.set(inv.tank_id, (map.get(inv.tank_id) || 0) + (inv.units || 0));
    }
    return map;
  }, [inventory]);

  // Enriched tanks
  const enriched = useMemo(() =>
    tanks.map((t: any) => ({
      ...t,
      customerName: t.customers?.name || null,
      lastFill: lastFillMap.get(t.id) || null,
      totalUnits: unitSumMap.get(t.id) || 0,
    })),
    [tanks, lastFillMap, unitSumMap]
  );

  // Filtered
  const filtered = useMemo(() => {
    let list = enriched;
    if (typeFilter !== "all") list = list.filter((t: any) => t.tank_type === typeFilter);
    if (statusFilter !== "all") list = list.filter((t: any) => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t: any) =>
        (t.tank_number || "").toLowerCase().includes(q) ||
        (t.tank_name || "").toLowerCase().includes(q) ||
        (t.customerName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [enriched, typeFilter, statusFilter, search]);

  // Stats
  const totalTanks = tanks.length;
  const wetCount = tanks.filter((t: any) => t.status === "wet").length;
  const dryCount = tanks.filter((t: any) => t.status === "dry").length;
  const outCount = tanks.filter((t: any) => t.status === "out").length;

  // Save tank
  const handleSave = async () => {
    if (!tankNumber.trim() || !orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("tanks")
      .insert({
        organization_id: orgId,
        tank_number: tankNumber.trim(),
        tank_name: tankName.trim() || null,
        eid: tankEid.trim() || null,
        customer_id: tankCustomerId === "none" ? null : tankCustomerId,
        tank_type: tankType,
        status: tankStatus,
        model: tankModel.trim() || null,
        serial_number: tankSerial.trim() || null,
        description: tankDesc.trim() || null,
      } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not add tank.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
      toast({ title: "Tank added" });
      setDialogOpen(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setTankNumber(""); setTankName(""); setTankEid("");
    setTankCustomerId("none"); setTankType("customer_tank");
    setTankStatus("wet"); setTankModel(""); setTankSerial(""); setTankDesc("");
  };

  const getFillColor = (lastFill: string | null) => {
    if (!lastFill) return "";
    const days = differenceInDays(new Date(), parseISO(lastFill));
    if (days > 90) return "text-orange-400";
    return "";
  };

  const handleEyeClick = (tank: any) => {
    if (tank.customer_id) {
      navigate(`/customers/${tank.customer_id}`);
    } else {
      navigate(`/tanks/${tank.id}`);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold font-display tracking-tight">Tanks</h2>
          <Button className="gap-2" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Tank
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard title="Total Tanks" value={totalTanks} delay={0} index={0} icon={Package} />
          <StatCard title="Wet" value={wetCount} delay={100} index={1} icon={Droplets} />
          <StatCard title="Dry" value={dryCount} delay={200} index={2} icon={Sun} />
          <StatCard title="Out" value={outCount} delay={300} index={3} icon={Truck} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TANK_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tanks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="whitespace-nowrap">Tank Number</TableHead>
                <TableHead className="whitespace-nowrap">Tank Name</TableHead>
                <TableHead className="whitespace-nowrap">Customer</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Model</TableHead>
                <TableHead className="whitespace-nowrap">Last Fill</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total Units</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    {tanks.length === 0 ? "No tanks yet." : "No tanks match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((tank: any) => (
                  <TableRow key={tank.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium whitespace-nowrap">{tank.tank_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{tank.tank_name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{tank.customerName || orgName || "Company Owned"}</TableCell>
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
                    <TableCell className="whitespace-nowrap">{tank.model || "—"}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", getFillColor(tank.lastFill))}>
                      {tank.lastFill ? format(parseISO(tank.lastFill), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">{tank.totalUnits}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEyeClick(tank)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Add Tank Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Tank</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tank Number *</Label>
              <Input value={tankNumber} onChange={(e) => setTankNumber(e.target.value)} placeholder="e.g. T-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Tank Name</Label>
              <Input value={tankName} onChange={(e) => setTankName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>EID</Label>
              <Input value={tankEid} onChange={(e) => setTankEid(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={tankCustomerId} onValueChange={setTankCustomerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Company Owned</SelectItem>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tank Type</Label>
                <Select value={tankType} onValueChange={setTankType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TANK_TYPES.filter((t) => t.value !== "all").map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={tankStatus} onValueChange={setTankStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.filter((s) => s.value !== "all").map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input value={tankModel} onChange={(e) => setTankModel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input value={tankSerial} onChange={(e) => setTankSerial(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={tankDesc} onChange={(e) => setTankDesc(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !tankNumber.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
};

export default Tanks;
