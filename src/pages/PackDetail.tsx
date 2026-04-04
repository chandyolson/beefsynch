import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, FileText, Tag, ClipboardList, PackageOpen, Eye,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";

import { generatePackingSlipPdf } from "@/lib/generatePackingSlipPdf";
import { generatePackingLabelPdf } from "@/lib/generatePackingLabelPdf";
import { generateSessionSheetPdf } from "@/lib/generateSessionSheetPdf";
import { generateReturnSlipPdf } from "@/lib/generateReturnSlipPdf";

const STATUS_BADGE: Record<string, string> = {
  packed: "bg-green-600/20 text-green-400 border-green-600/30",
  in_field: "bg-green-600/20 text-green-400 border-green-600/30",
  unpacked: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const PackDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch pack with field tank
  const { data: pack, isLoading } = useQuery({
    queryKey: ["pack_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("*, tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Fetch pack lines with source tank info
  const { data: packLines = [] } = useQuery({
    queryKey: ["pack_lines", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_lines")
        .select("*, tanks!tank_pack_lines_source_tank_id_fkey(tank_name, tank_number)")
        .eq("tank_pack_id", id!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch pack projects
  const { data: packProjects = [] } = useQuery({
    queryKey: ["pack_projects", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_projects")
        .select("*, projects!tank_pack_projects_project_id_fkey(name)")
        .eq("tank_pack_id", id!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch unpack lines if unpacked
  const { data: unpackLines = [] } = useQuery({
    queryKey: ["unpack_lines", id],
    enabled: !!id && pack?.status === "unpacked",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_unpack_lines")
        .select("*, tanks!tank_unpack_lines_destination_tank_id_fkey(tank_name, tank_number)")
        .eq("tank_pack_id", id!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const fieldTankName = pack?.tanks?.tank_name || pack?.tanks?.tank_number || "Unknown";
  const projectNames = packProjects.map((pp: any) => pp.projects?.name).filter(Boolean);
  const totalPackedUnits = packLines.reduce((s: number, l: any) => s + (l.units || 0), 0);

  const handlePrintSlip = () => {
    generatePackingSlipPdf(
      {
        fieldTankName,
        packedAt: pack.packed_at,
        packedBy: pack.packed_by,
        projectNames,
        notes: pack.notes,
      },
      packLines.map((l: any) => ({
        bullName: l.bull_name,
        bullCode: l.bull_code,
        sourceTankName: l.tanks?.tank_name || l.tanks?.tank_number || "—",
        sourceCanister: l.source_canister,
        fieldCanister: l.field_canister,
        units: l.units,
      }))
    );
  };

  const handlePrintLabel = () => {
    generatePackingLabelPdf(
      { fieldTankName, packedAt: pack.packed_at, projectNames },
      packLines.map((l: any) => ({
        bullName: l.bull_name,
        fieldCanister: l.field_canister,
        units: l.units,
      }))
    );
  };

  const handlePrintSession = () => {
    generateSessionSheetPdf(
      { fieldTankName, packedAt: pack.packed_at, projectNames },
      packLines.map((l: any) => ({
        bullName: l.bull_name,
        fieldCanister: l.field_canister,
        units: l.units,
      }))
    );
  };

  const handlePrintReturn = () => {
    // Build a map of packed units per bull for the return slip
    const packedMap = new Map<string, number>();
    for (const pl of packLines) {
      const key = pl.bull_catalog_id || pl.bull_name;
      packedMap.set(key, (packedMap.get(key) || 0) + pl.units);
    }

    generateReturnSlipPdf(
      {
        fieldTankName,
        packedAt: pack.packed_at,
        unpackedAt: pack.unpacked_at,
        unpackedBy: pack.unpacked_by,
        projectNames,
      },
      unpackLines.map((ul: any) => {
        const key = ul.bull_catalog_id || ul.bull_name;
        const unitsPacked = packedMap.get(key) || 0;
        return {
          bullName: ul.bull_name,
          bullCode: ul.bull_code,
          unitsPacked,
          unitsReturned: ul.units_returned,
          destTankName: ul.tanks?.tank_name || ul.tanks?.tank_number || "—",
          destCanister: ul.destination_canister,
        };
      })
    );
  };

  if (isLoading) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main></div>;
  }
  if (!pack) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Pack not found.</p></main></div>;
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Back + Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/inventory-dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl font-bold font-display tracking-tight">Pack — {fieldTankName}</h2>
          </div>
          <Badge variant="outline" className={STATUS_BADGE[pack.status] || "bg-muted text-muted-foreground border-border"}>
            {pack.status}
          </Badge>
        </div>

        {/* Details Card */}
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Field Tank:</span><span>{fieldTankName}</span></div>
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Date Packed:</span><span>{format(new Date(pack.packed_at), "MMMM d, yyyy")}</span></div>
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Packed By:</span><span>{pack.packed_by || "—"}</span></div>
            <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Projects:</span>
              <div className="flex flex-wrap gap-1">
                {projectNames.map((name: string, i: number) => (
                  <Badge key={i} variant="secondary">{name}</Badge>
                ))}
              </div>
            </div>
            {pack.notes && <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Notes:</span><span>{pack.notes}</span></div>}
          </CardContent>
        </Card>

        {/* Pack Lines Table */}
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Source Tank</TableHead>
                <TableHead>Bull</TableHead>
                <TableHead>Bull Code</TableHead>
                <TableHead>Src Can.</TableHead>
                <TableHead>Field Can.</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packLines.map((l: any) => (
                <TableRow key={l.id} className="hover:bg-muted/20">
                  <TableCell>{l.tanks?.tank_name || l.tanks?.tank_number || "—"}</TableCell>
                  <TableCell className="font-medium">{l.bull_name}</TableCell>
                  <TableCell>{l.bull_code || "—"}</TableCell>
                  <TableCell>{l.source_canister || "—"}</TableCell>
                  <TableCell>{l.field_canister || "—"}</TableCell>
                  <TableCell className="text-right">{l.units}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right font-semibold">Total</TableCell>
                <TableCell className="text-right font-bold">{totalPackedUnits}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePrintSlip} className="gap-2"><FileText className="h-4 w-4" /> Print Packing Slip</Button>
          <Button variant="outline" onClick={handlePrintLabel} className="gap-2"><Tag className="h-4 w-4" /> Print Label (2×4)</Button>
          <Button variant="outline" onClick={handlePrintSession} className="gap-2"><ClipboardList className="h-4 w-4" /> Print Session Sheet</Button>
          {pack.status !== "unpacked" && (
            <Button variant="secondary" onClick={() => navigate(`/unpack/${pack.id}`)} className="gap-2">
              <PackageOpen className="h-4 w-4" /> Unpack Tank
            </Button>
          )}
        </div>

        {/* Unpack Details (if unpacked) */}
        {pack.status === "unpacked" && (
          <>
            <Card>
              <CardHeader><CardTitle>Unpack Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Date Unpacked:</span><span>{pack.unpacked_at ? format(new Date(pack.unpacked_at), "MMMM d, yyyy") : "—"}</span></div>
                <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Unpacked By:</span><span>{pack.unpacked_by || "—"}</span></div>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Bull</TableHead>
                    <TableHead>Bull Code</TableHead>
                    <TableHead className="text-right">Packed</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead>Dest. Tank</TableHead>
                    <TableHead>Canister</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpackLines.map((ul: any) => {
                    const packed = packLines.find((pl: any) =>
                      (pl.bull_catalog_id && pl.bull_catalog_id === ul.bull_catalog_id) ||
                      (!pl.bull_catalog_id && pl.bull_name === ul.bull_name)
                    );
                    const unitsPacked = packed?.units || 0;
                    return (
                      <TableRow key={ul.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{ul.bull_name}</TableCell>
                        <TableCell>{ul.bull_code || "—"}</TableCell>
                        <TableCell className="text-right">{unitsPacked}</TableCell>
                        <TableCell className="text-right">{ul.units_returned}</TableCell>
                        <TableCell className="text-right">{unitsPacked - ul.units_returned}</TableCell>
                        <TableCell>{ul.tanks?.tank_name || ul.tanks?.tank_number || "—"}</TableCell>
                        <TableCell>{ul.destination_canister || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-right font-semibold">Total</TableCell>
                    <TableCell className="text-right font-bold">{totalPackedUnits}</TableCell>
                    <TableCell className="text-right font-bold">{unpackLines.reduce((s: number, ul: any) => s + (ul.units_returned || 0), 0)}</TableCell>
                    <TableCell className="text-right font-bold">{totalPackedUnits - unpackLines.reduce((s: number, ul: any) => s + (ul.units_returned || 0), 0)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex">
              <Button onClick={handlePrintReturn} className="gap-2"><FileText className="h-4 w-4" /> Print Return Slip</Button>
            </div>
          </>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default PackDetail;
