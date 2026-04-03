import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit, Package, Archive, Dna, Plus, FileText } from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import BullCombobox from "@/components/BullCombobox";
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
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const STATUS_COLORS: Record<string, string> = {
  wet: "bg-green-600/20 text-green-400 border-green-600/30",
  dry: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  "bad tank": "bg-destructive/20 text-destructive border-destructive/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();

  // Edit customer dialog
  const [editOpen, setEditOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Add tank dialog
  const [tankDialogOpen, setTankDialogOpen] = useState(false);
  const [tankNumber, setTankNumber] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankEid, setTankEid] = useState("");
  const [tankType, setTankType] = useState("customer_tank");
  const [tankStatus, setTankStatus] = useState("wet");
  const [tankModel, setTankModel] = useState("");
  const [tankSerial, setTankSerial] = useState("");
  const [tankDesc, setTankDesc] = useState("");
  const [tankSaving, setTankSaving] = useState(false);

  // Add semen dialog
  const [semenDialogOpen, setSemenDialogOpen] = useState(false);
  const [semenTankId, setSemenTankId] = useState<string | null>(null);
  const [semenCanister, setSemenCanister] = useState("");
  const [semenSubCanister, setSemenSubCanister] = useState("");
  const [semenBullName, setSemenBullName] = useState("");
  const [semenBullCatalogId, setSemenBullCatalogId] = useState<string | null>(null);
  const [semenBullCode, setSemenBullCode] = useState("");
  const [semenUnits, setSemenUnits] = useState("");
  const [semenStorageType, setSemenStorageType] = useState("customer");
  const [semenNotes, setSemenNotes] = useState("");
  const [semenSaving, setSemenSaving] = useState(false);

  // Fetch customer
  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Fetch tanks owned by this customer
  const { data: ownedTanks = [] } = useQuery({
    queryKey: ["customer_tanks", id, orgId],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("customer_id", id!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch inventory rows for this customer (to find communal tanks)
  const { data: customerInventory = [] } = useQuery({
    queryKey: ["customer_inventory", id, orgId],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, bulls_catalog(bull_name, company, registration_number)")
        .eq("organization_id", orgId!)
        .eq("customer_id", id!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Find communal tank IDs (tanks holding this customer's semen but not owned by them)
  const communalTankIds = useMemo(() => {
    const ownedSet = new Set(ownedTanks.map((t: any) => t.id));
    const extra = new Set<string>();
    for (const inv of customerInventory) {
      if (!ownedSet.has(inv.tank_id)) extra.add(inv.tank_id);
    }
    return Array.from(extra);
  }, [ownedTanks, customerInventory]);

  // Fetch communal tanks
  const { data: communalTanks = [] } = useQuery({
    queryKey: ["communal_tanks", communalTankIds],
    enabled: communalTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*")
        .in("id", communalTankIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // All tanks combined
  const allTanks = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of ownedTanks) map.set(t.id, t);
    for (const t of communalTanks) map.set(t.id, t);
    return Array.from(map.values());
  }, [ownedTanks, communalTanks]);

  // Fetch ALL inventory for these tanks (not just this customer's, but we'll filter display)
  const allTankIds = useMemo(() => allTanks.map((t: any) => t.id), [allTanks]);

  const { data: allInventory = [] } = useQuery({
    queryKey: ["tank_inventory_all", allTankIds, id],
    enabled: allTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, bulls_catalog(bull_name, company, registration_number)")
        .in("tank_id", allTankIds)
        .or(`customer_id.eq.${id},customer_id.is.null`);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Group inventory by tank
  const inventoryByTank = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const inv of allInventory) {
      const arr = map.get(inv.tank_id) || [];
      arr.push(inv);
      map.set(inv.tank_id, arr);
    }
    // Sort each group
    for (const [, arr] of map) {
      arr.sort((a: any, b: any) => {
        const ca = (a.canister || "").localeCompare(b.canister || "");
        if (ca !== 0) return ca;
        return (a.sub_canister || "").localeCompare(b.sub_canister || "");
      });
    }
    return map;
  }, [allInventory]);

  // Stats
  const totalTanks = allTanks.length;
  const totalUnits = allInventory.reduce((s: number, i: any) => s + (i.units || 0), 0);
  const bullsOnHand = useMemo(() => {
    const names = new Set<string>();
    for (const inv of allInventory) {
      const name = inv.bulls_catalog?.bull_name || inv.custom_bull_name;
      if (name) names.add(name);
    }
    return names.size;
  }, [allInventory]);

  // Edit customer handlers
  const openEdit = () => {
    if (!customer) return;
    setFormName(customer.name || "");
    setFormPhone(customer.phone || "");
    setFormEmail(customer.email || "");
    setFormAddress(customer.address || "");
    setFormNotes(customer.notes || "");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!formName.trim() || !id) return;
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: formName.trim(),
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        address: formAddress.trim() || null,
        notes: formNotes.trim() || null,
      } as any)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not update customer.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer updated" });
      setEditOpen(false);
    }
  };

  // Add tank handler
  const handleAddTank = async () => {
    if (!tankNumber.trim() || !orgId || !id) return;
    setTankSaving(true);
    const { error } = await supabase
      .from("tanks")
      .insert({
        organization_id: orgId,
        customer_id: id,
        tank_number: tankNumber.trim(),
        tank_name: tankName.trim() || null,
        eid: tankEid.trim() || null,
        tank_type: tankType,
        status: tankStatus,
        model: tankModel.trim() || null,
        serial_number: tankSerial.trim() || null,
        description: tankDesc.trim() || null,
      } as any);
    setTankSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not add tank.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["customer_tanks"] });
      toast({ title: "Tank added" });
      setTankDialogOpen(false);
      resetTankForm();
    }
  };

  const resetTankForm = () => {
    setTankNumber(""); setTankName(""); setTankEid("");
    setTankType("customer_tank"); setTankStatus("wet");
    setTankModel(""); setTankSerial(""); setTankDesc("");
  };

  // Add semen handler
  const handleAddSemen = async () => {
    if (!semenCanister.trim() || !semenTankId || !orgId) return;
    setSemenSaving(true);
    const { error } = await supabase
      .from("tank_inventory")
      .insert({
        organization_id: orgId,
        tank_id: semenTankId,
        customer_id: id,
        canister: semenCanister.trim(),
        sub_canister: semenSubCanister.trim() || null,
        bull_catalog_id: semenBullCatalogId || null,
        custom_bull_name: semenBullCatalogId ? null : semenBullName.trim() || null,
        bull_code: semenBullCode.trim() || null,
        units: parseInt(semenUnits) || 0,
        storage_type: semenStorageType,
        notes: semenNotes.trim() || null,
      } as any);
    setSemenSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not add semen.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      toast({ title: "Semen added" });
      setSemenDialogOpen(false);
      resetSemenForm();
    }
  };

  const resetSemenForm = () => {
    setSemenCanister(""); setSemenSubCanister(""); setSemenBullName("");
    setSemenBullCatalogId(null); setSemenBullCode(""); setSemenUnits("");
    setSemenStorageType("customer"); setSemenNotes("");
  };

  const openAddSemen = (tankId: string) => {
    resetSemenForm();
    setSemenTankId(tankId);
    setSemenDialogOpen(true);
  };

  const statusBadge = (status: string) => {
    const key = status.toLowerCase();
    const cls = STATUS_COLORS[key] || "bg-muted text-muted-foreground border-border";
    return <Badge variant="outline" className={cls}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Customer not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate("/customers")} className="cursor-pointer">Customers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{customer.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} className="mt-1">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight">{customer.name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                {customer.phone && <span>{customer.phone}</span>}
                {customer.email && <span>{customer.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEdit} className="gap-2">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard title="Tanks" value={totalTanks} delay={0} index={0} icon={Package} />
          <StatCard title="Total Units" value={totalUnits} delay={100} index={1} icon={Archive} />
          <StatCard title="Bulls on Hand" value={bullsOnHand} delay={200} index={2} icon={Dna} />
        </div>

        {/* Tanks section header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tanks</h2>
          <Button className="gap-2" onClick={() => { resetTankForm(); setTankDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Tank
          </Button>
        </div>

        {/* Tank cards */}
        {allTanks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tanks for this customer.</p>
        ) : (
          allTanks.map((tank: any) => {
            const inv = inventoryByTank.get(tank.id) || [];
            const tankTotal = inv.reduce((s: number, i: any) => s + (i.units || 0), 0);
            return (
              <div key={tank.id} className="rounded-lg border border-border/50 overflow-hidden">
                {/* Tank header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {tank.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank.tank_number}
                      </span>
                      {statusBadge(tank.status)}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {tank.model && <span>Model: {tank.model}</span>}
                      {tank.eid && <span>EID: {tank.eid}</span>}
                      {tank.serial_number && <span>S/N: {tank.serial_number}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/tanks/${tank.id}/reinventory?customer_id=${id}`)}>
                      Re-inventory
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openAddSemen(tank.id)}>
                      Add Semen
                    </Button>
                  </div>
                </div>
                {/* Inventory table */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead>Canister</TableHead>
                      <TableHead>Sub-can</TableHead>
                      <TableHead>Bull</TableHead>
                      <TableHead>Bull Code</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No inventory</TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {inv.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.canister}</TableCell>
                            <TableCell>{item.sub_canister || "—"}</TableCell>
                            <TableCell>{item.bulls_catalog?.bull_name || item.custom_bull_name || "—"}</TableCell>
                            <TableCell>{item.bull_code || "—"}</TableCell>
                            <TableCell>{item.bulls_catalog?.company || "—"}</TableCell>
                            <TableCell className="text-right">{item.units}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/20 font-semibold">
                          <TableCell colSpan={5}>Total</TableCell>
                          <TableCell className="text-right">{tankTotal}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            );
          })
        )}
      </main>

      {/* Edit Customer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={saving || !formName.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Tank Dialog */}
      <Dialog open={tankDialogOpen} onOpenChange={setTankDialogOpen}>
        <DialogContent className="max-w-md">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tank Type</Label>
                <Select value={tankType} onValueChange={setTankType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_tank">Customer Tank</SelectItem>
                    <SelectItem value="rental_tank">Rental Tank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={tankStatus} onValueChange={setTankStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wet">Wet</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
                    <SelectItem value="out">Out</SelectItem>
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
              <Button variant="outline" onClick={() => setTankDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddTank} disabled={tankSaving || !tankNumber.trim()}>
                {tankSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Semen Dialog */}
      <Dialog open={semenDialogOpen} onOpenChange={setSemenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Semen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Canister *</Label>
              <Input value={semenCanister} onChange={(e) => setSemenCanister(e.target.value)} placeholder="e.g. 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Sub-canister</Label>
              <Input value={semenSubCanister} onChange={(e) => setSemenSubCanister(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bull</Label>
              <BullCombobox
                value={semenBullName}
                catalogId={semenBullCatalogId}
                onChange={(name, catId) => { setSemenBullName(name); setSemenBullCatalogId(catId); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bull Code</Label>
              <Input value={semenBullCode} onChange={(e) => setSemenBullCode(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Units</Label>
                <Input type="number" value={semenUnits} onChange={(e) => setSemenUnits(e.target.value)} min="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Storage Type</Label>
                <Select value={semenStorageType} onValueChange={setSemenStorageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="communal">Communal</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                    <SelectItem value="inventory">Inventory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={semenNotes} onChange={(e) => setSemenNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSemenDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddSemen} disabled={semenSaving || !semenCanister.trim()}>
                {semenSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
};

export default CustomerDetail;
