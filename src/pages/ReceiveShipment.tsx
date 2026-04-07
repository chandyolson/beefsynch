import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BullCombobox from "@/components/BullCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Upload, X, Package, CalendarDays, Loader2, Check, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface OrderItem {
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  units: number;
  bulls_catalog: { bull_name: string } | null;
}

interface LineItem {
  key: string;
  groupId: string;
  bullName: string;
  bullCatalogId: string | null;
  units: number;
  tankId: string;
  canister: string;
  itemType: "semen" | "embryo";
}

interface BullGroup {
  groupKey: string;
  bullName: string;
  bullCatalogId: string | null;
  items: LineItem[];
}

const emptyLine = (): LineItem => ({
  key: crypto.randomUUID(),
  groupId: crypto.randomUUID(),
  bullName: "",
  bullCatalogId: null,
  units: 0,
  tankId: "",
  canister: "",
  itemType: "semen",
});

const ReceiveShipment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgId } = useOrgRole();
  const isMobile = useIsMobile();

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedDate, setReceivedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [orderedQtyMap, setOrderedQtyMap] = useState<Map<string, number>>(new Map());
  const [semenOwnerId, setSemenOwnerId] = useState<string | null>(null);

  // Derive groups from lines
  const groups: BullGroup[] = useMemo(() => {
    const map = new Map<string, LineItem[]>();
    for (const line of lines) {
      const groupKey = line.groupId;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(line);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      groupKey: key,
      bullName: items[0].bullName,
      bullCatalogId: items[0].bullCatalogId,
      items,
    }));
  }, [lines]);

  // Fetch orders
  const { data: orders = [] } = useQuery({
    queryKey: ["semen-orders-list", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("semen_orders")
        .select("id, customer_name, order_date")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Fetch tanks
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks-list", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type")
        .eq("organization_id", orgId)
        .order("tank_number");
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Fetch customers for semen owner dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name");
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Pre-select order from query param
  useEffect(() => {
    const orderId = searchParams.get("order");
    if (orderId) setSelectedOrderId(orderId);
  }, [searchParams]);

  // When order is selected, pre-fill lines
  useEffect(() => {
    if (!selectedOrderId || selectedOrderId === "__none") {
      setOrderedQtyMap(new Map());
      return;
    }
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
        const items = data as unknown as OrderItem[];
        const newLines: LineItem[] = items.map((item) => ({
          key: crypto.randomUUID(),
          groupId: crypto.randomUUID(),
          bullName: item.bulls_catalog?.bull_name ?? item.custom_bull_name ?? "",
          bullCatalogId: item.bull_catalog_id,
          units: item.units,
          tankId: "",
          canister: "",
          itemType: "semen" as const,
        }));
        setLines(newLines);

        const qtyMap = new Map<string, number>();
        for (const item of items) {
          const key = item.bull_catalog_id || item.custom_bull_name || "";
          qtyMap.set(key, (qtyMap.get(key) || 0) + item.units);
        }
        setOrderedQtyMap(qtyMap);
      }
    })();
  }, [selectedOrderId, orders]);

  const handleOrderChange = (val: string) => {
    if (val === "__none") {
      setSelectedOrderId("");
      setReceivedFrom("");
      setLines([emptyLine()]);
      setOrderedQtyMap(new Map());
    } else {
      setSelectedOrderId(val);
    }
  };

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB allowed", variant: "destructive" });
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
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
  };

  // Line item helpers
  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const updateBullForGroup = (groupKey: string, bullName: string, bullCatalogId: string | null) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.groupId === groupKey) {
          return { ...l, bullName, bullCatalogId };
        }
        return l;
      })
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const removeGroup = (group: BullGroup) => {
    if (groups.length <= 1) return;
    const keys = new Set(group.items.map((i) => i.key));
    setLines((prev) => prev.filter((l) => !keys.has(l.key)));
  };

  const addSplitToGroup = (group: BullGroup) => {
    const newLine: LineItem = {
      key: crypto.randomUUID(),
      groupId: group.groupKey,
      bullName: group.bullName,
      bullCatalogId: group.bullCatalogId,
      units: 0,
      tankId: "",
      canister: "",
      itemType: group.items[0]?.itemType || "semen",
    };
    // Insert after the last line of this group
    const lastKey = group.items[group.items.length - 1].key;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === lastKey);
      const copy = [...prev];
      copy.splice(idx + 1, 0, newLine);
      return copy;
    });
  };

  // Validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!receivedFrom.trim()) errs.receivedFrom = "Required";
    if (!receivedBy.trim()) errs.receivedBy = "Required";
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
      const shipmentId = crypto.randomUUID();

      let documentPath: string | null = null;
      if (file) {
        const path = `${orgId}/${crypto.randomUUID()}/${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("shipment-documents")
          .upload(path, file);
        if (upErr) throw upErr;
        documentPath = path;
      }

      const { error: shipErr } = await supabase.from("shipments").insert({
        id: shipmentId,
        organization_id: orgId,
        semen_order_id: selectedOrderId || null,
        received_from: receivedFrom.trim(),
        received_date: format(receivedDate, "yyyy-MM-dd"),
        document_path: documentPath,
        notes: notes.trim() || null,
        received_by: receivedBy.trim() || null,
        created_by: userId,
      });
      if (shipErr) throw shipErr;

      let totalUnits = 0;
      for (const line of lines) {
        totalUnits += line.units;

        const matchFilter: Record<string, string> = {
          organization_id: orgId,
          tank_id: line.tankId,
          canister: line.canister.trim(),
          item_type: line.itemType,
        };

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
          const ownerName = semenOwnerId ? customers.find(c => c.id === semenOwnerId)?.name || null : null;
          await supabase.from("tank_inventory").insert({
            organization_id: orgId,
            tank_id: line.tankId,
            canister: line.canister.trim(),
            bull_catalog_id: line.bullCatalogId,
            custom_bull_name: line.bullCatalogId ? null : line.bullName,
            units: line.units,
            storage_type: "inventory",
            item_type: line.itemType,
            customer_id: semenOwnerId || null,
            owner: ownerName,
          });
        }

        await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: line.tankId,
          bull_catalog_id: line.bullCatalogId,
          custom_bull_name: line.bullName,
          units_change: line.units,
          transaction_type: "received",
          shipment_id: shipmentId,
          order_id: selectedOrderId || null,
          performed_by: userId,
          notes: `Received from ${receivedFrom.trim()}`,
        });
      }

      if (selectedOrderId) {
        const [{ data: orderItems }, { data: txns }] = await Promise.all([
          supabase.from("semen_order_items").select("units").eq("semen_order_id", selectedOrderId),
          supabase.from("inventory_transactions").select("units_change").eq("order_id", selectedOrderId).eq("transaction_type", "received").limit(10000),
        ]);
        const totalOrdered = (orderItems ?? []).reduce((s, i) => s + i.units, 0);
        const totalReceived = (txns ?? []).reduce((s, t) => s + t.units_change, 0);
        const newStatus = totalReceived >= totalOrdered ? "delivered" : "partially_filled";

        const { data: currentOrder } = await supabase
          .from("semen_orders")
          .select("fulfillment_status")
          .eq("id", selectedOrderId)
          .single();

        const statusRank: Record<string, number> = {
          pending: 0, backordered: 1, ordered: 2, partially_filled: 3, shipped: 4, delivered: 5,
        };

        if (currentOrder && (statusRank[newStatus] ?? 0) > (statusRank[currentOrder.fulfillment_status] ?? 0)) {
          await supabase.from("semen_orders").update({ fulfillment_status: newStatus }).eq("id", selectedOrderId);
        }
      }

      toast({ title: "Shipment received", description: `${totalUnits} units added to inventory` });

      if (selectedOrderId) {
        navigate(`/semen-orders/${selectedOrderId}`);
      } else {
        navigate("/semen-inventory");
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to receive shipment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderTankSelect = (line: LineItem, lineIndex: number) => (
    <>
      {tanks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tanks found.{" "}
          <Link to="/tanks" className="text-primary hover:underline">Add tanks first.</Link>
        </p>
      ) : (
        <Select value={line.tankId} onValueChange={(v) => updateLine(line.key, { tankId: v })}>
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
      )}
      {errors[`line_${lineIndex}_tank`] && <p className="text-xs text-destructive mt-1">{errors[`line_${lineIndex}_tank`]}</p>}
    </>
  );

  const getLineIndex = (key: string) => lines.findIndex((l) => l.key === key);

  const renderAllocationBadge = (group: BullGroup) => {
    const totalAllocated = group.items.reduce((s, l) => s + l.units, 0);
    const orderedKey = group.bullCatalogId || group.bullName;
    const orderedQty = orderedQtyMap.get(orderedKey);

    if (orderedQty != null) {
          const isFull = totalAllocated >= orderedQty;
      const isPartial = totalAllocated > 0 && totalAllocated < orderedQty;
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Ordered: {orderedQty}</span>
          <span className={cn(
            "font-medium",
            isFull ? "text-primary" : isPartial ? "text-accent-foreground" : "text-destructive"
          )}>
            {isFull && <Check className="inline h-3 w-3 mr-0.5" />}
            {isPartial && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
            {totalAllocated} of {orderedQty} allocated
          </span>
        </div>
      );
    }

    if (totalAllocated > 0) {
      return <span className="text-xs text-muted-foreground">{totalAllocated} allocated</span>;
    }
    return null;
  };

  const renderGroup = (group: BullGroup) => {
    const firstLine = group.items[0];
    const firstIdx = getLineIndex(firstLine.key);

    return (
      <div key={group.groupKey} className="border border-border rounded-lg overflow-hidden">
        {/* Group Header */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-secondary/40 border-b border-border">
          <div className="flex-1 min-w-0">
            {firstLine.bullName ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground truncate">{group.bullName}</span>
                {group.bullCatalogId && (
                  <span className="text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded">Catalog</span>
                )}
                {renderAllocationBadge(group)}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">New bull — select below</span>
            )}
          </div>
          {groups.length > 1 && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeGroup(group)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Bull Combobox — only on first line, or if bull not yet chosen */}
        {!firstLine.bullCatalogId && !group.bullCatalogId && (
          <div className="px-3 py-2 border-b border-border">
            <Label className="text-xs">Bull *</Label>
            <BullCombobox
              value={firstLine.bullName}
              catalogId={firstLine.bullCatalogId}
              onChange={(name, catId) => updateBullForGroup(group.groupKey, name, catId)}
            />
            {errors[`line_${firstIdx}_bull`] && <p className="text-xs text-destructive mt-1">{errors[`line_${firstIdx}_bull`]}</p>}
          </div>
        )}

        {/* Destination rows */}
        <div className="divide-y divide-border">
          {group.items.map((line) => {
            const idx = getLineIndex(line.key);
            return isMobile ? (
              <div key={line.key} className="p-3 space-y-3 relative">
                {group.items.length > 1 && (
                  <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => removeLine(line.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Destination Tank *</Label>
                  {renderTankSelect(line, idx)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Canister *</Label>
                    <Input value={line.canister} onChange={(e) => updateLine(line.key, { canister: e.target.value })} placeholder="e.g. 1, 2, A" />
                    {errors[`line_${idx}_canister`] && <p className="text-xs text-destructive">{errors[`line_${idx}_canister`]}</p>}
                  </div>
                   <div className="space-y-1">
                    <Label className="text-xs">Units *</Label>
                    <Input type="number" min={1} value={line.units || ""} onChange={(e) => updateLine(line.key, { units: parseInt(e.target.value) || 0 })} />
                    {errors[`line_${idx}_units`] && <p className="text-xs text-destructive">{errors[`line_${idx}_units`]}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={line.itemType} onValueChange={(v) => updateLine(line.key, { itemType: v as "semen" | "embryo" })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semen">Semen</SelectItem>
                      <SelectItem value="embryo">Embryo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div key={line.key} className="flex items-start gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  {renderTankSelect(line, idx)}
                </div>
                <div className="w-28">
                  <Input value={line.canister} onChange={(e) => updateLine(line.key, { canister: e.target.value })} placeholder="Canister" />
                  {errors[`line_${idx}_canister`] && <p className="text-xs text-destructive mt-1">{errors[`line_${idx}_canister`]}</p>}
                </div>
                <div className="w-20">
                  <Input type="number" min={1} value={line.units || ""} onChange={(e) => updateLine(line.key, { units: parseInt(e.target.value) || 0 })} />
                  {errors[`line_${idx}_units`] && <p className="text-xs text-destructive mt-1">{errors[`line_${idx}_units`]}</p>}
                </div>
                <div className="w-28">
                  <Select value={line.itemType} onValueChange={(v) => updateLine(line.key, { itemType: v as "semen" | "embryo" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semen">Semen</SelectItem>
                      <SelectItem value="embryo">Embryo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {group.items.length > 1 && (
                  <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 shrink-0" onClick={() => removeLine(line.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Split button */}
        <div className="px-3 py-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => addSplitToGroup(group)} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Split to Another Tank
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receive Shipment</h1>
          <p className="text-sm text-muted-foreground">Log incoming semen and add to inventory</p>
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
                <Select value={selectedOrderId || "__none"} onValueChange={handleOrderChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="No order — manual entry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No order — manual entry</SelectItem>
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
                  placeholder="e.g. Select Sires, ABS Global"
                  className={cn(errors.receivedFrom && "border-destructive")}
                />
                {errors.receivedFrom && <p className="text-xs text-destructive">{errors.receivedFrom}</p>}
              </div>

              {/* Received By */}
              <div className="space-y-1.5">
                <Label>Received By *</Label>
                <Input
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Who received this shipment?"
                  className={cn(errors.receivedBy && "border-destructive")}
                />
                {errors.receivedBy && <p className="text-xs text-destructive">{errors.receivedBy}</p>}
              </div>

              {/* Semen Owner */}
              <div className="space-y-1.5">
                <Label>Semen Owner</Label>
                <Select value={semenOwnerId || "__none"} onValueChange={(v) => setSemenOwnerId(v === "__none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="No owner (company inventory)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No owner (company inventory)</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Received Date */}
              <div className="space-y-1.5">
                <Label>Received Date</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {format(receivedDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={receivedDate}
                      onSelect={(d) => { if (d) { setReceivedDate(d); setCalendarOpen(false); } }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
                    <Button variant="ghost" size="icon" onClick={removeFile} type="button">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer p-2 border border-dashed border-border rounded-md hover:bg-secondary/50 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload photo or PDF</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.heic,.heif,.pdf"
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

        {/* Line Items — Grouped by Bull */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Inventory Items</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus className="h-4 w-4 mr-1" /> Add Bull
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {errors.lines && <p className="text-xs text-destructive mb-2">{errors.lines}</p>}

            {!isMobile && groups.some((g) => g.bullName) && (
              <div className="flex items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Tank</span>
                <span className="w-28">Canister</span>
                <span className="w-20">Units</span>
                <span className="w-8" />
              </div>
            )}

            {groups.map(renderGroup)}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className={isMobile ? "sticky bottom-0 bg-background border-t border-border p-4 -mx-4" : ""}>
          <Button onClick={handleSubmit} disabled={submitting} className={isMobile ? "w-full" : "w-full md:w-auto"} size="lg">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? "Processing..." : "Receive & Add to Inventory"}
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default ReceiveShipment;
