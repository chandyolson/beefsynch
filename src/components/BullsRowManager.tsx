import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import BullCombobox from "@/components/BullCombobox";

export interface BullRow {
  bull_name: string;
  bull_catalog_id: string | null;
  units?: number;
}

export interface BullsRowManagerProps {
  bulls: BullRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdateBull: (index: number, name: string, catalogId: string | null) => void;
  onUpdateUnits?: (index: number, units: number) => void;
  showUnits?: boolean;
  emptyMessage?: string;
  /** When true, shows an inventory badge next to each bull row. Requires orgId. */
  showInventory?: boolean;
  /** Required when showInventory is true — used to scope the inventory lookup. */
  orgId?: string | null;
}

const BullsRowManager = ({
  bulls,
  onAdd,
  onRemove,
  onUpdateBull,
  onUpdateUnits,
  showUnits = true,
  emptyMessage = "No bulls added yet. Click \"Add Bull\" to assign semen.",
  showInventory = false,
  orgId,
}: BullsRowManagerProps) => {
  // Fetch aggregate inventory for the org, keyed by bull_catalog_id AND by lowercase name.
  // Paginated because tank_inventory can exceed the 1000-row PostgREST cap.
  const { data: inventoryIndex } = useQuery({
    queryKey: ["inventory_index_by_bull", orgId],
    enabled: showInventory && !!orgId,
    queryFn: async () => {
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("tank_inventory")
          .select("bull_catalog_id, bull_code, custom_bull_name, units, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name)")
          .eq("organization_id", orgId!)
          .is("customer_id", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      // Build two lookup maps: one keyed by catalog_id, one by lowercased display name.
      const byCatalogId = new Map<string, number>();
      const byName = new Map<string, number>();
      for (const r of all) {
        const units = r.units || 0;
        if (r.bull_catalog_id) {
          byCatalogId.set(r.bull_catalog_id, (byCatalogId.get(r.bull_catalog_id) || 0) + units);
        }
        const name =
          r.bulls_catalog?.bull_name || r.custom_bull_name || r.bull_code || "";
        if (name) {
          const k = name.toLowerCase().trim();
          byName.set(k, (byName.get(k) || 0) + units);
        }
      }
      return { byCatalogId, byName };
    },
  });

  const getOnHand = (bull: BullRow): number | null => {
    if (!showInventory || !inventoryIndex) return null;
    if (bull.bull_catalog_id) {
      return inventoryIndex.byCatalogId.get(bull.bull_catalog_id) ?? 0;
    }
    if (bull.bull_name) {
      return inventoryIndex.byName.get(bull.bull_name.toLowerCase().trim()) ?? 0;
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground font-display">
          Bulls & Semen
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add Bull
        </Button>
      </div>

      {bulls.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {bulls.map((bull, i) => {
        const onHand = getOnHand(bull);
        const hasSelection = !!(bull.bull_name || bull.bull_catalog_id);
        return (
          <div key={i} className="flex items-center gap-2">
            <BullCombobox
              value={bull.bull_name}
              catalogId={bull.bull_catalog_id}
              onChange={(name, catId) => onUpdateBull(i, name, catId)}
            />
            {showUnits && (
              <Input
                type="number"
                min={0}
                value={bull.units || ""}
                onChange={(e) =>
                  onUpdateUnits?.(i, parseInt(e.target.value) || 0)
                }
                className="w-20"
                placeholder="—"
              />
            )}
            {showInventory && hasSelection && onHand !== null && (
              <Badge
                variant="outline"
                className={
                  onHand > 0
                    ? "bg-green-50 text-green-800 border-green-200 whitespace-nowrap"
                    : "bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap"
                }
                title={
                  onHand > 0
                    ? `You currently have ${onHand} units of this bull across all tanks.`
                    : "No units on hand — this bull will need to be ordered."
                }
              >
                {onHand > 0 ? `${onHand} on hand` : "Need to order"}
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(i)}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default BullsRowManager;
