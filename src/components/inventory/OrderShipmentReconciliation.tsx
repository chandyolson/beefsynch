import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, Move } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";

type Props = {
  orderId: string;
  defaultView?: "order" | "shipment";
};

type OrderItem = {
  id: string;
  units: number;
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  bulls_catalog: {
    bull_name: string | null;
    naab_code: string | null;
    company: string | null;
  } | null;
};

type ReceiveLine = {
  id: string;
  units_change: number;
  created_at: string;
  shipment_id: string | null;
  tank_id: string | null;
  bull_catalog_id: string | null;
  bull_code: string | null;
  custom_bull_name: string | null;
  inventory_item_id: string | null;
  tanks: {
    tank_number: string | null;
    tank_name: string | null;
  } | null;
  tank_inventory: {
    canister: string | null;
    sub_canister: string | null;
  } | null;
  bulls_catalog: {
    bull_name: string | null;
    naab_code: string | null;
  } | null;
  shipments: {
    received_date: string | null;
    status: string | null;
  } | null;
};

type TankOption = {
  id: string;
  tank_number: string;
  tank_name: string | null;
};

type GroupedRow = {
  key: string;
  bullDisplay: string;
  bullSubtitle: string | null;
  ordered: number;
  received: number;
  receiveLines: ReceiveLine[];
};

const bullKey = (bullCatalogId: string | null, bullName: string | null) =>
  bullCatalogId ? `cat:${bullCatalogId}` : `name:${(bullName || "").toLowerCase().trim()}`;

const formatBullDisplay = (
  catName: string | null | undefined,
  naab: string | null | undefined,
  customName: string | null | undefined,
  bullCode: string | null | undefined
) => {
  const display = catName || customName || bullCode || "Unknown bull";
  const subtitle = catName ? naab : naab || bullCode;
  return { display, subtitle: subtitle || null };
};

