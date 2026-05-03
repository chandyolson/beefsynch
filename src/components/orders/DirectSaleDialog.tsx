import { useEffect, useMemo, useState } from "react";
import { Loader2, HandCoins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DirectSaleLine {
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  ordered: number;
  fulfilled: number;
}

interface DirectSaleDialogProps {
  orderId: string;
  customerName: string;
  organizationId: string;
  lines: DirectSaleLine[];
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

interface TankOption {
  id: string;
  tank_number: string | number;
  tank_name: string | null;
}

interface LineState {
  units: string;
  tankId: string;
  canister: string;
}

export const DirectSaleDialog = ({
  orderId,
  customerName,
  organizationId,
  lines,
  trigger,
  onSuccess,
}: DirectSaleDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [tanks, setTanks] = useState<TankOption[]>([]);
  const [tanksLoading, setTanksLoading] = useState(false);

  const remainingLines = useMemo(
    () => lines.filter((l) => l.ordered - l.fulfilled > 0),
    [lines],
  );

  const [state, setState] = useState<Record<string, LineState>>({});

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    const init: Record<string, LineState> = {};
    remainingLines.forEach((l, idx) => {
      init[String(idx)] = { units: "", tankId: "", canister: "" };
    });
    setState(init);
    setNote("");
  }, [open, remainingLines]);

  // Load tanks at CATL when dialog opens
  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    (async () => {
      setTanksLoading(true);
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name")
        .eq("organization_id", organizationId)
        .eq("location_status", "here")
        .order("tank_number");
      if (cancelled) return;
      if (error) {
        toast({
          title: "Failed to load tanks",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setTanks((data ?? []) as TankOption[]);
      }
      setTanksLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, toast]);

  const updateLine = (key: string, patch: Partial<LineState>) => {
    setState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSubmit = async () => {
    // Build payload
    const payloads: Array<{
      bull_catalog_id: string | null;
      units: number;
      tankId: string;
      canister: string;
    }> = [];

    for (let idx = 0; idx < remainingLines.length; idx++) {
      const line = remainingLines[idx];
      const s = state[String(idx)];
      if (!s) continue;
      const units = parseInt(s.units, 10);
      if (!units || units <= 0) continue;
      const remaining = line.ordered - line.fulfilled;
      if (units > remaining) {
        toast({
          title: "Too many units",
          description: `${line.bull_name}: max ${remaining} units remaining`,
          variant: "destructive",
        });
        return;
      }
      if (!s.tankId) {
        toast({
          title: "Source tank required",
          description: `Select a source tank for ${line.bull_name}`,
          variant: "destructive",
        });
        return;
      }
      if (!s.canister.trim()) {
        toast({
          title: "Source canister required",
          description: `Enter a canister for ${line.bull_name}`,
          variant: "destructive",
        });
        return;
      }
      payloads.push({
        bull_catalog_id: line.bull_catalog_id,
        units,
        tankId: s.tankId,
        canister: s.canister.trim(),
      });
    }

    if (payloads.length === 0) {
      toast({
        title: "Nothing to record",
        description: "Enter units for at least one line.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      for (const p of payloads) {
        const { error } = await supabase.rpc("record_direct_sale", {
          _input: {
            order_id: orderId,
            source_tank_id: p.tankId,
            source_canister: p.canister,
            bull_catalog_id: p.bull_catalog_id,
            units: p.units,
            notes: note.trim() || null,
          },
        });
        if (error) throw error;
      }
      toast({ title: "Sale recorded" });
      setOpen(false);
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: "Failed to record sale",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5" />
            Record Direct Sale — {customerName}
          </DialogTitle>
          <DialogDescription>
            Fulfill this order without packing into a tracked tank. Semen is
            decremented from the source tank inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {remainingLines.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No lines with remaining units.
            </p>
          )}

          {remainingLines.map((line, idx) => {
            const key = String(idx);
            const s = state[key] || { units: "", tankId: "", canister: "" };
            const remaining = line.ordered - line.fulfilled;
            return (
              <div
                key={key}
                className="border rounded-md p-3 space-y-3 bg-card"
              >
                <div className="text-sm">
                  <div className="font-medium">{line.bull_name}</div>
                  {line.bull_code && (
                    <div className="text-xs text-muted-foreground">
                      NAAB: {line.bull_code}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Ordered: {line.ordered} | Already fulfilled:{" "}
                    {line.fulfilled} | Remaining:{" "}
                    <span className="font-medium text-foreground">
                      {remaining}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Units to sell</Label>
                    <Input
                      type="number"
                      min={0}
                      max={remaining}
                      value={s.units}
                      onChange={(e) =>
                        updateLine(key, { units: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Source tank</Label>
                    <Select
                      value={s.tankId}
                      onValueChange={(v) => updateLine(key, { tankId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            tanksLoading ? "Loading..." : "Select tank"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {tanks.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.tank_number}
                            {t.tank_name ? ` — ${t.tank_name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Source canister</Label>
                    <Input
                      value={s.canister}
                      onChange={(e) =>
                        updateLine(key, { canister: e.target.value })
                      }
                      placeholder="e.g. 3"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Walk-in customer, paid in cash, etc."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || remainingLines.length === 0}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
