import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Printer, ArrowLeft, Pencil, Trash2, ShieldAlert, Check, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { RECONCILIATION_STATUS_COLORS } from "@/lib/constants";
import { generateReceivingReportPdf } from "@/lib/generateReceivingReportPdf";

interface DraftLine {
  groupId: string;
  bullCatalogId: string | null;
  bullName: string;
  tankId: string;
  canister: string;
  units: number;
  itemType: string;
}

interface ReconciliationRow {
  bullCatalogId: string | null;
  bullName: string;
  ordered_units: number;
  received_units: number;
  delta: number;
  status: string;
  locations?: string[];
}

interface Totals {
  total_ordered: number;
  total_received: number;
  lines_short: number;
  lines_over: number;
  lines_added: number;
  lines_missing: number;
}

const ReceiveShipmentPreview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId, role } = useOrgRole();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch shipment
  const { data: shipment, isLoading, refetch } = useQuery({
    queryKey: ["shipment-preview", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch order items if linked
  const orderId = shipment?.semen_order_id;
  const { data: orderItems = [] } = useQuery({
    queryKey: ["order-items-for-reconcile", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data } = await supabase
        .from("semen_order_items")
        .select("bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name)")
        .eq("semen_order_id", orderId);
      return (data ?? []) as any[];
    },
    enabled: !!orderId,
  });

  // Fetch tanks for name lookup
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks-names", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("tanks").select("id, tank_name, tank_number").eq("organization_id", orgId);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Fetch customers for owner lookup
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list-preview", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("customers").select("id, name").eq("organization_id", orgId);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const tankName = (tankId: string) => {
    const t = tanks.find((tk) => tk.id === tankId);
    return t ? (t.tank_name || t.tank_number) : "—";
  };

  const isDraft = shipment?.status === "draft";
  const isConfirmed = shipment?.status === "confirmed";
  const _isOwner = role === "owner";
  const canOverride = role === "owner" || role === "admin";
  const snapshot = shipment?.reconciliation_snapshot as any;

  // Check if linked order was already received (for duplicate warning on drafts)
  const { data: linkedOrder } = useQuery({
    queryKey: ["linked-order-status", shipment?.semen_order_id],
    queryFn: async () => {
      if (!shipment?.semen_order_id) return null;
      const { data } = await supabase
        .from("semen_orders")
        .select("fulfillment_status, customer_name")
        .eq("id", shipment.semen_order_id)
        .single();
      return data;
    },
    enabled: !!shipment?.semen_order_id && isDraft,
  });

  const alreadyReceivedStatuses = ["delivered", "partially_filled", "substituted", "over", "short"];
  const showDuplicateWarning = isDraft && linkedOrder && alreadyReceivedStatuses.includes(linkedOrder.fulfillment_status);

  // Build reconciliation
  const { reconciliation, totals } = useMemo(() => {
    if (!shipment) return { reconciliation: [] as ReconciliationRow[], totals: { total_ordered: 0, total_received: 0, lines_short: 0, lines_over: 0, lines_added: 0, lines_missing: 0 } };

    // If confirmed, use frozen snapshot
    if (isConfirmed && snapshot?.reconciliation) {
      const recon = snapshot.reconciliation as ReconciliationRow[];
      const t = snapshot.totals as Totals;
      return { reconciliation: recon, totals: t };
    }

    // Draft mode: compute live
    const draftLines: DraftLine[] = snapshot?.draft_lines ?? [];

    // Group received by bull
    const receivedMap = new Map<string, { bullName: string; bullCatalogId: string | null; units: number; locations: string[] }>();
    for (const dl of draftLines) {
      const key = dl.bullCatalogId || dl.bullName;
      const existing = receivedMap.get(key);
      const loc = `${tankName(dl.tankId)} / ${dl.canister}`;
      if (existing) {
        existing.units += dl.units;
        existing.locations.push(loc);
      } else {
        receivedMap.set(key, { bullName: dl.bullName, bullCatalogId: dl.bullCatalogId, units: dl.units, locations: [loc] });
      }
    }

    // Group ordered by bull
    const orderedMap = new Map<string, { bullName: string; bullCatalogId: string | null; units: number }>();
    for (const oi of orderItems) {
      const catId = oi.bull_catalog_id;
      const name = oi.bulls_catalog?.bull_name ?? oi.custom_bull_name ?? "";
      const key = catId || name;
      const existing = orderedMap.get(key);
      if (existing) {
        existing.units += oi.units;
      } else {
        orderedMap.set(key, { bullName: name, bullCatalogId: catId, units: oi.units });
      }
    }

    const rows: ReconciliationRow[] = [];

    // Process ordered items
    for (const [key, ordered] of orderedMap) {
      const received = receivedMap.get(key);
      if (received) {
        const delta = received.units - ordered.units;
        let status = "match";
        if (delta < 0) status = "short";
        if (delta > 0) status = "over";
        rows.push({
          bullCatalogId: ordered.bullCatalogId,
          bullName: ordered.bullName,
          ordered_units: ordered.units,
          received_units: received.units,
          delta,
          status,
          locations: received.locations,
        });
        receivedMap.delete(key);
      } else {
        rows.push({
          bullCatalogId: ordered.bullCatalogId,
          bullName: ordered.bullName,
          ordered_units: ordered.units,
          received_units: 0,
          delta: -ordered.units,
          status: "missing",
          locations: [],
        });
      }
    }

    // Remaining received = added
    for (const [, received] of receivedMap) {
      rows.push({
        bullCatalogId: received.bullCatalogId,
        bullName: received.bullName,
        ordered_units: 0,
        received_units: received.units,
        delta: received.units,
        status: "added",
        locations: received.locations,
      });
    }

    const t: Totals = {
      total_ordered: rows.reduce((s, r) => s + r.ordered_units, 0),
      total_received: rows.reduce((s, r) => s + r.received_units, 0),
      lines_short: rows.filter((r) => r.status === "short").length,
      lines_over: rows.filter((r) => r.status === "over").length,
      lines_added: rows.filter((r) => r.status === "added").length,
      lines_missing: rows.filter((r) => r.status === "missing").length,
    };

    return { reconciliation: rows, totals: t };
  }, [shipment, snapshot, orderItems, tanks, isConfirmed]);

  const handleConfirm = async () => {
    if (!shipment || !orgId || !id) return;
    setConfirming(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const draftLines: DraftLine[] = snapshot?.draft_lines ?? [];
      const semenOwnerId = snapshot?.semen_owner_id ?? null;

      let totalUnits = 0;

      for (const line of draftLines) {
        totalUnits += line.units;

        const matchFilter: Record<string, string> = {
          organization_id: orgId,
          tank_id: line.tankId,
          canister: line.canister,
          item_type: line.itemType || "semen",
        };

        if (line.bullCatalogId) {
          matchFilter.bull_catalog_id = line.bullCatalogId;
        } else {
          matchFilter.custom_bull_name = line.bullName;
        }

        const { data: existing } = await supabase
          .from("tank_inventory")
          .select("id, units")
          .match(matchFilter)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("tank_inventory")
            .update({ units: existing.units + line.units })
            .eq("id", existing.id);
          if (error) { toast({ title: "Error updating inventory", description: error.message, variant: "destructive" }); setConfirming(false); return; }
        } else {
          const ownerName = semenOwnerId ? customers.find((c) => c.id === semenOwnerId)?.name || null : null;
          const { error } = await supabase.from("tank_inventory").insert({
            organization_id: orgId,
            tank_id: line.tankId,
            canister: line.canister,
            bull_catalog_id: line.bullCatalogId,
            custom_bull_name: line.bullCatalogId ? null : line.bullName,
            units: line.units,
            storage_type: "inventory",
            item_type: line.itemType || "semen",
            customer_id: semenOwnerId || null,
            owner: ownerName,
          });
          if (error) { toast({ title: "Error inserting inventory", description: error.message, variant: "destructive" }); setConfirming(false); return; }
        }

        const { error: txErr } = await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: line.tankId,
          bull_catalog_id: line.bullCatalogId,
          custom_bull_name: line.bullName,
          units_change: line.units,
          transaction_type: "received",
          shipment_id: id,
          order_id: shipment.semen_order_id || null,
          performed_by: userId,
          notes: `Received from ${shipment.received_from || "unknown"}`,
        });
        if (txErr) { toast({ title: "Error recording transaction", description: txErr.message, variant: "destructive" }); setConfirming(false); return; }
      }

      // Update order fulfillment status
      if (shipment.semen_order_id) {
        let newStatus = "delivered";
        const hasShort = reconciliation.some((r) => r.status === "short");
        const hasMissing = reconciliation.some((r) => r.status === "missing");
        if (hasShort || hasMissing) newStatus = "partially_filled";

        const { data: currentOrder } = await supabase
          .from("semen_orders")
          .select("fulfillment_status")
          .eq("id", shipment.semen_order_id)
          .single();

        const statusRank: Record<string, number> = {
          pending: 0, backordered: 1, ordered: 2, partially_filled: 3, shipped: 4, delivered: 5,
        };

        if (currentOrder && (statusRank[newStatus] ?? 0) > (statusRank[currentOrder.fulfillment_status] ?? 0)) {
          await supabase.from("semen_orders").update({ fulfillment_status: newStatus }).eq("id", shipment.semen_order_id);
        }
      }

      // Build confirmed snapshot
      const confirmedSnapshot = {
        version: 1,
        confirmed_at: new Date().toISOString(),
        reconciliation: reconciliation.map((r) => ({
          bullCatalogId: r.bullCatalogId,
          bullName: r.bullName,
          ordered_units: r.ordered_units,
          received_units: r.received_units,
          delta: r.delta,
          status: r.status,
        })),
        received_lines: draftLines,
        totals,
      };

      const { error: shipErr } = await supabase.from("shipments").update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: userId,
        reconciliation_snapshot: confirmedSnapshot as any,
      }).eq("id", id);

      if (shipErr) { toast({ title: "Error confirming", description: shipErr.message, variant: "destructive" }); setConfirming(false); return; }

      toast({ title: "Shipment confirmed", description: `${totalUnits} units added to inventory` });
      refetch();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to confirm shipment", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      // Delete packing slip if exists
      if (shipment?.document_path) {
        await supabase.storage.from("shipment-documents").remove([shipment.document_path]);
      }
      const { error } = await supabase.from("shipments").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Draft deleted" });
      navigate("/receive-shipment");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintPdf = () => {
    if (!shipment) return;
    generateReceivingReportPdf(
      {
        received_from: shipment.received_from,
        received_date: shipment.received_date,
        received_by: shipment.received_by,
        notes: shipment.notes,
        confirmed_at: snapshot?.confirmed_at || shipment.confirmed_at,
      },
      reconciliation,
      totals,
      isConfirmed
    );
  };

  const statusBadgeClass = (status: string) =>
    RECONCILIATION_STATUS_COLORS[status] || "bg-muted text-muted-foreground";

  const statusLabel = (status: string, delta: number) => {
    switch (status) {
      case "match": return "✓ Match";
      case "short": return `⚠ Short (${delta})`;
      case "over": return `+ Over (+${delta})`;
      case "added": return "+ Added";
      case "missing": return "✗ Missing";
      case "substituted": return "↔ Substituted";
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Shipment not found.</p>
          <Button variant="outline" onClick={() => navigate("/receive-shipment")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/inventory-dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Receiving Report</h1>
              {isDraft && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">DRAFT</Badge>
              )}
              {isConfirmed && (
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                  <Check className="h-3 w-3 mr-1" /> Confirmed
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Metadata */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Received From</span>
                <p className="font-medium">{shipment.received_from || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Received Date</span>
                <p className="font-medium">
                  {shipment.received_date ? format(new Date(shipment.received_date + "T00:00:00"), "MMM d, yyyy") : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Received By</span>
                <p className="font-medium">{shipment.received_by || "—"}</p>
              </div>
              {shipment.semen_order_id && (
                <div>
                  <span className="text-muted-foreground">Linked Order</span>
                  <p>
                    <Link to={`/semen-orders/${shipment.semen_order_id}`} className="text-primary hover:underline text-sm font-medium">
                      View Order →
                    </Link>
                  </p>
                </div>
              )}
              {isConfirmed && snapshot?.confirmed_at && (
                <div>
                  <span className="text-muted-foreground">Confirmed At</span>
                  <p className="font-medium">{format(new Date(snapshot.confirmed_at), "MMM d, yyyy h:mm a")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* No order notice */}
        {!shipment.semen_order_id && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Manual entry — no order linked for comparison.
          </div>
        )}

        {/* Duplicate receive warning (drafts only) */}
        {showDuplicateWarning && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">This order has already been received</p>
              <p className="text-amber-300/80 mt-0.5">
                Status: <strong>{linkedOrder?.fulfillment_status.replace(/_/g, " ")}</strong>. Confirming this draft will create a second shipment and add to inventory again.
              </p>
            </div>
          </div>
        )}

        {/* Reconciliation Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bull</TableHead>
                    <TableHead className="text-right w-20">Ordered</TableHead>
                    <TableHead className="text-right w-20">Received</TableHead>
                    <TableHead className="text-right w-20">Delta</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead>Locations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliation.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No items to display
                      </TableCell>
                    </TableRow>
                  ) : (
                    reconciliation.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.bullName || "—"}</TableCell>
                        <TableCell className="text-right">{row.ordered_units || "—"}</TableCell>
                        <TableCell className="text-right">{row.received_units}</TableCell>
                        <TableCell className="text-right font-mono">
                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", statusBadgeClass(row.status))}>
                            {statusLabel(row.status, row.delta)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.locations?.join(", ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-sm text-center">
              <div>
                <p className="text-muted-foreground">Ordered</p>
                <p className="text-lg font-bold">{totals.total_ordered}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Received</p>
                <p className="text-lg font-bold">{totals.total_received}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Net</p>
                <p className={cn("text-lg font-bold", (totals.total_received - totals.total_ordered) < 0 ? "text-destructive" : "text-primary")}>
                  {totals.total_received - totals.total_ordered >= 0 ? "+" : ""}{totals.total_received - totals.total_ordered}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Short</p>
                <p className="text-lg font-bold text-destructive">{totals.lines_short}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Added</p>
                <p className="text-lg font-bold">{totals.lines_added}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Missing</p>
                <p className="text-lg font-bold text-destructive">{totals.lines_missing}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {shipment.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{shipment.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pb-8">
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => navigate(`/receive-shipment/${id}`)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit Draft
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default">
                    <Check className="h-4 w-4 mr-2" /> Confirm & Add to Inventory
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Shipment</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will add {totals.total_received} units to inventory and lock this receiving report. Continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirm} disabled={confirming}>
                      {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="text-muted-foreground hover:text-rose-400">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Draft</AlertDialogTitle>
                    <AlertDialogDescription>
                      Delete this draft? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteDraft} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isConfirmed && (
            <>
              <Button variant="outline" onClick={handlePrintPdf}>
                <Printer className="h-4 w-4 mr-2" /> Print / Save PDF
              </Button>
              <Button variant="ghost" onClick={() => navigate("/inventory-dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>

              {canOverride && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-amber-400 border-amber-500/20 hover:bg-amber-500/10">
                      <ShieldAlert className="h-4 w-4 mr-2" /> Override Lock
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Override Confirmed Record</AlertDialogTitle>
                      <AlertDialogDescription>
                        This is a permanent record. Editing it after confirmation may cause inventory drift and audit issues. Continue only if you understand the consequences.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={async () => {
                        // Write audit log
                        try {
                          const { data: { user } } = await supabase.auth.getUser();
                          await supabase.from("receiving_report_audit_log").insert({
                            shipment_id: shipment!.id,
                            organization_id: orgId!,
                            edited_by: user!.id,
                            field_name: "override_edit",
                            old_value: JSON.stringify({ previous_confirmed_at: shipment!.confirmed_at }),
                            new_value: null,
                            reason: null,
                          });
                        } catch (e) {
                          console.error("Audit log write failed:", e);
                        }
                        navigate(`/receive-shipment/${id}`);
                      }}>
                        I Understand — Edit
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default ReceiveShipmentPreview;
