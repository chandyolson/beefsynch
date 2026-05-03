import { useEffect, useMemo, useState } from "react";
import { Loader2, Package } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FulfillLine {
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  ordered: number;
  fulfilled: number;
}

interface FulfillOrderDialogProps {
  orderId: string;
  customerName: string;
  organizationId: string;
  lines: FulfillLine[];
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

interface LineState {
  units: string;
  tankId: string;
  canister: string;
  billable: boolean;
}

interface TankOption {
  id: string;
  tank_number: string | number;
  tank_name: string | null;
  customer_id: string | null;
}

export const FulfillOrderDialog = ({
  orderId,
  customerName,
  organizationId,
  lines,
  trigger,
  onSuccess,
}: FulfillOrderDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tanks, setTanks] = useState<TankOption[]>([]);
  const [lineStates, setLineStates] = useState<LineState[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name, customer_id")
        .eq("organization_id", organizationId)
        .order("tank_number", { ascending: true });
      setTanks((data ?? []) as TankOption[]);
    })();
  }, [open, organizationId]);

  useEffect(() => {
    if (!open) return;
    setLineStates(
      lines
        .filter((l) => l.ordered - l.fulfilled > 0)
        .map((l) => ({
          units: String(l.ordered - l.fulfilled),
          tankId: "",
          canister: "",
          billable: true,
        }))
    );
  }, [open, lines]);

  const activeBulls = useMemo(
    () => lines.filter((l) => l.ordered - l.fulfilled > 0),
    [lines]
  );

  const updateLine = (idx: number, field: keyof LineState, value: string | boolean) => {
    setLineStates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleTankChange = (idx: number, tankId: string) => {
    const tank = tanks.find((t) => t.id === tankId);
    const isCompanyTank = tank ? !tank.customer_id : true;
    setLineStates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], tankId, billable: isCompanyTank };
      return next;
    });
  };

  const canSubmit = lineStates.some(
    (ls) => ls.tankId && parseInt(ls.units) > 0
  );

  const handleSubmit = async () => {
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < activeBulls.length; i++) {
      const bull = activeBulls[i];
      const ls = lineStates[i];
      if (!ls) continue;

      const units = parseInt(ls.units);
      if (!ls.tankId || !units || units <= 0) continue;

      const { error } = await supabase.rpc("record_direct_sale", {
        _input: {
          order_id: orderId,
          source_tank_id: ls.tankId,
          units,
          bull_catalog_id: bull.bull_catalog_id || null,
          bull_code: bull.bull_code || null,
          bull_name: bull.bull_name || null,
          source_canister: ls.canister || null,
          is_billable: ls.billable,
          notes: null,
        },
      });

      if (error) {
        console.error(`Fulfill error for ${bull.bull_name}:`, error);
        toast({
          title: `Error: ${bull.bull_name}`,
          description: error.message,
          variant: "destructive",
        });
        errorCount++;
      } else {
        successCount++;
      }
    }

    setSaving(false);

    if (successCount > 0) {
      toast({
        title: `Fulfilled ${successCount} bull${successCount !== 1 ? "s" : ""}`,
        description: errorCount > 0 ? `${errorCount} failed` : undefined,
      });
      setOpen(false);
      onSuccess?.();
    }
  };

  const tankLabel = (t: TankOption) => {
    const num = t.tank_number;
    const name = t.tank_name ? ` — ${t.tank_name}` : "";
    const owner = t.customer_id ? " (customer)" : " (company)";
    return `${num}${name}${owner}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fulfill Order — {customerName}</DialogTitle>
          <DialogDescription>
            Select a source tank, units, and whether each line is billable.
          </DialogDescription>
        </DialogHeader>

        {activeBulls.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            All bulls on this order are fully fulfilled.
          </p>
        ) : (
          <div className="space-y-4">
            {activeBulls.map((bull, idx) => {
              const remaining = bull.ordered - bull.fulfilled;
              const ls = lineStates[idx];
              if (!ls) return null;

              return (
                <div key={`${bull.bull_catalog_id || bull.bull_name}-${idx}`} className="border border-border/40 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{bull.bull_name}</div>
                      {bull.bull_code && (
                        <div className="text-xs text-muted-foreground">{bull.bull_code}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {remaining} of {bull.ordered} remaining
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-5 space-y-1">
                      <Label className="text-xs">Source Tank</Label>
                      <Select value={ls.tankId} onValueChange={(v) => handleTankChange(idx, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tank" />
                        </SelectTrigger>
                        <SelectContent>
                          {tanks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {tankLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs">Units</Label>
                      <Input
                        type="number"
                        min="1"
                        value={ls.units}
                        onChange={(e) => updateLine(idx, "units", e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <Label className="text-xs">Canister</Label>
                      <Input
                        value={ls.canister}
                        onChange={(e) => updateLine(idx, "canister", e.target.value)}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-2 pb-2">
                      <Checkbox
                        id={`billable-${idx}`}
                        checked={ls.billable}
                        onCheckedChange={(checked) => updateLine(idx, "billable", !!checked)}
                      />
                      <Label htmlFor={`billable-${idx}`} className="text-xs cursor-pointer">
                        Billable
                      </Label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Package className="h-4 w-4 mr-2" />
            Fulfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
