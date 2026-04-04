import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, Trash2, Package, CalendarDays, Loader2, X, Check, Search,
  Truck, ClipboardList,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BullCombobox from "@/components/BullCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PackLine {
  key: string;
  sourceTankId: string;
  bullName: string;
  bullCatalogId: string | null;
  bullCode: string | null;
  sourceCanister: string;
  fieldCanister: string;
  units: number;
}

const emptyLine = (): PackLine => ({
  key: crypto.randomUUID(),
  sourceTankId: "",
  bullName: "",
  bullCatalogId: null,
  bullCode: null,
  sourceCanister: "",
  fieldCanister: "",
  units: 0,
});

const PackTank = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgId } = useOrgRole();
  const isMobile = useIsMobile();

  const preselectedTankId = searchParams.get("tankId") || "";

  const [packType, setPackType] = useState<"project" | "shipment">("project");
  const [selectedTankId, setSelectedTankId] = useState(preselectedTankId);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [packedBy, setPackedBy] = useState("");
  const [packedDate, setPackedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PackLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);

  // Shipment fields
  const [destinationName, setDestinationName] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [tankReturnExpected, setTankReturnExpected] = useState(true);

  // Fetch all active tanks (for project packs)
  const { data: allActiveTanks = [] } = useQuery({
    queryKey: ["all_active_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type")
        .eq("organization_id", orgId!)
        .eq("status", "wet")
        .order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch shipper tanks only (for shipment packs)
  const { data: shipperTanks = [] } = useQuery({
    queryKey: ["shipper_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type")
        .eq("organization_id", orgId!)
        .eq("tank_type", "shipper")
        .eq("status", "wet")
        .order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const fieldTankOptions = packType === "project" ? allActiveTanks : shipperTanks;

  // Fetch all tanks with inventory for source tank dropdown
  const { data: sourceTanks = [] } = useQuery({
    queryKey: ["source_tanks_with_inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: tanks, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number")
        .eq("organization_id", orgId!)
        .order("tank_number");
      if (error) throw error;
      return tanks ?? [];
    },
  });

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ["projects_for_pack", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const toggleProject = (projId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projId) ? prev.filter(id => id !== projId) : [...prev, projId]
    );
  };

  const updateLine = (index: number, updates: Partial<PackLine>) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, ...updates } : l));
  };

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!selectedTankId) errs.fieldTank = "Select a field tank";
    if (packType === "project") {
      if (selectedProjects.length === 0) errs.projects = "Select at least one project";
    } else {
      if (!destinationName.trim()) errs.destinationName = "Destination name is required";
    }
    lines.forEach((line, i) => {
      if (!line.sourceTankId) errs[`line_${i}_source`] = "Required";
      if (!line.bullName.trim()) errs[`line_${i}_bull`] = "Required";
      if (line.units <= 0) errs[`line_${i}_units`] = "Must be > 0";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !orgId) return;
    setSubmitting(true);

    try {
      const fieldTank = fieldTankOptions.find((t: any) => t.id === selectedTankId);
      const fieldTankName = fieldTank?.tank_name || fieldTank?.tank_number || "Unknown";
      const projectNames = selectedProjects.map(pid => projects.find((p: any) => p.id === pid)?.name || "").filter(Boolean);

      // Step 1: Create tank_pack
      const { data: pack, error: packErr } = await supabase
        .from("tank_packs")
        .insert({
          organization_id: orgId,
          field_tank_id: selectedTankId,
          pack_type: packType,
          status: "packed",
          packed_at: packedDate.toISOString(),
          packed_by: packedBy.trim() || null,
          notes: notes.trim() || null,
          destination_name: packType === "shipment" ? destinationName.trim() : null,
          destination_address: packType === "shipment" ? destinationAddress.trim() || null : null,
          shipping_carrier: packType === "shipment" ? shippingCarrier || null : null,
          tracking_number: packType === "shipment" ? trackingNumber.trim() || null : null,
          tank_return_expected: packType === "shipment" ? tankReturnExpected : true,
        })
        .select()
        .single();

      if (packErr || !pack) throw packErr || new Error("Failed to create pack");

      // Step 2: Create tank_pack_projects (only for project packs)
      if (packType === "project" && selectedProjects.length > 0) {
        await supabase.from("tank_pack_projects").insert(
          selectedProjects.map(projId => ({
            tank_pack_id: pack.id,
            project_id: projId,
          }))
        );
      }

      // Step 3: Process each line
      for (const line of lines) {
        const sourceTank = sourceTanks.find((t: any) => t.id === line.sourceTankId);
        const sourceTankName = sourceTank?.tank_name || sourceTank?.tank_number || "Unknown";

        // a. Insert pack line
        await supabase.from("tank_pack_lines").insert({
          tank_pack_id: pack.id,
          source_tank_id: line.sourceTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_name: line.bullName,
          bull_code: line.bullCode,
          source_canister: line.sourceCanister || null,
          field_canister: line.fieldCanister || null,
          units: line.units,
        });

        // b. Deduct from source tank inventory
        let query = supabase.from("tank_inventory").select("id, units")
          .eq("tank_id", line.sourceTankId)
          .eq("organization_id", orgId);
        if (line.bullCatalogId) {
          query = query.eq("bull_catalog_id", line.bullCatalogId);
        } else {
          query = query.eq("custom_bull_name", line.bullName);
        }
        if (line.sourceCanister) {
          query = query.eq("canister", line.sourceCanister);
        }
        const { data: invRows } = await query.limit(1);

        if (invRows && invRows.length > 0) {
          const inv = invRows[0];
          if ((inv.units as number) - line.units <= 0) {
            await supabase.from("tank_inventory").delete().eq("id", inv.id);
          } else {
            await supabase.from("tank_inventory").update({ units: (inv.units as number) - line.units }).eq("id", inv.id);
          }
        }

        // c. Add to field tank inventory (upsert)
        let fieldQuery = supabase.from("tank_inventory").select("id, units")
          .eq("tank_id", selectedTankId)
          .eq("organization_id", orgId);
        if (line.bullCatalogId) {
          fieldQuery = fieldQuery.eq("bull_catalog_id", line.bullCatalogId);
        } else {
          fieldQuery = fieldQuery.eq("custom_bull_name", line.bullName);
        }
        if (line.fieldCanister) {
          fieldQuery = fieldQuery.eq("canister", line.fieldCanister);
        }
        const { data: fieldInvRows } = await fieldQuery.limit(1);

        if (fieldInvRows && fieldInvRows.length > 0) {
          await supabase.from("tank_inventory").update({
            units: (fieldInvRows[0].units as number) + line.units,
          }).eq("id", fieldInvRows[0].id);
        } else {
          await supabase.from("tank_inventory").insert({
            tank_id: selectedTankId,
            organization_id: orgId,
            canister: line.fieldCanister || "1",
            units: line.units,
            item_type: "semen",
            bull_catalog_id: line.bullCatalogId,
            custom_bull_name: line.bullCatalogId ? null : line.bullName,
            bull_code: line.bullCode,
          });
        }

        // d. Deduction transaction
        await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: line.sourceTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_code: line.bullCode,
          custom_bull_name: line.bullName,
          units_change: -line.units,
          transaction_type: "pack_out",
          notes: packType === "project"
            ? `Packed to ${fieldTankName} for ${projectNames.join(", ")}`
            : `Packed to ${fieldTankName} — shipment to ${destinationName.trim()}`,
        });

        // e. Addition transaction
        await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: selectedTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_code: line.bullCode,
          custom_bull_name: line.bullName,
          units_change: line.units,
          transaction_type: "pack_in",
          notes: `Packed from ${sourceTankName}`,
        });
      }

      toast({ title: "Tank packed", description: "Packing slip ready to print." });
      navigate(`/pack/${pack.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to pack tank.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    customer_tank: "Customer", inventory_tank: "Inventory", shipper: "Shipper",
    mushroom: "Mushroom", rental_tank: "Rental", communal_tank: "Communal", freeze_branding: "Freeze",
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <h2 className="text-2xl font-bold font-display tracking-tight">Pack Tank</h2>

        {/* Pack Type Toggle */}
        <div className="inline-flex rounded-lg border border-border/50 overflow-hidden">
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "project" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("project"); setSelectedTankId(""); }}
          >
            <ClipboardList className="h-4 w-4" /> Pack for Project
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "shipment" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("shipment"); setSelectedTankId(""); }}
          >
            <Truck className="h-4 w-4" /> Pack for Shipment
          </button>
        </div>

        {/* Section 1: Pack Details */}
        <Card>
          <CardHeader><CardTitle>Pack Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Field Tank */}
            <div className="space-y-1.5">
              <Label>{packType === "shipment" ? "Shipper Tank *" : "Field Tank *"}</Label>
              <Select value={selectedTankId} onValueChange={setSelectedTankId}>
                <SelectTrigger className={cn(errors.fieldTank && "border-destructive")}>
                  <SelectValue placeholder={packType === "shipment" ? "Select shipper tank…" : "Select tank…"} />
                </SelectTrigger>
                <SelectContent>
                  {fieldTankOptions.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        {t.tank_name || t.tank_number}
                        {packType === "project" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{TYPE_LABELS[t.tank_type] || t.tank_type}</Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.fieldTank && <p className="text-xs text-destructive">{errors.fieldTank}</p>}
            </div>

            {/* Project fields */}
            {packType === "project" && (
              <div className="space-y-1.5">
                <Label>Projects *</Label>
                <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", errors.projects && "border-destructive", selectedProjects.length === 0 && "text-muted-foreground")}>
                      {selectedProjects.length === 0
                        ? "Select projects…"
                        : `${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""} selected`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search projects…"
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredProjects.map((p: any) => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedProjects.includes(p.id)}
                            onCheckedChange={() => toggleProject(p.id)}
                          />
                          {p.name}
                        </label>
                      ))}
                      {filteredProjects.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-2">No projects found.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {errors.projects && <p className="text-xs text-destructive">{errors.projects}</p>}
                {selectedProjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedProjects.map(pid => {
                      const proj = projects.find((p: any) => p.id === pid);
                      return (
                        <Badge key={pid} variant="secondary" className="gap-1">
                          {proj?.name || pid}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => toggleProject(pid)} />
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Shipment fields */}
            {packType === "shipment" && (
              <>
                <div className="space-y-1.5">
                  <Label>Ship To *</Label>
                  <Input
                    value={destinationName}
                    onChange={e => setDestinationName(e.target.value)}
                    placeholder="Recipient name or ranch"
                    className={cn(errors.destinationName && "border-destructive")}
                  />
                  {errors.destinationName && <p className="text-xs text-destructive">{errors.destinationName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Shipping Address</Label>
                  <Input
                    value={destinationAddress}
                    onChange={e => setDestinationAddress(e.target.value)}
                    placeholder="Full shipping address"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Carrier</Label>
                  <Select value={shippingCarrier} onValueChange={setShippingCarrier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select carrier..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="FedEx">FedEx</SelectItem>
                      <SelectItem value="USPS">USPS</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tracking Number</Label>
                  <Input
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    placeholder="Enter after shipping"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={tankReturnExpected}
                    onCheckedChange={(checked) => setTankReturnExpected(!!checked)}
                  />
                  <Label className="cursor-pointer" onClick={() => setTankReturnExpected(!tankReturnExpected)}>
                    Tank will be returned to us
                  </Label>
                </div>
              </>
            )}

            {/* Packed By */}
            <div className="space-y-1.5">
              <Label>Packed By</Label>
              <Input value={packedBy} onChange={e => setPackedBy(e.target.value)} placeholder="Who packed this tank?" />
            </div>

            {/* Date Packed */}
            <div className="space-y-1.5">
              <Label>Date Packed</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {format(packedDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={packedDate}
                    onSelect={d => { if (d) { setPackedDate(d); setCalendarOpen(false); } }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Pack Lines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Semen to Pack</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLines(prev => [...prev, emptyLine()])}>
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line, i) => (
              <div key={line.key} className={cn("rounded-lg border border-border/50 p-3 space-y-3", isMobile ? "" : "")}>
                <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-6")}>
                  {/* Source Tank */}
                  <div className="space-y-1">
                    <Label className="text-xs">Source Tank</Label>
                    <Select value={line.sourceTankId} onValueChange={v => updateLine(i, { sourceTankId: v })}>
                      <SelectTrigger className={cn("text-sm", errors[`line_${i}_source`] && "border-destructive")}>
                        <SelectValue placeholder="Tank…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceTanks.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.tank_name || t.tank_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Bull */}
                  <div className="space-y-1 col-span-1">
                    <Label className="text-xs">Bull</Label>
                    <div className={cn(errors[`line_${i}_bull`] && "ring-1 ring-destructive rounded-md")}>
                      <BullCombobox
                        value={line.bullName}
                        catalogId={line.bullCatalogId}
                        onChange={(name, catId, naabCode) => updateLine(i, {
                          bullName: name,
                          bullCatalogId: catId,
                          bullCode: naabCode ?? null,
                        })}
                      />
                    </div>
                  </div>

                  {/* Source Canister */}
                  <div className="space-y-1">
                    <Label className="text-xs">Src Canister</Label>
                    <Input
                      value={line.sourceCanister}
                      onChange={e => updateLine(i, { sourceCanister: e.target.value })}
                      placeholder="Can #"
                      className="text-sm"
                    />
                  </div>

                  {/* Field Canister */}
                  <div className="space-y-1">
                    <Label className="text-xs">Field Canister</Label>
                    <Input
                      value={line.fieldCanister}
                      onChange={e => updateLine(i, { fieldCanister: e.target.value })}
                      placeholder="Can #"
                      className="text-sm"
                    />
                  </div>

                  {/* Units */}
                  <div className="space-y-1">
                    <Label className="text-xs">Units</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.units || ""}
                      onChange={e => updateLine(i, { units: parseInt(e.target.value) || 0 })}
                      className={cn("text-sm", errors[`line_${i}_units`] && "border-destructive")}
                    />
                  </div>

                  {/* Remove */}
                  <div className="flex items-end">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className={cn("flex", isMobile ? "" : "justify-end")}>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className={cn("gap-2", isMobile && "w-full")}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Pack Tank
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default PackTank;