export const OrderShipmentReconciliation = ({ orderId }: Props) => {
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { role } = useOrgRole();
  const { toast } = useToast();
  const canOverride = role === "owner" || role === "admin";

  // Action dialog state
  const [editingLine, setEditingLine] = useState<ReceiveLine | null>(null);
  const [editUnits, setEditUnits] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [movingLine, setMovingLine] = useState<ReceiveLine | null>(null);
  const [moveDestTankId, setMoveDestTankId] = useState("");
  const [moveDestCanister, setMoveDestCanister] = useState("");
  const [moveDestSubCanister, setMoveDestSubCanister] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [availableTanks, setAvailableTanks] = useState<TankOption[]>([]);

  const [deletingLine, setDeletingLine] = useState<ReceiveLine | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [overrideAcknowledged, setOverrideAcknowledged] = useState<Set<string>>(new Set());

  const isLineLocked = (line: ReceiveLine) =>
    line.shipments?.status === "confirmed" && !overrideAcknowledged.has(line.id);

  const fetchData = async () => {
    const [itemsRes, txnRes] = await Promise.all([
      (supabase
        .from("semen_order_items")
        .select("id, units, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name, naab_code, company)")
        .eq("semen_order_id", orderId) as any),
      (supabase
        .from("inventory_transactions")
        .select(`
          id, units_change, created_at, shipment_id, tank_id,
          bull_catalog_id, bull_code, custom_bull_name, inventory_item_id,
          tanks(tank_number, tank_name),
          tank_inventory!inventory_transactions_inventory_item_id_fkey(canister, sub_canister),
          bulls_catalog(bull_name, naab_code),
          shipments(received_date, status)
        `)
        .eq("order_id", orderId)
        .eq("transaction_type", "received")
        .order("created_at", { ascending: true }) as any),
    ]);
    setOrderItems((itemsRes.data || []) as any);
    setReceiveLines((txnRes.data || []) as any);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    };
    load();
  }, [orderId]);

  const reload = async () => {
    await fetchData();
  };

  const loadAvailableTanks = async () => {
    const { data } = await (supabase
      .from("tanks")
      .select("id, tank_number, tank_name")
      .eq("location_status" as any, "here")
      .eq("nitrogen_status" as any, "wet")
      .order("tank_number") as any);
    setAvailableTanks((data || []) as TankOption[]);
  };

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openEdit = (line: ReceiveLine) => {
    setEditingLine(line);
    setEditUnits(String(line.units_change));
    setEditReason("");
  };

  const openMove = (line: ReceiveLine) => {
    setMovingLine(line);
    setMoveDestTankId("");
    setMoveDestCanister("");
    setMoveDestSubCanister("");
    setMoveReason("");
    loadAvailableTanks();
  };

  const openDelete = (line: ReceiveLine) => {
    setDeletingLine(line);
    setDeleteReason("");
  };

  const submitEdit = async () => {
    if (!editingLine) return;
    const newUnits = parseInt(editUnits, 10);
    if (isNaN(newUnits) || newUnits < 0) {
      toast({ title: "Invalid units", description: "Units must be 0 or greater.", variant: "destructive" });
      return;
    }
    setEditSubmitting(true);
    const { error } = await supabase.rpc("edit_received_line" as any, {
      _input: { transaction_id: editingLine.id, new_units: newUnits, reason: editReason || null },
    } as any);
    setEditSubmitting(false);
    if (error) {
      toast({ title: "Edit failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Receive line updated", description: `Units changed to ${newUnits}.` });
    setEditingLine(null);
    await reload();
  };

  const submitMove = async () => {
    if (!movingLine) return;
    if (!moveDestTankId || !moveDestCanister.trim()) {
      toast({ title: "Missing fields", description: "Destination tank and canister are required.", variant: "destructive" });
      return;
    }
    setMoveSubmitting(true);
    const { error } = await supabase.rpc("move_received_units" as any, {
      _input: {
        transaction_id: movingLine.id,
        dest_tank_id: moveDestTankId,
        dest_canister: moveDestCanister.trim(),
        dest_sub_canister: moveDestSubCanister.trim() || null,
        reason: moveReason || null,
      },
    } as any);
    setMoveSubmitting(false);
    if (error) {
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Receive line moved", description: "Inventory location updated." });
    setMovingLine(null);
    await reload();
  };

  const submitDelete = async () => {
    if (!deletingLine) return;
    setDeleteSubmitting(true);
    const { error } = await supabase.rpc("delete_received_line" as any, {
      _input: { transaction_id: deletingLine.id, reason: deleteReason || null },
    } as any);
    setDeleteSubmitting(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Receive line deleted", description: `${deletingLine.units_change} units removed.` });
    setDeletingLine(null);
    await reload();
  };

  const acknowledgeOverride = (lineId: string) => {
    setOverrideAcknowledged((prev) => new Set(prev).add(lineId));
  };

  // Group ordered items by bull key
  const grouped: GroupedRow[] = orderItems.map((item) => {
    const key = bullKey(item.bull_catalog_id, item.custom_bull_name);
    const matchingReceives = receiveLines.filter(
      (r) => bullKey(r.bull_catalog_id, r.custom_bull_name || r.bull_code) === key
    );
    const { display, subtitle } = formatBullDisplay(
      item.bulls_catalog?.bull_name,
      item.bulls_catalog?.naab_code,
      item.custom_bull_name,
      null
    );
    return {
      key,
      bullDisplay: display,
      bullSubtitle: subtitle,
      ordered: item.units,
      received: matchingReceives.reduce((sum, r) => sum + r.units_change, 0),
      receiveLines: matchingReceives,
    };
  });

  // Find unmatched receive lines
  const orderedKeys = new Set(grouped.map((g) => g.key));
  const unmatchedReceives = receiveLines.filter(
    (r) => !orderedKeys.has(bullKey(r.bull_catalog_id, r.custom_bull_name || r.bull_code))
  );

  const unmatchedGroupsMap = new Map<string, ReceiveLine[]>();
  unmatchedReceives.forEach((r) => {
    const key = bullKey(r.bull_catalog_id, r.custom_bull_name || r.bull_code);
    if (!unmatchedGroupsMap.has(key)) unmatchedGroupsMap.set(key, []);
    unmatchedGroupsMap.get(key)!.push(r);
  });
  const unmatchedGroups: GroupedRow[] = Array.from(unmatchedGroupsMap.entries()).map(
    ([key, lines]) => {
      const first = lines[0];
      const { display, subtitle } = formatBullDisplay(
        first.bulls_catalog?.bull_name,
        first.bulls_catalog?.naab_code,
        first.custom_bull_name,
        first.bull_code
      );
      return {
        key,
        bullDisplay: display,
        bullSubtitle: subtitle,
        ordered: 0,
        received: lines.reduce((sum, r) => sum + r.units_change, 0),
        receiveLines: lines,
      };
    }
  );

  const totalOrdered = grouped.reduce((sum, g) => sum + g.ordered, 0);
  const totalReceived =
    grouped.reduce((sum, g) => sum + g.received, 0) +
    unmatchedGroups.reduce((sum, g) => sum + g.received, 0);
  const totalOutstanding = totalOrdered - grouped.reduce((sum, g) => sum + g.received, 0);

  const renderWhereItWent = (group: GroupedRow) => {
    if (group.receiveLines.length === 0) {
      return <span className="text-muted-foreground text-xs">Nothing received yet</span>;
    }
    return (
      <div className="space-y-1.5">
        {group.receiveLines.map((line) => {
          const tankDisplay = line.tanks
            ? line.tanks.tank_name
              ? `${line.tanks.tank_name} (#${line.tanks.tank_number})`
              : `Tank #${line.tanks.tank_number}`
            : null;
          const canisterDisplay = line.tank_inventory?.canister
            ? `can ${line.tank_inventory.canister}${line.tank_inventory.sub_canister ? `-${line.tank_inventory.sub_canister}` : ""}`
            : null;
          const dateDisplay = line.shipments?.received_date
            ? format(new Date(line.shipments.received_date), "MMM d, yyyy")
            : format(new Date(line.created_at), "MMM d, yyyy");
          const locked = isLineLocked(line);
          const showActions = !locked || canOverride;

          return (
            <div key={line.id} className="flex items-center justify-between gap-2 text-xs group">
              <div>
                {tankDisplay ? (
                  <span>
                    <span className="font-medium">{tankDisplay}</span>
                    {canisterDisplay && <span className="text-muted-foreground"> {canisterDisplay}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">(deleted tank)</span>
                )}
                <span className="text-muted-foreground"> — {line.units_change} units ({dateDisplay})</span>
                {locked && (
                  <Badge variant="outline" className="ml-2 text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                    Confirmed — locked
                  </Badge>
                )}
              </div>
              {showActions && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      if (locked && canOverride) acknowledgeOverride(line.id);
                      openEdit(line);
                    }}
                    title="Edit units"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      if (locked && canOverride) acknowledgeOverride(line.id);
                      openMove(line);
                    }}
                    title="Move to different tank"
                  >
                    <Move className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (locked && canOverride) acknowledgeOverride(line.id);
                      openDelete(line);
                    }}
                    title="Delete this receive line"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRow = (group: GroupedRow, isUnmatched: boolean) => {
    const expanded = expandedRows.has(group.key);
    const outstanding = group.ordered - group.received;
    const outstandingColor =
      group.ordered === 0
        ? "text-muted-foreground"
        : outstanding === 0
          ? "text-green-600"
          : outstanding > 0
            ? "text-amber-600"
            : "text-red-600";

    return (
      <TableRow key={group.key} className={isUnmatched ? "bg-amber-500/5" : ""}>
        <TableCell>
          <button
            type="button"
            onClick={() => toggleRow(group.key)}
            className="flex items-start gap-1 text-left hover:text-primary"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>
              <span className="font-medium">{group.bullDisplay}</span>
              {group.bullSubtitle && (
                <span className="text-muted-foreground text-xs ml-1">
                  ({group.bullSubtitle})
                </span>
              )}
              {isUnmatched && (
                <Badge variant="outline" className="ml-2 text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                  Not on order
                </Badge>
              )}
            </span>
          </button>
        </TableCell>
        <TableCell className="text-center">{group.ordered || "—"}</TableCell>
        <TableCell className="text-center">{group.received}</TableCell>
        <TableCell className={`text-center font-medium ${outstandingColor}`}>
          {group.ordered === 0 ? "—" : outstanding === 0 ? "✓ 0" : outstanding}
        </TableCell>
        <TableCell>
          {expanded ? (
            renderWhereItWent(group)
          ) : (
            <span className="text-muted-foreground text-xs">
              {group.receiveLines.length === 0
                ? "Nothing received yet"
                : `${group.receiveLines.length} receipt${group.receiveLines.length === 1 ? "" : "s"} — click to expand`}
            </span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Reconciliation — Ordered vs Received</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Bull</TableHead>
                <TableHead className="text-center">Ordered</TableHead>
                <TableHead className="text-center">Received</TableHead>
                <TableHead className="text-center">Outstanding</TableHead>
                <TableHead>Where it went</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.length === 0 && unmatchedGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No order items or receive lines.
                  </TableCell>
                </TableRow>
              )}
              {grouped.map((g) => renderRow(g, false))}
              {unmatchedGroups.length > 0 && (
                <>
                  <TableRow className="bg-amber-500/10">
                    <TableCell colSpan={5} className="text-xs text-amber-400 font-medium py-2">
                      Unmatched received bulls — received against this order but not on the order line. Likely catalog mismatch.
                    </TableCell>
                  </TableRow>
                  {unmatchedGroups.map((g) => renderRow(g, true))}
                </>
              )}
              <TableRow className="bg-muted/20 font-bold">
                <TableCell>Totals</TableCell>
                <TableCell className="text-center">{totalOrdered}</TableCell>
                <TableCell className="text-center">{totalReceived}</TableCell>
                <TableCell className={`text-center ${totalOutstanding === 0 ? "text-green-600" : totalOutstanding > 0 ? "text-amber-600" : "text-red-600"}`}>
                  {totalOutstanding === 0 ? "✓ 0" : totalOutstanding}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* EDIT DIALOG */}
      <Dialog open={!!editingLine} onOpenChange={(open) => !open && setEditingLine(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit received units</DialogTitle>
            <DialogDescription>
              Change the units recorded for this receive line. The tank inventory will be adjusted to match.
              {editingLine?.shipments?.status === "confirmed" && (
                <span className="block mt-2 text-amber-400 text-xs">
                  ⚠ This receiving report is confirmed. Edits will be logged to the audit trail.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Units</Label>
              <Input
                type="number"
                min={0}
                value={editUnits}
                onChange={(e) => setEditUnits(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Was {editingLine?.units_change}.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLine(null)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={editSubmitting}>
              {editSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MOVE DIALOG */}
      <Dialog open={!!movingLine} onOpenChange={(open) => !open && setMovingLine(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move receive line</DialogTitle>
            <DialogDescription>
              Move this received bull to a different tank or canister. Use this to fix data entry errors.
              {movingLine?.shipments?.status === "confirmed" && (
                <span className="block mt-2 text-amber-400 text-xs">
                  ⚠ This receiving report is confirmed. Moves will be logged to the audit trail.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Destination tank</Label>
              <Select value={moveDestTankId} onValueChange={setMoveDestTankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tank…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTanks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only tanks here + wet are shown.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Canister</Label>
                <Input
                  value={moveDestCanister}
                  onChange={(e) => setMoveDestCanister(e.target.value)}
                  placeholder="e.g. 4"
                />
              </div>
              <div className="space-y-2">
                <Label>Sub-canister (optional)</Label>
                <Input
                  value={moveDestSubCanister}
                  onChange={(e) => setMoveDestSubCanister(e.target.value)}
                  placeholder="e.g. A"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovingLine(null)} disabled={moveSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitMove} disabled={moveSubmitting}>
              {moveSubmitting ? "Moving…" : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deletingLine} onOpenChange={(open) => !open && setDeletingLine(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this receive line?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deletingLine?.units_change} units from the tank inventory and delete the receive record.
              {deletingLine?.shipments?.status === "confirmed" && (
                <span className="block mt-2 text-amber-400 text-xs">
                  ⚠ This receiving report is confirmed. The deletion will be logged to the audit trail.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitDelete}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default OrderShipmentReconciliation;
