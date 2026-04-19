import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Plus, Check, Trash2, Package, Loader2, PackageOpen, ChevronRight, ChevronDown } from "lucide-react";
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
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { generateBillingSheetPdf } from "@/lib/generateBillingSheetPdf";

/* ────────────────── types ────────────────── */

interface BillingProduct {
  id: string;
  product_name: string;
  product_category: string;
  drug_name: string | null;
  doses_per_unit: number | null;
  unit_label: string | null;
  default_price: number | null;
  is_default: boolean | null;
  sort_order: number | null;
}

interface ProductLine {
  id?: string;
  billing_id: string;
  billing_product_id: string | null;
  product_name: string;
  product_category: string | null;
  protocol_event_label: string | null;
  event_date: string | null;
  doses: number;
  doses_per_unit: number | null;
  unit_label: string | null;
  units_calculated: number | null;
  units_billed: number | null;
  units_returned: number | null;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  session_id?: string | null;
}

interface SessionLine {
  id?: string;
  billing_id: string;
  session_date: string;
  session_label: string | null;
  time_of_day: string | null;
  head_count: number | null;
  crew: string | null;
  notes: string | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  session_type?: string | null;
}

interface SessionInventoryLine {
  id?: string;
  billing_id: string;
  session_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  canister: string;
  start_units: number | null;
  end_units: number | null;
  returned_units: number | null;
  sort_order: number | null;
}

interface WorksheetRow {
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  canister: string;
  packed_units: number;
  returned_units: number | null;
  cellsBySessionId: Record<string, { start_units: number | null; end_units: number | null; id?: string }>;
}

interface SemenLine {
  id?: string;
  billing_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  units_packed: number | null;
  units_returned: number | null;
  units_blown: number | null;
  units_billable: number | null;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
}

/* ────────────────── helpers ────────────────── */

const STATUS_COLORS: Record<string, string> = {
  in_process: "bg-blue-500/20 text-blue-600",
  work_complete: "bg-amber-500/20 text-amber-600",
  invoiced_closed: "bg-emerald-500/20 text-emerald-600",
};

const BILLING_STATUSES = ["in_process", "work_complete", "invoiced_closed"];

const STATUS_LABELS: Record<string, string> = {
  in_process: "In Process",
  work_complete: "Work Complete",
  invoiced_closed: "Invoiced & Closed",
};

function calcUnits(doses: number, dpu: number | null) {
  if (!dpu || dpu <= 0) return doses;
  return doses / dpu;
}

function formatCurrency(v: number | null) {
  if (v == null) return "$0.00";
  return `$${v.toFixed(2)}`;
}

