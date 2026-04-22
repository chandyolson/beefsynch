import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQueryClient } from "@tanstack/react-query";
import BullCombobox from "@/components/BullCombobox";
import BullsRowManager from "@/components/BullsRowManager";
import CustomerPicker from "@/components/CustomerPicker";

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
  naabCode: string | null;
  units: number | "";
}

export interface EditOrderData {
  id: string;
  customer_id: string | null;
  order_date: string;
  fulfillment_status: string;
  billing_status: string;
  project_id: string | null;
  semen_company_id: string | null;
  notes: string | null;
  placed_by: string | null;
  order_type: string;
  bulls: BullRow[];
}

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: EditOrderData | null;
  initialOrderType?: "customer" | "inventory";
}

const NewOrderDialog = ({ open, onOpenChange, editData, initialOrderType }: NewOrderDialogProps) => {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();
  const isEditing = !!editData;
  const [saving, setSaving] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [fulfillmentStatus, setFulfillmentStatus] = useState("pending");
  const [billingStatus, setBillingStatus] = useState("unbilled");
  const [projectId, setProjectId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [placedBy, setPlacedBy] = useState("");
  const [orderType, setOrderType] = useState<"customer" | "inventory">("customer");
  const [bulls, setBulls] = useState<BullRow[]>([{ name: "", catalogId: null, naabCode: null, units: "" }]);
  const [dateOpen, setDateOpen] = useState(false);

  // Supplies state
  const [supplyLines, setSupplyLines] = useState<{ productId: string; productName: string; quantity: number | ""; unitPrice: number; unitLabel: string; lineTotal: number }[]>([]);
  const [supplyProducts, setSupplyProducts] = useState<{ id: string; product_name: string; product_category: string; default_price: number; unit_label: string }[]>([]);

  // Semen company state
  const [semenCompanyId, setSemenCompanyId] = useState("none");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [addingCompany, setAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

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
    supabase
      .from("semen_companies")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .then(({ data }) => setCompanies(data ?? []));
    (supabase as any)
      .from("billing_products")
      .select("id, product_name, product_category, default_price, unit_label")
      .eq("organization_id", orgId)
      .eq("active", true)
      .in("product_category", ["breeding_supply", "sheath", "glove", "gun_warmer", "ai_gun", "heat_detection", "nutritional", "patch"])
      .order("sort_order")
      .then(({ data }: { data: any }) => setSupplyProducts(data ?? []));
  }, [open, orgId]);

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return;
    if (editData) {
      setCustomerId(editData.customer_id ?? null);
      setOrderDate(new Date(editData.order_date + "T12:00:00"));
      setFulfillmentStatus(editData.fulfillment_status);
      setBillingStatus(editData.billing_status);
      setProjectId(editData.project_id ?? "none");
      setSemenCompanyId(editData.semen_company_id ?? "none");
      setNotes(editData.notes ?? "");
      setPlacedBy(editData.placed_by ?? "");
      setOrderType((editData.order_type as "customer" | "inventory") ?? "customer");
      setBulls(editData.bulls.length > 0 ? editData.bulls : [{ name: "", catalogId: null, naabCode: null, units: "" }]);
      // Fetch existing supply lines for edit
      if (editData.id) {
        (supabase as any)
          .from("order_supply_items")
          .select("*")
          .eq("semen_order_id", editData.id)
          .then(({ data }: { data: any }) => {
            setSupplyLines((data ?? []).map((d: any) => ({
              productId: d.billing_product_id || "",
              productName: d.product_name,
              quantity: d.quantity,
              unitPrice: d.unit_price || 0,
              unitLabel: d.unit_label || "",
              lineTotal: d.line_total || 0,
            })));
          });
      } else {
        setSupplyLines([]);
      }
    } else {
      setCustomerId(null);
      setOrderDate(new Date());
      setFulfillmentStatus("pending");
      setBillingStatus("unbilled");
      setProjectId("none");
      setSemenCompanyId("none");
      setNotes("");
      setPlacedBy("");
      setOrderType("customer");
      setBulls([{ name: "", catalogId: null, naabCode: null, units: "" }]);
      setSupplyLines([]);
      setAddingCompany(false);
      setNewCompanyName("");
    }
  }, [open, editData]);

  const addBullRow = () => setBulls((prev) => [...prev, { name: "", catalogId: null, naabCode: null, units: "" }]);
  const removeBullRow = (i: number) => setBulls((prev) => prev.filter((_, idx) => idx !== i));
  const updateBull = (i: number, name: string, catalogId: string | null, naabCode?: string | null) =>
    setBulls((prev) => prev.map((b, idx) => (idx === i ? { ...b, name, catalogId, naabCode: naabCode ?? null } : b)));
  const updateUnits = (i: number, val: string) =>
    setBulls((prev) => prev.map((b, idx) => (idx === i ? { ...b, units: val === "" ? "" : parseInt(val) || 0 } : b)));

  const handleSave = async () => {
    if (!orgId) {
      toast({ title: "No organization found", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const orderPayload: any = {
        organization_id: orgId,
        customer_id: customerId || null,
        order_date: format(orderDate, "yyyy-MM-dd"),
        fulfillment_status: fulfillmentStatus,
        billing_status: billingStatus,
        project_id: projectId === "none" ? null : projectId,
        semen_company_id: semenCompanyId === "none" ? null : semenCompanyId,
        notes: notes.trim() || null,
        placed_by: placedBy.trim() || null,
        order_type: orderType,
      };

      let orderId: string;

      if (isEditing && editData) {
        const { error } = await supabase
          .from("semen_orders")
          .update(orderPayload)
          .eq("id", editData.id);
        if (error) throw error;
        orderId = editData.id;

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

      const validBulls = bulls.filter((b) => b.name.trim());
      if (validBulls.length > 0) {
        const rows = validBulls.map((b) => ({
          semen_order_id: orderId,
          bull_catalog_id: b.catalogId,
          custom_bull_name: b.catalogId ? null : b.name.trim(),
          units: typeof b.units === "number" ? b.units : parseInt(String(b.units)) || 0,
        }));
        const { error: itemErr } = await supabase.from("semen_order_items").insert(rows);
        if (itemErr) throw itemErr;
      }

      // Supplies — delete existing and re-insert
      if (isEditing) {
        const { error: delSupErr } = await (supabase as any)
          .from("order_supply_items")
          .delete()
          .eq("semen_order_id", orderId);
        if (delSupErr) throw delSupErr;
      }
      const validSupplies = supplyLines.filter((s) => s.productName.trim() && s.quantity);
      if (validSupplies.length > 0) {
        const supplyRows = validSupplies.map((s) => {
          const qty = typeof s.quantity === "number" ? s.quantity : parseInt(String(s.quantity)) || 0;
          return {
            semen_order_id: orderId,
            billing_product_id: s.productId || null,
            product_name: s.productName,
            quantity: qty,
            unit_price: s.unitPrice,
            unit_label: s.unitLabel || null,
            line_total: qty * s.unitPrice,
          };
        });
        const { error: supplyErr } = await (supabase as any).from("order_supply_items").insert(supplyRows);
        if (supplyErr) throw supplyErr;
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
          {/* Order Type Toggle */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Order Type</Label>
            <div className="flex rounded-md overflow-hidden border border-border">
              <button
                type="button"
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                  orderType === "customer"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                )}
                onClick={() => setOrderType("customer")}
              >
                Customer Order
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                  orderType === "inventory"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                )}
                onClick={() => setOrderType("inventory")}
              >
                Inventory Order
              </button>
            </div>
          </div>

          {/* Customer Picker */}
          {orderType === "customer" && orgId && (
            <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
              <Label className="text-right text-sm">Customer</Label>
              <CustomerPicker value={customerId} onChange={setCustomerId} orgId={orgId} />
            </div>
          )}

          {/* Semen Company */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Company</Label>
            <div>
              <Select
                value={semenCompanyId}
                onValueChange={(val) => {
                  if (val === "add_new") {
                    setAddingCompany(true);
                    setNewCompanyName("");
                  } else {
                    setSemenCompanyId(val);
                    setAddingCompany(false);
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="add_new">+ Add New Company...</SelectItem>
                </SelectContent>
              </Select>
              {addingCompany && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Company name"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={!newCompanyName.trim() || !orgId}
                    onClick={async () => {
                      if (!orgId) return;
                      const { data, error } = await supabase
                        .from("semen_companies")
                        .insert({ name: newCompanyName.trim(), organization_id: orgId })
                        .select("id, name")
                        .single();
                      if (error) {
                        toast({ title: "Error", description: error.message, variant: "destructive" });
                        return;
                      }
                      setCompanies((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                      setSemenCompanyId(data.id);
                      setAddingCompany(false);
                      setNewCompanyName("");
                    }}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Order Date */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Order Date</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
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

          {/* Placed By */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Placed By</Label>
            <Input value={placedBy} onChange={(e) => setPlacedBy(e.target.value)} placeholder="Who placed this order?" />
          </div>

          {/* Status dropdowns */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Fulfillment</Label>
            <Select value={fulfillmentStatus} onValueChange={setFulfillmentStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Billing</Label>
            <Select value={billingStatus} onValueChange={setBillingStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unbilled">Unbilled</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Link to Project */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <Label className="text-right text-sm">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulls */}
          <div className="grid grid-cols-[100px_1fr] items-start gap-x-4">
            <div />
            <BullsRowManager
              bulls={bulls.map((b) => ({
                bull_name: b.name,
                bull_catalog_id: b.catalogId,
                units: typeof b.units === "number" ? b.units : 0,
              }))}
              onAdd={addBullRow}
              onRemove={removeBullRow}
              onUpdateBull={(i, name, catId) =>
                updateBull(i, name, catId)
              }
              onUpdateUnits={(i, units) => updateUnits(i, units.toString())}
              showUnits={true}
              emptyMessage="No bulls added yet. Click 'Add Bull' to add semen."
              showInventory={true}
              orgId={orgId}
            />
          </div>

          {/* Supplies */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Supplies</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSupplyLines((prev) => [
                    ...prev,
                    { productId: "", productName: "", quantity: "", unitPrice: 0, unitLabel: "", lineTotal: 0 },
                  ])
                }
              >
                + Add Supply
              </Button>
            </div>
            {supplyLines.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No supplies added.</p>
            ) : (
              supplyLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={line.productId || undefined}
                    onValueChange={(v) => {
                      const prod = supplyProducts.find((p) => p.id === v);
                      setSupplyLines((prev) =>
                        prev.map((s, i) =>
                          i === idx
                            ? {
                                ...s,
                                productId: prod ? prod.id : "",
                                productName: prod ? prod.product_name : s.productName,
                                unitPrice: prod ? Number(prod.default_price) || 0 : s.unitPrice,
                                unitLabel: prod ? prod.unit_label || "" : s.unitLabel,
                              }
                            : s,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger className="flex-1 min-w-[200px]">
                      <SelectValue placeholder="Select product…" />
                    </SelectTrigger>
                    <SelectContent>
                      {supplyProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.product_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-[80px]"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) =>
                      setSupplyLines((prev) =>
                        prev.map((s, i) =>
                          i === idx ? { ...s, quantity: e.target.value === "" ? "" : parseInt(e.target.value) || 0 } : s,
                        ),
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground w-[60px] text-right">
                    ${line.unitPrice.toFixed(2)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setSupplyLines((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <span className="text-lg">×</span>
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Notes */}
          <div className="grid grid-cols-[100px_1fr] items-start gap-x-4">
            <Label className="text-right text-sm pt-2">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={3} />
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
