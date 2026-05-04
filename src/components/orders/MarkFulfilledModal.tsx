import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MarkFulfilledModalProps {
  orderId: string;
  customerName: string;
  unitsOrdered: number;
  unitsFilled: number;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export const MarkFulfilledModal = ({
  orderId,
  customerName,
  unitsOrdered,
  unitsFilled,
  trigger,
  onSuccess,
}: MarkFulfilledModalProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const shortBy = unitsOrdered - unitsFilled;

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("close_customer_order_as_fulfilled", {
      _input: { order_id: orderId, reason: reason.trim() },
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not mark fulfilled", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order marked fulfilled", description: customerName });
    setOpen(false);
    setReason("");
    onSuccess?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark order as fulfilled</AlertDialogTitle>
          <AlertDialogDescription>
            Close this order even though it's short. {customerName} ordered {unitsOrdered}, received {unitsFilled}
            {shortBy > 0 ? `, ${shortBy} short.` : "."} A reason is required for the record.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fulfill-reason">Reason *</Label>
            <Textarea
              id="fulfill-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Supplier short-shipped, customer agreed to closeout at this quantity"
              rows={3}
              autoFocus
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark Fulfilled
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
