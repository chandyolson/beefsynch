import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Plus, Check, Trash2, Package, Loader2 } from "lucide-react";
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

interface LaborLine {
  id?: string;
  billing_id: string;
  description: string;
  labor_dates: string | null;
  amount: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
}

/* ────────────────── helpers ────────────────── */

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-warning/20 text-warning",
  invoiced: "bg-primary/20 text-primary",
  paid: "bg-emerald-500 text-white",
};

const BILLING_STATUSES = ["draft", "review", "invoiced", "paid"];

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
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);

  const [suggestedDoses, setSuggestedDoses] = useState<Record<string, number>>({});
  const [suggestedPackedUnits, setSuggestedPackedUnits] = useState<Record<string, number>>({});

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

    // Fetch pack info for this project
    const { data: packLinks } = await supabase
      .from("tank_pack_projects")
      .select("tank_pack_id, tank_packs(id, status, pack_type, field_tank_id)")
      .eq("project_id", projectId!);
    setProjectPacks((packLinks ?? []).map((pl: any) => pl.tank_packs).filter(Boolean));

    setLoading(false);
  }, [projectId, orgId]);

  async function loadBillingChildren(bId: string) {
    const [prodRes, sessRes, semRes, labRes, invRes] = await Promise.all([
      supabase.from("project_billing_products").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_sessions").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_semen").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_labor").select("*").eq("billing_id", bId).order("sort_order"),
      (supabase.from as any)("project_billing_session_inventory").select("*").eq("billing_id", bId).order("sort_order"),
    ]);
    setProductLines((prodRes.data ?? []) as ProductLine[]);
    setSessions((sessRes.data ?? []) as SessionLine[]);
    setSemenLines((semRes.data ?? []) as SemenLine[]);
    setLaborLines((labRes.data ?? []) as LaborLine[]);
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

    // Packed units suggestions from pack data
    const packedMap: Record<string, number> = {};
    const { data: packProjects } = await supabase
      .from("tank_pack_projects")
      .select("tank_pack_id")
      .eq("project_id", proj.id);

    if (packProjects && packProjects.length > 0) {
      const packIds = packProjects.map(pp => pp.tank_pack_id);
      const { data: packLines } = await supabase
        .from("tank_pack_lines")
        .select("bull_catalog_id, bull_name, units")
        .in("tank_pack_id", packIds);

      for (const pl of packLines ?? []) {
        const key = pl.bull_catalog_id || pl.bull_name;
        packedMap[key] = (packedMap[key] || 0) + pl.units;
      }
    }
    setSuggestedPackedUnits(packedMap);
  }

  /* ── create blank billing with zeroed quantities ── */
  async function createBlankWithSuggestions(proj: any, evts: any[], bulls: any[], products: BillingProduct[]) {
    const { data: billing, error } = await supabase
      .from("project_billing")
      .insert({ project_id: proj.id, organization_id: orgId!, status: "draft" })
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

    // ── Semen from project bulls (zeroed out) ──
    const newSemen: Omit<SemenLine, "id">[] = bulls.map((b, i) => {
      const bullName = b.bulls_catalog?.bull_name || b.custom_bull_name || "Unknown";
      const bullCode = b.bulls_catalog?.naab_code || null;
      const catalogId = b.bull_catalog_id;

      return {
        billing_id: bId,
        bull_catalog_id: catalogId,
        bull_name: bullName,
        bull_code: bullCode,
        units_packed: 0,
        units_returned: 0,
        units_blown: 0,
        units_billable: 0,
        unit_price: 0,
        line_total: 0,
        sort_order: i,
      };
    });

    if (newSemen.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_semen").insert(newSemen).select();
      setSemenLines((inserted ?? []) as SemenLine[]);
    }

    setLaborLines([]);
  }

  /* ── reset sheet ── */
  async function handleResetSheet() {
    if (!billingId || !projectId || !project) return;
    await Promise.all([
      supabase.from("project_billing_products").delete().eq("billing_id", billingId),
      supabase.from("project_billing_sessions").delete().eq("billing_id", billingId),
      supabase.from("project_billing_semen").delete().eq("billing_id", billingId),
      supabase.from("project_billing_labor").delete().eq("billing_id", billingId),
    ]);
    setProductLines([]);
    setSessions([]);
    setSemenLines([]);
    setLaborLines([]);

    // Re-fetch project data for fresh suggestions
    const [eventsRes, bullsRes, productsRes] = await Promise.all([
      supabase.from("protocol_events").select("*").eq("project_id", projectId).order("event_date"),
      supabase.from("project_bulls").select("*, bulls_catalog(bull_name, naab_code, registration_number)").eq("project_id", projectId),
      supabase.from("billing_products").select("*").eq("organization_id", orgId!).eq("active", true).order("sort_order"),
    ]);

    // Re-use existing billing record, just rebuild children
    const bId = billingId;
    const evts = eventsRes.data ?? [];
    const bulls = bullsRes.data ?? [];
    const products = (productsRes.data ?? []) as BillingProduct[];

    // Compute suggestions
    await computeSuggestions(project, evts, bulls);

    // Rebuild zeroed product lines
    
    const getDefaultProduct = (cat: string) => products.find(p => p.product_category === cat && p.is_default);
    const getProduct = (cat: string) => products.find(p => p.product_category === cat);
    const skipEvents = ["Return Heat", "Estimated Calving", "MGA Start", "MGA End", "Bulls In"];
    const isMGA = project.protocol?.toLowerCase().includes("mga");

    const newProducts: Omit<ProductLine, "id">[] = [];
    let sortIdx = 0;

    const makeLine = (prod: BillingProduct, cat: string, label: string, eventDate: string): Omit<ProductLine, "id"> => ({
      billing_id: bId!, billing_product_id: prod.id, product_name: prod.product_name,
      product_category: cat, protocol_event_label: label, event_date: eventDate,
      doses: 0, doses_per_unit: prod.doses_per_unit, unit_label: prod.unit_label,
      units_calculated: 0, units_billed: 0, units_returned: 0,
      unit_price: prod.default_price, line_total: 0,
      sort_order: sortIdx++,
    });

    for (const evt of evts) {
      const en = (evt.event_name || "").toLowerCase();
      if (skipEvents.some(s => en.includes(s.toLowerCase()))) continue;
      const eventLabel = evt.event_name;
      const eventDate = evt.event_date;

      if (en.includes("pgf") && en.includes("cidr insert")) {
        const pgfProd = getDefaultProduct("pgf") || getProduct("pgf");
        if (pgfProd) newProducts.push(makeLine(pgfProd, "pgf", eventLabel, eventDate));
        if (!isMGA) {
          const cidrProd = getDefaultProduct("cidr") || getProduct("cidr");
          if (cidrProd) newProducts.push(makeLine(cidrProd, "cidr", eventLabel, eventDate));
        }
      } else if (en.includes("cidr in") || en.includes("cidr insert")) {
        if (!isMGA) {
          const cidrProd = getDefaultProduct("cidr") || getProduct("cidr");
          if (cidrProd) newProducts.push(makeLine(cidrProd, "cidr", eventLabel, eventDate));
        }
        if (en.includes("gnrh")) {
          const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
          if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", eventLabel, eventDate));
        }
      } else if (en.includes("pgf") || en.includes("cidr out")) {
        const pgfProd = getDefaultProduct("pgf") || getProduct("pgf");
        if (pgfProd) newProducts.push(makeLine(pgfProd, "pgf", eventLabel, eventDate));
        if (en.includes("cidr out") && !isMGA) {
          const patchProd = getDefaultProduct("patch") || getProduct("patch");
          if (patchProd) newProducts.push(makeLine(patchProd, "patch", eventLabel, eventDate));
        }
      } else if (en.includes("gnrh")) {
        const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
        if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", eventLabel, eventDate));
      } else if (en.includes("timed breeding") || en.includes("tai") || en.includes("breed")) {
        const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
        if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", "Breeding (Mass GnRH)", eventDate));
        const svcProd = getDefaultProduct("service") || getProduct("service");
        if (svcProd) newProducts.push(makeLine(svcProd, "service", eventLabel, eventDate));
      }
    }

    if (newProducts.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_products").insert(newProducts).select();
      setProductLines((inserted ?? []) as ProductLine[]);
    }

    // Sessions
    const sessionSkip = ["return heat", "estimated calving"];
    const newSessions: Omit<SessionLine, "id">[] = evts
      .filter(e => !sessionSkip.some(s => (e.event_name || "").toLowerCase().includes(s)))
      .map((e, i) => ({
        billing_id: bId!,
        session_date: e.event_date,
        session_label: e.event_name,
        time_of_day: e.event_time ? formatTime12(e.event_time) : null,
        head_count: null, crew: null, notes: null, sort_order: i,
      }));

    if (newSessions.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_sessions").insert(newSessions).select();
      setSessions((inserted ?? []) as SessionLine[]);
    }

    // Semen
    const newSemen: Omit<SemenLine, "id">[] = bulls.map((b, i) => ({
      billing_id: bId!,
      bull_catalog_id: b.bull_catalog_id,
      bull_name: b.bulls_catalog?.bull_name || b.custom_bull_name || "Unknown",
      bull_code: b.bulls_catalog?.naab_code || null,
      units_packed: 0, units_returned: 0, units_blown: 0, units_billable: 0,
      unit_price: 0, line_total: 0, sort_order: i,
    }));

    if (newSemen.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_semen").insert(newSemen).select();
      setSemenLines((inserted ?? []) as SemenLine[]);
    }

    toast({ title: "Billing sheet reset" });
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

  // Save returned_units for a canister. Stored on the first session row for that (bull, canister) combo.
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

  // Add a new breeding session to the worksheet for all existing bull/canister combos
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

  // Add a new bull/canister to the worksheet for all existing breeding sessions
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

  // Delete all worksheet rows for a specific (bull, canister) combo
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

  function saveLaborLine(idx: number, updates: Partial<LaborLine>) {
    const line = { ...laborLines[idx], ...updates };
    const newLines = [...laborLines];
    newLines[idx] = line;
    setLaborLines(newLines);

    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`labor-${id}`, () =>
        supabase.from("project_billing_labor").update(rest).eq("id", id)
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

  async function addLabor() {
    if (!billingId) return;
    const newLine: Omit<LaborLine, "id"> = {
      billing_id: billingId, description: "", labor_dates: null, amount: 0, sort_order: laborLines.length,
    };
    const { data } = await supabase.from("project_billing_labor").insert(newLine).select().single();
    if (data) setLaborLines(prev => [...prev, data as LaborLine]);
  }

  async function removeLabor(idx: number) {
    const line = laborLines[idx];
    if (line.id) await supabase.from("project_billing_labor").delete().eq("id", line.id);
    setLaborLines(prev => prev.filter((_, i) => i !== idx));
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
  function toggleLaborInvoiced(idx: number) {
    const nowInvoiced = !laborLines[idx].invoiced;
    saveLaborLine(idx, {
      invoiced: nowInvoiced,
      invoiced_at: nowInvoiced ? new Date().toISOString() : null,
    });
  }

  /* ── totals ── */
  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const productsInvoiced = productLines.filter(l => l.invoiced).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenInvoiced = semenLines.filter(l => l.invoiced).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const laborTotal = laborLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const laborInvoiced = laborLines.filter(l => l.invoiced).reduce((s, l) => s + (l.amount ?? 0), 0);
  const grandTotal = productsTotal + semenTotal + laborTotal;
  const grandInvoiced = productsInvoiced + semenInvoiced + laborInvoiced;
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
  const totalLines = productLines.length + semenLines.length + sessions.length + laborLines.length;
  const allInvoiced = totalLines > 0 && [
    ...productLines.map(l => l.invoiced),
    ...semenLines.map(l => l.invoiced),
    ...sessions.map(l => l.invoiced),
    ...laborLines.map(l => l.invoiced),
  ].every(Boolean);
  const isProjectComplete = project?.status === "Complete";
  const readOnly = isProjectComplete;

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
      // Re-fetch the billing record to pick up inventory_finalized_at
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
    generateBillingSheetPdf(project, billingRecord, productLines, semenLines, sessions, laborLines, {
      productsTotal, semenTotal, laborTotal, grandTotal,
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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
                <Badge variant="outline">{project.cattle_type}</Badge>
                <Badge variant="outline">{project.head_count} head</Badge>
                {project.breeding_date && (
                  <Badge variant="outline">Breed: {format(parseISO(project.breeding_date), "MMM d, yyyy")}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={billingRecord?.status || "draft"}
              onValueChange={(v) => saveBillingField("status", v)}
              disabled={readOnly}
            >
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILLING_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  if (confirm("Reset this billing sheet? All entered values will be cleared. This cannot be undone.")) {
                    handleResetSheet();
                  }
                }}
              >
                Reset Sheet
              </Button>
            )}
            {billingRecord?.inventory_finalized_at ? (
              <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-500 px-2">
                <Check className="h-4 w-4" />
                <span>
                  Inventory finalized {format(parseISO(billingRecord.inventory_finalized_at), "MMM d, yyyy")}
                </span>
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={finalizing || semenLines.length === 0}
                  >
                    {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                    {finalizing ? "Finalizing…" : "Finalize Inventory"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Finalize Inventory?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will subtract all used semen from the field tank inventory.
                      Used units = Packed − Returned − Blown. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFinalizeInventory} disabled={finalizing}>
                      {finalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Finalize
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrint} title="Print PDF">
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Closeout Checklist ── */}
        <div className="sticky top-0 z-10">
          <Card className="border border-border/60 bg-card/95 backdrop-blur-sm shadow-sm">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium">
                <span className="text-muted-foreground uppercase tracking-wider mr-2 self-center">Closeout</span>
                <span className={hasPack ? "text-emerald-600" : "text-muted-foreground"}>
                  {hasPack ? "☑" : "☐"} Packed
                </span>
                <span className={hasSessions ? "text-emerald-600" : "text-muted-foreground"}>
                  {hasSessions ? "☑" : "☐"} Sessions
                </span>
                <span className={isUnpacked ? "text-emerald-600" : "text-muted-foreground"}>
                  {isUnpacked ? "☑" : "☐"} Unpacked
                </span>
                <span className={worksheetDone ? "text-emerald-600" : "text-muted-foreground"}>
                  {worksheetDone ? "☑" : "☐"} Worksheet
                </span>
                <span className={blownEntered ? "text-emerald-600" : "text-muted-foreground"}>
                  {blownEntered ? "☑" : "☐"} Blown
                </span>
                <span className={inventoryFinalized ? "text-emerald-600" : "text-muted-foreground"}>
                  {inventoryFinalized ? "☑" : "☐"} Finalized
                </span>
                <span className={allInvoiced ? "text-emerald-600" : "text-muted-foreground"}>
                  {allInvoiced ? "☑" : "☐"} Invoiced
                </span>
                <span className={isProjectComplete ? "text-emerald-600" : "text-muted-foreground"}>
                  {isProjectComplete ? "☑" : "☐"} Complete
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Invoice Numbers ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">CATL Resources Invoice #</label>
            <Input
              className="mt-1"
              defaultValue={billingRecord?.catl_invoice_number || ""}
              disabled={readOnly}
              onBlur={(e) => saveBillingField("catl_invoice_number", e.target.value || null)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Select Sires Invoice #</label>
            <Input
              className="mt-1"
              defaultValue={billingRecord?.select_sires_invoice_number || ""}
              disabled={readOnly}
              onBlur={(e) => saveBillingField("select_sires_invoice_number", e.target.value || null)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Project ID</label>
            <Input
              className="mt-1"
              defaultValue={billingRecord?.zoho_project_id || ""}
              disabled={readOnly}
              placeholder="Zoho project ID"
              onBlur={(e) => saveBillingField("zoho_project_id", e.target.value || null)}
            />
          </div>
        </div>

        <fieldset disabled={readOnly} className="contents [&_button]:disabled:pointer-events-auto">
        {/* ── Products Section ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Products by Protocol Event</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Date</TableHead>
                    <TableHead className="w-[140px]">Event</TableHead>
                    <TableHead className="w-[180px]">Product</TableHead>
                    <TableHead className="w-[100px] text-right">Doses</TableHead>
                    <TableHead className="w-[100px] text-right">Units</TableHead>
                    <TableHead className="w-[100px] text-right">Price</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                    <TableHead className="w-[50px] text-center">Inv.</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productLines.map((line, idx) => {
                    const prevLine = idx > 0 ? productLines[idx - 1] : null;
                    const showDate = !prevLine || prevLine.event_date !== line.event_date;
                    const showEvent = !prevLine || prevLine.protocol_event_label !== line.protocol_event_label || showDate;
                    const categoryProducts = billingProducts.filter(p => p.product_category === line.product_category);

                    return (
                      <TableRow key={line.id || idx}>
                        <TableCell className="text-xs">
                          {showDate && line.event_date ? format(parseISO(line.event_date), "MMM d") : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {showEvent ? line.protocol_event_label : ""}
                        </TableCell>
                        <TableCell>
                          {categoryProducts.length > 1 ? (
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
                            <span className="text-sm">{line.product_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            {suggestedDoses[`${line.product_category}-${line.event_date}`] != null && (
                              <span className="text-xs text-teal-400 whitespace-nowrap">
                                {suggestedDoses[`${line.product_category}-${line.event_date}`]}
                              </span>
                            )}
                            <Input
                              type="number"
                              className="h-8 w-[80px] text-right text-xs ml-auto"
                              value={line.doses || ""}
                              placeholder="Doses"
                              onChange={(e) => saveProductLine(idx, { doses: Number(e.target.value) || 0 })}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {(line.units_billed ?? line.units_calculated ?? 0).toFixed(1)} {line.unit_label || ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 w-[90px] text-right text-xs ml-auto"
                            value={line.unit_price ?? ""}
                            onChange={(e) => saveProductLine(idx, { unit_price: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(line.line_total)}
                        </TableCell>
                        <TableCell className="text-center">
                          <fieldset disabled={false} className="contents"><Checkbox checked={!!line.invoiced} onCheckedChange={() => toggleProductInvoiced(idx)} /></fieldset>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeProductLine(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {productLines.map((line, idx) => (
                <div key={line.id || idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {line.event_date ? format(parseISO(line.event_date), "MMM d") : ""} · {line.protocol_event_label}
                      </p>
                      <p className="font-medium text-sm">{line.product_name}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeProductLine(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Doses</label>
                      {suggestedDoses[`${line.product_category}-${line.event_date}`] != null && (
                        <span className="text-[10px] text-teal-400 ml-1">
                          ({suggestedDoses[`${line.product_category}-${line.event_date}`]})
                        </span>
                      )}
                      <Input type="number" className="h-8 text-xs" value={line.doses || ""}
                        placeholder="Doses"
                        onChange={(e) => saveProductLine(idx, { doses: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Units</label>
                      <p className="text-sm mt-1">{(line.units_billed ?? 0).toFixed(1)} {line.unit_label || ""}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Total</label>
                      <p className="text-sm font-medium mt-1">{formatCurrency(line.line_total)}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <fieldset disabled={false} className="contents"><Checkbox checked={!!line.invoiced} onCheckedChange={() => toggleProductInvoiced(idx)} /></fieldset>
                    <span className="text-muted-foreground">{line.invoiced ? "Invoiced" : "Not invoiced"}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-3">
              <Button variant="outline" size="sm" onClick={addProductLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
              </Button>
              <p className="text-sm font-semibold">Products Total: {formatCurrency(productsTotal)}</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Semen Section ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Semen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bull</TableHead>
                    <TableHead className="w-[90px]">Code</TableHead>
                    <TableHead className="w-[70px] text-right">Packed</TableHead>
                    <TableHead className="w-[70px] text-right">Returned</TableHead>
                    <TableHead className="w-[70px] text-right">Blown</TableHead>
                    <TableHead className="w-[70px] text-right">Billable</TableHead>
                    <TableHead className="w-[80px] text-right">Price</TableHead>
                    <TableHead className="w-[90px] text-right">Total</TableHead>
                    <TableHead className="w-[50px] text-center">Inv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {semenLines.map((line, idx) => (
                    <TableRow key={line.id || idx}>
                      <TableCell className="text-sm font-medium">{line.bull_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{line.bull_code || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          {suggestedPackedUnits[line.bull_catalog_id || line.bull_name] != null && (
                            <span className="text-xs text-teal-400 whitespace-nowrap">
                              {suggestedPackedUnits[line.bull_catalog_id || line.bull_name]}
                            </span>
                          )}
                          <Input type="number" className="h-8 w-[60px] text-right text-xs ml-auto"
                            value={line.units_packed ?? ""}
                            placeholder="Packed"
                            onChange={(e) => saveSemenLine(idx, { units_packed: Number(e.target.value) || 0 })} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" className="h-8 w-[60px] text-right text-xs ml-auto"
                          value={line.units_returned ?? ""}
                          onChange={(e) => saveSemenLine(idx, { units_returned: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" className="h-8 w-[60px] text-right text-xs ml-auto"
                          value={line.units_blown ?? ""}
                          onChange={(e) => saveSemenLine(idx, { units_blown: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{line.units_billable ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" className="h-8 w-[70px] text-right text-xs ml-auto"
                          value={line.unit_price ?? ""}
                          onChange={(e) => saveSemenLine(idx, { unit_price: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(line.line_total)}</TableCell>
                      <TableCell className="text-center">
                        <fieldset disabled={false} className="contents"><Checkbox checked={!!line.invoiced} onCheckedChange={() => toggleSemenInvoiced(idx)} /></fieldset>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {semenLines.map((line, idx) => (
                <div key={line.id || idx} className="border rounded-lg p-3 space-y-2">
                  <p className="font-medium text-sm">{line.bull_name} <span className="text-muted-foreground text-xs">{line.bull_code}</span></p>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Packed</label>
                      {suggestedPackedUnits[line.bull_catalog_id || line.bull_name] != null && (
                        <span className="text-[10px] text-teal-400 ml-1">
                          ({suggestedPackedUnits[line.bull_catalog_id || line.bull_name]})
                        </span>
                      )}
                      <Input type="number" className="h-8 text-xs" value={line.units_packed ?? ""}
                        placeholder="Packed"
                        onChange={(e) => saveSemenLine(idx, { units_packed: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Ret'd</label>
                      <Input type="number" className="h-8 text-xs" value={line.units_returned ?? ""}
                        onChange={(e) => saveSemenLine(idx, { units_returned: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Blown</label>
                      <Input type="number" className="h-8 text-xs" value={line.units_blown ?? ""}
                        onChange={(e) => saveSemenLine(idx, { units_blown: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Billable</label>
                      <p className="text-sm mt-1 font-medium">{line.units_billable ?? 0}</p>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-sm font-medium">{formatCurrency(line.line_total)}</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <fieldset disabled={false} className="contents"><Checkbox checked={!!line.invoiced} onCheckedChange={() => toggleSemenInvoiced(idx)} /></fieldset>
                    <span className="text-muted-foreground">{line.invoiced ? "Invoiced" : "Not invoiced"}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-3">
              <p className="text-sm font-semibold">Semen Total: {formatCurrency(semenTotal)}</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Sessions Section ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Field Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Date</TableHead>
                    <TableHead className="w-[150px]">Event</TableHead>
                    <TableHead className="w-[100px]">Time</TableHead>
                    <TableHead className="w-[90px] text-right">Head Count</TableHead>
                    <TableHead className="w-[120px]">Crew</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[50px] text-center">Inv.</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s, idx) => {
                    const diff = s.head_count != null && project.head_count
                      ? s.head_count - project.head_count : null;
                    return (
                      <TableRow key={s.id || idx}>
                        <TableCell className="text-xs">{format(parseISO(s.session_date), "MMM d")}</TableCell>
                        <TableCell className="text-xs">{s.session_label}</TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" value={s.time_of_day || ""}
                            onChange={(e) => saveSessionLine(idx, { time_of_day: e.target.value })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <Input type="number" className="h-8 w-[70px] text-right text-xs"
                              value={s.head_count ?? ""}
                              placeholder="—"
                              onChange={(e) => saveSessionLine(idx, { head_count: e.target.value ? Number(e.target.value) : null })} />
                            {diff !== null && diff !== 0 && (
                              <span className={`text-[10px] ${diff < 0 ? "text-destructive" : "text-emerald-600"}`}>
                                {diff > 0 ? "+" : ""}{diff} vs projected
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" value={s.crew || ""}
                            onChange={(e) => saveSessionLine(idx, { crew: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" value={s.notes || ""}
                            onChange={(e) => saveSessionLine(idx, { notes: e.target.value })} />
                        </TableCell>
                        <TableCell className="text-center">
                          <fieldset disabled={false} className="contents"><Checkbox checked={!!s.invoiced} onCheckedChange={() => toggleSessionInvoiced(idx)} /></fieldset>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSession(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {sessions.map((s, idx) => {
                const diff = s.head_count != null && project.head_count ? s.head_count - project.head_count : null;
                return (
                  <div key={s.id || idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-muted-foreground">{format(parseISO(s.session_date), "MMM d")}</p>
                        <p className="font-medium text-sm">{s.session_label}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSession(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Time</label>
                        <Input className="h-8 text-xs" value={s.time_of_day || ""}
                          onChange={(e) => saveSessionLine(idx, { time_of_day: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Head</label>
                        <Input type="number" className="h-8 text-xs" value={s.head_count ?? ""}
                          placeholder="—"
                          onChange={(e) => saveSessionLine(idx, { head_count: e.target.value ? Number(e.target.value) : null })} />
                        {diff !== null && diff !== 0 && (
                          <span className={`text-[10px] ${diff < 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {diff > 0 ? "+" : ""}{diff}
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Crew</label>
                        <Input className="h-8 text-xs" value={s.crew || ""}
                          onChange={(e) => saveSessionLine(idx, { crew: e.target.value })} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" size="sm" className="mt-3" onClick={addSession}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Session
            </Button>
          </CardContent>
        </Card>

        {/* ── Session Inventory Tracking ── */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Session Inventory Tracking</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {sessionInventory.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={addWorksheetSession}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Session
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddBullToWorksheet(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Bull
                  </Button>
                </>
              )}
              {sessionInventory.length === 0 && sessions.length > 0 && (
                <Button size="sm" onClick={generateWorksheet} disabled={generatingWorksheet}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {generatingWorksheet ? "Generating..." : "Generate Worksheet"}
                </Button>
              )}
              {sessionInventory.length > 0 && (
                <Button size="sm" variant="outline" onClick={generateWorksheet} disabled={generatingWorksheet}>
                  Regenerate
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add Field Sessions above first.</p>
            ) : sessionInventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Click "Generate Worksheet" to create tracking rows from this project's pack data.
              </p>
            ) : (() => {
              const breedingSessions = sessions.filter(s => {
                const label = (s.session_label || "").toLowerCase();
                return label.includes("breed") || label.includes("ai ") || label === "ai";
              });
              const sortedSessions = [...breedingSessions].sort((a, b) =>
                (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date)
              );
              const worksheetRows = buildWorksheetRows();

              const byBull = new Map<string, WorksheetRow[]>();
              for (const row of worksheetRows) {
                const bullKey = row.bull_catalog_id || `name:${row.bull_name}`;
                if (!byBull.has(bullKey)) byBull.set(bullKey, []);
                byBull.get(bullKey)!.push(row);
              }

              return (
                <div className="space-y-6">
                  {/* Per-bull tables — vertical layout */}
                  {Array.from(byBull.entries()).map(([bullKey, rows]) => {
                    const first = rows[0];
                    const totalPacked = rows.reduce((s, r) => s + r.packed_units, 0);

                    return (
                      <div key={bullKey}>
                        <div className="text-sm font-medium mb-1 flex items-center justify-between">
                          <div>
                            {first.bull_name}
                            {first.bull_code && <span className="ml-2 text-xs text-muted-foreground font-normal">· {first.bull_code}</span>}
                            <span className="ml-2 text-xs text-muted-foreground font-normal">· {totalPacked} packed</span>
                          </div>
                          {rows.length === 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => deleteWorksheetCanister(bullKey, rows[0].canister)}
                              title="Remove from worksheet"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[50px] text-center">Can.</TableHead>
                                <TableHead>Session</TableHead>
                                <TableHead className="w-[80px] text-center">Start</TableHead>
                                <TableHead className="w-[80px] text-center">End</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((row) => (
                                <React.Fragment key={`${row.bull_name}-${row.canister}`}>
                                  {sortedSessions.map((s, sIdx) => {
                                    const cell = row.cellsBySessionId[s.id!];
                                    return (
                                      <TableRow key={`${row.canister}-${s.id}`}>
                                        {sIdx === 0 && (
                                          <TableCell
                                            className="text-center font-mono text-xs align-top font-medium"
                                            rowSpan={sortedSessions.length + 1}
                                          >
                                            <div className="flex flex-col items-center gap-1">
                                              <span>{row.canister}</span>
                                              {rows.length > 1 && (
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-5 w-5 text-destructive hover:text-destructive"
                                                  onClick={() => deleteWorksheetCanister(bullKey, row.canister)}
                                                  title={`Remove canister ${row.canister}`}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              )}
                                            </div>
                                          </TableCell>
                                        )}
                                        <TableCell className="text-xs">
                                          {s.session_label || "Breed"} · {format(parseISO(s.session_date), "MMM d")}
                                        </TableCell>
                                        <TableCell className="p-1">
                                          <Input
                                            type="number"
                                            className="h-8 w-full text-right text-xs"
                                            value={cell?.start_units ?? ""}
                                            placeholder="—"
                                            onBlur={(e) => {
                                              if (!cell?.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              if (v !== cell.start_units) saveWorksheetCell(cell.id, "start_units", v);
                                            }}
                                            onChange={(e) => {
                                              if (!cell?.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              setSessionInventory(prev => prev.map(r => r.id === cell.id ? { ...r, start_units: v } : r));
                                            }}
                                          />
                                        </TableCell>
                                        <TableCell className="p-1">
                                          <Input
                                            type="number"
                                            className="h-8 w-full text-right text-xs"
                                            value={cell?.end_units ?? ""}
                                            placeholder="—"
                                            onBlur={(e) => {
                                              if (!cell?.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              if (v !== cell.end_units) saveWorksheetCell(cell.id, "end_units", v);
                                            }}
                                            onChange={(e) => {
                                              if (!cell?.id) return;
                                              const v = e.target.value === "" ? null : Number(e.target.value);
                                              setSessionInventory(prev => prev.map(r => r.id === cell.id ? { ...r, end_units: v } : r));
                                            }}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                  {/* Returned row for this canister */}
                                  <TableRow key={`${row.canister}-returned`} className="bg-muted/30">
                                    <TableCell className="text-xs font-medium">Returned</TableCell>
                                    <TableCell colSpan={2} className="p-1">
                                      <Input
                                        type="number"
                                        className="h-8 w-[80px] text-right text-xs"
                                        value={row.returned_units ?? ""}
                                        placeholder="—"
                                        onBlur={(e) => {
                                          const v = e.target.value === "" ? null : Number(e.target.value);
                                          if (v !== row.returned_units) saveReturnedUnits(bullKey, row.canister, v);
                                        }}
                                        onChange={(e) => {
                                          const v = e.target.value === "" ? null : Number(e.target.value);
                                          const firstRow = sessionInventory.find(r =>
                                            (r.bull_catalog_id || `name:${r.bull_name}`) === bullKey && r.canister === row.canister
                                          );
                                          if (firstRow?.id) {
                                            setSessionInventory(prev => prev.map(r => r.id === firstRow.id ? { ...r, returned_units: v } : r));
                                          }
                                        }}
                                      />
                                    </TableCell>
                                  </TableRow>
                                </React.Fragment>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}

                  {/* ── Semen usage summary ── */}
                  <div className="border-t-2 border-border pt-4">
                    <h3 className="text-sm font-medium mb-2">Semen usage summary</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bull</TableHead>
                          <TableHead className="w-[70px] text-right">Packed</TableHead>
                          <TableHead className="w-[70px] text-right">Returned</TableHead>
                          <TableHead className="w-[70px] text-right">Blown</TableHead>
                          <TableHead className="w-[70px] text-right">Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const bullSummary = new Map<string, { name: string; code: string | null; packed: number; returned: number; bull_catalog_id: string | null }>();
                          for (const row of worksheetRows) {
                            const bk = row.bull_catalog_id || `name:${row.bull_name}`;
                            if (!bullSummary.has(bk)) {
                              bullSummary.set(bk, { name: row.bull_name, code: row.bull_code, packed: 0, returned: 0, bull_catalog_id: row.bull_catalog_id });
                            }
                            const bs = bullSummary.get(bk)!;
                            bs.packed += row.packed_units;
                            bs.returned += row.returned_units ?? 0;
                          }

                          const summaryRows = Array.from(bullSummary.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
                          let totalPacked = 0, totalReturned = 0, totalBlown = 0;

                          const rendered = summaryRows.map(([bk, bs]) => {
                            const semenLine = semenLines.find(sl =>
                              (sl.bull_catalog_id && bs.bull_catalog_id && sl.bull_catalog_id === bs.bull_catalog_id)
                              || sl.bull_name === bs.name
                            );
                            const blown = semenLine?.units_blown ?? 0;
                            const used = bs.packed - bs.returned - blown;
                            totalPacked += bs.packed;
                            totalReturned += bs.returned;
                            totalBlown += blown;

                            return (
                              <TableRow key={bk}>
                                <TableCell className="text-xs">{bs.name}</TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{bs.packed}</TableCell>
                                <TableCell className="text-xs text-right">{bs.returned || "—"}</TableCell>
                                <TableCell className="p-1">
                                  <Input
                                    type="number"
                                    className="h-7 w-[60px] text-right text-xs ml-auto"
                                    value={blown || ""}
                                    placeholder="—"
                                    onBlur={(e) => {
                                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                                      const slIdx = semenLines.findIndex(sl =>
                                        (sl.bull_catalog_id && bs.bull_catalog_id && sl.bull_catalog_id === bs.bull_catalog_id)
                                        || sl.bull_name === bs.name
                                      );
                                      if (slIdx >= 0) {
                                        saveSemenLine(slIdx, { units_blown: v });
                                      }
                                    }}
                                    onChange={(e) => {
                                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                                      const slIdx = semenLines.findIndex(sl =>
                                        (sl.bull_catalog_id && bs.bull_catalog_id && sl.bull_catalog_id === bs.bull_catalog_id)
                                        || sl.bull_name === bs.name
                                      );
                                      if (slIdx >= 0) {
                                        const updated = [...semenLines];
                                        updated[slIdx] = { ...updated[slIdx], units_blown: v };
                                        setSemenLines(updated);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="text-xs text-right font-medium">{bs.returned > 0 || blown > 0 ? used : "—"}</TableCell>
                              </TableRow>
                            );
                          });

                          const totalUsed = totalPacked - totalReturned - totalBlown;
                          rendered.push(
                            <TableRow key="total" className="bg-muted/30 font-medium">
                              <TableCell className="text-xs">Total</TableCell>
                              <TableCell className="text-xs text-right">{totalPacked}</TableCell>
                              <TableCell className="text-xs text-right">{totalReturned || "—"}</TableCell>
                              <TableCell className="text-xs text-right">{totalBlown || "—"}</TableCell>
                              <TableCell className="text-xs text-right">{totalReturned > 0 || totalBlown > 0 ? totalUsed : "—"}</TableCell>
                            </TableRow>
                          );
                          return rendered;
                        })()}
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2">
                      Used = Packed − Returned − Blown. Blown is entered on the Semen billing section above. These totals feed directly into billing.
                    </p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* ── Labor Section ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Labor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {laborLines.map((line, idx) => (
                <div key={line.id || idx} className="flex items-center gap-2">
                  <Input className="h-9 flex-1 text-sm" placeholder="Description" value={line.description}
                    onChange={(e) => saveLaborLine(idx, { description: e.target.value })} />
                  <Input className="h-9 w-[120px] text-sm" placeholder="Dates" value={line.labor_dates || ""}
                    onChange={(e) => saveLaborLine(idx, { labor_dates: e.target.value })} />
                  <Input type="number" step="0.01" className="h-9 w-[100px] text-right text-sm" placeholder="$0.00"
                    value={line.amount ?? ""}
                    onChange={(e) => saveLaborLine(idx, { amount: Number(e.target.value) || 0 })} />
                  <div className="flex items-center justify-center w-9">
                    <fieldset disabled={false} className="contents"><Checkbox checked={!!line.invoiced} onCheckedChange={() => toggleLaborInvoiced(idx)} /></fieldset>
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeLabor(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <Button variant="outline" size="sm" onClick={addLabor}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Labor
              </Button>
              <p className="text-sm font-semibold">Labor Total: {formatCurrency(laborTotal)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Add Bull to Worksheet Dialog */}
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

        {/* ── Grand Total ── */}
        <Card className="border-2 border-primary/30">
          <CardContent className="py-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Products</p>
                <p className="font-semibold">{formatCurrency(productsTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Semen</p>
                <p className="font-semibold">{formatCurrency(semenTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Labor</p>
                <p className="font-semibold">{formatCurrency(laborTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Grand Total</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(grandTotal)}</p>
              </div>
            </div>
            {grandInvoiced > 0 && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t text-sm">
                <div>
                  <p className="text-muted-foreground">Invoiced</p>
                  <p className="font-semibold text-emerald-600">{formatCurrency(grandInvoiced)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Outstanding</p>
                  <p className="font-semibold text-amber-600">{formatCurrency(grandOutstanding)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Notes ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[80px]"
              defaultValue={billingRecord?.notes || ""}
              disabled={readOnly}
              placeholder="General billing notes..."
              onBlur={(e) => saveBillingField("notes", e.target.value || null)}
            />
          </CardContent>
        </Card>

        {/* ── Complete Project ── */}
        {!isProjectComplete && (
          <Card className="border-dashed">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-sm">Complete Project</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {!inventoryFinalized
                      ? "Finalize inventory before completing."
                      : !isUnpacked
                      ? "Unpack the field tank before completing."
                      : "Mark this project as complete. The billing page will become read-only."}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={completing || !inventoryFinalized || !isUnpacked}
                      className="gap-1.5"
                    >
                      {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {completing ? "Completing…" : "Complete Project"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Complete this project?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark {project?.name} as Complete. The billing page will become
                        read-only (invoiced checkboxes will stay toggleable). This can be undone by
                        changing the project status back from the project detail page.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCompleteProject}>
                        Complete Project
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        )}

        {isProjectComplete && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-500 justify-center py-2">
            <Check className="h-4 w-4" />
            <span>Project completed {billingRecord?.billing_completed_at ? format(parseISO(billingRecord.billing_completed_at), "MMM d, yyyy") : ""}</span>
          </div>
        )}
      </main>
      {/* Fixed-position save confirmation — visible from anywhere on the page */}
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
