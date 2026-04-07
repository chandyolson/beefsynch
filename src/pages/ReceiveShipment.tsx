import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useParams, Link } from "react-router-dom";
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
  const { id: editId } = useParams<{ id?: string }>();
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
  const [existingDocPath, setExistingDocPath] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

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
        .select("id, customer_name, order_date, fulfillment_status")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Check if selected order already received
  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const alreadyReceivedStatuses = ["delivered", "partially_filled", "substituted", "over", "short"];
  const selectedOrderAlreadyReceived = selectedOrder && alreadyReceivedStatuses.includes(selectedOrder.fulfillment_status);

  // Fetch existing shipments for the selected order (for linking)
  const { data: existingShipmentsForOrder = [] } = useQuery({
    queryKey: ["existing-shipments-for-order", selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId) return [];
      const { data } = await supabase
        .from("shipments")
        .select("id, confirmed_at")
        .eq("semen_order_id", selectedOrderId)
        .eq("status", "confirmed")
        .order("confirmed_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!selectedOrderId && !!selectedOrderAlreadyReceived,
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

  // Build stable list of bull keys for existing-inventory lookup
  const bullKeysForQuery = useMemo(() => {
    const keys = new Set<string>();
    for (const line of lines) {
      const key = line.bullCatalogId || line.bullName;
      if (key) keys.add(key);
    }
    return Array.from(keys).sort();
  }, [lines]);

  // Fetch existing inventory for the bulls in the form (paginated), filtered by semen owner
  const { data: existingInventory = [] } = useQuery({
    queryKey: ["receive-existing-inventory", orgId, bullKeysForQuery, semenOwnerId],
    queryFn: async () => {
      if (!orgId || bullKeysForQuery.length === 0) return [];
      const catalogIds = lines.filter(l => l.bullCatalogId).map(l => l.bullCatalogId!);
      const customNames = lines.filter(l => !l.bullCatalogId && l.bullName).map(l => l.bullName);

      const allRows: any[] = [];
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("tank_inventory")
          .select("id, bull_catalog_id, custom_bull_name, tank_id, canister, units, item_type, customer_id, owner")
          .eq("organization_id", orgId)
          .gt("units", 0)
          .range(from, from + pageSize - 1);

        // Apply ownership filter
        if (semenOwnerId === null) {
          query = query.is("customer_id", null);
        } else {
          query = query.eq("customer_id", semenOwnerId);
        }

        // Build OR filter
        const orFilters: string[] = [];
        if (catalogIds.length > 0) orFilters.push(`bull_catalog_id.in.(${catalogIds.join(",")})`);
        if (customNames.length > 0) orFilters.push(`custom_bull_name.in.(${customNames.join(",")})`);
        if (orFilters.length > 0) query = query.or(orFilters.join(","));

        const { data, error } = await query;
        if (error) throw error;
        if (data) allRows.push(...data);
        hasMore = (data?.length ?? 0) === pageSize;
        from += pageSize;
      }
      return allRows;
    },
    enabled: !!orgId && bullKeysForQuery.length > 0,
  });

  type ExistingLocation = {
    inventoryId: string;
    tankId: string;
    tankName: string;
    canister: string;
    units: number;
    itemType: string;
    ownerName: string | null;
  };

  const existingByBull: Map<string, ExistingLocation[]> = useMemo(() => {
    const map = new Map<string, ExistingLocation[]>();
    for (const row of existingInventory) {
      const key = row.bull_catalog_id || row.custom_bull_name;
      if (!key) continue;
      const tank = tanks.find(t => t.id === row.tank_id);
      const customer = row.customer_id ? customers.find(c => c.id === row.customer_id) : null;
      const loc: ExistingLocation = {
        inventoryId: row.id,
        tankId: row.tank_id,
        tankName: tank?.tank_name || tank?.tank_number || "Unknown tank",
        canister: row.canister,
        units: row.units,
        itemType: row.item_type,
        ownerName: customer?.name ?? (row.customer_id ? null : "Company"),
      };
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(loc);
    }
    for (const locs of map.values()) {
      locs.sort((a, b) => a.tankName.localeCompare(b.tankName) || a.canister.localeCompare(b.canister));
    }
    return map;
  }, [existingInventory, tanks, customers]);


  // Load existing draft if editing
  useEffect(() => {
    if (!editId || !orgId || draftLoaded) return;
    (async () => {
      const { data: shipment, error } = await supabase
        .from("shipments")
        .select("*")
        .eq("id", editId)
        .single();
      if (error || !shipment) {
        toast({ title: "Not found", description: "Shipment not found", variant: "destructive" });
        navigate("/receive-shipment");
        return;
      }
      if (shipment.status !== "draft") {
        navigate(`/receive-shipment/preview/${editId}`);
        return;
      }
      // Populate form from draft
      setReceivedFrom(shipment.received_from || "");
      setReceivedBy(shipment.received_by || "");
      setReceivedDate(new Date(shipment.received_date + "T00:00:00"));
      setNotes(shipment.notes || "");
      setSelectedOrderId(shipment.semen_order_id || "");
      setExistingDocPath(shipment.document_path);

      const snapshot = shipment.reconciliation_snapshot as any;
      if (snapshot?.draft_lines) {
        setSemenOwnerId(snapshot.semen_owner_id || null);
        const loadedLines: LineItem[] = snapshot.draft_lines.map((dl: any) => ({
          key: crypto.randomUUID(),
          groupId: dl.groupId || crypto.randomUUID(),
          bullName: dl.bullName || "",
          bullCatalogId: dl.bullCatalogId || null,
          units: dl.units || 0,
          tankId: dl.tankId || "",
          canister: dl.canister || "",
          itemType: dl.itemType || "semen",
        }));
        if (loadedLines.length > 0) setLines(loadedLines);
      }
      setDraftLoaded(true);
    })();
  }, [editId, orgId, draftLoaded, navigate]);

  // Pre-select order from query param (only for new shipments)
  useEffect(() => {
    if (editId) return;
    const orderId = searchParams.get("order");
    if (orderId) setSelectedOrderId(orderId);
  }, [searchParams, editId]);

  // When order is selected, pre-fill lines (only for new shipments or if not draft-loaded)
  useEffect(() => {
    if (!selectedOrderId || selectedOrderId === "__none") {
      setOrderedQtyMap(new Map());
      return;
    }
    const order = orders.find((o) => o.id === selectedOrderId);
    if (order && !editId) {
      setReceivedFrom(order.customer_name);
    }
    (async () => {
      const { data } = await supabase
        .from("semen_order_items")
        .select("bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name)")
        .eq("semen_order_id", selectedOrderId);
      if (data && data.length > 0) {
        const items = data as unknown as OrderItem[];
        // Only set lines from order if NOT editing existing draft
        if (!editId || !draftLoaded) {
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
        }

        const qtyMap = new Map<string, number>();
        for (const item of items) {
          const key = item.bull_catalog_id || item.custom_bull_name || "";
          qtyMap.set(key, (qtyMap.get(key) || 0) + item.units);
        }
        setOrderedQtyMap(qtyMap);
      }
    })();
  }, [selectedOrderId, orders, editId, draftLoaded]);

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
    setExistingDocPath(null);
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
    const lastKey = group.items[group.items.length - 1].key;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === lastKey);
      const copy = [...prev];
      copy.splice(idx + 1, 0, newLine);
      return copy;
    });
  };

  const fillFromExistingLocation = (group: BullGroup, loc: ExistingLocation) => {
    const groupLines = group.items;
    const targetLine =
      groupLines.find(l => !l.tankId && !l.canister) ??
      groupLines[groupLines.length - 1];
    if (!targetLine) return;
    updateLine(targetLine.key, {
      tankId: loc.tankId,
      canister: loc.canister,
    });
    toast({
      title: "Location applied",
      description: `${loc.tankName} · canister ${loc.canister}`,
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

      // Upload file if new
      let documentPath: string | null = existingDocPath;
      if (file) {
        const path = `${orgId}/${crypto.randomUUID()}/${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("shipment-documents")
          .upload(path, file);
        if (upErr) throw upErr;
        documentPath = path;
      }

      // Build draft snapshot
      const draftLines = lines.map((l) => ({
        groupId: l.groupId,
        bullCatalogId: l.bullCatalogId,
        bullName: l.bullName,
        tankId: l.tankId,
        canister: l.canister.trim(),
        units: l.units,
        itemType: l.itemType,
      }));

      const snapshot = {
        version: 1,
        draft_lines: draftLines,
        semen_owner_id: semenOwnerId,
      };

      const shipmentData = {
        organization_id: orgId,
        semen_order_id: selectedOrderId || null,
        received_from: receivedFrom.trim(),
        received_date: format(receivedDate, "yyyy-MM-dd"),
        document_path: documentPath,
        notes: notes.trim() || null,
        received_by: receivedBy.trim() || null,
        created_by: userId,
        status: "draft" as const,
        reconciliation_snapshot: snapshot as any,
      };

      let shipmentId: string;

      if (editId) {
        // Update existing draft
        const { error: updErr } = await supabase
          .from("shipments")
          .update(shipmentData)
          .eq("id", editId);
        if (updErr) throw updErr;
        shipmentId = editId;
      } else {
        // Insert new draft
        shipmentId = crypto.randomUUID();
        const { error: shipErr } = await supabase.from("shipments").insert({
          id: shipmentId,
          ...shipmentData,
        });
        if (shipErr) throw shipErr;
      }

      toast({ title: "Draft saved", description: "Redirecting to preview..." });
      navigate(`/receive-shipment/preview/${shipmentId}`);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to save draft", variant: "destructive" });
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
            isFull ? "text-primary" : isPartial ? "text-accent-foreground" : "text-amber-400"
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

        {/* Existing inventory panel */}
        {(() => {
          const lookupKey = group.bullCatalogId || group.bullName;
          const locations = lookupKey ? (existingByBull.get(lookupKey) ?? []) : [];
          const totalExistingUnits = locations.reduce((s, l) => s + l.units, 0);
          const ownerLabel = semenOwnerId
            ? (customers.find(c => c.id === semenOwnerId)?.name ?? "customer") + "'s"
            : "company";
          if (!firstLine.bullName) return null;
          if (locations.length === 0) {
            return (
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <p className="text-xs text-muted-foreground">Not currently in {ownerLabel} inventory</p>
              </div>
            );
          }
          return (
            <div className="px-3 py-2 bg-muted/30 border-b border-border">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Already in {ownerLabel} inventory ({totalExistingUnits} units across {locations.length} location{locations.length === 1 ? '' : 's'})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {locations.map(loc => (
                  <button
                    type="button"
                    key={loc.inventoryId}
                    onClick={() => fillFromExistingLocation(group, loc)}
                    className="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-secondary hover:border-primary/40 transition-colors text-left"
                    title="Click to use this tank and canister for the active line"
                  >
                    <span className="font-medium text-foreground">{loc.tankName}</span>
                    <span className="text-muted-foreground"> · canister {loc.canister}</span>
                    <span className="text-muted-foreground"> · {loc.units} units</span>
                    {loc.ownerName && loc.ownerName !== "Company" && (
                      <span className="text-muted-foreground"> · {loc.ownerName}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

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
          <h1 className="text-2xl font-bold text-foreground">
            {editId ? "Edit Draft Shipment" : "Receive Shipment"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {editId ? "Update this draft and preview the reconciliation report" : "Log incoming semen and preview before confirming"}
          </p>
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
                        <span className="flex items-center gap-2">
                          {o.customer_name} — {format(new Date(o.order_date + "T00:00:00"), "MMM d, yyyy")}
                          {alreadyReceivedStatuses.includes(o.fulfillment_status) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              ✓ {o.fulfillment_status.replace(/_/g, " ")}
                            </span>
                          )}
                        </span>
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
                ) : existingDocPath ? (
                  <div className="flex items-center gap-2 p-2 border border-border rounded-md bg-secondary/50">
                    <Package className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">{existingDocPath.split("/").pop()}</span>
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

        {/* Duplicate receive warning */}
        {selectedOrderAlreadyReceived && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">This order has already been received</p>
              <p className="text-amber-300/80 mt-0.5">
                Status: <strong>{selectedOrder?.fulfillment_status.replace(/_/g, " ")}</strong>. Receiving against it again will create a second shipment record and add to inventory a second time. Proceed only if you're sure (backorder, replacement).
              </p>
              {existingShipmentsForOrder.length === 1 && (
                <Link to={`/receive-shipment/preview/${existingShipmentsForOrder[0].id}`} className="text-primary hover:underline text-xs mt-1 inline-block">
                  View existing shipment →
                </Link>
              )}
              {existingShipmentsForOrder.length > 1 && (
                <Link to={`/shipments?order=${selectedOrderId}`} className="text-primary hover:underline text-xs mt-1 inline-block">
                  View {existingShipmentsForOrder.length} existing shipments →
                </Link>
              )}
            </div>
          </div>
        )}

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
            {submitting ? "Saving..." : "Save Draft & Preview"}
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default ReceiveShipment;
