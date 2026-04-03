import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BullCombobox from "@/components/BullCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Upload, X, Package } from "lucide-react";
import { format } from "date-fns";

interface OrderOption {
  id: string;
  customer_name: string;
  order_date: string;
  received_from?: string;
}

interface OrderItem {
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  units: number;
  bulls_catalog: { bull_name: string } | null;
}

interface TankOption {
  id: string;
  tank_name: string | null;
  tank_number: string;
  tank_type: string;
}

interface LineItem {
  key: string;
  bullName: string;
  bullCatalogId: string | null;
  units: number;
  tankId: string;
  canister: string;
}

const emptyLine = (): LineItem => ({
  key: crypto.randomUUID(),
  bullName: "",
  bullCatalogId: null,
  units: 0,
  tankId: "",
  canister: "",
});

const ReceiveShipment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgId } = useOrgRole();
  const isMobile = useIsMobile();

  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [tanks, setTanks] = useState<TankOption[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedDate, setReceivedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load orders and tanks
  useEffect(() => {
    if (!orgId) return;
    const loadData = async () => {
      const [oRes, tRes] = await Promise.all([
        supabase
          .from("semen_orders")
          .select("id, customer_name, order_date")
          .eq("organization_id", orgId)
          .order("order_date", { ascending: false })
          .limit(100),
        supabase
          .from("tanks")
          .select("id, tank_name, tank_number, tank_type")
          .eq("organization_id", orgId)
          .order("tank_number"),
      ]);
      setOrders(oRes.data ?? []);
      setTanks(tRes.data ?? []);
    };
    loadData();
  }, [orgId]);

  // Pre-select order from query param
  useEffect(() => {
    const orderId = searchParams.get("order");
    if (orderId) setSelectedOrderId(orderId);
  }, [searchParams]);

  // When order is selected, pre-fill lines
  useEffect(() => {
    if (!selectedOrderId) return;
    const order = orders.find((o) => o.id === selectedOrderId);
    if (order) {
      setReceivedFrom(order.customer_name);
    }
    (async () => {
      const { data } = await supabase
        .from("semen_order_items")
        .select("bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name)")
        .eq("semen_order_id", selectedOrderId);
      if (data && data.length > 0) {
        const newLines: LineItem[] = (data as unknown as OrderItem[]).map((item) => ({
          key: crypto.randomUUID(),
          bullName: item.bulls_catalog?.bull_name ?? item.custom_bull_name ?? "",
          bullCatalogId: item.bull_catalog_id,
          units: item.units,
          tankId: "",
          canister: "",
        }));
        setLines(newLines);
      }
    })();
  }, [selectedOrderId, orders]);

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File too large — max 10MB");
      return;
    }
    setFile(f);
    if (f.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(f));
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setFilePreview(null);
  };

  // Line item helpers
  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  // Validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!receivedFrom.trim()) errs.receivedFrom = "Required";
    if (lines.length === 0) errs.lines = "At least one line item required";
    lines.forEach((l, i) => {
      if (!l.bullName) errs[`line_${i}_bull`] = "Required";
      if (!l.units || l.units < 1) errs[`line_${i}_units`] = "Min 1";
      if (!l.tankId) errs[`line_${i}_tank`] = "Required";
      if (!l.canister.trim()) errs[`line_${i}_canister`] = "Required";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !orgId) return;
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      // 1. Upload file if present
      let documentPath: string | null = null;
      const shipmentId = crypto.randomUUID();

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${orgId}/${shipmentId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("shipment-documents")
          .upload(path, file);
        if (upErr) throw upErr;
        documentPath = path;
      }

      // 2. Insert shipment
      const { error: shipErr } = await supabase.from("shipments").insert({
        id: shipmentId,
        organization_id: orgId,
        semen_order_id: selectedOrderId || null,
        received_from: receivedFrom.trim(),
        received_date: receivedDate,
        document_path: documentPath,
        notes: notes.trim() || null,
        created_by: userId,
      });
      if (shipErr) throw shipErr;

      // 3. Process each line
      let totalUnits = 0;
      for (const line of lines) {
        totalUnits += line.units;

        // Upsert tank_inventory
        const matchFilter = {
          organization_id: orgId,
          tank_id: line.tankId,
          canister: line.canister.trim(),
        } as Record<string, string>;

        if (line.bullCatalogId) {
          matchFilter.bull_catalog_id = line.bullCatalogId;
        } else {
          matchFilter.custom_bull_name = line.bullName;
        }

        const { data: existing } = await supabase
          .from("tank_inventory")
          .select("id, units")
          .match(matchFilter)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("tank_inventory")
            .update({ units: existing.units + line.units })
            .eq("id", existing.id);
        } else {
          await supabase.from("tank_inventory").insert({
            organization_id: orgId,
            tank_id: line.tankId,
            canister: line.canister.trim(),
            bull_catalog_id: line.bullCatalogId,
            custom_bull_name: line.bullCatalogId ? null : line.bullName,
            units: line.units,
            storage_type: "customer",
          });
        }

        // Insert inventory_transaction
        await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: line.tankId,
          bull_catalog_id: line.bullCatalogId,
          custom_bull_name: line.bullCatalogId ? null : line.bullName,
          units_change: line.units,
          transaction_type: "received",
          shipment_id: shipmentId,
          order_id: selectedOrderId || null,
          performed_by: userId,
          notes: `Received from ${receivedFrom.trim()}`,
        });
      }

      // 4. Update order fulfillment if linked
      if (selectedOrderId) {
        // Get total ordered
        const { data: orderItems } = await supabase
          .from("semen_order_items")
          .select("units")
          .eq("semen_order_id", selectedOrderId);
        const totalOrdered = (orderItems ?? []).reduce((s, i) => s + i.units, 0);

        // Get total received (all shipments for this order)
        const { data: txns } = await supabase
          .from("inventory_transactions")
          .select("units_change")
          .eq("order_id", selectedOrderId)
          .eq("transaction_type", "received");
        const totalReceived = (txns ?? []).reduce((s, t) => s + t.units_change, 0);

        const newStatus = totalReceived >= totalOrdered ? "delivered" : "partially_filled";

        // Only upgrade status
        const { data: currentOrder } = await supabase
          .from("semen_orders")
          .select("fulfillment_status")
          .eq("id", selectedOrderId)
          .single();

        const statusRank: Record<string, number> = {
          pending: 0,
          backordered: 1,
          ordered: 2,
          partially_filled: 3,
          shipped: 4,
          delivered: 5,
        };

        if (
          currentOrder &&
          (statusRank[newStatus] ?? 0) > (statusRank[currentOrder.fulfillment_status] ?? 0)
        ) {
          await supabase
            .from("semen_orders")
            .update({ fulfillment_status: newStatus })
            .eq("id", selectedOrderId);
        }
      }

      toast.success(`Shipment received — ${totalUnits} units added to inventory`);

      if (selectedOrderId) {
        navigate(`/semen-orders/${selectedOrderId}`);
      } else {
        navigate("/tanks");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to receive shipment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receive Shipment</h1>
          <p className="text-sm text-muted-foreground">Log incoming semen and add it to inventory</p>
        </div>

        {/* Shipment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Shipment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Link to Order */}
              <div className="space-y-1.5">
                <Label>Link to Order (optional)</Label>
                <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an order..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.length === 0 && (
                      <SelectItem value="__none" disabled>No orders found</SelectItem>
                    )}
                    {orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.customer_name} — {format(new Date(o.order_date + "T00:00:00"), "MMM d, yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Received From */}
              <div className="space-y-1.5">
                <Label>Received From *</Label>
                <Input
                  value={receivedFrom}
                  onChange={(e) => setReceivedFrom(e.target.value)}
                  placeholder='e.g. "Select Sires", "ABS Global"'
                />
                {errors.receivedFrom && (
                  <p className="text-xs text-destructive">{errors.receivedFrom}</p>
                )}
              </div>

              {/* Received Date */}
              <div className="space-y-1.5">
                <Label>Received Date</Label>
                <Input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </div>

              {/* File Upload */}
              <div className="space-y-1.5">
                <Label>Packing Slip Photo</Label>
                {file ? (
                  <div className="flex items-center gap-2 p-2 border border-border rounded-md bg-secondary/50">
                    {filePreview ? (
                      <img src={filePreview} alt="Preview" className="h-12 w-12 object-cover rounded" />
                    ) : (
                      <Package className="h-8 w-8 text-muted-foreground" />
                    )}
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <Button variant="ghost" size="icon" onClick={removeFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer p-2 border border-dashed border-border rounded-md hover:bg-secondary/50 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload photo or PDF</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/heic,application/pdf"
                      capture="environment"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this shipment..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Line Items</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Row
            </Button>
          </CardHeader>
          <CardContent>
            {errors.lines && (
              <p className="text-xs text-destructive mb-2">{errors.lines}</p>
            )}

            {isMobile ? (
              /* Mobile: card layout */
              <div className="space-y-4">
                {lines.map((line, i) => (
                  <div key={line.key} className="border border-border rounded-lg p-3 space-y-3 relative">
                    {lines.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7 text-destructive"
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Bull *</Label>
                      <BullCombobox
                        value={line.bullName}
                        catalogId={line.bullCatalogId}
                        onChange={(name, catId) => updateLine(line.key, { bullName: name, bullCatalogId: catId })}
                      />
                      {errors[`line_${i}_bull`] && (
                        <p className="text-xs text-destructive">{errors[`line_${i}_bull`]}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Units *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={line.units || ""}
                          onChange={(e) => updateLine(line.key, { units: parseInt(e.target.value) || 0 })}
                        />
                        {errors[`line_${i}_units`] && (
                          <p className="text-xs text-destructive">{errors[`line_${i}_units`]}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Canister *</Label>
                        <Input
                          value={line.canister}
                          onChange={(e) => updateLine(line.key, { canister: e.target.value })}
                          placeholder="e.g. 1A"
                        />
                        {errors[`line_${i}_canister`] && (
                          <p className="text-xs text-destructive">{errors[`line_${i}_canister`]}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Destination Tank *</Label>
                      <Select
                        value={line.tankId}
                        onValueChange={(v) => updateLine(line.key, { tankId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select tank..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tanks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.tank_name || t.tank_number} ({t.tank_type.replace(/_/g, " ")})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors[`line_${i}_tank`] && (
                        <p className="text-xs text-destructive">{errors[`line_${i}_tank`]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Desktop: table layout */
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Bull</TableHead>
                    <TableHead className="w-[12%]">Units</TableHead>
                    <TableHead className="w-[28%]">Destination Tank</TableHead>
                    <TableHead className="w-[15%]">Canister</TableHead>
                    <TableHead className="w-[5%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={line.key}>
                      <TableCell>
                        <BullCombobox
                          value={line.bullName}
                          catalogId={line.bullCatalogId}
                          onChange={(name, catId) => updateLine(line.key, { bullName: name, bullCatalogId: catId })}
                        />
                        {errors[`line_${i}_bull`] && (
                          <p className="text-xs text-destructive mt-1">{errors[`line_${i}_bull`]}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={line.units || ""}
                          onChange={(e) => updateLine(line.key, { units: parseInt(e.target.value) || 0 })}
                          className="w-20"
                        />
                        {errors[`line_${i}_units`] && (
                          <p className="text-xs text-destructive mt-1">{errors[`line_${i}_units`]}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.tankId}
                          onValueChange={(v) => updateLine(line.key, { tankId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select tank..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tanks.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.tank_name || t.tank_number} ({t.tank_type.replace(/_/g, " ")})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors[`line_${i}_tank`] && (
                          <p className="text-xs text-destructive mt-1">{errors[`line_${i}_tank`]}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.canister}
                          onChange={(e) => updateLine(line.key, { canister: e.target.value })}
                          placeholder="e.g. 1A"
                        />
                        {errors[`line_${i}_canister`] && (
                          <p className="text-xs text-destructive mt-1">{errors[`line_${i}_canister`]}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {lines.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive h-8 w-8"
                            onClick={() => removeLine(line.key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className={isMobile ? "sticky bottom-0 bg-background border-t border-border p-4 -mx-4" : ""}>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className={isMobile ? "w-full" : "w-full md:w-auto"}
            size="lg"
          >
            {submitting ? "Processing..." : "Receive & Add to Inventory"}
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default ReceiveShipment;
