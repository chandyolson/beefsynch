import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQueryClient } from "@tanstack/react-query";
import BullCombobox from "@/components/BullCombobox";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface BullRow {
  name: string;
  catalogId: string | null;
  units: number;
}

export interface EditOrderData {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  order_date: string;
  fulfillment_status: string;
  billing_status: string;
  project_id: string | null;
  notes: string | null;
  bulls: BullRow[];
}

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: EditOrderData | null;
}

const NewOrderDialog = ({ open, onOpenChange, editData }: NewOrderDialogProps) => {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();
  const isEditing = !!editData;
  const [saving, setSaving] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [fulfillmentStatus, setFulfillmentStatus] = useState("pending");
  const [billingStatus, setBillingStatus] = useState("unbilled");
  const [projectId, setProjectId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [bulls, setBulls] = useState<BullRow[]>([{ name: "", catalogId: null, units: 1 }]);
  const [dateOpen, setDateOpen] = useState(false);

  // Org projects for linking
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .then(({ data }) => setProjects(data ?? []));
  }, [open, orgId]);

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return;
    if (editData) {
      setCustomerName(editData.customer_name);
      setCustomerPhone(editData.customer_phone ?? "");
      setCustomerEmail(editData.customer_email ?? "");
      setOrderDate(new Date(editData.order_date + "T12:00:00"));
      setFulfillmentStatus(editData.fulfillment_status);
      setBillingStatus(editData.billing_status);
      setProjectId(editData.project_id ?? "none");
      setNotes(editData.notes ?? "");
      setBulls(editData.bulls.length > 0 ? editData.bulls : [{ name: "", catalogId: null, units: 1 }]);
    } else {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setOrderDate(new Date());
      setFulfillmentStatus("pending");
      setBillingStatus("unbilled");
      setProjectId("none");
      setNotes("");
      setBulls([{ name: "", catalogId: null, units: 1 }]);
    }
  }, [open, editData]);

  const addBullRow = () => setBulls((prev) => [...prev, { name: "", catalogId: null, units: 1 }]);
  const removeBullRow = (i: number) => setBulls((prev) => prev.filter((_, idx) => idx !== i));
  const updateBull = (i: number, name: string, catalogId: string | null) =>
    setBulls((prev) => prev.map((b, idx) => (idx === i ? { ...b, name, catalogId } : b)));
  const updateUnits = (i: number, units: number) =>
    setBulls((prev) => prev.map((b, idx) => (idx === i ? { ...b, units } : b)));

  const handleSave = async () => {
    if (!customerName.trim()) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    if (!orgId) {
      toast({ title: "No organization found", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const orderPayload = {
        organization_id: orgId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        customer_email: customerEmail.trim() || null,
        order_date: format(orderDate, "yyyy-MM-dd"),
        fulfillment_status: fulfillmentStatus,
        billing_status: billingStatus,
        project_id: projectId === "none" ? null : projectId,
        notes: notes.trim() || null,
      };

      let orderId: string;

      if (isEditing && editData) {
        const { error } = await supabase
          .from("semen_orders")
          .update(orderPayload)
          .eq("id", editData.id);
        if (error) throw error;
        orderId = editData.id;

        // Delete existing items, re-insert
        const { error: delErr } = await supabase
          .from("semen_order_items")
          .delete()
          .eq("semen_order_id", orderId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from("semen_orders")
          .insert(orderPayload)
          .select("id")
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      // Insert bull items
      const validBulls = bulls.filter((b) => b.name.trim());
      if (validBulls.length > 0) {
        const rows = validBulls.map((b) => ({
          semen_order_id: orderId,
          bull_catalog_id: b.catalogId,
          custom_bull_name: b.catalogId ? null : b.name.trim(),
          units: b.units,
        }));
        const { error: itemErr } = await supabase.from("semen_order_items").insert(rows);
        if (itemErr) throw itemErr;
      }

      toast({ title: isEditing ? "Order updated" : "Order created" });
      queryClient.invalidateQueries({ queryKey: ["semen_orders"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEditing ? "Edit Semen Order" : "New Semen Order"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer Name */}
          <div>
            <Label>Customer Name *</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Smith Ranch" className="mt-1.5" />
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Customer Phone</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" className="mt-1.5" />
            </div>
            <div>
              <Label>Customer Email</Label>
              <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Optional" className="mt-1.5" />
            </div>
          </div>

          {/* Order Date */}
          <div>
            <Label>Order Date</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full mt-1.5 justify-start text-left font-normal")}>
                  {format(orderDate, "PPP")}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={orderDate}
                  onSelect={(d) => { if (d) setOrderDate(d); setDateOpen(false); }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Status dropdowns */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fulfillment Status</Label>
              <Select value={fulfillmentStatus} onValueChange={setFulfillmentStatus}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="backordered">Backordered</SelectItem>
                  <SelectItem value="partially filled">Partially Filled</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Billing Status</Label>
              <Select value={billingStatus} onValueChange={setBillingStatus}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unbilled">Unbilled</SelectItem>
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Link to Project */}
          <div>
            <Label>Link to Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-display">Bulls & Units</h3>
              <Button type="button" variant="outline" size="sm" onClick={addBullRow} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Bull
              </Button>
            </div>
            {bulls.map((bull, i) => (
              <div key={i} className="flex items-center gap-2">
                <BullCombobox
                  value={bull.name}
                  catalogId={bull.catalogId}
                  onChange={(name, catId) => updateBull(i, name, catId)}
                />
                <Input
                  type="number"
                  min={0}
                  value={bull.units}
                  onChange={(e) => updateUnits(i, parseInt(e.target.value) || 0)}
                  className="w-20"
                  placeholder="Units"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeBullRow(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={3} className="mt-1.5" />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update Order" : "Save Order"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewOrderDialog;
