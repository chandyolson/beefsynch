import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

const BullsRowManager = ({
  bulls,
  onAdd,
  onRemove,
  onUpdateBull,
  onUpdateUnits,
  showUnits = true,
  emptyMessage = "No bulls added yet. Click \"Add Bull\" to assign semen.",
}: BullsRowManagerProps) => {
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

      {bulls.map((bull, i) => (
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
      ))}
    </div>
  );
};

export default BullsRowManager;
