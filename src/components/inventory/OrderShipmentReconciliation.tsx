import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  } | null;
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [itemsRes, txnRes] = await Promise.all([
        supabase
          .from("semen_order_items")
          .select("id, units, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name, naab_code, company)")
          .eq("semen_order_id", orderId),
        supabase
          .from("inventory_transactions")
          .select(`
            id, units_change, created_at, shipment_id, tank_id,
            bull_catalog_id, bull_code, custom_bull_name, inventory_item_id,
            tanks(tank_number, tank_name),
            tank_inventory!inventory_transactions_inventory_item_id_fkey(canister, sub_canister),
            bulls_catalog(bull_name, naab_code),
            shipments(received_date)
          `)
          .eq("order_id", orderId)
          .eq("transaction_type", "received")
          .order("created_at", { ascending: true }),
      ]);

      setOrderItems((itemsRes.data || []) as any);
      setReceiveLines((txnRes.data || []) as any);
      setLoading(false);
    };
    load();
  }, [orderId]);

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
      <div className="space-y-1">
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

          return (
            <div key={line.id} className="text-xs">
              {tankDisplay ? (
                <span>
                  <span className="font-medium">{tankDisplay}</span>
                  {canisterDisplay && <span className="text-muted-foreground"> {canisterDisplay}</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">(deleted tank)</span>
              )}
              <span className="text-muted-foreground"> — {line.units_change} units ({dateDisplay})</span>
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
    </Card>
  );
};

export default OrderShipmentReconciliation;
