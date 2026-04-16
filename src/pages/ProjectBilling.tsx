import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Plus, Check, Trash2 } from "lucide-react";
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
}

interface LaborLine {
  id?: string;
  billing_id: string;
  description: string;
  labor_dates: string | null;
  amount: number | null;
  sort_order: number | null;
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
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [sessions, setSessions] = useState<SessionLine[]>([]);
  const [semenLines, setSemenLines] = useState<SemenLine[]>([]);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);

  const [suggestedDoses, setSuggestedDoses] = useState<Record<string, number>>({});
  const [suggestedPackedUnits, setSuggestedPackedUnits] = useState<Record<string, number>>({});

  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = () => {
    setSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 1500);
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

    setLoading(false);
  }, [projectId, orgId]);

  async function loadBillingChildren(bId: string) {
    const [prodRes, sessRes, semRes, labRes] = await Promise.all([
      supabase.from("project_billing_products").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_sessions").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_semen").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_labor").select("*").eq("billing_id", bId).order("sort_order"),
    ]);
    setProductLines((prodRes.data ?? []) as ProductLine[]);
    setSessions((sessRes.data ?? []) as SessionLine[]);
    setSemenLines((semRes.data ?? []) as SemenLine[]);
    setLaborLines((labRes.data ?? []) as LaborLine[]);
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

  /* ── totals ── */
  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const laborTotal = laborLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const grandTotal = productsTotal + semenTotal + laborTotal;

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

  /* ── PDF ── */
  function handlePrint() {
    if (!project || !billingRecord) return;
    generateBillingSheetPdf(project, billingRecord, productLines, semenLines, sessions, laborLines, {
      productsTotal, semenTotal, laborTotal, grandTotal,
    });
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
            {saved && (
              <span className="text-xs text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
            <Select
              value={billingRecord?.status || "draft"}
              onValueChange={(v) => saveBillingField("status", v)}
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
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrint} title="Print PDF">
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Invoice Numbers ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">CATL Resources Invoice #</label>
            <Input
              className="mt-1"
              defaultValue={billingRecord?.catl_invoice_number || ""}
              onBlur={(e) => saveBillingField("catl_invoice_number", e.target.value || null)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Select Sires Invoice #</label>
            <Input
              className="mt-1"
              defaultValue={billingRecord?.select_sires_invoice_number || ""}
              onBlur={(e) => saveBillingField("select_sires_invoice_number", e.target.value || null)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Project ID</label>
            <Input
              className="mt-1"
              defaultValue={billingRecord?.zoho_project_id || ""}
              placeholder="Zoho project ID"
              onBlur={(e) => saveBillingField("zoho_project_id", e.target.value || null)}
            />
          </div>
        </div>

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

        {/* ── Grand Total ── */}
        <Card className="border-2 border-primary/30">
          <CardContent className="py-4">
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
              placeholder="General billing notes..."
              onBlur={(e) => saveBillingField("notes", e.target.value || null)}
            />
          </CardContent>
        </Card>
      </main>
      <AppFooter />
    </div>
  );
};

export default ProjectBilling;
