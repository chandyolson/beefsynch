import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TankMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  highlightBullCatalogId?: string | null;
  highlightBullName?: string | null;
}

type BullEntry = { name: string; units: number; catalogId: string | null };
type CanisterEntry = { bulls: BullEntry[] };
type TankEntry = {
  name: string;
  number: string;
  nitrogen: string;
  canisters: Map<string, CanisterEntry>;
};

export default function TankMapDialog({
  open,
  onOpenChange,
  orgId,
  highlightBullCatalogId,
  highlightBullName,
}: TankMapDialogProps) {
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["tank_map_dialog", orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select(
          "bull_catalog_id, units, canister, tank_id, customer_id, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name), tanks!tank_inventory_tank_id_fkey(tank_name, tank_number, nitrogen_status)"
        )
        .eq("organization_id", orgId)
        .is("customer_id", null)
        .gt("units", 0)
        .order("units", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const tankGroups = useMemo(() => {
    const map = new Map<string, TankEntry>();
    for (const row of inventory as any[]) {
      const tid = row.tank_id;
      if (!map.has(tid)) {
        map.set(tid, {
          name: row.tanks?.tank_name || "?",
          number: row.tanks?.tank_number || "",
          nitrogen: row.tanks?.nitrogen_status || "unknown",
          canisters: new Map(),
        });
      }
      const tank = map.get(tid)!;
      const can = row.canister || "?";
      if (!tank.canisters.has(can)) tank.canisters.set(can, { bulls: [] });
      tank.canisters.get(can)!.bulls.push({
        name: row.bulls_catalog?.bull_name || "Unknown",
        units: row.units || 0,
        catalogId: row.bull_catalog_id,
      });
    }
    return map;
  }, [inventory]);

  const sortedTanks = useMemo(() => {
    const entries = Array.from(tankGroups.entries());
    if (!highlightBullCatalogId) return entries;
    const has: typeof entries = [];
    const rest: typeof entries = [];
    for (const e of entries) {
      let found = false;
      for (const [, c] of e[1].canisters) {
        if (c.bulls.some((b) => b.catalogId === highlightBullCatalogId)) {
          found = true;
          break;
        }
      }
      (found ? has : rest).push(e);
    }
    return [...has, ...rest];
  }, [tankGroups, highlightBullCatalogId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>Tank Map — Company Stock</span>
            {highlightBullName && (
              <span className="text-sm font-normal text-muted-foreground">
                (showing {highlightBullName})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading inventory…
          </p>
        ) : sortedTanks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No company inventory found.
          </p>
        ) : (
          <div className="space-y-3 overflow-y-auto pr-1">
            {sortedTanks.map(([tankId, tank]) => (
              <div
                key={tankId}
                className="rounded-lg border border-border/60 bg-card p-3"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-semibold text-foreground">
                    {tank.name}
                  </span>
                  {tank.number && (
                    <span className="text-xs text-muted-foreground">
                      #{tank.number}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {tank.nitrogen}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {Array.from(tank.canisters.entries())
                    .sort(
                      ([a], [b]) => (parseInt(a) || 0) - (parseInt(b) || 0)
                    )
                    .map(([can, data]) => (
                      <div key={can} className="text-sm leading-snug">
                        <span className="font-medium text-muted-foreground mr-1">
                          Can {can}:
                        </span>
                        {data.bulls.map((bull, bi) => {
                          const isHighlighted =
                            highlightBullCatalogId &&
                            bull.catalogId === highlightBullCatalogId;
                          return (
                            <span
                              key={bi}
                              className={cn(
                                isHighlighted &&
                                  "font-semibold text-primary bg-primary/10 px-1 rounded"
                              )}
                            >
                              {bi > 0 && ", "}
                              {bull.name} ({bull.units})
                            </span>
                          );
                        })}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
