import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit, Droplets, RotateCcw, Truck, Sun } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";

import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  wet: "bg-green-600/20 text-green-400 border-green-600/30",
  dry: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  inactive: "bg-muted text-muted-foreground border-border",
  "bad tank": "bg-destructive/20 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const TYPE_BADGE: Record<string, string> = {
  customer_tank: "bg-teal-600/20 text-teal-400 border-teal-600/30",
  inventory_tank: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  shipper: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  mushroom: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  rental_tank: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  communal_tank: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  freeze_branding: "bg-muted text-muted-foreground border-border",
};

const TYPE_LABELS: Record<string, string> = {
  customer_tank: "Customer Tank", inventory_tank: "Inventory Tank", shipper: "Shipper",
  mushroom: "Mushroom", rental_tank: "Rental Tank", communal_tank: "Communal Tank", freeze_branding: "Freeze Branding",
};

const MOVEMENT_BADGE: Record<string, string> = {
  picked_up: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  returned: "bg-green-600/20 text-green-400 border-green-600/30",
  shipped_out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  received_back: "bg-teal-600/20 text-teal-400 border-teal-600/30",
};

const TXN_BADGE: Record<string, string> = {
  reinventory_adjustment: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  reinventory_found: "bg-green-600/20 text-green-400 border-green-600/30",
  added: "bg-green-600/20 text-green-400 border-green-600/30",
  used: "bg-destructive/20 text-destructive border-destructive/30",
};

const TANK_TYPES = [
  { value: "customer_tank", label: "Customer Tank" },
  { value: "inventory_tank", label: "Inventory Tank" },
  { value: "shipper", label: "Shipper" },
  { value: "mushroom", label: "Mushroom" },
  { value: "rental_tank", label: "Rental Tank" },
  { value: "communal_tank", label: "Communal Tank" },
  { value: "freeze_branding", label: "Freeze Branding" },
];

const ALL_STATUSES = [
  { value: "wet", label: "Wet" },
  { value: "dry", label: "Dry" },
  { value: "out", label: "Out" },
  { value: "unknown", label: "Unknown" },
  { value: "inactive", label: "Inactive" },
  { value: "bad_tank", label: "Bad Tank" },
];

const TankDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId, userId } = useOrgRole();
  const queryClient = useQueryClient();

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [eTankNumber, setETankNumber] = useState("");
  const [eTankName, setETankName] = useState("");
  const [eTankEid, setETankEid] = useState("");
  const [eTankType, setETankType] = useState("inventory_tank");
  const [eTankStatus, setETankStatus] = useState("wet");
  const [eTankModel, setETankModel] = useState("");
  const [eTankSerial, setETankSerial] = useState("");
  const [eTankDesc, setETankDesc] = useState("");
  const [eSaving, setESaving] = useState(false);

  // Fill dialog
  const [fillOpen, setFillOpen] = useState(false);
  const [fillDate, setFillDate] = useState<Date>(new Date());
  const [fillNotes, setFillNotes] = useState("");
  const [fillSaving, setFillSaving] = useState(false);

  // Movement dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState("picked_up");
  const [moveDate, setMoveDate] = useState<Date>(new Date());
  const [moveStatusAfter, setMoveStatusAfter] = useState("wet");
  const [moveCustomerId, setMoveCustomerId] = useState("none");
  const [moveProjectId, setMoveProjectId] = useState("none");
  const [moveNotes, setMoveNotes] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  // Fetch tank
  const { data: tank, isLoading } = useQuery({
    queryKey: ["tank_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tanks").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  // Inventory
  const { data: inventory = [] } = useQuery({
    queryKey: ["tank_detail_inventory", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, bulls_catalog(bull_name, company, registration_number), customers(name)")
        .eq("tank_id", id!)
        .order("canister", { ascending: true })
        .order("sub_canister", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fills
  const { data: fills = [] } = useQuery({
    queryKey: ["tank_detail_fills", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select("*")
        .eq("tank_id", id!)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Movements
  const { data: movements = [] } = useQuery({
    queryKey: ["tank_detail_movements", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_movements")
        .select("*, customers(name), projects(name)")
        .eq("tank_id", id!)
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ["tank_detail_transactions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("*, bulls_catalog(bull_name), customers(name), projects(name), semen_orders(customer_name)")
        .eq("tank_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Customers & projects for movement dialog
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").eq("organization_id", orgId!).order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects_list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("organization_id", orgId!).order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Grouped inventory by customer for communal tanks
  const isCommunal = tank?.tank_type === "communal_tank";
  const inventoryByCustomer = useMemo(() => {
    if (!isCommunal) return null;
    const map = new Map<string, { name: string; items: any[]; total: number }>();
    for (const inv of inventory) {
      const cid = inv.customer_id || "__company__";
      const cname = inv.customers?.name || "Company Owned";
      if (!map.has(cid)) map.set(cid, { name: cname, items: [], total: 0 });
      const group = map.get(cid)!;
      group.items.push(inv);
      group.total += inv.units || 0;
    }
    return Array.from(map.values());
  }, [inventory, isCommunal]);

  const totalUnits = inventory.reduce((s: number, i: any) => s + (i.units || 0), 0);

  const lastFill = fills.length > 0 ? fills[0] : null;
  const fillWarning = lastFill ? differenceInDays(new Date(), parseISO(lastFill.fill_date)) > 90 : false;

  // Edit handlers
  const openEdit = () => {
    if (!tank) return;
    setETankNumber(tank.tank_number || "");
    setETankName(tank.tank_name || "");
    setETankEid(tank.eid || "");
    setETankType(tank.tank_type || "inventory_tank");
    setETankStatus(tank.status || "wet");
    setETankModel(tank.model || "");
    setETankSerial(tank.serial_number || "");
    setETankDesc(tank.description || "");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!eTankNumber.trim() || !id) return;
    setESaving(true);
    const { error } = await supabase.from("tanks").update({
      tank_number: eTankNumber.trim(),
      tank_name: eTankName.trim() || null,
      eid: eTankEid.trim() || null,
      tank_type: eTankType,
      status: eTankStatus,
      model: eTankModel.trim() || null,
      serial_number: eTankSerial.trim() || null,
      description: eTankDesc.trim() || null,
    } as any).eq("id", id);
    setESaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not update tank.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["tank_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
      toast({ title: "Tank updated" });
      setEditOpen(false);
    }
  };

  const handleDryToggle = async () => {
    if (!id || !tank) return;
    const newStatus = tank.status === "dry" ? "wet" : "dry";
    const { error } = await supabase
      .from("tanks")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: newStatus === "dry" ? "Tank marked as dry" : "Tank marked as wet" });
    queryClient.invalidateQueries({ queryKey: ["tank_detail", id] });
  };

  // Fill handler
  const handleFillSave = async () => {
    if (!id || !orgId) return;
    if (tank?.status === "dry") {
      toast({ title: "Cannot fill a dry tank", variant: "destructive" });
      return;
    }
    setFillSaving(true);
    const { error } = await supabase.from("tank_fills").insert({
      organization_id: orgId,
      tank_id: id,
      fill_date: format(fillDate, "yyyy-MM-dd"),
      filled_by: userId,
      notes: fillNotes.trim() || null,
    } as any);
    setFillSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not record fill.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["tank_detail_fills", id] });
      toast({ title: "Fill recorded" });
      setFillOpen(false);
      setFillNotes("");
      setFillDate(new Date());
    }
  };

  // Movement handler
  const handleMoveSave = async () => {
    if (!id || !orgId) return;
    setMoveSaving(true);
    const custId = moveCustomerId === "none" ? null : moveCustomerId;
    const projId = moveProjectId === "none" ? null : moveProjectId;
    const { error: moveErr } = await supabase.from("tank_movements").insert({
      organization_id: orgId,
      tank_id: id,
      movement_type: moveType,
      movement_date: format(moveDate, "yyyy-MM-dd"),
      tank_status_after: moveStatusAfter,
      customer_id: custId,
      project_id: projId,
      performed_by: userId,
      notes: moveNotes.trim() || null,
    } as any);
    if (moveErr) {
      setMoveSaving(false);
      toast({ title: "Error", description: "Could not record movement.", variant: "destructive" });
      return;
    }
    // Update tank status
    await supabase.from("tanks").update({ status: moveStatusAfter } as any).eq("id", id);
    setMoveSaving(false);
    queryClient.invalidateQueries({ queryKey: ["tank_detail", id] });
    queryClient.invalidateQueries({ queryKey: ["tank_detail_movements", id] });
    queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
    toast({ title: "Movement recorded" });
    setMoveOpen(false);
    setMoveNotes("");
    setMoveType("picked_up");
    setMoveDate(new Date());
    setMoveStatusAfter("wet");
    setMoveCustomerId("none");
    setMoveProjectId("none");
  };

  const tankLabel = tank?.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank?.tank_number || "Tank";

  if (isLoading) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main></div>;
  }
  if (!tank) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Tank not found.</p></main></div>;
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink onClick={() => navigate("/tanks")} className="cursor-pointer">Tanks</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{tankLabel}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/tanks")} className="mt-1"><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight">{tankLabel}</h1>
              <div className="flex flex-wrap gap-2 mt-1 items-center">
                <Badge variant="outline" className={TYPE_BADGE[tank.tank_type] || "bg-muted text-muted-foreground border-border"}>
                  {TYPE_LABELS[tank.tank_type] || tank.tank_type}
                </Badge>
                <Badge variant="outline" className={STATUS_BADGE[tank.status] || "bg-muted text-muted-foreground border-border"}>
                  {tank.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                {tank.model && <span>Model: {tank.model}</span>}
                {tank.serial_number && <span>S/N: {tank.serial_number}</span>}
                {tank.eid && <span>EID: {tank.eid}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5"><Edit className="h-4 w-4" /> Edit</Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/tanks/${id}/reinventory`)} className="gap-1.5"><RotateCcw className="h-4 w-4" /> Re-inventory</Button>
            <Button variant="outline" size="sm" onClick={() => { setFillDate(new Date()); setFillNotes(""); setFillOpen(true); }} className="gap-1.5"><Droplets className="h-4 w-4" /> Record Fill</Button>
            <Button variant="outline" size="sm" onClick={() => { setMoveDate(new Date()); setMoveNotes(""); setMoveType("picked_up"); setMoveStatusAfter("wet"); setMoveCustomerId("none"); setMoveProjectId("none"); setMoveOpen(true); }} className="gap-1.5"><Truck className="h-4 w-4" /> Record Movement</Button>
          </div>
        </div>

        {/* ───── Inventory ───── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Inventory ({totalUnits} units)</h2>

          {isCommunal && inventoryByCustomer ? (
            inventoryByCustomer.map((group, gi) => (
              <div key={gi} className="mb-4">
                <h3 className="text-sm font-semibold mb-1">{group.name} — {group.total} units</h3>
                <div className="rounded-lg border border-border/50 overflow-hidden mb-2">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/10">
                      <TableHead>Canister</TableHead><TableHead>Sub-can</TableHead><TableHead>Bull</TableHead><TableHead>Bull Code</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Units</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {group.items.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.canister}</TableCell>
                          <TableCell>{inv.sub_canister || "—"}</TableCell>
                          <TableCell>{inv.bulls_catalog?.bull_name || inv.custom_bull_name || "—"}</TableCell>
                          <TableCell>{inv.bull_code || "—"}</TableCell>
                          <TableCell>{inv.bulls_catalog?.company || "—"}</TableCell>
                          <TableCell className="text-right">{inv.units}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/10">
                  <TableHead>Canister</TableHead><TableHead>Sub-can</TableHead><TableHead>Bull</TableHead><TableHead>Bull Code</TableHead><TableHead>Company</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Units</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {inventory.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No inventory</TableCell></TableRow>
                  ) : (
                    <>
                      {inventory.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.canister}</TableCell>
                          <TableCell>{inv.sub_canister || "—"}</TableCell>
                          <TableCell>{inv.bulls_catalog?.bull_name || inv.custom_bull_name || "—"}</TableCell>
                          <TableCell>{inv.bull_code || "—"}</TableCell>
                          <TableCell>{inv.bulls_catalog?.company || "—"}</TableCell>
                          <TableCell>{inv.owner || inv.customers?.name || "—"}</TableCell>
                          <TableCell className="text-right">{inv.units}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/20 font-semibold">
                        <TableCell colSpan={6}>Total</TableCell>
                        <TableCell className="text-right">{totalUnits}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ───── Fill History ───── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Fill History</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/10">
                <TableHead>Fill Date</TableHead><TableHead>Filled By</TableHead><TableHead>Notes</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {fills.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No fills recorded</TableCell></TableRow>
                ) : fills.map((f: any, i: number) => (
                  <TableRow key={f.id} className={i === 0 && fillWarning ? "bg-amber-500/10" : ""}>
                    <TableCell className={cn("whitespace-nowrap", i === 0 && fillWarning && "text-orange-400")}>
                      {format(parseISO(f.fill_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{f.filled_by ? f.filled_by.substring(0, 8) + "…" : "—"}</TableCell>
                    <TableCell>{f.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ───── Movement History ───── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Movement History</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/10">
                <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Status After</TableHead><TableHead>Customer</TableHead><TableHead>Project</TableHead><TableHead>Notes</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No movements recorded</TableCell></TableRow>
                ) : movements.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{format(parseISO(m.movement_date), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge variant="outline" className={MOVEMENT_BADGE[m.movement_type] || "bg-muted text-muted-foreground border-border"}>{m.movement_type.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[m.tank_status_after] || "bg-muted text-muted-foreground border-border"}>{m.tank_status_after}</Badge></TableCell>
                    <TableCell>{m.customers?.name || "—"}</TableCell>
                    <TableCell>{m.projects?.name || "—"}</TableCell>
                    <TableCell>{m.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ───── Transaction History ───── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/10">
                <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Bull</TableHead><TableHead className="text-right">Units</TableHead><TableHead>Customer</TableHead><TableHead>Project/Order</TableHead><TableHead>Reason</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions recorded</TableCell></TableRow>
                ) : transactions.map((t: any) => {
                  const bullName = t.bulls_catalog?.bull_name || t.custom_bull_name || "—";
                  const projOrder = t.projects?.name || t.semen_orders?.customer_name || "—";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{format(parseISO(t.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell><Badge variant="outline" className={TXN_BADGE[t.transaction_type] || "bg-muted text-muted-foreground border-border"}>{t.transaction_type.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{bullName}</TableCell>
                      <TableCell className={cn("text-right font-medium", t.units_change < 0 ? "text-destructive" : "text-green-400")}>
                        {t.units_change > 0 ? `+${t.units_change}` : t.units_change}
                      </TableCell>
                      <TableCell>{t.customers?.name || "—"}</TableCell>
                      <TableCell>{projOrder}</TableCell>
                      <TableCell className="text-xs">{t.reason || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {/* ───── Edit Tank Dialog ───── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Tank</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Tank Number *</Label><Input value={eTankNumber} onChange={(e) => setETankNumber(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tank Name</Label><Input value={eTankName} onChange={(e) => setETankName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>EID</Label><Input value={eTankEid} onChange={(e) => setETankEid(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tank Type</Label>
                <Select value={eTankType} onValueChange={setETankType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TANK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={eTankStatus} onValueChange={setETankStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Model</Label><Input value={eTankModel} onChange={(e) => setETankModel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Serial Number</Label><Input value={eTankSerial} onChange={(e) => setETankSerial(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={eTankDesc} onChange={(e) => setETankDesc(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={eSaving || !eTankNumber.trim()}>{eSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───── Record Fill Dialog ───── */}
      <Dialog open={fillOpen} onOpenChange={setFillOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Fill</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Fill Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fillDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fillDate ? format(fillDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fillDate} onSelect={(d) => d && setFillDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={fillNotes} onChange={(e) => setFillNotes(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFillOpen(false)}>Cancel</Button>
              <Button onClick={handleFillSave} disabled={fillSaving}>{fillSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───── Record Movement Dialog ───── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Movement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Movement Type</Label>
              <Select value={moveType} onValueChange={setMoveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="picked_up">Picked Up</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="shipped_out">Shipped Out</SelectItem>
                  <SelectItem value="received_back">Received Back</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !moveDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {moveDate ? format(moveDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={moveDate} onSelect={(d) => d && setMoveDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Status After</Label>
              <Select value={moveStatusAfter} onValueChange={setMoveStatusAfter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={moveCustomerId} onValueChange={setMoveCustomerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={moveProjectId} onValueChange={setMoveProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
              <Button onClick={handleMoveSave} disabled={moveSaving}>{moveSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
};

export default TankDetail;