function formatTime12(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* ────────────────── component ────────────────── */

const ProjectBilling = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [projectBulls, setProjectBulls] = useState<any[]>([]);
  const [billingProducts, setBillingProducts] = useState<BillingProduct[]>([]);

  const [billingId, setBillingId] = useState<string | null>(null);
  const [billingRecord, setBillingRecord] = useState<any>(null);
  const [projectPacks, setProjectPacks] = useState<any[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [sessions, setSessions] = useState<SessionLine[]>([]);
  const [sessionInventory, setSessionInventory] = useState<SessionInventoryLine[]>([]);
  const [generatingWorksheet, setGeneratingWorksheet] = useState(false);
  const [showAddBullToWorksheet, setShowAddBullToWorksheet] = useState(false);
  const [newBullName, setNewBullName] = useState("");
  const [newBullCode, setNewBullCode] = useState("");
  const [newBullCanister, setNewBullCanister] = useState("");
  const [newBullPacked, setNewBullPacked] = useState<number | "">("");
  const [semenLines, setSemenLines] = useState<SemenLine[]>([]);
  // Labor removed — sessions cover it

  const [suggestedDoses, setSuggestedDoses] = useState<Record<string, number>>({});

  // Tab state for the new two-tab layout (Sessions | Billing)
  const [activeTab, setActiveTab] = useState<"sessions" | "billing">("sessions");
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = () => {
    setSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  /* ── debounced save helper ── */
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function debouncedSave(key: string, fn: () => PromiseLike<any>, delay = 500) {
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(async () => {
      const { error } = await fn();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
      } else {
        showSaved();
      }
    }, delay);
  }

  /* ── data loading ── */
  const loadData = useCallback(async () => {
    if (!projectId || !orgId) return;
    setLoading(true);

    const [projRes, eventsRes, bullsRes, productsRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("protocol_events").select("*").eq("project_id", projectId).order("event_date"),
      supabase.from("project_bulls").select("*, bulls_catalog(bull_name, naab_code, registration_number)").eq("project_id", projectId),
      supabase.from("billing_products").select("*").eq("organization_id", orgId).eq("active", true).order("sort_order"),
    ]);

    if (projRes.error || !projRes.data) {
      toast({ title: "Error", description: "Project not found", variant: "destructive" });
      setLoading(false);
      return;
    }

    setProject(projRes.data);
    setEvents(eventsRes.data ?? []);
    setProjectBulls(bullsRes.data ?? []);
    setBillingProducts((productsRes.data ?? []) as BillingProduct[]);

    // Check if billing record exists
    const { data: existingBilling } = await supabase
      .from("project_billing")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    if (existingBilling) {
      setBillingId(existingBilling.id);
      setBillingRecord(existingBilling);
      await loadBillingChildren(existingBilling.id);
      await computeSuggestions(projRes.data, eventsRes.data ?? [], bullsRes.data ?? []);
    } else {
      await createBlankWithSuggestions(
        projRes.data,
        eventsRes.data ?? [],
        bullsRes.data ?? [],
        (productsRes.data ?? []) as BillingProduct[],
      );
    }

    // Fetch pack info for this project (include tank name/number for the status bar)
    const { data: packLinks } = await supabase
      .from("tank_pack_projects")
      .select("tank_pack_id, tank_packs(id, status, pack_type, field_tank_id, tanks:field_tank_id(id, tank_number, tank_name))")
      .eq("project_id", projectId!);
    setProjectPacks((packLinks ?? []).map((pl: any) => pl.tank_packs).filter(Boolean));

    setLoading(false);
  }, [projectId, orgId]);

  async function loadBillingChildren(bId: string) {
    const [prodRes, sessRes, semRes, invRes] = await Promise.all([
      supabase.from("project_billing_products").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_sessions").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_semen").select("*").eq("billing_id", bId).order("sort_order"),
      (supabase.from as any)("project_billing_session_inventory").select("*").eq("billing_id", bId).order("sort_order"),
    ]);
    setProductLines((prodRes.data ?? []) as ProductLine[]);
    setSessions((sessRes.data ?? []) as SessionLine[]);
    setSemenLines((semRes.data ?? []) as SemenLine[]);
    setSessionInventory((invRes.data ?? []) as SessionInventoryLine[]);
  }

  /* ── compute suggestions from project data (head_count + pack lines) ── */
  async function computeSuggestions(proj: any, evts: any[], _bulls?: any[]) {
    const hc = proj.head_count || 0;

    // Dose suggestions: one per event→product mapping using same matching logic
    const doseMap: Record<string, number> = {};
    const skipEvents = ["Return Heat", "Estimated Calving", "MGA Start", "MGA End", "Bulls In"];
    const isMGA = proj.protocol?.toLowerCase().includes("mga");

    for (const evt of evts) {
      const en = (evt.event_name || "").toLowerCase();
      if (skipEvents.some(s => en.includes(s.toLowerCase()))) continue;
      const eventDate = evt.event_date;

      // Build keys matching the product lines that will be/were created
      if (en.includes("pgf") && en.includes("cidr insert")) {
        doseMap[`pgf-${eventDate}`] = hc;
        if (!isMGA) doseMap[`cidr-${eventDate}`] = hc;
      } else if (en.includes("cidr in") || en.includes("cidr insert")) {
        if (!isMGA) doseMap[`cidr-${eventDate}`] = hc;
        if (en.includes("gnrh")) doseMap[`gnrh-${eventDate}`] = hc;
      } else if (en.includes("pgf") || en.includes("cidr out")) {
        doseMap[`pgf-${eventDate}`] = hc;
        if (en.includes("cidr out") && !isMGA) doseMap[`patch-${eventDate}`] = hc;
      } else if (en.includes("gnrh")) {
        doseMap[`gnrh-${eventDate}`] = hc;
      } else if (en.includes("timed breeding") || en.includes("tai") || en.includes("breed")) {
        doseMap[`gnrh-${eventDate}`] = hc;
        doseMap[`service-${eventDate}`] = hc;
      }
    }
    setSuggestedDoses(doseMap);

  }

  /* ── create blank billing with zeroed quantities ── */
  async function createBlankWithSuggestions(proj: any, evts: any[], bulls: any[], products: BillingProduct[]) {
    const { data: billing, error } = await supabase
      .from("project_billing")
      .insert({ project_id: proj.id, organization_id: orgId!, status: "in_process" })
      .select()
      .single();

    if (error || !billing) {
      toast({ title: "Error creating billing sheet", description: error?.message, variant: "destructive" });
      return;
    }

    setBillingId(billing.id);
    setBillingRecord(billing);

    const bId = billing.id;

    // Compute suggestions first
    await computeSuggestions(proj, evts, bulls);

    // ── Products from protocol events (zeroed out) ──
    const newProducts: Omit<ProductLine, "id">[] = [];
    let sortIdx = 0;

    const getDefaultProduct = (cat: string) => products.find(p => p.product_category === cat && p.is_default);
    const getProduct = (cat: string) => products.find(p => p.product_category === cat);

    const skipEvents = ["Return Heat", "Estimated Calving", "MGA Start", "MGA End", "Bulls In"];
    const isMGA = proj.protocol?.toLowerCase().includes("mga");

    for (const evt of evts) {
      const en = (evt.event_name || "").toLowerCase();
      if (skipEvents.some(s => en.includes(s.toLowerCase()))) continue;

      const eventLabel = evt.event_name;
      const eventDate = evt.event_date;

      const makeLine = (prod: BillingProduct, cat: string, label: string): Omit<ProductLine, "id"> => ({
        billing_id: bId, billing_product_id: prod.id, product_name: prod.product_name,
        product_category: cat, protocol_event_label: label, event_date: eventDate,
        doses: 0, doses_per_unit: prod.doses_per_unit, unit_label: prod.unit_label,
        units_calculated: 0, units_billed: 0, units_returned: 0,
        unit_price: prod.default_price, line_total: 0,
        sort_order: sortIdx++,
      });

      if (en.includes("pgf") && en.includes("cidr insert")) {
        const pgfProd = getDefaultProduct("pgf") || getProduct("pgf");
        if (pgfProd) newProducts.push(makeLine(pgfProd, "pgf", eventLabel));
        if (!isMGA) {
          const cidrProd = getDefaultProduct("cidr") || getProduct("cidr");
          if (cidrProd) newProducts.push(makeLine(cidrProd, "cidr", eventLabel));
        }
      } else if (en.includes("cidr in") || en.includes("cidr insert")) {
        if (!isMGA) {
          const cidrProd = getDefaultProduct("cidr") || getProduct("cidr");
          if (cidrProd) newProducts.push(makeLine(cidrProd, "cidr", eventLabel));
        }
        if (en.includes("gnrh")) {
          const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
          if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", eventLabel));
        }
      } else if (en.includes("pgf") || en.includes("cidr out")) {
        const pgfProd = getDefaultProduct("pgf") || getProduct("pgf");
        if (pgfProd) newProducts.push(makeLine(pgfProd, "pgf", eventLabel));
        if (en.includes("cidr out") && !isMGA) {
          const patchProd = getDefaultProduct("patch") || getProduct("patch");
          if (patchProd) newProducts.push(makeLine(patchProd, "patch", eventLabel));
        }
      } else if (en.includes("gnrh")) {
        const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
        if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", eventLabel));
      } else if (en.includes("timed breeding") || en.includes("tai") || en.includes("breed")) {
        const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
        if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", "Breeding (Mass GnRH)"));
        const svcProd = getDefaultProduct("service") || getProduct("service");
        if (svcProd) newProducts.push(makeLine(svcProd, "service", eventLabel));
      }
    }

    if (newProducts.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_products").insert(newProducts).select();
      setProductLines((inserted ?? []) as ProductLine[]);
    }

    // ── Sessions from protocol events (dates/labels pre-fill, quantities blank) ──
    const sessionSkip = ["return heat", "estimated calving"];
    const newSessions: Omit<SessionLine, "id">[] = evts
      .filter(e => !sessionSkip.some(s => (e.event_name || "").toLowerCase().includes(s)))
      .map((e, i) => ({
        billing_id: bId,
        session_date: e.event_date,
        session_label: e.event_name,
        time_of_day: e.event_time ? formatTime12(e.event_time) : null,
        head_count: null,
        crew: null,
        notes: null,
        sort_order: i,
      }));

    if (newSessions.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_sessions").insert(newSessions).select();
      setSessions((inserted ?? []) as SessionLine[]);
    }

    // ── Semen from project bulls, auto-filled with actual pack data ──
    const { data: semenPackProjects } = await supabase
      .from("tank_pack_projects")
      .select("tank_pack_id")
      .eq("project_id", proj.id);

    const packedByBull: Record<string, number> = {};
    if (semenPackProjects && semenPackProjects.length > 0) {
      const semenPackIds = semenPackProjects.map(pp => pp.tank_pack_id);
      const { data: semenPackLines } = await supabase
        .from("tank_pack_lines")
        .select("bull_catalog_id, bull_name, units")
        .in("tank_pack_id", semenPackIds);
      for (const pl of semenPackLines ?? []) {
        const key = pl.bull_catalog_id || pl.bull_name;
        packedByBull[key] = (packedByBull[key] || 0) + pl.units;
      }
    }

    const newSemen: Omit<SemenLine, "id">[] = bulls.map((b, i) => {
      const bullName = b.bulls_catalog?.bull_name || b.custom_bull_name || "Unknown";
      const bullCode = b.bulls_catalog?.naab_code || null;
      const catalogId = b.bull_catalog_id;
      const packed = packedByBull[catalogId || bullName] || 0;

      return {
        billing_id: bId,
        bull_catalog_id: catalogId,
        bull_name: bullName,
        bull_code: bullCode,
        units_packed: packed,
        units_returned: 0,
        units_blown: 0,
        units_billable: packed,
        unit_price: 0,
        line_total: 0,
        sort_order: i,
      };
    });

    if (newSemen.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_semen").insert(newSemen).select();
      setSemenLines((inserted ?? []) as SemenLine[]);
    }
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── save helpers ── */

  function saveBillingField(field: string, value: any) {
    if (!billingId) return;
    debouncedSave(`billing-${field}`, () =>
      supabase.from("project_billing").update({ [field]: value }).eq("id", billingId)
    );
    setBillingRecord((prev: any) => ({ ...prev, [field]: value }));
  }

  function saveProductLine(idx: number, updates: Partial<ProductLine>) {
    const line = { ...productLines[idx], ...updates };
    // recalc
    const uc = calcUnits(line.doses, line.doses_per_unit);
    line.units_calculated = uc;
    if (updates.doses !== undefined || updates.doses_per_unit !== undefined) {
      line.units_billed = uc;
    }
    line.line_total = (line.units_billed ?? uc) * (line.unit_price ?? 0);

    const newLines = [...productLines];
    newLines[idx] = line;
    setProductLines(newLines);

    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`product-${id}`, () =>
        supabase.from("project_billing_products").update(rest).eq("id", id)
      );
    }
  }

  /* ────────────────── Session Inventory Worksheet ────────────────── */

  async function generateWorksheet() {
    if (!billingId || !project) return;
    if (sessions.length === 0) {
      toast({ title: "No sessions", description: "Add Field Sessions first before generating a worksheet.", variant: "destructive" });
      return;
    }
    setGeneratingWorksheet(true);
    try {
      const { data: packProjects } = await supabase
        .from("tank_pack_projects")
        .select("tank_pack_id")
        .eq("project_id", project.id);

      if (!packProjects || packProjects.length === 0) {
        toast({ title: "No packs", description: "This project has no packs yet. Pack it first, then generate the worksheet.", variant: "destructive" });
        return;
      }
      const packIds = packProjects.map(pp => pp.tank_pack_id);

      const { data: packLines } = await supabase
        .from("tank_pack_lines")
        .select("bull_catalog_id, bull_name, bull_code, field_canister, units")
        .in("tank_pack_id", packIds);

      if (!packLines || packLines.length === 0) {
        toast({ title: "No pack lines", description: "Packs exist but have no lines.", variant: "destructive" });
        return;
      }

      const comboMap = new Map<string, { bull_catalog_id: string | null; bull_name: string; bull_code: string | null; canister: string; packed_units: number }>();
      for (const pl of packLines) {
        const canister = pl.field_canister || "1";
        const bullKey = pl.bull_catalog_id || `name:${pl.bull_name}`;
        const comboKey = `${bullKey}|${canister}`;
        if (comboMap.has(comboKey)) {
          comboMap.get(comboKey)!.packed_units += pl.units;
        } else {
          comboMap.set(comboKey, {
            bull_catalog_id: pl.bull_catalog_id,
            bull_name: pl.bull_name,
            bull_code: pl.bull_code,
            canister,
            packed_units: pl.units,
          });
        }
      }
      const combos = Array.from(comboMap.values()).sort((a, b) => {
        const nameCmp = a.bull_name.localeCompare(b.bull_name);
        if (nameCmp !== 0) return nameCmp;
        return a.canister.localeCompare(b.canister, undefined, { numeric: true });
      });

      await (supabase.from as any)("project_billing_session_inventory")
        .delete()
        .eq("billing_id", billingId);

      const newRows: Omit<SessionInventoryLine, "id">[] = [];
      let sortIdx = 0;
      // Only include breeding sessions — product events (CIDR, PGF, GnRH, MGA) don't involve semen
      const breedingSessions = sessions.filter(s => {
        const label = (s.session_label || "").toLowerCase();
        return label.includes("breed") || label.includes("ai ") || label === "ai";
      });

      if (breedingSessions.length === 0) {
        toast({ title: "No breeding sessions", description: "None of the sessions are breeding events. The inventory worksheet only tracks semen usage during breeding sessions (e.g. 'Timed Breeding').", variant: "destructive" });
        setGeneratingWorksheet(false);
        return;
      }

      const sortedSessions = [...breedingSessions].sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.session_date.localeCompare(b.session_date);
      });
      for (const combo of combos) {
        let sessIdx = 0;
        for (const sess of sortedSessions) {
          newRows.push({
            billing_id: billingId,
            session_id: sess.id!,
            bull_catalog_id: combo.bull_catalog_id,
            bull_name: combo.bull_name,
            bull_code: combo.bull_code,
            canister: combo.canister,
            start_units: sessIdx === 0 ? combo.packed_units : null,
            end_units: null,
            returned_units: null,
            sort_order: sortIdx++,
          });
          sessIdx++;
        }
      }

      const { data: inserted, error } = await (supabase.from as any)("project_billing_session_inventory")
        .insert(newRows)
        .select();
      if (error) throw error;

      setSessionInventory((inserted ?? []) as SessionInventoryLine[]);
      toast({ title: "Worksheet generated", description: `Created ${newRows.length} tracking rows.` });
    } catch (err: any) {
      toast({ title: "Failed to generate worksheet", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setGeneratingWorksheet(false);
    }
  }

  async function saveWorksheetCell(rowId: string, field: "start_units" | "end_units", value: number | null) {
    setSessionInventory(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
    const { error } = await (supabase.from as any)("project_billing_session_inventory")
      .update({ [field]: value })
      .eq("id", rowId);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  }

  async function saveReturnedUnits(bullKey: string, canister: string, value: number | null) {
    const row = sessionInventory.find(r => {
      const rKey = r.bull_catalog_id || `name:${r.bull_name}`;
      return rKey === bullKey && r.canister === canister;
    });
    if (!row?.id) return;

    setSessionInventory(prev => prev.map(r => r.id === row.id ? { ...r, returned_units: value } : r));

    const { error } = await (supabase.from as any)("project_billing_session_inventory")
      .update({ returned_units: value })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  }

  async function addWorksheetSession() {
    if (!billingId) return;

    const breedingSessions = sessions.filter(s => {
      const label = (s.session_label || "").toLowerCase();
      return label.includes("breed") || label.includes("ai ") || label === "ai";
    });

    const lastDate = breedingSessions.length > 0
      ? breedingSessions.sort((a, b) => b.session_date.localeCompare(a.session_date))[0].session_date
      : format(new Date(), "yyyy-MM-dd");

    const nextDate = new Date(lastDate + "T12:00:00");
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = format(nextDate, "yyyy-MM-dd");

    const { data: newSession, error: sessErr } = await supabase
      .from("project_billing_sessions")
      .insert({
        billing_id: billingId,
        session_date: nextDateStr,
        session_label: "Timed Breeding",
        sort_order: (breedingSessions.length + 1) * 10,
      })
      .select()
      .single();

    if (sessErr || !newSession) {
      toast({ title: "Failed to add session", description: sessErr?.message, variant: "destructive" });
      return;
    }

    setSessions(prev => [...prev, newSession as SessionLine]);

    const existingCombos = new Map<string, { bull_catalog_id: string | null; bull_name: string; bull_code: string | null; canister: string }>();
    for (const inv of sessionInventory) {
      const key = `${inv.bull_catalog_id || inv.bull_name}|${inv.canister}`;
      if (!existingCombos.has(key)) {
        existingCombos.set(key, {
          bull_catalog_id: inv.bull_catalog_id,
          bull_name: inv.bull_name,
          bull_code: inv.bull_code,
          canister: inv.canister,
        });
      }
    }

    const newRows = Array.from(existingCombos.values()).map((combo, idx) => ({
      billing_id: billingId,
      session_id: (newSession as any).id,
      bull_catalog_id: combo.bull_catalog_id,
      bull_name: combo.bull_name,
      bull_code: combo.bull_code,
      canister: combo.canister,
      start_units: null,
      end_units: null,
      sort_order: idx,
    }));

    if (newRows.length > 0) {
      const { data: inserted, error: invErr } = await (supabase.from as any)("project_billing_session_inventory")
        .insert(newRows)
        .select();

      if (invErr) {
        toast({ title: "Failed to add session rows", description: invErr.message, variant: "destructive" });
        return;
      }

      setSessionInventory(prev => [...prev, ...((inserted ?? []) as SessionInventoryLine[])]);
    }
    toast({ title: "Session added" });
  }

  async function addBullToWorksheet() {
    if (!billingId || !newBullName.trim() || !newBullCanister.trim()) return;

    const breedingSessions = sessions.filter(s => {
      const label = (s.session_label || "").toLowerCase();
      return label.includes("breed") || label.includes("ai ") || label === "ai";
    });
    const sortedSessions = [...breedingSessions].sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date)
    );

    if (sortedSessions.length === 0) {
      toast({ title: "No breeding sessions", description: "Add a breeding session first.", variant: "destructive" });
      return;
    }

    const packed = typeof newBullPacked === "number" ? newBullPacked : 0;

    const newRows = sortedSessions.map((s, idx) => ({
      billing_id: billingId,
      session_id: s.id!,
      bull_catalog_id: null,
      bull_name: newBullName.trim(),
      bull_code: newBullCode.trim() || null,
      canister: newBullCanister.trim(),
      start_units: idx === 0 ? packed : null,
      end_units: null,
      sort_order: (sessionInventory.length + idx),
    }));

    const { data: inserted, error } = await (supabase.from as any)("project_billing_session_inventory")
      .insert(newRows)
      .select();

    if (error) {
      toast({ title: "Failed to add bull", description: error.message, variant: "destructive" });
      return;
    }

    setSessionInventory(prev => [...prev, ...((inserted ?? []) as SessionInventoryLine[])]);
    setShowAddBullToWorksheet(false);
    setNewBullName("");
    setNewBullCode("");
    setNewBullCanister("");
    setNewBullPacked("");
    toast({ title: `${newBullName.trim()} added to worksheet` });
  }

  async function deleteWorksheetCanister(bullKey: string, canister: string) {
    const rowIds = sessionInventory
      .filter(r => (r.bull_catalog_id || `name:${r.bull_name}`) === bullKey && r.canister === canister)
      .map(r => r.id)
      .filter(Boolean) as string[];

    if (rowIds.length === 0) return;

    const { error } = await (supabase.from as any)("project_billing_session_inventory")
      .delete()
      .in("id", rowIds);

    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }

    setSessionInventory(prev => prev.filter(r => !rowIds.includes(r.id!)));
    toast({ title: "Canister removed from worksheet" });
  }

  function buildWorksheetRows(): WorksheetRow[] {
    const breedingSessions = sessions.filter(s => {
      const label = (s.session_label || "").toLowerCase();
      return label.includes("breed") || label.includes("ai ") || label === "ai";
    });

    const map = new Map<string, WorksheetRow>();
    for (const inv of sessionInventory) {
      const sess = breedingSessions.find(s => s.id === inv.session_id);
      if (!sess) continue;

      const bullKey = inv.bull_catalog_id || `name:${inv.bull_name}`;
      const key = `${bullKey}|${inv.canister}`;
      if (!map.has(key)) {
        map.set(key, {
          bull_catalog_id: inv.bull_catalog_id,
          bull_name: inv.bull_name,
          bull_code: inv.bull_code,
          canister: inv.canister,
          packed_units: 0,
          returned_units: inv.returned_units ?? null,
          cellsBySessionId: {},
        });
      }
      const row = map.get(key)!;
      if (inv.returned_units != null) {
        row.returned_units = inv.returned_units;
      }
      row.cellsBySessionId[inv.session_id] = {
        start_units: inv.start_units,
        end_units: inv.end_units,
        id: inv.id,
      };
    }

    const sortedSessions = [...breedingSessions].sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date)
    );
    const firstSessionId = sortedSessions[0]?.id;
    for (const row of map.values()) {
      if (firstSessionId && row.cellsBySessionId[firstSessionId]) {
        row.packed_units = row.cellsBySessionId[firstSessionId].start_units ?? 0;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const n = a.bull_name.localeCompare(b.bull_name);
      if (n !== 0) return n;
      return a.canister.localeCompare(b.canister, undefined, { numeric: true });
    });
  }

  function saveSessionLine(idx: number, updates: Partial<SessionLine>) {
    const line = { ...sessions[idx], ...updates };
    const newLines = [...sessions];
    newLines[idx] = line;
    setSessions(newLines);

    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`session-${id}`, () =>
        supabase.from("project_billing_sessions").update(rest).eq("id", id)
      );
    }
  }

  function saveSemenLine(idx: number, updates: Partial<SemenLine>) {
    const line = { ...semenLines[idx], ...updates };
    line.units_billable = Math.max(0, (line.units_packed ?? 0) - (line.units_returned ?? 0) - (line.units_blown ?? 0));
    line.line_total = (line.units_billable ?? 0) * (line.unit_price ?? 0);

    const newLines = [...semenLines];
    newLines[idx] = line;
    setSemenLines(newLines);

    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`semen-${id}`, () =>
        supabase.from("project_billing_semen").update(rest).eq("id", id)
      );
    }
  }

  /* ── add / remove helpers ── */

  async function addProductLine() {
    if (!billingId) return;
    const defaultProd = billingProducts[0];
    const newLine: Omit<ProductLine, "id"> = {
      billing_id: billingId,
      billing_product_id: defaultProd?.id || null,
      product_name: defaultProd?.product_name || "New Product",
      product_category: defaultProd?.product_category || null,
      protocol_event_label: "Manual",
      event_date: null,
      doses: project?.head_count || 0,
      doses_per_unit: defaultProd?.doses_per_unit || null,
      unit_label: defaultProd?.unit_label || null,
      units_calculated: 0, units_billed: 0, units_returned: 0,
      unit_price: defaultProd?.default_price || 0,
      line_total: 0,
      sort_order: productLines.length,
    };
    const { data, error } = await supabase.from("project_billing_products").insert(newLine).select().single();
    if (data) setProductLines(prev => [...prev, data as ProductLine]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  }

  async function removeProductLine(idx: number) {
    const line = productLines[idx];
    if (line.id) {
      await supabase.from("project_billing_products").delete().eq("id", line.id);
    }
    setProductLines(prev => prev.filter((_, i) => i !== idx));
    showSaved();
  }

  async function addSession() {
    if (!billingId) return;
    const newLine: Omit<SessionLine, "id"> = {
      billing_id: billingId,
      session_date: format(new Date(), "yyyy-MM-dd"),
      session_label: "Additional Visit",
      time_of_day: null, head_count: null, crew: null, notes: null,
      sort_order: sessions.length,
    };
    const { data } = await supabase.from("project_billing_sessions").insert(newLine).select().single();
    if (data) setSessions(prev => [...prev, data as SessionLine]);
  }

  async function removeSession(idx: number) {
    const line = sessions[idx];
    if (line.id) await supabase.from("project_billing_sessions").delete().eq("id", line.id);
    setSessions(prev => prev.filter((_, i) => i !== idx));
    showSaved();
  }

  /* ── invoiced toggle helpers ── */
  function toggleProductInvoiced(idx: number) {
    const nowInvoiced = !productLines[idx].invoiced;
    saveProductLine(idx, {
      invoiced: nowInvoiced,
      invoiced_at: nowInvoiced ? new Date().toISOString() : null,
    });
  }
  function toggleSemenInvoiced(idx: number) {
    const nowInvoiced = !semenLines[idx].invoiced;
    saveSemenLine(idx, {
      invoiced: nowInvoiced,
      invoiced_at: nowInvoiced ? new Date().toISOString() : null,
    });
  }
  function toggleSessionInvoiced(idx: number) {
    const nowInvoiced = !sessions[idx].invoiced;
    saveSessionLine(idx, {
      invoiced: nowInvoiced,
      invoiced_at: nowInvoiced ? new Date().toISOString() : null,
    });
  }

  /* ── totals ── */
  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const productsInvoiced = productLines.filter(l => l.invoiced).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenInvoiced = semenLines.filter(l => l.invoiced).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const grandTotal = productsTotal + semenTotal;
  const grandInvoiced = productsInvoiced + semenInvoiced;
  const grandOutstanding = grandTotal - grandInvoiced;

  /* ── closeout checklist ── */
  const hasPack = projectPacks.length > 0;
  const packStatus = projectPacks[0]?.status || null;
  const isUnpacked = packStatus === "unpacked" || packStatus === "tank_returned";
  const hasSessions = sessions.length > 0;
  const worksheetDone = sessionInventory.length > 0 && sessionInventory.every(
    (si) => si.start_units != null && si.end_units != null
  );
  const blownEntered = semenLines.length > 0 && semenLines.every(
    (sl) => sl.units_blown != null
  );
  const inventoryFinalized = !!billingRecord?.inventory_finalized_at;
  const totalLines = productLines.length + semenLines.length + sessions.length;
  const allInvoiced = totalLines > 0 && [
    ...productLines.map(l => l.invoiced),
    ...semenLines.map(l => l.invoiced),
    ...sessions.map(l => l.invoiced),
  ].every(Boolean);
  const isProjectComplete = project?.status === "Complete";
  const readOnly = isProjectComplete || billingRecord?.status === "work_complete" || billingRecord?.status === "invoiced_closed";

  /* ── auto-fill returned units from worksheet ── */
  const worksheetReturnedByBull = useMemo(() => {
    const counted = new Set<string>();
    const result: Record<string, number> = {};
    for (const si of sessionInventory) {
      const bullKey = si.bull_catalog_id || `name:${si.bull_name}`;
      const canKey = `${bullKey}:${si.canister}`;
      if (si.returned_units != null && !counted.has(canKey)) {
        result[bullKey] = (result[bullKey] || 0) + si.returned_units;
        counted.add(canKey);
      }
    }
    return result;
  }, [sessionInventory]);

  useEffect(() => {
    if (Object.keys(worksheetReturnedByBull).length === 0) return;
    let changed = false;
    const updated = semenLines.map(sl => {
      const key = sl.bull_catalog_id || `name:${sl.bull_name}`;
      const wsReturned = worksheetReturnedByBull[key] ?? 0;
      if (sl.units_returned !== wsReturned) {
        changed = true;
        const newBillable = Math.max(0, (sl.units_packed ?? 0) - wsReturned - (sl.units_blown ?? 0));
        return {
          ...sl,
          units_returned: wsReturned,
          units_billable: newBillable,
          line_total: newBillable * (sl.unit_price ?? 0),
        };
      }
      return sl;
    });
    if (changed) {
      setSemenLines(updated);
      for (const sl of updated) {
        const original = semenLines.find(s => s.id === sl.id);
        if (sl.id && original && sl.units_returned !== original.units_returned) {
          debouncedSave(`semen-ret-${sl.id}`, () =>
            supabase.from("project_billing_semen").update({
              units_returned: sl.units_returned,
              units_billable: sl.units_billable,
              line_total: sl.line_total,
            }).eq("id", sl.id!)
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worksheetReturnedByBull]);

  /* ── product swap ── */
  function swapProduct(idx: number, newProductId: string) {
    const prod = billingProducts.find(p => p.id === newProductId);
    if (!prod) return;
    saveProductLine(idx, {
      billing_product_id: prod.id,
      product_name: prod.product_name,
      product_category: prod.product_category,
      doses_per_unit: prod.doses_per_unit,
      unit_label: prod.unit_label,
      unit_price: prod.default_price,
    });
  }

  /* ── Auto-advance billing status ── */
  useEffect(() => {
    if (!billingRecord || readOnly) return;
    const currentStatus = billingRecord.status;

    // Auto-advance to work_complete when all closeout items are done
    if (currentStatus === "in_process" && hasPack && isUnpacked && inventoryFinalized && hasSessions) {
      saveBillingField("status", "work_complete");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPack, isUnpacked, inventoryFinalized, hasSessions, billingRecord?.status]);

  /* ── Finalize Inventory ── */
  async function handleFinalizeInventory() {
    if (!billingId || !orgId) return;
    setFinalizing(true);
    try {
      const { data, error } = await (supabase.rpc as any)("finalize_billing_inventory", {
        _input: { organization_id: orgId, billing_id: billingId }
      });
      if (error) throw error;
      const result = data as { ok?: boolean; bulls_processed?: number; units_consumed?: number } | null;
      if (!result?.ok) throw new Error("Finalize failed");
      toast({
        title: "Inventory finalized",
        description: `${result.units_consumed ?? 0} units consumed across ${result.bulls_processed ?? 0} bull(s).`,
      });
      const { data: refreshed } = await supabase
        .from("project_billing")
        .select("*")
        .eq("id", billingId)
        .maybeSingle();
      if (refreshed) setBillingRecord(refreshed);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not finalize inventory.", variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  }

  /* ── Complete Project ── */
  const [completing, setCompleting] = useState(false);

  async function handleCompleteProject() {
    if (!projectId || !billingId) return;
    setCompleting(true);
    try {
      const { error: projErr } = await supabase
        .from("projects")
        .update({ status: "Complete" })
        .eq("id", projectId);
      if (projErr) throw projErr;

      const userId = (await supabase.auth.getUser()).data.user?.id || null;
      const { error: billErr } = await (supabase
        .from("project_billing") as any)
        .update({
          billing_completed_at: new Date().toISOString(),
          billing_completed_by: userId,
        })
        .eq("id", billingId);
      if (billErr) throw billErr;

      toast({ title: "Project completed" });
      setProject((prev: any) => ({ ...prev, status: "Complete" }));
      setBillingRecord((prev: any) => ({
        ...prev,
        billing_completed_at: new Date().toISOString(),
      }));
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not complete project.", variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  }

  /* ── PDF ── */
  function handlePrint() {
    if (!project || !billingRecord) return;
    generateBillingSheetPdf(project, billingRecord, productLines, semenLines, sessions, [], {
      productsTotal, semenTotal, laborTotal: 0, grandTotal,
    }, sessionInventory);
    toast({ title: "PDF downloaded" });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Project not found.</p>
          <Button className="mt-4" onClick={() => navigate("/operations")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const currentStatus = billingRecord?.status || "in_process";

  /* ── Group products by session_id for the Sessions tab ── */
  const productsBySession = useMemo(() => {
    const map = new Map<string | null, ProductLine[]>();
    for (const p of productLines) {
      const key = p.session_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [productLines]);

  /* ── Helper: detect breeding sessions ── */
  function isBreedingSession(s: SessionLine) {
    const label = (s.session_label || "").toLowerCase();
    return label.includes("breed") || label.includes("ai ") || label === "ai" || label.includes("tai");
  }

  /* ── Toggle a session card open/closed ── */
  function toggleSession(sessionId: string) {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  /* ── Sessions sorted chronologically (with sort_order tiebreaker) ── */
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const dateCmp = a.session_date.localeCompare(b.session_date);
      if (dateCmp !== 0) return dateCmp;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [sessions]);

  /* ── Field tank label for the pack status bar ── */
  const firstPack: any = projectPacks[0] || null;
  const packTankLabel = firstPack?.tanks
    ? (firstPack.tanks.tank_name || firstPack.tanks.tank_number || "")
    : "";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge className="bg-primary/20 text-primary border-primary/30">{project.protocol}</Badge>
                <Badge variant="outline">{project.cattle_type} · {project.head_count} head</Badge>
                {project.breeding_date && (
                  <Badge variant="outline">Breed: {format(parseISO(project.breeding_date), "MMM d, yyyy")}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={currentStatus}
              onValueChange={(v) => saveBillingField("status", v)}
              disabled={readOnly && currentStatus !== "work_complete"}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[currentStatus] || ""}`}>
                    {STATUS_LABELS[currentStatus] || currentStatus}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BILLING_STATUSES.map(s => {
                  const disabled = s === "invoiced_closed" && !allInvoiced && currentStatus !== "invoiced_closed";
                  return (
                    <SelectItem key={s} value={s} disabled={disabled}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrint} title="Print PDF">
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Pack status bar ── */}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-muted/50 rounded-lg flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            {hasPack ? (
              <>
                {isUnpacked ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                )}
                <span className="font-medium">
                  {isUnpacked ? "Unpacked" : "Packed"}
                </span>
                {packTankLabel && (
                  <span className="text-muted-foreground">
                    — Tank #{packTankLabel}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Not packed</span>
            )}
          </div>
          <div className="flex gap-2">
            {!hasPack && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => navigate(`/pack-tank?projectId=${projectId}`)}>
                <Package className="h-3.5 w-3.5 mr-1" />
                Pack Tank
              </Button>
            )}
            {hasPack && firstPack && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => navigate(`/pack/${firstPack.id}`)}>
                View Pack
              </Button>
            )}
            {hasPack && !isUnpacked && firstPack && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => navigate(`/unpack/${firstPack.id}`)}>
                <PackageOpen className="h-3.5 w-3.5 mr-1" />
                Unpack Tank
              </Button>
            )}
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab("sessions")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "sessions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Sessions
          </button>
          <button
            onClick={() => setActiveTab("billing")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "billing"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Billing
          </button>
        </div>

        <fieldset disabled={readOnly} className="contents [&_button]:disabled:pointer-events-auto">

        {/* ════════════════════ SESSIONS TAB ════════════════════ */}
        {activeTab === "sessions" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {sortedSessions.length} session{sortedSessions.length === 1 ? "" : "s"}
              </p>
              {!readOnly && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addSession}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Session
                </Button>
              )}
            </div>

            {sortedSessions.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No sessions yet. Add a session to start tracking field activity and billing.
                </CardContent>
              </Card>
            )}

            {sortedSessions.map((s) => {
              const sessionIdx = sessions.findIndex(x => x.id === s.id);
              const sessionId = s.id || "";
              const isExpanded = expandedSessions.has(sessionId);
              const sessionProducts = productsBySession.get(sessionId) || [];
              const sessionTotal = sessionProducts.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
              const allSessionInvoiced = sessionProducts.length > 0 &&
                sessionProducts.every(p => p.invoiced) &&
                (s.invoiced ?? false);
              const isCustomerAdmin = s.session_type === "customer_administered";
              const isBreed = isBreedingSession(s);
              const breedInventoryRows = isBreed
                ? sessionInventory.filter(si => si.session_id === sessionId)
                : [];

              return (
                <Card key={sessionId} className="overflow-hidden">
                  {/* Collapsed header — clickable */}
                  <button
                    type="button"
                    onClick={() => toggleSession(sessionId)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {format(parseISO(s.session_date), "MMM d, yyyy")}
                        </span>
                        <span className="text-sm text-muted-foreground">·</span>
                        <span className="text-sm">{s.session_label || "Session"}</span>
                        {isCustomerAdmin && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">Customer</Badge>
                        )}
                        {isBreed && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">
                            Breeding
                          </Badge>
                        )}
                        {allSessionInvoiced && (
                          <Badge className="text-[10px] py-0 px-1.5 bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/15">
                            Previously invoiced
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">
                      {formatCurrency(sessionTotal)}
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <CardContent className="border-t pt-4 space-y-4">
                      {/* Session details row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="text-muted-foreground">Time</label>
                          <Input
                            className="h-8 text-xs mt-1"
                            value={s.time_of_day || ""}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(e) => saveSessionLine(sessionIdx, { time_of_day: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground">Head Count</label>
                          <Input
                            type="number"
                            className="h-8 text-xs mt-1"
                            value={s.head_count ?? ""}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(e) => saveSessionLine(sessionIdx, {
                              head_count: e.target.value ? Number(e.target.value) : null
                            })}
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground">Crew</label>
                          <Input
                            className="h-8 text-xs mt-1"
                            value={s.crew || ""}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(e) => saveSessionLine(sessionIdx, { crew: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground">Notes</label>
                          <Input
                            className="h-8 text-xs mt-1"
                            value={s.notes || ""}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(e) => saveSessionLine(sessionIdx, { notes: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Customer-administered short-circuit */}
                      {isCustomerAdmin ? (
                        <p className="text-sm text-muted-foreground italic">
                          Products accounted for in customer pickup. No billable activity.
                        </p>
                      ) : (
                        <>
                          {/* Products for this session */}
                          {sessionProducts.length > 0 ? (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[180px]">Product</TableHead>
                                    <TableHead className="w-[80px] text-right">Doses</TableHead>
                                    <TableHead className="w-[100px] text-right">Units</TableHead>
                                    <TableHead className="w-[90px] text-right">Price</TableHead>
                                    <TableHead className="w-[100px] text-right">Total</TableHead>
                                    <TableHead className="w-[50px] text-center">Inv.</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sessionProducts.map((line) => {
                                    const idx = productLines.findIndex(p => p.id === line.id);
                                    const categoryProducts = billingProducts.filter(
                                      p => p.product_category === line.product_category
                                    );
                                    return (
                                      <TableRow key={line.id || idx}>
                                        <TableCell className="text-sm">
                                          {!readOnly && categoryProducts.length > 1 ? (
                                            <Select
                                              value={line.billing_product_id || ""}
                                              onValueChange={(v) => swapProduct(idx, v)}
                                            >
                                              <SelectTrigger className="h-8 text-xs">
                                                <SelectValue>{line.product_name}</SelectValue>
                                              </SelectTrigger>
                                              <SelectContent>
                                                {categoryProducts.map(p => (
                                                  <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          ) : (
                                            <span>{line.product_name}</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="number"
                                            className="h-8 w-[70px] text-right text-xs ml-auto"
                                            value={line.doses || ""}
                                            placeholder="—"
                                            disabled={readOnly}
                                            onChange={(e) => saveProductLine(idx, { doses: Number(e.target.value) || 0 })}
                                          />
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                          {(line.units_billed ?? line.units_calculated ?? 0).toFixed(1)} {line.unit_label || ""}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            className="h-8 w-[80px] text-right text-xs ml-auto"
                                            value={line.unit_price ?? ""}
                                            disabled={readOnly}
                                            onChange={(e) => saveProductLine(idx, { unit_price: Number(e.target.value) || 0 })}
                                          />
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-medium">
                                          {formatCurrency(line.line_total)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          <Checkbox
                                            checked={!!line.invoiced}
                                            onCheckedChange={() => toggleProductInvoiced(idx)}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No products on this session.</p>
                          )}

                          {/* Breeding session: semen inventory tracking */}
                          {isBreed && breedInventoryRows.length > 0 && (
                            <div className="space-y-2 pt-2">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Semen inventory
                              </div>
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Bull</TableHead>
                                      <TableHead className="w-[60px] text-center">Can.</TableHead>
                                      <TableHead className="w-[80px] text-right">Start</TableHead>
                                      <TableHead className="w-[80px] text-right">End</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {breedInventoryRows.map((row) => (
                                      <TableRow key={row.id}>
                                        <TableCell className="text-xs">
                                          {row.bull_name}
                                          {row.bull_code && (
                                            <span className="ml-1 text-muted-foreground">· {row.bull_code}</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-center text-xs font-mono">{row.canister}</TableCell>
                                        <TableCell className="p-1">
                                          <Input
                                            type="number"
                                            className="h-8 w-full text-right text-xs"
                                            value={row.start_units ?? ""}
                                            placeholder="—"
                                            disabled={readOnly}
                                            onBlur={(e) => {
                                              if (!row.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              if (v !== row.start_units) saveWorksheetCell(row.id, "start_units", v);
                                            }}
                                            onChange={(e) => {
                                              if (!row.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              setSessionInventory(prev => prev.map(r =>
                                                r.id === row.id ? { ...r, start_units: v } : r
                                              ));
                                            }}
                                          />
                                        </TableCell>
                                        <TableCell className="p-1">
                                          <Input
                                            type="number"
                                            className="h-8 w-full text-right text-xs"
                                            value={row.end_units ?? ""}
                                            placeholder="—"
                                            disabled={readOnly}
                                            onBlur={(e) => {
                                              if (!row.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              if (v !== row.end_units) saveWorksheetCell(row.id, "end_units", v);
                                            }}
                                            onChange={(e) => {
                                              if (!row.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              setSessionInventory(prev => prev.map(r =>
                                                r.id === row.id ? { ...r, end_units: v } : r
                                              ));
                                            }}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {!readOnly && (
                        <div className="flex justify-end pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => removeSession(sessionIdx)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove session
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {/* Standalone (unassigned) products card */}
            {(productsBySession.get(null)?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Unassigned products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Date</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="w-[80px] text-right">Doses</TableHead>
                          <TableHead className="w-[100px] text-right">Total</TableHead>
                          <TableHead className="w-[50px] text-center">Inv.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(productsBySession.get(null) || []).map((line) => {
                          const idx = productLines.findIndex(p => p.id === line.id);
                          return (
                            <TableRow key={line.id || idx}>
                              <TableCell className="text-xs">
                                {line.event_date ? format(parseISO(line.event_date), "MMM d") : "—"}
                              </TableCell>
                              <TableCell className="text-sm">{line.product_name}</TableCell>
                              <TableCell className="text-right text-sm">{line.doses || "—"}</TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {formatCurrency(line.line_total)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={!!line.invoiced}
                                  onCheckedChange={() => toggleProductInvoiced(idx)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ════════════════════ BILLING TAB (placeholder — built in Prompt 2) ════════════════════ */}
        {activeTab === "billing" && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Billing summary — coming in next prompt
            </CardContent>
          </Card>
        )}


        {/* Add Bull to Worksheet Dialog — accessible from any tab */}
        <Dialog open={showAddBullToWorksheet} onOpenChange={setShowAddBullToWorksheet}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add bull to worksheet</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                <Label className="text-right text-sm">Bull Name *</Label>
                <Input value={newBullName} onChange={(e) => setNewBullName(e.target.value)} placeholder="e.g. Restore" />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                <Label className="text-right text-sm">Bull Code</Label>
                <Input value={newBullCode} onChange={(e) => setNewBullCode(e.target.value)} placeholder="e.g. 7AN779 (optional)" />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                <Label className="text-right text-sm">Canister *</Label>
                <Input value={newBullCanister} onChange={(e) => setNewBullCanister(e.target.value)} placeholder="e.g. 1" />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                <Label className="text-right text-sm">Packed</Label>
                <Input type="number" value={newBullPacked} onChange={(e) => setNewBullPacked(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Units packed" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddBullToWorksheet(false)}>Cancel</Button>
              <Button onClick={addBullToWorksheet} disabled={!newBullName.trim() || !newBullCanister.trim()}>
                Add to Worksheet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        </fieldset>
      </main>

      {/* Fixed-position save confirmation */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
            <Check className="h-4 w-4" />
            Saved
          </div>
        </div>
      )}
      <AppFooter />
    </div>
  );
};

export default ProjectBilling;
