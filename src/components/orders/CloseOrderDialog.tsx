import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Outcome = "fulfilled" | "cancelled";

interface CloseOrderDialogProps {
  orderId: string;
  /** "customer" orders are packed; "inventory" orders are received. */
  orderType: string;
  /** Total units ordered across all lines. */
  orderedUnits: number;
  /** Units packed (customer orders) or received (inventory orders). */
  completedUnits: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Builds the plain-English, INFORMATIONAL-ONLY status line shown in an amber
// banner. This never blocks the operator — it just tells them what they're
// closing.
function buildStatusLine(orderType: string, ordered: number, completed: number): string {
  const isInventory = orderType === "inventory";
  const remaining = Math.max(0, ordered - completed);

  if (isInventory) {
    if (completed <= 0) {
      return "Heads up: this inventory order has not been received yet.";
    }
    if (remaining === 0) {
      return `Heads up: this inventory order has been fully received (${completed} of ${ordered} units).`;
    }
    return `Heads up: this inventory order is received ${completed} of ${ordered} units. Closing it now will leave ${remaining} unreceived.`;
  }

  if (completed <= 0) {
    return "Heads up: nothing has been packed on this order yet.";
  }
  if (remaining === 0) {
    return `Heads up: this order is fully packed (${completed} of ${ordered} units).`;
  }
  return `Heads up: this order is packed ${completed} of ${ordered} units. Closing it now will leave ${remaining} unpacked.`;
}

export const CloseOrderDialog = ({
  orderId,
  orderType,
  orderedUnits,
  completedUnits,
  open,
  onOpenChange,
  onSuccess,
}: CloseOrderDialogProps) => {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog is reopened so a stale choice/reason
  // can never carry over to the next order being closed.
  useEffect(() => {
    if (open) {
      setOutcome("");
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  const statusLine = buildStatusLine(orderType, orderedUnits, completedUnits);
  const canConfirm = !!outcome && reason.trim().length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!outcome || !reason.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("close_order_manual", {
      _input: { order_id: orderId, outcome, reason: reason.trim() },
    });
    setSubmitting(false);
    if (error) {
      // Surface the thrown DB message verbatim (e.g. already-invoiced).
      toast({ title: "Could not close order", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: outcome === "fulfilled" ? "Order closed (fulfilled)" : "Order cancelled",
    });
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this order</DialogTitle>
          <DialogDescription>
            Closing records why the order is done and stops it from showing in the open queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1. Informational status line — NEVER blocks the Confirm button. */}
          <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              {statusLine}
            </AlertDescription>
          </Alert>

          {/* 2. Outcome choice — required, no default selection. */}
          <div className="space-y-2">
            <Label>What happened to this order?</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as Outcome)}
              className="gap-2"
            >
              <label
                htmlFor="close-outcome-fulfilled"
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  outcome === "fulfilled" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <RadioGroupItem value="fulfilled" id="close-outcome-fulfilled" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Close as fulfilled</span>
                  <span className="block text-xs text-muted-foreground">
                    Order is done. It will bill on what was actually packed.
                  </span>
                </span>
              </label>
              <label
                htmlFor="close-outcome-cancelled"
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  outcome === "cancelled" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <RadioGroupItem value="cancelled" id="close-outcome-cancelled" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Cancel order</span>
                  <span className="block text-xs text-muted-foreground">
                    Order is dead. It will not bill.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* 3. Reason — required free text, the audit trail. */}
          <div className="space-y-2">
            <Label htmlFor="close-reason">Reason for closing (required)</Label>
            <Textarea
              id="close-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer agreed to close out at this quantity; remainder won't ship."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
