import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, FileText, Tag, ClipboardList, PackageOpen, PackageCheck, Package,
  Truck, ExternalLink, Pencil, Loader2, Check, CalendarIcon,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useOrgRole } from "@/hooks/useOrgRole";

import { generatePackingSlipPdf } from "@/lib/generatePackingSlipPdf";
import { generatePackingLabelPdf } from "@/lib/generatePackingLabelPdf";
import { generateSessionSheetPdf } from "@/lib/generateSessionSheetPdf";
import { generateReturnSlipPdf } from "@/lib/generateReturnSlipPdf";

const STATUS_BADGE: Record<string, string> = {
  packed: "bg-green-600/20 text-green-400 border-green-600/30",
  in_field: "bg-green-600/20 text-green-400 border-green-600/30",
  unpacked: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  returned: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function getTrackingUrl(carrier: string | null, trackingNumber: string): string | null {
  if (!trackingNumber) return null;
  const num = trackingNumber.trim();
  switch (carrier?.toLowerCase()) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`;
    default:
      return null;
  }
}

const PackDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrgRole();

  const [editingTracking, setEditingTracking] = useState(false);
  const [editCarrier, setEditCarrier] = useState("");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);

  const [editingReturnTracking, setEditingReturnTracking] = useState(false);
  const [editReturnCarrier, setEditReturnCarrier] = useState("");
  const [editReturnTrackingNumber, setEditReturnTrackingNumber] = useState("");
  const [savingReturnTracking, setSavingReturnTracking] = useState(false);

  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [closingOut, setClosingOut] = useState(false);
  const [closeOutDate, setCloseOutDate] = useState<Date>(new Date());
  const [closeOutBy, setCloseOutBy] = useState("");
  const [closeOutNotes, setCloseOutNotes] = useState("");

  // Fetch pack with field tank
  const { data: pack, isLoading } = useQuery({
    queryKey: ["pack_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("*, tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number), customers(name)")
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

  // Fetch pack orders
  const { data: packOrders = [] } = useQuery({
    queryKey: ["pack_orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_orders")
        .select("semen_order_id, semen_orders(id, customer_name, order_date, fulfillment_status)")
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
  const packTypeValue = pack?.pack_type || "project";
  const isShipment = packTypeValue === "shipment";
  const isOrder = packTypeValue === "order";
  const isPickup = packTypeValue === "pickup";
  const pickupCustomerName = (pack?.customers as any)?.name;

  const handleSaveTracking = async () => {
    setSavingTracking(true);
    try {
      await supabase.from("tank_packs").update({
        shipping_carrier: editCarrier || null,
        tracking_number: editTrackingNumber.trim() || null,
      }).eq("id", pack.id);
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      setEditingTracking(false);
      toast({ title: "Tracking updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSavingTracking(false);
    }
  };

  const handleSaveReturnTracking = async () => {
    setSavingReturnTracking(true);
    try {
      await supabase.from("tank_packs").update({
        return_carrier: editReturnCarrier || null,
        return_tracking_number: editReturnTrackingNumber.trim() || null,
      } as any).eq("id", pack.id);
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      setEditingReturnTracking(false);
      toast({ title: "Return tracking updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSavingReturnTracking(false);
    }
  };

  const handlePrintSlip = () => {
    generatePackingSlipPdf(
      {
        fieldTankName,
        packedAt: pack.packed_at,
        packedBy: pack.packed_by,
        projectNames: isShipment ? [] : projectNames,
        notes: pack.notes,
        packType: packTypeValue,
        destinationName: pack.destination_name,
        destinationAddress: pack.destination_address,
        trackingNumber: pack.tracking_number,
        shippingCarrier: pack.shipping_carrier,
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
      {
        fieldTankName,
        packedAt: pack.packed_at,
        projectNames: isShipment ? [] : projectNames,
        packType: packTypeValue,
        destinationName: pack.destination_name,
      },
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
        packedBy: pack.packed_by,
        unpackedBy: pack.unpacked_by,
        projectNames,
        notes: pack.notes,
      },
      unpackLines.map((ul: any) => {
        const key = ul.bull_catalog_id || ul.bull_name;
        const unitsPacked = packedMap.get(key) || 0;
        return {
          bullName: ul.bull_name,
          bullCode: ul.bull_code,
          unitsPacked,
          unitsReturned: ul.units_returned,
          destinationTankName: ul.tanks?.tank_name || ul.tanks?.tank_number || "—",
          destinationCanister: ul.destination_canister,
        };
      })
    );
  };

  const handleCloseOut = async () => {
    if (!pack || !orgId) return;
    setClosingOut(true);
    try {
      const { error: updateErr } = await supabase
        .from("tank_packs")
        .update({
          status: "returned",
          closed_at: closeOutDate.toISOString(),
          closed_by: closeOutBy.trim() || null,
          notes: [pack.notes, closeOutNotes.trim()].filter(Boolean).join(" | ") || null,
        } as any)
        .eq("id", pack.id);
      if (updateErr) throw updateErr;

      const { data: packLinesData, error: linesErr } = await supabase
        .from("tank_pack_lines")
        .select("id, bull_name, bull_code, bull_catalog_id, units")
        .eq("tank_pack_id", pack.id);
      if (linesErr) throw linesErr;

      for (const line of (packLinesData || [])) {
        let invRow: any = null;
        const baseQ = () => supabase.from("tank_inventory").select("id, units")
          .eq("tank_id", pack.field_tank_id)
          .eq("organization_id", orgId);

        if (line.bull_catalog_id) {
          const { data } = await baseQ().eq("bull_catalog_id", line.bull_catalog_id).limit(1);
          if (data && data.length > 0) invRow = data[0];
        }
        if (!invRow && line.bull_code) {
          const { data } = await baseQ().eq("bull_code", line.bull_code).limit(1);
          if (data && data.length > 0) invRow = data[0];
        }
        if (!invRow) {
          const { data } = await baseQ().eq("custom_bull_name", line.bull_name).limit(1);
          if (data && data.length > 0) invRow = data[0];
        }

        if (invRow) {
          const remaining = (invRow.units || 0) - line.units;
          if (remaining <= 0) {
            const { error: delErr } = await supabase.from("tank_inventory").delete().eq("id", invRow.id);
            if (delErr) throw delErr;
          } else {
            const { error: updErr } = await supabase.from("tank_inventory").update({ units: remaining }).eq("id", invRow.id);
            if (updErr) throw updErr;
          }
        }

        const { error: txnErr } = await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: pack.field_tank_id,
          bull_catalog_id: line.bull_catalog_id,
          bull_code: line.bull_code,
          custom_bull_name: line.bull_name,
          units_change: -line.units,
          transaction_type: "used_in_field",
          notes: `Close-out: all semen used. Pack ${pack.id.slice(0, 8)}`,
        });
        if (txnErr) throw txnErr;
      }

      toast({ title: "Pack closed out", description: "Tank marked as returned. All semen recorded as used in field." });
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      setCloseOutOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setClosingOut(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main></div>;
  }
  if (!pack) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Pack not found.</p></main></div>;
  }

  const trackingUrl = getTrackingUrl(pack.shipping_carrier, pack.tracking_number || "");

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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={isShipment ? "bg-blue-600/20 text-blue-400 border-blue-600/30" : isOrder ? "bg-amber-600/20 text-amber-400 border-amber-600/30" : isPickup ? "bg-violet-600/20 text-violet-400 border-violet-600/30" : "bg-teal-600/20 text-teal-400 border-teal-600/30"}>
              {isShipment ? <><Truck className="h-3 w-3 mr-1" /> Shipment</> : isOrder ? <><ClipboardList className="h-3 w-3 mr-1" /> Order</> : isPickup ? <><Package className="h-3 w-3 mr-1" /> Pickup</> : <><ClipboardList className="h-3 w-3 mr-1" /> Project</>}
            </Badge>
            <Badge variant="outline" className={STATUS_BADGE[pack.status] || "bg-muted text-muted-foreground border-border"}>
              {pack.status}
            </Badge>
          </div>
        </div>

        {/* Details Card */}
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Field Tank:</span><span>{fieldTankName}</span></div>
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Date Packed:</span><span>{format(new Date(pack.packed_at), "MMMM d, yyyy")}</span></div>
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Packed By:</span><span>{pack.packed_by || "—"}</span></div>

            {/* Conditional: Project vs Shipment details */}
            {isShipment ? (
              <>
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Ship To:</span><span>{pack.destination_name || "—"}</span></div>
                {pack.destination_address && (
                  <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Address:</span><span>{pack.destination_address}</span></div>
                )}
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Carrier:</span><span>{pack.shipping_carrier || "—"}</span></div>
                <div className="flex gap-2 items-start">
                  <span className="font-semibold w-28 shrink-0">Tracking:</span>
                  {editingTracking ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={editCarrier} onValueChange={setEditCarrier}>
                        <SelectTrigger className="w-28 h-8 text-sm">
                          <SelectValue placeholder="Carrier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UPS">UPS</SelectItem>
                          <SelectItem value="FedEx">FedEx</SelectItem>
                          <SelectItem value="USPS">USPS</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-48 h-8 text-sm"
                        placeholder="Tracking number"
                        value={editTrackingNumber}
                        onChange={e => setEditTrackingNumber(e.target.value)}
                      />
                      <Button size="sm" variant="outline" onClick={handleSaveTracking} disabled={savingTracking} className="gap-1 h-8">
                        {savingTracking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingTracking(false)} className="h-8">Cancel</Button>
                    </div>
                  ) : pack.tracking_number ? (
                    <div className="flex items-center gap-2">
                      {trackingUrl ? (
                        <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          {pack.tracking_number} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>{pack.tracking_number}</span>
                      )}
                      {pack.shipping_carrier && <span className="text-muted-foreground">({pack.shipping_carrier})</span>}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditCarrier(pack.shipping_carrier || ""); setEditTrackingNumber(pack.tracking_number || ""); setEditingTracking(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-auto p-0 text-primary hover:underline" onClick={() => { setEditCarrier(pack.shipping_carrier || ""); setEditTrackingNumber(""); setEditingTracking(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Add tracking
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="font-semibold w-28 shrink-0">Tank Return:</span>
                  {pack.tank_return_expected ? (
                    <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30">Expected</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-600/20 text-amber-400 border-amber-600/30">Not returning</Badge>
                  )}
                </div>
                <div className="flex gap-2 items-start">
                  <span className="font-semibold w-28 shrink-0">Return Track:</span>
                  {editingReturnTracking ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={editReturnCarrier} onValueChange={setEditReturnCarrier}>
                        <SelectTrigger className="w-28 h-8 text-sm">
                          <SelectValue placeholder="Carrier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UPS">UPS</SelectItem>
                          <SelectItem value="FedEx">FedEx</SelectItem>
                          <SelectItem value="USPS">USPS</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-48 h-8 text-sm"
                        placeholder="Return tracking number"
                        value={editReturnTrackingNumber}
                        onChange={e => setEditReturnTrackingNumber(e.target.value)}
                      />
                      <Button size="sm" variant="outline" onClick={handleSaveReturnTracking} disabled={savingReturnTracking} className="gap-1 h-8">
                        {savingReturnTracking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingReturnTracking(false)} className="h-8">Cancel</Button>
                    </div>
                  ) : (pack as any).return_tracking_number ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const returnUrl = getTrackingUrl((pack as any).return_carrier, (pack as any).return_tracking_number || "");
                        return returnUrl ? (
                          <a href={returnUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            {(pack as any).return_tracking_number} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span>{(pack as any).return_tracking_number}</span>
                        );
                      })()}
                      {(pack as any).return_carrier && <span className="text-muted-foreground">({(pack as any).return_carrier})</span>}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditReturnCarrier((pack as any).return_carrier || ""); setEditReturnTrackingNumber((pack as any).return_tracking_number || ""); setEditingReturnTracking(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-auto p-0 text-primary hover:underline" onClick={() => { setEditReturnCarrier((pack as any).return_carrier || ""); setEditReturnTrackingNumber(""); setEditingReturnTracking(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Add return tracking
                    </Button>
                  )}
                </div>
              </>
            ) : isOrder ? (
              <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Orders:</span>
                <div className="flex flex-wrap gap-1">
                  {packOrders.map((link: any) => (
                    <Badge
                      key={link.semen_order_id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => navigate(`/semen-orders/${link.semen_order_id}`)}
                    >
                      {(link.semen_orders as any)?.customers?.name || "Order"}{" "}
                      <ExternalLink className="h-3 w-3 ml-1 inline" />
                    </Badge>
                  ))}
                </div>
              </div>
            ) : isPickup ? (
              <>
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Picked up by:</span><span>{pickupCustomerName || "—"}</span></div>
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Pickup Date:</span><span>{format(new Date(pack.packed_at), "MMMM d, yyyy")}</span></div>
                {pack.tank_return_expected ? (
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold w-28 shrink-0">Tank Return:</span>
                    <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30">Expected</Badge>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold w-28 shrink-0">Tank Return:</span>
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Not returning</Badge>
                  </div>
                )}
                {packOrders.length > 0 && (
                  <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Orders:</span>
                    <div className="flex flex-wrap gap-1">
                      {packOrders.map((link: any) => (
                        <Badge
                          key={link.semen_order_id}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => navigate(`/semen-orders/${link.semen_order_id}`)}
                        >
                          {link.semen_orders?.order_date ? format(new Date(link.semen_orders.order_date + "T00:00"), "MMM d, yyyy") : "Order"}{" "}
                          <ExternalLink className="h-3 w-3 ml-1 inline" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Projects:</span>
                <div className="flex flex-wrap gap-1">
                  {projectNames.map((name: string, i: number) => (
                    <Badge key={i} variant="secondary">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

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
          {!isShipment && (
            <Button variant="outline" onClick={handlePrintSession} className="gap-2"><ClipboardList className="h-4 w-4" /> Print Session Sheet</Button>
          )}
          {isShipment && (
            <Button variant="outline" onClick={() => window.open("https://www.ups.com/ship/guided/origin", "_blank")} className="gap-2">
              <Truck className="h-4 w-4" /> Create UPS Shipment
            </Button>
          )}
          {pack.tank_return_expected !== false && pack.status !== "unpacked" && pack.status !== "returned" && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/unpack/${pack.id}`)} className="gap-2">
                <PackageOpen className="h-4 w-4" /> Unpack Tank
              </Button>
              <Button variant="outline" onClick={() => setCloseOutOpen(true)} className="gap-2">
                <PackageCheck className="h-4 w-4" /> Close Out
              </Button>
            </>
          )}
        </div>

        {/* Close Out Dialog */}
        <AlertDialog open={closeOutOpen} onOpenChange={setCloseOutOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close Out Pack</AlertDialogTitle>
              <AlertDialogDescription>
                This marks the pack as complete — all semen was used in the field and the tank has been returned.
                Field tank inventory will be zeroed out and transactions logged as "used in field."
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Return Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !closeOutDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(closeOutDate, "MMMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={closeOutDate} onSelect={(d) => d && setCloseOutDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium">Returned By</label>
                <Input value={closeOutBy} onChange={(e) => setCloseOutBy(e.target.value)} placeholder="Who confirmed the return?" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea value={closeOutNotes} onChange={(e) => setCloseOutNotes(e.target.value)} placeholder="e.g., Tank empty, good condition" className="mt-1" />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleCloseOut} disabled={closingOut}>
                {closingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Close Out Pack
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

        {/* Close Out Details (if returned) */}
        {pack.status === "returned" && (
          <Card>
            <CardHeader><CardTitle>Close Out Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Date Returned:</span><span>{pack.closed_at ? format(new Date(pack.closed_at), "MMMM d, yyyy") : "—"}</span></div>
              <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Returned By:</span><span>{(pack as any).closed_by || "—"}</span></div>
              <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Outcome:</span><span>All semen used in field</span></div>
            </CardContent>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default PackDetail;
