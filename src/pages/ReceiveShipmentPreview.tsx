import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getBullDisplayName } from "@/lib/bullDisplay";
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
import { Loader2, Printer, ArrowLeft, Pencil, Trash2, ShieldAlert, Check, AlertTriangle, Upload, X, FileText, Image } from "lucide-react";
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
  const [uploading, setUploading] = useState(false);

  // Fetch shipment
  const { data: shipment, isLoading, refetch } = useQuery({
    queryKey: ["shipment-preview", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("shipments")
        .select("*, semen_companies!shipments_semen_company_id_fkey(name), customers!shipments_customer_id_fkey(name)")
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
      return data ?? [];
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

  // Fetch org members so we can resolve received_by UUID to a label
  const { data: orgMembers = [] } = useQuery({
    queryKey: ["org-members-for-receiving", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc("get_org_members", { _organization_id: orgId });
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        id: m.id,
        label: m.email || m.invited_email || "Unknown member",
      }));
    },
    enabled: !!orgId,
  });

  const memberLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of orgMembers) map.set(m.id, m.label);
    return map;
  }, [orgMembers]);

  const receivedByLabel = shipment?.received_by
    ? memberLabelById.get(shipment.received_by) || "—"
    : "—";

  const tankName = (tankId: string) => {
    const t = tanks.find((tk) => tk.id === tankId);
    return t ? (t.tank_name || t.tank_number) : "—";
  };

  const isDraft = shipment?.status === "draft";
  const isConfirmed = shipment?.status === "confirmed";
  const canOverride = role === "owner" || role === "admin";
  const snapshot = shipment?.reconciliation_snapshot as any;

  // Check if linked order was already received (for duplicate warning on drafts)
  const { data: linkedOrder } = useQuery({
    queryKey: ["linked-order-status", shipment?.semen_order_id],
    queryFn: async () => {
      if (!shipment?.semen_order_id) return null;
      const { data } = await supabase
        .from("semen_orders")
        .select("fulfillment_status, customer_id, customers!semen_orders_customer_id_fkey(name)")
        .eq("id", shipment.semen_order_id)
        .single();
      return data;
    },
    enabled: !!shipment?.semen_order_id && isDraft,
  });

  const alreadyReceivedStatuses = ["fulfilled", "partially_fulfilled", "substituted", "over", "short"];
  const showDuplicateWarning = isDraft && linkedOrder && alreadyReceivedStatuses.includes((linkedOrder as any).fulfillment_status);

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
      const name = getBullDisplayName(oi);
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
    // Guard: if a previous click is still in flight, ignore this one.
    if (confirming) return;
    if (!shipment || !orgId || !id) return;
    setConfirming(true);

    try {
      const { data, error } = await supabase.rpc("confirm_shipment", {
        _input: { shipment_id: id },
      });

      if (error) {
        console.error("confirm_shipment error:", error);
        toast({ title: "Error confirming", description: error.message, variant: "destructive" });
        // Re-enable the button so the user can retry after fixing whatever broke.
        setConfirming(false);
        return;
      }

      const result = data as any;
      toast({
        title: "Shipment confirmed",
        description: `${result?.total_units ?? 0} units added to inventory`,
      });
      // Note: we intentionally do NOT setConfirming(false) on success —
      // the page is about to navigate away, and leaving it disabled prevents
      // any straggler click from firing during the navigation transition.
      refetch();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to confirm shipment", variant: "destructive" });
      // Re-enable the button so the user can retry after fixing whatever broke.
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !shipment || !orgId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB allowed", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Remove old file if exists
      if (shipment.document_path) {
        await supabase.storage.from("shipment-documents").remove([shipment.document_path]);
      }
      const path = `${orgId}/${crypto.randomUUID()}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("shipment-documents").upload(path, file);
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from("shipments").update({ document_path: path }).eq("id", shipment.id);
      if (updErr) throw updErr;
      toast({ title: "Packing slip uploaded" });
      refetch();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      e.target.value = "";
    }
  };

  const handleRemoveFile = async () => {
    if (!shipment?.document_path) return;
    setUploading(true);
    try {
      await supabase.storage.from("shipment-documents").remove([shipment.document_path]);
      await supabase.from("shipments").update({ document_path: null }).eq("id", shipment.id);
      toast({ title: "Packing slip removed" });
      refetch();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const isImageFile = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return ["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext);
  };

  // Fetch a signed URL for the private storage bucket (valid 1 hour)
  const { data: documentUrl } = useQuery({
    queryKey: ["shipment-doc-url", shipment?.document_path],
    queryFn: async () => {
      if (!shipment?.document_path) return null;
      const { data, error } = await supabase.storage
        .from("shipment-documents")
        .createSignedUrl(shipment.document_path, 3600);
      if (error) { console.error("Signed URL error:", error); return null; }
      return data?.signedUrl || null;
    },
    enabled: !!shipment?.document_path,
    staleTime: 30 * 60 * 1000, // refresh after 30 min (URL valid for 60 min)
  });

  const handlePrintPdf = () => {
    if (!shipment) return;
    generateReceivingReportPdf(
      {
        received_from_name: (shipment as any).semen_companies?.name || "—",
        received_date: shipment.received_date,
        received_by: receivedByLabel === "—" ? null : receivedByLabel,
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
                <span className="text-muted-foreground">Company</span>
                <p className="font-medium">{(shipment as any).semen_companies?.name || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Received Date</span>
                <p className="font-medium">
                  {shipment.received_date ? format(new Date(shipment.received_date + "T00:00:00"), "MMM d, yyyy") : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Received By</span>
                <p className="font-medium">{receivedByLabel}</p>
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
                Status: <strong>{(linkedOrder as any)?.fulfillment_status?.replace(/_/g, " ")}</strong>. Confirming this draft will create a second shipment and add to inventory again.
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
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm text-center">
              <div>
                <p className="text-muted-foreground">Units Ordered</p>
                <p className="text-lg font-bold">{totals.total_ordered}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Units Received</p>
                <p className="text-lg font-bold">{totals.total_received}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Net Units</p>
                <p className={cn("text-lg font-bold", (totals.total_received - totals.total_ordered) < 0 ? "text-destructive" : "text-primary")}>
                  {totals.total_received - totals.total_ordered >= 0 ? "+" : ""}{totals.total_received - totals.total_ordered}
                </p>
              </div>
            </div>
            {(totals.lines_short > 0 || totals.lines_missing > 0 || totals.lines_added > 0) && (
              <div className="flex items-center justify-center gap-4 text-xs border-t border-border/50 pt-3">
                {totals.lines_short > 0 && (
                  <span className="text-destructive font-medium">{totals.lines_short} bull{totals.lines_short !== 1 ? "s" : ""} short</span>
                )}
                {totals.lines_missing > 0 && (
                  <span className="text-destructive font-medium">{totals.lines_missing} bull{totals.lines_missing !== 1 ? "s" : ""} missing</span>
                )}
                {totals.lines_added > 0 && (
                  <span className="text-muted-foreground font-medium">{totals.lines_added} bull{totals.lines_added !== 1 ? "s" : ""} added (not on order)</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Packing Slip */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Packing Slip</CardTitle>
            {shipment.document_path && (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-rose-400" onClick={handleRemoveFile} disabled={uploading}>
                <X className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {shipment.document_path ? (
              <div className="space-y-3">
                {isImageFile(shipment.document_path) ? (
                  <a href={documentUrl || "#"} target="_blank" rel="noopener noreferrer">
                    <img
                      src={documentUrl || ""}
                      alt="Packing slip"
                      className="max-w-full max-h-96 rounded-lg border border-border object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  </a>
                ) : (
                  <a
                    href={documentUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                  >
                    <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{shipment.document_path.split("/").pop()}</p>
                      <p className="text-xs text-muted-foreground">Click to view</p>
                    </div>
                  </a>
                )}
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Upload className="h-3 w-3" />
                  <span>Replace file</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.heic,.heif,.pdf"
                    capture="environment"
                    className="sr-only"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 cursor-pointer p-6 border border-dashed border-border rounded-lg hover:bg-secondary/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {uploading ? "Uploading..." : "Upload packing slip photo or PDF"}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.heic,.heif,.pdf"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            )}
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
                      {confirming ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Confirming…
                        </>
                      ) : (
                        "Confirm"
                      )}
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
                        // Revert to draft so the edit page accepts it
                        const { error: revertErr } = await supabase
                          .from("shipments")
                          .update({ status: "draft", confirmed_at: null, confirmed_by: null })
                          .eq("id", id!);
                        if (revertErr) {
                          toast({ title: "Error", description: "Failed to unlock shipment: " + revertErr.message, variant: "destructive" });
                          return;
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
