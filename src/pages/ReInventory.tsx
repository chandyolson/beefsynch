import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface ExistingRow {
  type: "existing";
  id: string;
  canister: string;
  sub_canister: string | null;
  bull_name: string;
  bull_code: string | null;
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  previous: number;
  actual: number;
  customer_id: string | null;
  customer_name: string | null;
  storage_type: string | null;
  item_type: string;
}

interface NewRow {
  type: "new";
  key: string;
  canister: string;
  sub_canister: string;
  bull_name: string;
  bull_catalog_id: string | null;
  bull_code: string;
  units: string;
  item_type: "semen" | "embryo";
  customer_id: string | null;
}

const ReInventory = () => {
  const { tankId } = useParams<{ tankId: string }>();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customer_id");
  const navigate = useNavigate();
  const { orgId, userId } = useOrgRole();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<ExistingRow[]>([]);
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Fetch tank
  const { data: tank } = useQuery({
    queryKey: ["tank_detail", tankId],
    enabled: !!tankId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*, customers(id, name)")
        .eq("id", tankId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Fetch inventory for this tank
  const { data: inventoryData = [], isLoading } = useQuery({
    queryKey: ["reinventory_items", tankId, customerId],
    enabled: !!tankId,
    queryFn: async () => {
      let query = supabase
        .from("tank_inventory")
        .select("*, bulls_catalog(bull_name, company, registration_number), customers!tank_inventory_customer_id_fkey(name)")
        .eq("tank_id", tankId!);
      if (customerId) {
        query = query.eq("customer_id", customerId);
      }
      query = query.order("canister", { ascending: true }).order("sub_canister", { ascending: true }).limit(10000);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Initialize rows from fetched data
  useEffect(() => {
    if (!isLoading && inventoryData.length > 0 && !initialized) {
      setRows(
        inventoryData.map((inv: any) => ({
          type: "existing" as const,
          id: inv.id,
          canister: inv.canister,
          sub_canister: inv.sub_canister,
          bull_name: inv.bulls_catalog?.bull_name || inv.custom_bull_name || "",
          bull_code: inv.bull_code,
          bull_catalog_id: inv.bull_catalog_id,
          custom_bull_name: inv.custom_bull_name,
          previous: inv.units,
          actual: inv.units,
          customer_id: inv.customer_id,
          storage_type: inv.storage_type,
          item_type: inv.item_type || "semen",
        }))
      );
      setInitialized(true);
    } else if (!isLoading && inventoryData.length === 0 && !initialized) {
      setInitialized(true);
    }
  }, [inventoryData, isLoading, initialized]);

  // Last inventoried
  const lastInventoried = useMemo(() => {
    let latest: string | null = null;
    for (const inv of inventoryData) {
      if (inv.inventoried_at && (!latest || inv.inventoried_at > latest)) {
        latest = inv.inventoried_at;
      }
    }
    return latest;
  }, [inventoryData]);

  // Net change
  const netChange = useMemo(() => {
    let net = 0;
    for (const r of rows) net += r.actual - r.previous;
    for (const r of newRows) net += parseInt(r.units) || 0;
    return net;
  }, [rows, newRows]);

  // Update existing row actual count
  const updateActual = (index: number, value: string) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], actual: parseInt(value) || 0 };
      return copy;
    });
  };

  // Add new slot
  const addNewRow = () => {
    setNewRows((prev) => [
      ...prev,
      { type: "new", key: crypto.randomUUID(), canister: "", sub_canister: "", bull_name: "", bull_catalog_id: null, bull_code: "", units: "", item_type: "semen" },
    ]);
  };

  const updateNewRow = (index: number, field: keyof NewRow, value: any) => {
    setNewRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeNewRow = (index: number) => {
    setNewRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Save
  const handleSave = async () => {
    if (!tankId || !orgId) return;
    setSaving(true);

    try {
      const now = new Date().toISOString();

      // Update existing rows with changes
      for (const row of rows) {
        const diff = row.actual - row.previous;
        if (diff === 0) {
          // Still update inventoried_at
          await supabase
            .from("tank_inventory")
            .update({ inventoried_at: now, inventoried_by: userId } as any)
            .eq("id", row.id);
          continue;
        }

        // Update inventory
        await supabase
          .from("tank_inventory")
          .update({ units: row.actual, inventoried_at: now, inventoried_by: userId } as any)
          .eq("id", row.id);

        // Log transaction
        await supabase
          .from("inventory_transactions")
          .insert({
            organization_id: orgId,
            tank_id: tankId,
            inventory_item_id: row.id,
            customer_id: row.customer_id,
            bull_catalog_id: row.bull_catalog_id,
            custom_bull_name: row.custom_bull_name,
            bull_code: row.bull_code,
            units_change: diff,
            transaction_type: "reinventory_adjustment",
            reason: diff < 0 ? "Missing/used" : "Found/added",
            notes: notes.trim() || null,
            performed_by: userId,
          } as any);
      }

      // Insert new rows
      for (const nr of newRows) {
        if (!nr.canister.trim()) continue;
        const units = parseInt(nr.units) || 0;

        const { data: inserted } = await supabase
          .from("tank_inventory")
          .insert({
            organization_id: orgId,
            tank_id: tankId,
            customer_id: customerId || null,
            canister: nr.canister.trim(),
            sub_canister: nr.sub_canister.trim() || null,
            bull_catalog_id: nr.bull_catalog_id || null,
            custom_bull_name: nr.bull_catalog_id ? null : nr.bull_name.trim() || null,
            bull_code: nr.bull_code.trim() || null,
            units,
            inventoried_at: now,
            inventoried_by: userId,
            storage_type: "customer",
            item_type: nr.item_type,
          } as any)
          .select("id")
          .single();

        if (inserted && units > 0) {
          await supabase
            .from("inventory_transactions")
            .insert({
              organization_id: orgId,
              tank_id: tankId,
              inventory_item_id: (inserted as any).id,
              customer_id: customerId || null,
              bull_catalog_id: nr.bull_catalog_id || null,
              custom_bull_name: nr.bull_catalog_id ? null : nr.bull_name.trim() || null,
              bull_code: nr.bull_code.trim() || null,
              units_change: units,
              transaction_type: "reinventory_found",
              reason: "Found during re-inventory",
              notes: notes.trim() || null,
              performed_by: userId,
            } as any);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["tank_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["reinventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      toast({ title: "Inventory saved" });
      navigate(-1);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Could not save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Breadcrumb
  const customerName = tank?.customers?.name;
  const tankLabel = tank?.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank?.tank_number || "Tank";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            {customerId && customerName ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink onClick={() => navigate("/customers")} className="cursor-pointer">Customers</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink onClick={() => navigate(`/customers/${customerId}`)} className="cursor-pointer">{customerName}</BreadcrumbLink>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate("/tanks")} className="cursor-pointer">Tanks</BreadcrumbLink>
              </BreadcrumbItem>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Re-inventory {tankLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-1">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Re-inventory: {tankLabel}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Last inventoried: {lastInventoried ? format(parseISO(lastInventoried), "MMM d, yyyy 'at' h:mm a") : "Never"}
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Enter the actual count for each slot. The system will calculate the difference and log adjustments automatically.
            </p>
          </div>
        </div>

        {/* Inventory table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Canister</TableHead>
                <TableHead>Sub-can</TableHead>
                <TableHead>Bull</TableHead>
                <TableHead>Bull Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || !initialized ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : rows.length === 0 && newRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No inventory rows for this tank.</TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row, i) => {
                    const diff = row.actual - row.previous;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.canister}</TableCell>
                        <TableCell>{row.sub_canister || "—"}</TableCell>
                        <TableCell>{row.bull_name || "—"}</TableCell>
                        <TableCell>{row.bull_code || "—"}</TableCell>
                        <TableCell>
                          {row.item_type === "embryo" && (
                            <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.previous}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            value={row.actual}
                            onChange={(e) => updateActual(i, e.target.value)}
                            className="w-20 ml-auto text-right h-8"
                          />
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          diff < 0 && "text-destructive",
                          diff > 0 && "text-green-400",
                          diff === 0 && "text-muted-foreground"
                        )}>
                          {diff > 0 ? `+${diff}` : diff}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* New rows */}
                  {newRows.map((nr, i) => (
                    <TableRow key={nr.key} className="bg-primary/5">
                      <TableCell>
                        <Input
                          value={nr.canister}
                          onChange={(e) => updateNewRow(i, "canister", e.target.value)}
                          placeholder="Can"
                          className="w-16 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={nr.sub_canister}
                          onChange={(e) => updateNewRow(i, "sub_canister", e.target.value)}
                          placeholder="Sub"
                          className="w-16 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <BullCombobox
                          value={nr.bull_name}
                          catalogId={nr.bull_catalog_id}
                          onChange={(name, catId) => {
                            updateNewRow(i, "bull_name", name);
                            updateNewRow(i, "bull_catalog_id", catId);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={nr.bull_code}
                          onChange={(e) => updateNewRow(i, "bull_code", e.target.value)}
                          placeholder="Code"
                          className="w-20 h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell>
                        <Select value={nr.item_type} onValueChange={(v) => updateNewRow(i, "item_type", v)}>
                          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="semen">Semen</SelectItem>
                            <SelectItem value="embryo">Embryo</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          value={nr.units}
                          onChange={(e) => updateNewRow(i, "units", e.target.value)}
                          className="w-20 ml-auto text-right h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => removeNewRow(i)} className="text-destructive h-8 px-2">✕</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add new slot */}
        <Button variant="outline" size="sm" className="gap-2" onClick={addNewRow}>
          <Plus className="h-4 w-4" /> Add New Slot
        </Button>

        {/* Summary */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            Net change:{" "}
            <span className={cn(
              "font-bold",
              netChange < 0 && "text-destructive",
              netChange > 0 && "text-green-400",
              netChange === 0 && "text-muted-foreground"
            )}>
              {netChange > 0 ? `+${netChange}` : netChange} units
            </span>
          </span>
        </div>

        {/* Notes */}
        <div className="max-w-xl space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g. "Customer used 3 Blueprint on their own cows"'
            rows={3}
          />
        </div>

        {/* Save */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Inventory"}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default ReInventory;
