import { useEffect, useState } from "react";
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

interface BillableRow {
  bull_catalog_id: string | null;
  naab_code: string | null;
  bull_name: string;
  units: number;
}

export const InvoiceOrderModal = ({ orderId, customerName, trigger, onSuccess }: InvoiceOrderModalProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Billable preview — load from get_billable_units_for_order(order_id) on open so the user sees
  // exactly what will be billed (per bull) before recording the invoice number.
  const [billableRows, setBillableRows] = useState<BillableRow[]>([]);
  const [billableLoading, setBillableLoading] = useState(false);
  const [billableError, setBillableError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBillableLoading(true);
    setBillableError(null);
    (async () => {
      const { data, error } = await supabase.rpc("get_billable_units_for_order", { _order_id: orderId });
      if (cancelled) return;
      if (error) {
        setBillableError(error.message || "Could not load billable units");
        setBillableRows([]);
      } else {
        setBillableRows((data ?? []) as BillableRow[]);
      }
      setBillableLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, orderId]);

  const billableTotal = billableRows.reduce((s, r) => s + (r.units || 0), 0);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      toast({ title: "Invoice number required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("mark_order_invoiced", {
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

        {/* Billable preview — what was actually moved to a customer tank with is_billable=true */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Billable units</span>
            {!billableLoading && !billableError && (
              <span className="text-sm font-semibold tabular-nums">{billableTotal}</span>
            )}
          </div>
          {billableLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : billableError ? (
            <p className="text-xs text-destructive">Could not load billable units: {billableError}</p>
          ) : billableRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No billable units yet for this order — nothing has been moved with is_billable=true.
              Marking invoiced now will record the invoice number, but the billed total will be 0.
            </p>
          ) : (
            <ul className="space-y-1">
              {billableRows.map((r) => (
                <li key={(r.bull_catalog_id ?? r.bull_name) + ":" + r.units} className="flex items-baseline justify-between text-sm">
                  <span className="truncate">
                    {r.bull_name}
                    {r.naab_code && <span className="text-muted-foreground"> · {r.naab_code}</span>}
                  </span>
                  <span className="tabular-nums font-medium">{r.units}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

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
