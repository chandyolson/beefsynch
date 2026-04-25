import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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

interface InvoiceOrderModalProps {
  orderId: string;
  customerName: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export const InvoiceOrderModal = ({ orderId, customerName, trigger, onSuccess }: InvoiceOrderModalProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      toast({ title: "Invoice number required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase.rpc as any)("mark_order_invoiced", {
      _input: {
        order_id: orderId,
        invoice_number: invoiceNumber.trim(),
        invoice_date: new Date(invoiceDate).toISOString(),
        notes: notes.trim() || null,
      },
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not mark invoiced", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marked as invoiced", description: `Invoice #${invoiceNumber}` });
    setOpen(false);
    setInvoiceNumber("");
    setNotes("");
    onSuccess?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark order as invoiced</AlertDialogTitle>
          <AlertDialogDescription>
            Record the invoice number and date for {customerName}'s order.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice-number">Invoice number *</Label>
            <Input
              id="invoice-number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g., INV-1042"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-date">Invoice date</Label>
            <Input
              id="invoice-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-notes">Notes (optional)</Label>
            <Textarea
              id="invoice-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="QBO memo, terms, etc."
              rows={2}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark Invoiced
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
