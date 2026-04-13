import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackageOpen, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface ReturnLine {
  key: string;
  bullName: string;
  bullCatalogId: string | null;
  bullCode: string | null;
  unitsPacked: number;
  unitsReturning: number;
  destinationTankId: string;
  destinationCanister: string;
  originalSourceTankId: string;
  originalSourceCanister: string;
  fieldCanister: string;
}

const UnpackTank = () => {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();

  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [unpackedBy, setUnpackedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linesInitialized, setLinesInitialized] = useState(false);

  // Fetch pack
  const { data: pack, isLoading: packLoading } = useQuery({
    queryKey: ["unpack_pack", packId],
    enabled: !!packId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("*, tanks!tank_packs_field_tank_id_fkey(id, tank_name, tank_number)")
        .eq("id", packId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Fetch pack lines
  const { data: packLines = [], isLoading: linesLoading } = useQuery({
    queryKey: ["unpack_pack_lines", packId],
    enabled: !!packId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_lines")
        .select("*, tanks!tank_pack_lines_source_tank_id_fkey(id, tank_name, tank_number)")
        .eq("tank_pack_id", packId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch pack projects
  const { data: packProjects = [] } = useQuery({
    queryKey: ["unpack_pack_projects", packId],
    enabled: !!packId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_projects")
        .select("*, projects!tank_pack_projects_project_id_fkey(name)")
        .eq("tank_pack_id", packId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch all org tanks for destination dropdown
  const { data: allTanks = [] } = useQuery({
    queryKey: ["unpack_all_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number")
        .eq("organization_id", orgId!)
        .order("tank_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Initialize return lines from pack lines once loaded
  if (packLines.length > 0 && !linesInitialized) {
    const lines: ReturnLine[] = packLines.map((pl: any) => ({
      key: crypto.randomUUID(),
      bullName: pl.bull_name,
      bullCatalogId: pl.bull_catalog_id,
      bullCode: pl.bull_code,
      unitsPacked: pl.units,
      unitsReturning: pl.units,
      destinationTankId: pl.source_tank_id,
      destinationCanister: pl.source_canister || "",
      originalSourceTankId: pl.source_tank_id,
      originalSourceCanister: pl.source_canister || "",
      fieldCanister: pl.field_canister || "",
    }));
    setReturnLines(lines);
    setLinesInitialized(true);
  }

  const fieldTankName = pack?.tanks?.tank_name || pack?.tanks?.tank_number || "Unknown";
  const fieldTankId = pack?.tanks?.id || pack?.field_tank_id;
  const projectNames = packProjects.map((pp: any) => pp.projects?.name).filter(Boolean);

  const updateLine = (index: number, updates: Partial<ReturnLine>) => {
    setReturnLines(prev => prev.map((l, i) => i === index ? { ...l, ...updates } : l));
  };

  const tankLabel = (t: any) => t.tank_name || t.tank_number;

  const handleSubmit = async () => {
    if (!orgId || !packId || !fieldTankId) return;
    setSubmitting(true);

    try {
      // Step 1: Process each return line
      for (const line of returnLines) {
        const destTank = allTanks.find((t: any) => t.id === line.destinationTankId);
        const destTankName = destTank ? tankLabel(destTank) : "Unknown";

        if (line.unitsReturning > 0) {
          // a. Insert unpack line
          await supabase.from("tank_unpack_lines").insert({
            tank_pack_id: packId,
            destination_tank_id: line.destinationTankId,
            bull_catalog_id: line.bullCatalogId,
            bull_name: line.bullName,
            bull_code: line.bullCode,
            destination_canister: line.destinationCanister || null,
            units_returned: line.unitsReturning,
          });

          // b. Deduct from field tank inventory
          let fieldQuery = supabase.from("tank_inventory").select("id, units")
            .eq("tank_id", fieldTankId)
            .eq("organization_id", orgId!);
          if (line.bullCatalogId) {
            fieldQuery = fieldQuery.eq("bull_catalog_id", line.bullCatalogId);
          } else {
            fieldQuery = fieldQuery.eq("custom_bull_name", line.bullName);
          }
          if (line.fieldCanister) {
            fieldQuery = fieldQuery.eq("canister", line.fieldCanister);
          }
          const { data: fieldInv } = await fieldQuery.limit(1);
          if (fieldInv && fieldInv[0]) {
            const newUnits = fieldInv[0].units - line.unitsReturning;
            if (newUnits <= 0) {
              await supabase.from("tank_inventory").delete().eq("id", fieldInv[0].id);
            } else {
              await supabase.from("tank_inventory").update({ units: newUnits }).eq("id", fieldInv[0].id);
            }
          }

          // c. Add to destination tank inventory
          let destQuery = supabase.from("tank_inventory").select("id, units")
            .eq("tank_id", line.destinationTankId)
            .eq("organization_id", orgId!);
          if (line.bullCatalogId) {
            destQuery = destQuery.eq("bull_catalog_id", line.bullCatalogId);
          } else {
            destQuery = destQuery.eq("custom_bull_name", line.bullName);
          }
          if (line.destinationCanister) {
            destQuery = destQuery.eq("canister", line.destinationCanister);
          }
          const { data: destInv } = await destQuery.limit(1);
          if (destInv && destInv.length > 0) {
            await supabase.from("tank_inventory").update({ units: destInv[0].units + line.unitsReturning }).eq("id", destInv[0].id);
          } else {
            await supabase.from("tank_inventory").insert({
              tank_id: line.destinationTankId,
              organization_id: orgId!,
              canister: line.destinationCanister || "1",
              units: line.unitsReturning,
              item_type: "semen",
              bull_catalog_id: line.bullCatalogId,
              custom_bull_name: line.bullName,
              bull_code: line.bullCode,
            });
          }

          // d. Transaction: field tank deduction
          await supabase.from("inventory_transactions").insert({
            organization_id: orgId!,
            tank_pack_id: packId,
            tank_id: fieldTankId,
            bull_catalog_id: line.bullCatalogId,
            bull_code: line.bullCode,
            custom_bull_name: line.bullName,
            units_change: -line.unitsReturning,
            transaction_type: "unpack_out",
            notes: `Returned to ${destTankName}`,
            performed_by: null,
          });

          // e. Transaction: destination tank addition
          await supabase.from("inventory_transactions").insert({
            organization_id: orgId!,
            tank_pack_id: packId,
            tank_id: line.destinationTankId,
            bull_catalog_id: line.bullCatalogId,
            bull_code: line.bullCode,
            custom_bull_name: line.bullName,
            units_change: line.unitsReturning,
            transaction_type: "unpack_return",
            notes: `Returned from ${fieldTankName} — ${projectNames.join(", ")}`,
            performed_by: null,
          });
        } else {
          // All semen used
          // a. Insert unpack line with 0
          await supabase.from("tank_unpack_lines").insert({
            tank_pack_id: packId,
            destination_tank_id: line.destinationTankId,
            bull_catalog_id: line.bullCatalogId,
            bull_name: line.bullName,
            bull_code: line.bullCode,
            destination_canister: line.destinationCanister || null,
            units_returned: 0,
          });

          // b. Delete field tank inventory row
          let fieldQuery = supabase.from("tank_inventory").select("id")
            .eq("tank_id", fieldTankId)
            .eq("organization_id", orgId!);
          if (line.bullCatalogId) {
            fieldQuery = fieldQuery.eq("bull_catalog_id", line.bullCatalogId);
          } else {
            fieldQuery = fieldQuery.eq("custom_bull_name", line.bullName);
          }
          if (line.fieldCanister) {
            fieldQuery = fieldQuery.eq("canister", line.fieldCanister);
          }
          const { data: fieldInv } = await fieldQuery.limit(1);
          if (fieldInv && fieldInv[0]) {
            await supabase.from("tank_inventory").delete().eq("id", fieldInv[0].id);
          }

          // c. Transaction: used in field
          await supabase.from("inventory_transactions").insert({
            organization_id: orgId!,
            tank_pack_id: packId,
            tank_id: fieldTankId,
            bull_catalog_id: line.bullCatalogId,
            bull_code: line.bullCode,
            custom_bull_name: line.bullName,
            units_change: -line.unitsPacked,
            transaction_type: "used_in_field",
            notes: `Used during ${projectNames.join(", ")}`,
            performed_by: null,
          });
        }
      }

      // Step 2: Update pack status
      await supabase.from("tank_packs").update({
        status: "unpacked",
        unpacked_at: new Date().toISOString(),
        unpacked_by: unpackedBy.trim() || null,
      }).eq("id", packId);

      toast.success("Tank unpacked", { description: "Return slip ready to print." });
      navigate(`/pack/${packId}`);
    } catch (err: any) {
      toast.error("Error unpacking tank", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (packLoading || linesLoading) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main></div>;
  }

  if (!pack) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Pack not found.</p></main></div>;
  }

  if (pack.status === "unpacked") {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
          <p className="text-muted-foreground">This pack has already been unpacked.</p>
          <Button variant="outline" onClick={() => navigate(`/pack/${packId}`)}>View Pack Details</Button>
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/pack/${packId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold font-display tracking-tight">Unpack — {fieldTankName}</h2>
            <div className="flex flex-wrap gap-1 mt-1">
              {projectNames.map((name: string, i: number) => (
                <Badge key={i} variant="secondary">{name}</Badge>
              ))}
            </div>
          </div>
        </div>

        {/* What Was Packed */}
        <Card>
          <CardHeader><CardTitle className="text-base">What Was Packed</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Bull Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Field Canister</TableHead>
                    <TableHead className="text-right">Units Packed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packLines.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.bull_name}</TableCell>
                      <TableCell>{l.bull_code || "—"}</TableCell>
                      <TableCell>{l.field_canister || "—"}</TableCell>
                      <TableCell className="text-right">{l.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Return Lines */}
        <Card>
          <CardHeader><CardTitle className="text-base">Return Semen to Inventory</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {returnLines.map((line, index) => (
              <div key={line.key} className="p-3 rounded-lg border border-border/50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{line.bullName}</span>
                  {line.bullCode && <span className="text-xs text-muted-foreground">({line.bullCode})</span>}
                  <span className="text-xs text-muted-foreground ml-auto">{line.unitsPacked} packed</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Units Returning</Label>
                    <Input
                      type="number"
                      min={0}
                      max={line.unitsPacked}
                      value={line.unitsReturning}
                      onChange={(e) => updateLine(index, { unitsReturning: Math.max(0, Math.min(line.unitsPacked, parseInt(e.target.value) || 0)) })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Destination Tank</Label>
                    <Select value={line.destinationTankId} onValueChange={(v) => updateLine(index, { destinationTankId: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select tank" /></SelectTrigger>
                      <SelectContent>
                        {allTanks.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{tankLabel(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Destination Canister</Label>
                    <Input
                      value={line.destinationCanister}
                      onChange={(e) => updateLine(index, { destinationCanister: e.target.value })}
                      placeholder="Canister"
                      className="mt-1"
                    />
                  </div>
                </div>
                {line.unitsReturning === 0 && (
                  <p className="text-xs text-amber-500">All units used — nothing to return for this bull.</p>
                )}
              </div>
            ))}

            <div className="space-y-3 pt-4 border-t border-border/50">
              <div>
                <Label>Unpacked By</Label>
                <Input value={unpackedBy} onChange={(e) => setUnpackedBy(e.target.value)} placeholder="Who unpacked this tank?" className="mt-1.5" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="mt-1.5" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2 w-full sm:w-auto">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
                Complete Unpack
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <AppFooter />
    </div>
  );
};

export default UnpackTank;
