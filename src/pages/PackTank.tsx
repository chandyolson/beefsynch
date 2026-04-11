import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, Trash2, Package, CalendarDays, Loader2, X, Search,
  Truck, ClipboardList, Printer, Check, ChevronsUpDown,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import InventoryBullPicker from "@/components/InventoryBullPicker";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { generateTankLabelPdf } from "@/lib/generateTankLabelPdf";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PackLine {
  key: string;
  sourceTankId: string;
  bullName: string;
  bullCatalogId: string | null;
  bullCode: string | null;
  sourceCanister: string;
  fieldCanister: string;
  units: number;
  availableUnits: number | null;
}

const emptyLine = (): PackLine => ({
  key: crypto.randomUUID(),
  sourceTankId: "",
  bullName: "",
  bullCatalogId: null,
  bullCode: null,
  sourceCanister: "",
  fieldCanister: "",
  units: 0,
  availableUnits: null,
});

const PackTank = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgId } = useOrgRole();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const preselectedTankId = searchParams.get("tankId") || "";
  const preselectedProjectId = searchParams.get("projectId") || "";

  const [packType, setPackType] = useState<"project" | "shipment" | "order" | "pickup">("project");
  const [selectedTankId, setSelectedTankId] = useState(preselectedTankId);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [packedBy, setPackedBy] = useState("");
  const [packedDate, setPackedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PackLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
  const [fieldTankOpen, setFieldTankOpen] = useState(false);
  const [fieldTankSearch, setFieldTankSearch] = useState("");
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState<Record<number, boolean>>({});

  // Order fields
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");

  // Shipment fields
  const [destinationName, setDestinationName] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [tankReturnExpected, setTankReturnExpected] = useState(true);

  // Pickup fields
  const [pickupCustomerId, setPickupCustomerId] = useState("");
  const [pickupCustomerSearch, setPickupCustomerSearch] = useState("");
  const [pickupCustomerOpen, setPickupCustomerOpen] = useState(false);
  const [tankReturnExpectedPickup, setTankReturnExpectedPickup] = useState(true);

  // Add Tank dialog state
  const [addTankOpen, setAddTankOpen] = useState(false);
  const [newTankNumber, setNewTankNumber] = useState("");
  const [newTankName, setNewTankName] = useState("");
  const [newTankType, setNewTankType] = useState("shipper");
  const [savingTank, setSavingTank] = useState(false);

  // Auto-fill state
  const [pendingAutoFill, setPendingAutoFill] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [didPreselect, setDidPreselect] = useState(false);

  // Fetch all active tanks (for project packs)
  const { data: allActiveTanks = [] } = useQuery({
    queryKey: ["all_active_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type")
        .eq("organization_id", orgId!)
        .eq("status", "wet")
        .order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch shipper tanks only (for shipment packs)
  const { data: shipperTanks = [] } = useQuery({
    queryKey: ["shipper_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type")
        .eq("organization_id", orgId!)
        .eq("tank_type", "shipper")
        .eq("status", "wet")
        .order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const fieldTankOptions = packType === "shipment" ? shipperTanks : allActiveTanks;

  // Fetch customers for pickup
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_for_pickup", orgId],
    enabled: !!orgId && packType === "pickup",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredPickupCustomers = useMemo(() => {
    if (!pickupCustomerSearch) return customers;
    const q = pickupCustomerSearch.toLowerCase();
    return customers.filter((c: any) => c.name.toLowerCase().includes(q));
  }, [customers, pickupCustomerSearch]);

  // Fetch orders for "order" pack type
  const { data: availableOrders = [] } = useQuery({
    queryKey: ["orders-for-pack", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("semen_orders")
        .select("id, customer_name, order_date, fulfillment_status")
        .eq("organization_id", orgId)
        .not("fulfillment_status", "in", "(delivered,cancelled)")
        .order("order_date", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!orgId && packType === "order",
  });

  const filteredOrders = useMemo(() => {
    if (!orderSearch) return availableOrders;
    const q = orderSearch.toLowerCase();
    return availableOrders.filter((o: any) => (o.customer_name || "").toLowerCase().includes(q));
  }, [availableOrders, orderSearch]);

  // Fetch all tanks with inventory for source tank dropdown
  const { data: sourceTanks = [] } = useQuery({
    queryKey: ["source_tanks_with_inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: tanks, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number")
        .eq("organization_id", orgId!)
        .order("tank_number");
      if (error) throw error;
      return tanks ?? [];
    },
  });

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ["projects_for_pack", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, head_count")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  // Inventory summary: bull -> list of { tankName, canister, units }
  const [inventorySummary, setInventorySummary] = useState<Record<string, { bullName: string; locations: { tankName: string; canister: string; units: number }[] }>>({});
  const [projectBullUnits, setProjectBullUnits] = useState<{ bullName: string; units: number }[]>([]);

  const loadInventorySummary = async (projectId: string) => {
    if (!orgId) return;
    const { data: projBulls, error } = await supabase
      .from("project_bulls")
      .select("bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
      .eq("project_id", projectId);
    if (error || !projBulls) return;

    const summary: Record<string, { bullName: string; locations: { tankName: string; canister: string; units: number }[] }> = {};

    for (const pb of projBulls) {
      const catalog = (pb as any).bulls_catalog as any;
      const bullName = catalog?.bull_name || (pb as any).custom_bull_name || "Unknown";
      const bullKey = (pb as any).bull_catalog_id || bullName;

      let invRows: any[] = [];
      if ((pb as any).bull_catalog_id) {
        const { data } = await supabase
          .from("tank_inventory")
          .select("canister, units, customer_id, tanks!inner(tank_name, tank_number)")
          .eq("organization_id", orgId)
          .eq("bull_catalog_id", (pb as any).bull_catalog_id)
          .is("customer_id", null)
          .gt("units", 0)
          .order("units", { ascending: false });
        invRows = data ?? [];
      } else {
        const { data } = await supabase
          .from("tank_inventory")
          .select("canister, units, customer_id, tanks!inner(tank_name, tank_number)")
          .eq("organization_id", orgId)
          .eq("custom_bull_name", bullName)
          .is("customer_id", null)
          .gt("units", 0)
          .order("units", { ascending: false });
        invRows = data ?? [];
      }

      summary[bullKey] = {
        bullName,
        locations: invRows.map((r: any) => ({
          tankName: r.tanks?.tank_name || `Tank #${r.tanks?.tank_number}` || "Unknown Tank",
          canister: r.canister,
          units: r.units,
        })),
      };
    }
    setInventorySummary(summary);

    const bullUnitsList = (projBulls ?? []).map((b: any) => ({
      bullName: b.bulls_catalog?.bull_name || b.custom_bull_name || "Unknown",
      units: b.units ?? 0,
    }));
    setProjectBullUnits(bullUnitsList);
  };

  // Auto-fill from project bulls
  const autoFillFromProject = async (projectId: string) => {
    if (!orgId) return;

    const { data: projBulls, error } = await supabase
      .from("project_bulls")
      .select("bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
      .eq("project_id", projectId);

    if (error || !projBulls || projBulls.length === 0) {
      toast({ title: "No bulls found", description: "This project has no bulls assigned.", variant: "destructive" });
      return;
    }

    const newLines: PackLine[] = [];

    for (const pb of projBulls) {
      const catalog = pb.bulls_catalog as any;
      const bullName = catalog?.bull_name || pb.custom_bull_name || "Unknown";
      const bullCode = catalog?.naab_code || null;
      const bullCatalogId = pb.bull_catalog_id;

      let bestSource: any = null;

      // Strategy 1: Match by bull_catalog_id
      if (bullCatalogId) {
        const { data: invRows } = await supabase
          .from("tank_inventory")
          .select("tank_id, canister, units, tanks!inner(tank_name, tank_number)")
          .eq("organization_id", orgId)
          .eq("bull_catalog_id", bullCatalogId)
          .gt("units", 0)
          .order("units", { ascending: false })
          .limit(1);
        if (invRows && invRows.length > 0) bestSource = invRows[0];
      }

      // Strategy 2: Match by bull_code / NAAB code
      if (!bestSource && bullCode) {
        const { data: invRows } = await supabase
          .from("tank_inventory")
          .select("tank_id, canister, units, tanks!inner(tank_name, tank_number)")
          .eq("organization_id", orgId)
          .eq("bull_code", bullCode)
          .gt("units", 0)
          .order("units", { ascending: false })
          .limit(1);
        if (invRows && invRows.length > 0) bestSource = invRows[0];
      }

      // Strategy 3: Match by custom_bull_name
      if (!bestSource) {
        const { data: invRows } = await supabase
          .from("tank_inventory")
          .select("tank_id, canister, units, tanks!inner(tank_name, tank_number)")
          .eq("organization_id", orgId)
          .eq("custom_bull_name", bullName)
          .gt("units", 0)
          .order("units", { ascending: false })
          .limit(1);
        if (invRows && invRows.length > 0) bestSource = invRows[0];
      }

      newLines.push({
        key: crypto.randomUUID(),
        sourceTankId: bestSource?.tank_id || "",
        bullName,
        bullCatalogId,
        bullCode,
        sourceCanister: bestSource?.canister || "",
        fieldCanister: "",
        units: 0,
        availableUnits: bestSource?.units ?? null,
      });
    }

    setLines(prev => {
      const hasContent = prev.some(l => l.bullName || l.sourceTankId || l.units > 0);
      return hasContent ? [...prev, ...newLines] : newLines;
    });

    toast({ title: "Lines auto-filled", description: `${newLines.length} bull(s) loaded from project.` });
    await loadInventorySummary(projectId);
  };

  // Process pending auto-fill
  useEffect(() => {
    if (pendingAutoFill && orgId) {
      autoFillFromProject(pendingAutoFill);
      setPendingAutoFill(null);
    }
  }, [pendingAutoFill, orgId]);

  // Pre-select project from URL param
  useEffect(() => {
    if (preselectedProjectId && orgId && !didPreselect) {
      setDidPreselect(true);
      setSelectedProjects([preselectedProjectId]);
      setPendingAutoFill(preselectedProjectId);
    }
  }, [preselectedProjectId, orgId, didPreselect]);

  // Pre-fill pack lines from selected orders
  useEffect(() => {
    if (packType !== "order" || selectedOrders.length === 0) return;

    (async () => {
      const { data: items } = await supabase
        .from("semen_order_items")
        .select("semen_order_id, bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
        .in("semen_order_id", selectedOrders);

      if (!items || items.length === 0) return;

      const bullMap = new Map<string, { bullName: string; bullCatalogId: string | null; bullCode: string | null; orderCount: number }>();
      for (const item of items as any[]) {
        const key = item.bull_catalog_id ?? `custom:${item.custom_bull_name}`;
        const existing = bullMap.get(key);
        if (existing) {
          existing.orderCount += 1;
        } else {
          bullMap.set(key, {
            bullName: item.bulls_catalog?.bull_name ?? item.custom_bull_name ?? "Unknown",
            bullCatalogId: item.bull_catalog_id,
            bullCode: item.bulls_catalog?.naab_code ?? null,
            orderCount: 1,
          });
        }
      }

      const newLines: PackLine[] = Array.from(bullMap.values()).map((b) => ({
        key: crypto.randomUUID(),
        sourceTankId: "",
        bullName: b.orderCount > 1 ? `${b.bullName} (from ${b.orderCount} orders)` : b.bullName,
        bullCatalogId: b.bullCatalogId,
        bullCode: b.bullCode,
        sourceCanister: "",
        fieldCanister: "",
        units: 0,
        availableUnits: null,
      }));

      setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    })();
  }, [packType, selectedOrders.join(",")]);

  const toggleProject = (projId: string) => {
    setSelectedProjects(prev => {
      const next = prev.includes(projId) ? prev.filter(id => id !== projId) : [...prev, projId];
      if (next.length > prev.length) {
        if (next.length === 1) {
          setPendingAutoFill(next[0]);
        } else {
          setShowProjectPicker(true);
        }
      }
      if (next.length === 0) {
        setInventorySummary({});
        setProjectBullUnits([]);
      }
      return next;
    });
  };

  const toggleOrder = (orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const updateLine = (index: number, updates: Partial<PackLine>) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, ...updates } : l));
  };

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  // Compute remaining available units for a line, subtracting what other lines
  // have already committed from the same source tank + bull combination
  const computeAvailable = (line: PackLine, lineIndex: number): number => {
    if (line.availableUnits === null) return 0;
    const committed = lines.reduce((sum, l, i) => {
      if (i === lineIndex) return sum;
      const sameTank = l.sourceTankId === line.sourceTankId;
      const sameBull = line.bullCatalogId
        ? l.bullCatalogId === line.bullCatalogId
        : l.bullName === line.bullName;
      const sameCanister = line.sourceCanister
        ? l.sourceCanister === line.sourceCanister
        : true;
      return sameTank && sameBull && sameCanister ? sum + (l.units || 0) : sum;
    }, 0);
    return Math.max(0, line.availableUnits - committed);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!selectedTankId) errs.fieldTank = "Select a field tank";
    if (packType === "project") {
      if (selectedProjects.length === 0) errs.projects = "Select at least one project";
    } else if (packType === "shipment") {
      if (!destinationName.trim()) errs.destinationName = "Destination name is required";
    } else if (packType === "order") {
      if (selectedOrders.length === 0) errs.orders = "Select at least one order";
    } else if (packType === "pickup") {
      if (!pickupCustomerId) errs.pickupCustomer = "Select a customer";
    }
    lines.forEach((line, i) => {
      if (!line.sourceTankId) errs[`line_${i}_source`] = "Required";
      if (!line.bullName.trim()) errs[`line_${i}_bull`] = "Required";
      if (line.units <= 0) errs[`line_${i}_units`] = "Must be > 0";
      if (line.availableUnits !== null && line.units > computeAvailable(line, i)) errs[`line_${i}_units`] = `Max ${computeAvailable(line, i)} units available`;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveNewTank = async () => {
    if (!newTankNumber.trim() || !orgId) return;
    setSavingTank(true);
    try {
      const { data: newTank, error } = await supabase
        .from("tanks")
        .insert({
          organization_id: orgId,
          tank_number: newTankNumber.trim(),
          tank_name: newTankName.trim() || null,
          tank_type: newTankType,
          status: "wet",
        })
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["all_active_tanks"] });
      queryClient.invalidateQueries({ queryKey: ["shipper_tanks"] });
      queryClient.invalidateQueries({ queryKey: ["source_tanks_with_inventory"] });
      setSelectedTankId(newTank.id);
      setAddTankOpen(false);
      setNewTankNumber("");
      setNewTankName("");
      setNewTankType("shipper");
      toast({ title: "Tank added" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSavingTank(false);
    }
  };

  const handleSubmit = async () => {
    if (!validate() || !orgId) return;
    setSubmitting(true);

    try {
      const fieldTank = fieldTankOptions.find((t: any) => t.id === selectedTankId);
      const fieldTankName = fieldTank?.tank_name || fieldTank?.tank_number || "Unknown";
      const projectNames = selectedProjects.map(pid => projects.find((p: any) => p.id === pid)?.name || "").filter(Boolean);

      // Step 1: Create tank_pack
      const { data: pack, error: packErr } = await supabase
        .from("tank_packs")
        .insert({
          organization_id: orgId,
          field_tank_id: selectedTankId,
          pack_type: packType,
          status: "packed",
          packed_at: packedDate.toISOString(),
          packed_by: packedBy.trim() || null,
          notes: notes.trim() || null,
          destination_name: packType === "shipment" ? destinationName.trim() : null,
          destination_address: packType === "shipment" ? destinationAddress.trim() || null : null,
          shipping_carrier: packType === "shipment" ? shippingCarrier || null : null,
          tracking_number: packType === "shipment" ? trackingNumber.trim() || null : null,
          tank_return_expected: packType === "shipment" ? tankReturnExpected : packType === "pickup" ? tankReturnExpectedPickup : true,
        })
        .select()
        .single();

      if (packErr || !pack) throw packErr || new Error("Failed to create pack");

      // Step 2: Create tank_pack_projects or tank_pack_orders
      if (packType === "project" && selectedProjects.length > 0) {
        const { error: tankPackProjectsErr } = await supabase.from("tank_pack_projects").insert(
          selectedProjects.map(projId => ({
            tank_pack_id: pack.id,
            project_id: projId,
          }))
        );
        if (tankPackProjectsErr) throw new Error(`Failed to write tank_pack_projects: ${tankPackProjectsErr.message}`);
      }

      if (packType === "order" && selectedOrders.length > 0) {
        const { error: orderLinkErr } = await supabase
          .from("tank_pack_orders")
          .insert(selectedOrders.map(orderId => ({
            tank_pack_id: pack.id,
            semen_order_id: orderId,
          })));
        if (orderLinkErr) {
          toast({ title: "Pack created but order links failed", description: orderLinkErr.message, variant: "destructive" });
        }
      }

      // Step 3: Process each line
      for (const line of lines) {
        const sourceTank = sourceTanks.find((t: any) => t.id === line.sourceTankId);
        const sourceTankName = sourceTank?.tank_name || sourceTank?.tank_number || "Unknown";

        // a. Insert pack line
        const { error: tankPackLinesErr } = await supabase.from("tank_pack_lines").insert({
          tank_pack_id: pack.id,
          source_tank_id: line.sourceTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_name: line.bullName,
          bull_code: line.bullCode,
          source_canister: line.sourceCanister || null,
          field_canister: line.fieldCanister || null,
          units: line.units,
        });
        if (tankPackLinesErr) throw new Error(`Failed to write tank_pack_lines: ${tankPackLinesErr.message}`);

        // b. Deduct from source tank inventory
        // Try three strategies in order: bull_catalog_id → bull_code → custom_bull_name
        let invRow: { id: string; units: number } | null = null;

        const baseInvQuery = () => supabase.from("tank_inventory").select("id, units")
          .eq("tank_id", line.sourceTankId)
          .eq("organization_id", orgId);

        const withCanister = (q: any) => line.sourceCanister ? q.eq("canister", line.sourceCanister) : q;

        if (line.bullCatalogId) {
          const { data } = await withCanister(baseInvQuery().eq("bull_catalog_id", line.bullCatalogId)).limit(1);
          if (data && data.length > 0) invRow = data[0];
        }
        if (!invRow && line.bullCode) {
          const { data } = await withCanister(baseInvQuery().eq("bull_code", line.bullCode)).limit(1);
          if (data && data.length > 0) invRow = data[0];
        }
        if (!invRow) {
          const { data } = await withCanister(baseInvQuery().eq("custom_bull_name", line.bullName)).limit(1);
          if (data && data.length > 0) invRow = data[0];
        }

        if (invRow) {
          if ((invRow.units as number) - line.units <= 0) {
            const { error: delErr } = await supabase.from("tank_inventory").delete().eq("id", invRow.id);
            if (delErr) throw new Error(`Failed to deduct inventory: ${delErr.message}`);
          } else {
            const { error: updErr } = await supabase.from("tank_inventory").update({ units: (invRow.units as number) - line.units }).eq("id", invRow.id);
            if (updErr) throw new Error(`Failed to deduct inventory: ${updErr.message}`);
          }
        } else {
          throw new Error(`Could not find inventory row to deduct from for "${line.bullName}" in source tank. Check that the bull name in the pack line exactly matches the inventory row.`);
        }

        // c. Add to field tank inventory (upsert)
        // Same three-strategy lookup as deduction
        let fieldInvRow: { id: string; units: number } | null = null;

        const baseFieldQuery = () => supabase.from("tank_inventory").select("id, units")
          .eq("tank_id", selectedTankId)
          .eq("organization_id", orgId);

        const withFieldCanister = (q: any) => line.fieldCanister ? q.eq("canister", line.fieldCanister) : q;

        if (line.bullCatalogId) {
          const { data } = await withFieldCanister(baseFieldQuery().eq("bull_catalog_id", line.bullCatalogId)).limit(1);
          if (data && data.length > 0) fieldInvRow = data[0];
        }
        if (!fieldInvRow && line.bullCode) {
          const { data } = await withFieldCanister(baseFieldQuery().eq("bull_code", line.bullCode)).limit(1);
          if (data && data.length > 0) fieldInvRow = data[0];
        }
        if (!fieldInvRow) {
          const { data } = await withFieldCanister(baseFieldQuery().eq("custom_bull_name", line.bullName)).limit(1);
          if (data && data.length > 0) fieldInvRow = data[0];
        }

        if (fieldInvRow) {
          const { error: fieldUpdErr } = await supabase.from("tank_inventory").update({
            units: (fieldInvRow.units as number) + line.units,
          }).eq("id", fieldInvRow.id);
          if (fieldUpdErr) throw new Error(`Failed to update field tank inventory: ${fieldUpdErr.message}`);
        } else {
          const { error: fieldInsErr } = await supabase.from("tank_inventory").insert({
            tank_id: selectedTankId,
            organization_id: orgId,
            canister: line.fieldCanister || "1",
            units: line.units,
            item_type: "semen",
            bull_catalog_id: line.bullCatalogId,
            custom_bull_name: line.bullCatalogId ? null : line.bullName,
            bull_code: line.bullCode,
          });
          if (fieldInsErr) throw new Error(`Failed to insert field tank inventory: ${fieldInsErr.message}`);
        }

        // d. Deduction transaction
        const { error: deductTxnErr } = await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: line.sourceTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_code: line.bullCode,
          custom_bull_name: line.bullName,
          units_change: -line.units,
          transaction_type: "pack_out",
          notes: packType === "project"
            ? `Packed to ${fieldTankName} for ${projectNames.join(", ")}`
            : packType === "order"
            ? `Packed to ${fieldTankName} for order(s)`
            : packType === "pickup"
            ? `Customer pickup — ${customers.find((c: any) => c.id === pickupCustomerId)?.name ?? "Unknown customer"}`
            : `Packed to ${fieldTankName} — shipment to ${destinationName.trim()}`,
        });
        if (deductTxnErr) throw new Error(`Failed to write deduction transaction: ${deductTxnErr.message}`);

        // e. Addition transaction
        const { error: addTxnErr } = await supabase.from("inventory_transactions").insert({
          organization_id: orgId,
          tank_id: selectedTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_code: line.bullCode,
          custom_bull_name: line.bullName,
          units_change: line.units,
          transaction_type: "pack_in",
          notes: `Packed from ${sourceTankName}`,
        });
        if (addTxnErr) throw new Error(`Failed to write addition transaction: ${addTxnErr.message}`);
      }

      toast({ title: "Tank packed", description: "Packing slip ready to print." });
      navigate(`/pack/${pack.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to pack tank.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    customer_tank: "Customer", inventory_tank: "Inventory", shipper: "Shipper",
    mushroom: "Mushroom", rental_tank: "Rental", communal_tank: "Communal", freeze_branding: "Freeze",
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <h2 className="text-2xl font-bold font-display tracking-tight">Pack Tank</h2>

        {/* Pack Type Toggle */}
        <div className="inline-flex rounded-lg border border-border/50 overflow-hidden flex-wrap">
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "project" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("project"); setSelectedTankId(""); setSelectedOrders([]); }}
          >
            <ClipboardList className="h-4 w-4" /> Project
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "order" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("order"); setSelectedTankId(""); setSelectedProjects([]); setInventorySummary({}); setProjectBullUnits([]); }}
          >
            <ClipboardList className="h-4 w-4" /> Order
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "shipment" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("shipment"); setSelectedTankId(""); setSelectedOrders([]); setSelectedProjects([]); }}
          >
            <Truck className="h-4 w-4" /> Shipment
          </button>
        </div>

        {/* Section 1: Pack Details */}
        <Card>
          <CardHeader><CardTitle>Pack Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Field Tank */}
            <div className="flex items-start gap-4">
              <Label className="w-28 shrink-0 text-right pt-2">{packType === "shipment" ? "Shipper Tank *" : "Field Tank *"}</Label>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1">
                  <Popover open={fieldTankOpen} onOpenChange={setFieldTankOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={fieldTankOpen} className={cn("w-full justify-between font-normal", errors.fieldTank && "border-destructive", !selectedTankId && "text-muted-foreground")}>
                        {selectedTankId
                          ? (() => { const t = fieldTankOptions.find((t: any) => t.id === selectedTankId); return t ? (t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number) : "Select tank…"; })()
                          : (packType === "shipment" ? "Select shipper tank…" : "Select tank…")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search tanks…" />
                        <CommandList>
                          <CommandEmpty>No tanks found.</CommandEmpty>
                          {fieldTankOptions.map((t: any) => {
                            const label = t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number;
                            return (
                              <CommandItem
                                key={t.id}
                                value={`${t.tank_name || ""} ${t.tank_number}`}
                                onSelect={() => { setSelectedTankId(t.id); setFieldTankOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedTankId === t.id ? "opacity-100" : "opacity-0")} />
                                {label}
                                {packType === "project" && (
                                  <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">{TYPE_LABELS[t.tank_type] || t.tank_type}</Badge>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAddTankOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Tank
                </Button>
              </div>
            </div>
            {errors.fieldTank && <p className="text-xs text-destructive pl-32">{errors.fieldTank}</p>}

            {/* Project fields */}
            {packType === "project" && (
              <div className="space-y-1.5">
                <div className="flex items-start gap-4">
              <Label className="w-28 shrink-0 text-right pt-2">Projects *</Label>
              <div className="flex-1">
                <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", errors.projects && "border-destructive", selectedProjects.length === 0 && "text-muted-foreground")}>
                      {selectedProjects.length === 0
                        ? "Select projects…"
                        : `${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""} selected`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search projects…"
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredProjects.map((p: any) => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedProjects.includes(p.id)}
                            onCheckedChange={() => toggleProject(p.id)}
                          />
                          {p.name}
                        </label>
                      ))}
                      {filteredProjects.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-2">No projects found.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {errors.projects && <p className="text-xs text-destructive">{errors.projects}</p>}
                {selectedProjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedProjects.map(pid => {
                      const proj = projects.find((p: any) => p.id === pid);
                      return (
                        <Badge key={pid} variant="secondary" className="gap-1">
                          {proj?.name || pid}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => toggleProject(pid)} />
                        </Badge>
                      );
                    })}
                  </div>
                 )}
                {projectBullUnits.length > 0 && (() => {
                  const proj = projects.find((p: any) => p.id === selectedProjects[0]);
                  const headCount = proj?.head_count;
                  return (
                    <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
                      {headCount != null && (
                        <p className="text-muted-foreground font-medium">{headCount} head</p>
                      )}
                      {projectBullUnits.map((b, i) => (
                        <div key={i} className="flex justify-between text-muted-foreground">
                          <span>{b.bullName}</span>
                          <span>{b.units} units assigned</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Multi-project picker for auto-fill */}
                {showProjectPicker && selectedProjects.length > 1 && (
                  <Card className="mt-2">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm text-muted-foreground">Which project should we pull the semen list from?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedProjects.map(pid => {
                          const proj = projects.find((p: any) => p.id === pid);
                          return (
                            <Button
                              key={pid}
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPendingAutoFill(pid);
                                setShowProjectPicker(false);
                              }}
                            >
                              {proj?.name || "Unknown"}
                            </Button>
                          );
                        })}
                        <Button variant="ghost" size="sm" onClick={() => setShowProjectPicker(false)}>
                          Skip
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              </div>
            </div>
            )}

            {/* Shipment fields */}
            {packType === "shipment" && (
              <>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Ship To *</Label>
                  <div className="flex-1">
                    <Input
                      value={destinationName}
                      onChange={e => setDestinationName(e.target.value)}
                      placeholder="Recipient name or ranch"
                      className={cn(errors.destinationName && "border-destructive")}
                    />
                    {errors.destinationName && <p className="text-xs text-destructive mt-1">{errors.destinationName}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Shipping Address</Label>
                  <div className="flex-1">
                    <Input
                      value={destinationAddress}
                      onChange={e => setDestinationAddress(e.target.value)}
                      placeholder="Full shipping address"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Carrier</Label>
                  <div className="flex-1">
                    <Select value={shippingCarrier} onValueChange={setShippingCarrier}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select carrier..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPS">UPS</SelectItem>
                        <SelectItem value="FedEx">FedEx</SelectItem>
                        <SelectItem value="USPS">USPS</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Tracking Number</Label>
                  <div className="flex-1">
                    <Input
                      value={trackingNumber}
                      onChange={e => setTrackingNumber(e.target.value)}
                      placeholder="Enter after shipping"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Tank Return</Label>
                  <div className="flex-1 flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={tankReturnExpected}
                      onCheckedChange={(checked) => setTankReturnExpected(!!checked)}
                    />
                    <Label className="cursor-pointer" onClick={() => setTankReturnExpected(!tankReturnExpected)}>
                      Tank will be returned to us
                    </Label>
                  </div>
                </div>
              </>
            )}

            {/* Order fields */}
            {packType === "order" && (
              <div className="space-y-1.5">
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Orders *</Label>
                  <div className="flex-1">
                    <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", errors.orders && "border-destructive", selectedOrders.length === 0 && "text-muted-foreground")}>
                          {selectedOrders.length === 0
                            ? "Select orders…"
                            : `${selectedOrders.length} order${selectedOrders.length > 1 ? "s" : ""} selected`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-2" align="start">
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search orders…"
                            value={orderSearch}
                            onChange={e => setOrderSearch(e.target.value)}
                            className="pl-8 h-8 text-sm"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {filteredOrders.map((o: any) => (
                            <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                              <Checkbox
                                checked={selectedOrders.includes(o.id)}
                                onCheckedChange={() => toggleOrder(o.id)}
                              />
                              <span className="flex-1">
                                {o.customer_name || "No customer"}
                                <span className="text-muted-foreground ml-1 text-xs">
                                  {o.order_date && format(new Date(o.order_date + "T00:00"), "MMM d, yyyy")}
                                </span>
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">{o.fulfillment_status}</Badge>
                            </label>
                          ))}
                          {filteredOrders.length === 0 && (
                            <p className="text-xs text-muted-foreground px-2 py-2">No open orders found.</p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {errors.orders && <p className="text-xs text-destructive">{errors.orders}</p>}
                    {selectedOrders.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {selectedOrders.map(oid => {
                          const order = availableOrders.find((o: any) => o.id === oid);
                          return (
                            <Badge key={oid} variant="secondary" className="gap-1">
                              {order?.customer_name || "Order"}
                              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleOrder(oid)} />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Packed By */}
            <div className="flex items-center gap-4">
              <Label className="w-28 shrink-0 text-right">Packed By</Label>
              <Input value={packedBy} onChange={e => setPackedBy(e.target.value)} placeholder="Who packed this tank?" className="flex-1" />
            </div>

            {/* Date Packed */}
            <div className="flex items-center gap-4">
              <Label className="w-28 shrink-0 text-right">Date Packed</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {format(packedDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={packedDate}
                    onSelect={d => { if (d) { setPackedDate(d); setCalendarOpen(false); } }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="flex items-start gap-4">
              <Label className="w-28 shrink-0 text-right pt-2">Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" className="flex-1" />
            </div>
          </CardContent>
        </Card>

        {/* Inventory Summary — project packs only */}
        {packType === "project" && selectedProjects.length > 0 && Object.keys(inventorySummary).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Available in Company Inventory</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {Object.values(inventorySummary).map((bull) => (
                <div key={bull.bullName}>
                  <p className="text-sm font-semibold mb-1">{bull.bullName}</p>
                  {bull.locations.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-3">No inventory on hand</p>
                  ) : (
                    <div className="space-y-0.5 pl-3">
                      {bull.locations.map((loc, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground">
                          {loc.tankName} — Canister {loc.canister} — {loc.units} units
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Section 2: Pack Lines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Semen to Pack</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLines(prev => {
              const last = prev[prev.length - 1];
              return [...prev, {
                ...emptyLine(),
                bullName: last?.bullName || "",
                bullCatalogId: last?.bullCatalogId || null,
                bullCode: last?.bullCode || null,
                sourceTankId: last?.sourceTankId || "",
                availableUnits: last?.availableUnits ?? null,
              }];
            })}>
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, i) => (
              <div key={line.key} className={cn("rounded-lg border border-border/50 p-2 space-y-2")}>
                <div className={cn("grid gap-2 items-end", isMobile ? "grid-cols-1" : "grid-cols-[2fr_70px_2.5fr_70px_80px_36px_36px]")}>
                  {/* Source Tank */}
                  <div className="space-y-1">
                    <Label className="text-xs">Source Tank</Label>
                    <Popover open={!!sourcePopoverOpen[i]} onOpenChange={v => setSourcePopoverOpen(prev => ({ ...prev, [i]: v }))}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal text-sm h-9", errors[`line_${i}_source`] && "border-destructive", !line.sourceTankId && "text-muted-foreground")}>
                          {line.sourceTankId
                            ? (() => { const t = sourceTanks.find((t: any) => t.id === line.sourceTankId); return t ? (t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number) : "Select…"; })()
                            : "Select tank…"}
                          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search tanks…" />
                          <CommandList>
                            <CommandEmpty>No tanks found.</CommandEmpty>
                            {sourceTanks.map((t: any) => {
                              const label = t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number;
                              return (
                                <CommandItem
                                  key={t.id}
                                  value={`${t.tank_name || ""} ${t.tank_number}`}
                                  onSelect={() => { updateLine(i, { sourceTankId: t.id }); setSourcePopoverOpen(prev => ({ ...prev, [i]: false })); }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", line.sourceTankId === t.id ? "opacity-100" : "opacity-0")} />
                                  {label}
                                </CommandItem>
                              );
                            })}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Source Canister */}
                  <div className="space-y-1">
                    <Label className="text-xs">Src Can.</Label>
                    <Input
                      value={line.sourceCanister}
                      onChange={e => updateLine(i, { sourceCanister: e.target.value })}
                      placeholder="#"
                      className="text-sm h-9"
                    />
                  </div>

                  {/* Bull (from inventory) */}
                  <div className="space-y-1">
                    <Label className="text-xs">Bull</Label>
                    <div className={cn(errors[`line_${i}_bull`] && "ring-1 ring-destructive rounded-md")}>
                      <InventoryBullPicker
                        sourceTankId={line.sourceTankId}
                        organizationId={orgId}
                        value={line.bullName}
                        onChange={(updates) => updateLine(i, updates)}
                      />
                    </div>
                  </div>

                  {/* Field Canister */}
                  <div className="space-y-1">
                    <Label className="text-xs">Fld Can.</Label>
                    <Input
                      value={line.fieldCanister}
                      onChange={e => updateLine(i, { fieldCanister: e.target.value })}
                      placeholder="#"
                      className="text-sm h-9"
                    />
                  </div>

                  {/* Units */}
                  <div className="space-y-1 min-w-[80px]">
                    <Label className="text-xs">
                      Units
                      {line.availableUnits !== null && (
                        <span className={cn("ml-1 font-normal", line.units > 0 && line.units > line.availableUnits ? "text-destructive" : "text-muted-foreground")}>
                          ({computeAvailable(line, i)} avail.)
                        </span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.units || ""}
                      onChange={e => updateLine(i, { units: parseInt(e.target.value) || 0 })}
                      className={cn("text-sm h-9", errors[`line_${i}_units`] && "border-destructive")}
                    />
                  </div>

                  {/* Print Label */}
                  <div className={cn("flex items-end pb-0.5", isMobile && "hidden")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      disabled={!line.bullName || !line.units}
                      onClick={() => generateTankLabelPdf(line.bullName, line.units)}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Remove */}
                  <div className="flex items-end pb-0.5">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className={cn("flex", isMobile ? "" : "justify-end")}>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className={cn("gap-2", isMobile && "w-full")}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Pack Tank
          </Button>
        </div>
      </main>
      <AppFooter />

      {/* Add Tank Dialog */}
      <Dialog open={addTankOpen} onOpenChange={setAddTankOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Tank</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tank Number *</Label>
              <Input
                value={newTankNumber}
                onChange={e => setNewTankNumber(e.target.value)}
                placeholder="e.g. 4085"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tank Name</Label>
              <Input
                value={newTankName}
                onChange={e => setNewTankName(e.target.value)}
                placeholder="e.g. Blue Shipper"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tank Type</Label>
              <Select value={newTankType} onValueChange={setNewTankType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipper">Shipper</SelectItem>
                  <SelectItem value="customer_tank">Customer Tank</SelectItem>
                  <SelectItem value="inventory_tank">Inventory Tank</SelectItem>
                  <SelectItem value="rental_tank">Rental Tank</SelectItem>
                  <SelectItem value="communal_tank">Communal Tank</SelectItem>
                  <SelectItem value="mushroom">Mushroom</SelectItem>
                  <SelectItem value="freeze_branding">Freeze Branding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTankOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNewTank} disabled={savingTank || !newTankNumber.trim()}>
              {savingTank ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PackTank;
