import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Check, Package, PackageOpen } from "lucide-react";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateBillingSheetPdf } from "@/lib/generateBillingSheetPdf";
import SessionsTab from "@/components/billing/SessionsTab";
import BillingTab from "@/components/billing/BillingTab";
import {
  BillingProduct, ProductLine, SessionLine, SessionInventoryLine, SemenLine,
  STATUS_COLORS, BILLING_STATUSES, STATUS_LABELS, calcUnits, formatTime12,
} from "@/components/billing/billingTypes";

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
  const [completing, setCompleting] = useState(false);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [sessions, setSessions] = useState<SessionLine[]>([]);
  const [sessionInventory, setSessionInventory] = useState<SessionInventoryLine[]>([]);
  const [semenLines, setSemenLines] = useState<SemenLine[]>([]);

  const [activeTab, setActiveTab] = useState<"sessions" | "billing">("sessions");
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

  /* ════════════════════ DATA LOADING ════════════════════ */

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

    const { data: existingBilling } = await supabase
      .from("project_billing").select("*").eq("project_id", projectId).maybeSingle();

    if (existingBilling) {
      setBillingId(existingBilling.id);
      setBillingRecord(existingBilling);
      await loadBillingChildren(existingBilling.id);
    } else {
      await createBlankWithSuggestions(
        projRes.data, eventsRes.data ?? [], bullsRes.data ?? [],
        (productsRes.data ?? []) as BillingProduct[],
      );
    }

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

  /* ── Create billing with protocol-based suggestions ── */
  async function createBlankWithSuggestions(proj: any, evts: any[], bulls: any[], products: BillingProduct[]) {
    const { data: billing, error } = await supabase
      .from("project_billing")
      .insert({ project_id: proj.id, organization_id: orgId!, status: "in_process" })
      .select().single();

    if (error || !billing) {
      toast({ title: "Error creating billing sheet", description: error?.message, variant: "destructive" });
      return;
    }
    setBillingId(billing.id);
    setBillingRecord(billing);
    const bId = billing.id;

    // ── Sessions from protocol events ──
    const sessionSkip = ["return heat", "estimated calving"];
    const newSessions: Omit<SessionLine, "id">[] = evts
      .filter(e => !sessionSkip.some(s => (e.event_name || "").toLowerCase().includes(s)))
      .map((e, i) => ({
        billing_id: bId, session_date: e.event_date, session_label: e.event_name,
        time_of_day: e.event_time ? formatTime12(e.event_time) : null,
        head_count: null, crew: null, notes: null, sort_order: i,
      }));

    let insertedSessions: SessionLine[] = [];
    if (newSessions.length > 0) {
      const { data } = await supabase.from("project_billing_sessions").insert(newSessions).select();
      insertedSessions = (data ?? []) as SessionLine[];
      setSessions(insertedSessions);
    }

    // Build session lookup by date+label for linking products
    const sessionLookup = new Map<string, string>();
    for (const s of insertedSessions) {
      if (s.id) sessionLookup.set(`${s.session_date}|${s.session_label}`, s.id);
    }

    // ── Products from protocol events (zeroed out, linked to sessions) ──
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
      const sessionId = sessionLookup.get(`${eventDate}|${eventLabel}`) || null;

      const makeLine = (prod: BillingProduct, cat: string, label: string): Omit<ProductLine, "id"> => ({
        billing_id: bId, billing_product_id: prod.id, product_name: prod.product_name,
        product_category: cat, protocol_event_label: label, event_date: eventDate,
        doses: 0, doses_per_unit: prod.doses_per_unit, unit_label: prod.unit_label,
        units_calculated: 0, units_billed: 0, units_returned: 0,
        unit_price: prod.default_price, line_total: 0, sort_order: sortIdx++,
        session_id: sessionId,
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

    // ── Semen from project bulls ──
    const { data: semenPackProjects } = await supabase
      .from("tank_pack_projects").select("tank_pack_id").eq("project_id", proj.id);
    const packedByBull: Record<string, number> = {};
    if (semenPackProjects && semenPackProjects.length > 0) {
      const { data: semenPackLines } = await supabase
        .from("tank_pack_lines").select("bull_catalog_id, bull_name, units")
        .in("tank_pack_id", semenPackProjects.map(pp => pp.tank_pack_id));
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
        billing_id: bId, bull_catalog_id: catalogId, bull_name: bullName, bull_code: bullCode,
        units_packed: packed, units_returned: 0, units_blown: 0, units_billable: packed,
        unit_price: 0, line_total: 0, sort_order: i,
      };
    });
    if (newSemen.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_semen").insert(newSemen).select();
      setSemenLines((inserted ?? []) as SemenLine[]);
    }
  }

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Auto-sync returned units when pack is unpacked ── */
  const unpackSyncDone = useRef(false);
  useEffect(() => {
    if (!projectPacks.length || !semenLines.length) return;
    const packStatus = projectPacks[0]?.status || null;
    const isUnpacked = packStatus === "unpacked" || packStatus === "tank_returned";
    if (isUnpacked && !unpackSyncDone.current) {
      unpackSyncDone.current = true;
      syncReturnedFromUnpack();
    }
  }, [projectPacks, semenLines]);

  async function syncReturnedFromUnpack() {
    const packIds = projectPacks.map((p) => p.id);
    const { data: unpackLines } = await supabase
      .from("tank_unpack_lines").select("bull_catalog_id, bull_name, units_returned")
      .in("tank_pack_id", packIds);
    if (!unpackLines?.length) return;

    const returnedByBull: Record<string, number> = {};
    for (const ul of unpackLines) {
      const key = (ul.bull_catalog_id as string) || ul.bull_name;
      returnedByBull[key] = (returnedByBull[key] || 0) + (ul.units_returned || 0);
    }

    const updates: Array<{ id: string; units_returned: number; units_billable: number; line_total: number }> = [];
    const updated = semenLines.map((sl) => {
      const key = sl.bull_catalog_id || sl.bull_name;
      const returned = returnedByBull[key] ?? 0;
      if (sl.units_returned !== returned) {
        const used = (sl.units_packed ?? 0) - returned;
        const billable = Math.max(0, used - (sl.units_blown ?? 0));
        const line_total = billable * (sl.unit_price ?? 0);
        if (sl.id) updates.push({ id: sl.id, units_returned: returned, units_billable: billable, line_total });
        return { ...sl, units_returned: returned, units_billable: billable, line_total };
      }
      return sl;
    });

    if (updates.length === 0) return;
    setSemenLines(updated);
    await Promise.all(updates.map((u) =>
      supabase.from("project_billing_semen").update({
        units_returned: u.units_returned, units_billable: u.units_billable, line_total: u.line_total,
      }).eq("id", u.id)
    ));
  }

  /* ════════════════════ SAVE HELPERS ════════════════════ */

  function saveBillingField(field: string, value: any) {
    if (!billingId) return;
    debouncedSave(`billing-${field}`, () =>
      supabase.from("project_billing").update({ [field]: value } as any).eq("id", billingId)
    );
    setBillingRecord((prev: any) => ({ ...prev, [field]: value }));
  }

  function saveProductLine(idx: number, updates: Partial<ProductLine>) {
    const line = { ...productLines[idx], ...updates };
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
        supabase.from("project_billing_products").update(rest).eq("id", id));
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
        supabase.from("project_billing_sessions").update(rest).eq("id", id));
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
        supabase.from("project_billing_semen").update(rest).eq("id", id));
    }
  }

  async function saveWorksheetCell(rowId: string, field: "start_units" | "end_units", value: number | null) {
    setSessionInventory(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
    const { error } = await (supabase.from as any)("project_billing_session_inventory")
      .update({ [field]: value }).eq("id", rowId);
    if (error) toast({ title: "Failed to save", description: error.message, variant: "destructive" });
  }

  /* ── Add / remove helpers ── */

  async function addSession() {
    if (!billingId) return;
    const newLine: Omit<SessionLine, "id"> = {
      billing_id: billingId, session_date: format(new Date(), "yyyy-MM-dd"),
      session_label: "Additional Visit", time_of_day: null, head_count: null,
      crew: null, notes: null, sort_order: sessions.length,
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

  function swapProduct(idx: number, newProductId: string) {
    const prod = billingProducts.find(p => p.id === newProductId);
    if (!prod) return;
    saveProductLine(idx, {
      billing_product_id: prod.id, product_name: prod.product_name,
      product_category: prod.product_category, doses_per_unit: prod.doses_per_unit,
      unit_label: prod.unit_label, unit_price: prod.default_price,
    });
  }

  function toggleProductInvoiced(idx: number) {
    const nowInvoiced = !productLines[idx].invoiced;
    saveProductLine(idx, { invoiced: nowInvoiced, invoiced_at: nowInvoiced ? new Date().toISOString() : null });
  }
  function toggleSemenInvoiced(idx: number) {
    const nowInvoiced = !semenLines[idx].invoiced;
    saveSemenLine(idx, { invoiced: nowInvoiced, invoiced_at: nowInvoiced ? new Date().toISOString() : null });
  }

  /* ── Finalize inventory ── */
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
      toast({ title: "Inventory finalized", description: `${result.units_consumed ?? 0} units consumed across ${result.bulls_processed ?? 0} bull(s).` });
      const { data: refreshed } = await supabase.from("project_billing").select("*").eq("id", billingId).maybeSingle();
      if (refreshed) setBillingRecord(refreshed);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not finalize inventory.", variant: "destructive" });
    } finally { setFinalizing(false); }
  }

  /* ── Complete project ── */
  async function handleCompleteProject() {
    if (!projectId || !billingId) return;
    setCompleting(true);
    try {
      const { error: projErr } = await supabase.from("projects").update({ status: "Complete" }).eq("id", projectId);
      if (projErr) throw projErr;
      const userId = (await supabase.auth.getUser()).data.user?.id || null;
      const { error: billErr } = await (supabase.from("project_billing") as any)
        .update({ billing_completed_at: new Date().toISOString(), billing_completed_by: userId })
        .eq("id", billingId);
      if (billErr) throw billErr;
      toast({ title: "Project completed" });
      setProject((prev: any) => ({ ...prev, status: "Complete" }));
      setBillingRecord((prev: any) => ({ ...prev, billing_completed_at: new Date().toISOString() }));
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not complete project.", variant: "destructive" });
    } finally { setCompleting(false); }
  }

  /* ── Print PDF ── */
  function handlePrint() {
    if (!project || !billingRecord) return;
    const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
    const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
    const grandTotal = productsTotal + semenTotal;
    generateBillingSheetPdf(project, billingRecord, productLines, semenLines, sessions, [], {
      productsTotal, semenTotal, laborTotal: 0, grandTotal,
    }, sessionInventory);
    toast({ title: "PDF downloaded" });
  }

  /* ════════════════════ COMPUTED VALUES ════════════════════ */

  const currentStatus = billingRecord?.status || "in_process";
  const hasPack = projectPacks.length > 0;
  const packStatus = projectPacks[0]?.status || null;
  const isUnpacked = packStatus === "unpacked" || packStatus === "tank_returned";
  const isProjectComplete = project?.status === "Complete";
  const readOnly = isProjectComplete || currentStatus === "work_complete" || currentStatus === "invoiced_closed";

  const totalLines = productLines.length + semenLines.length + sessions.length;
  const allInvoiced = totalLines > 0 && [
    ...productLines.map(l => l.invoiced),
    ...semenLines.map(l => l.invoiced),
    ...sessions.map(l => l.invoiced),
  ].every(Boolean);

  const firstPack: any = projectPacks[0] || null;
  const packTankLabel = firstPack?.tanks
    ? (firstPack.tanks.tank_name || firstPack.tanks.tank_number || "") : "";

  /* ════════════════════ RENDER ════════════════════ */

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
            <Select value={currentStatus} onValueChange={(v) => saveBillingField("status", v)}
              disabled={readOnly && currentStatus !== "work_complete"}>
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
                  return <SelectItem key={s} value={s} disabled={disabled}>{STATUS_LABELS[s]}</SelectItem>;
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
                {isUnpacked
                  ? <Check className="h-4 w-4 text-emerald-600" />
                  : <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />}
                <span className="font-medium">{isUnpacked ? "Unpacked" : "Packed"}</span>
                {packTankLabel && <span className="text-muted-foreground">— Tank #{packTankLabel}</span>}
              </>
            ) : (
              <span className="text-muted-foreground">Not packed</span>
            )}
          </div>
          <div className="flex gap-2">
            {!hasPack && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => navigate(`/pack-tank?projectId=${projectId}`)}>
                <Package className="h-3.5 w-3.5 mr-1" /> Pack Tank
              </Button>
            )}
            {hasPack && firstPack && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => navigate(`/pack/${firstPack.id}`)}>View Pack</Button>
            )}
            {hasPack && !isUnpacked && firstPack && (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => navigate(`/unpack/${firstPack.id}`)}>
                <PackageOpen className="h-3.5 w-3.5 mr-1" /> Unpack Tank
              </Button>
            )}
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex gap-1 border-b border-border">
          {(["sessions", "billing"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {tab === "sessions" ? "Sessions" : "Billing"}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <fieldset disabled={readOnly} className="contents [&_button]:disabled:pointer-events-auto">
          {activeTab === "sessions" && (
            <SessionsTab
              sessions={sessions} productLines={productLines}
              sessionInventory={sessionInventory} billingProducts={billingProducts}
              readOnly={readOnly}
              onSaveSession={saveSessionLine} onSaveProduct={saveProductLine}
              onSwapProduct={swapProduct} onToggleProductInvoiced={toggleProductInvoiced}
              onAddSession={addSession} onRemoveSession={removeSession}
              onSaveWorksheetCell={saveWorksheetCell}
              onSetSessionInventory={setSessionInventory}
            />
          )}
          {activeTab === "billing" && (
            <BillingTab
              productLines={productLines} semenLines={semenLines}
              billingRecord={billingRecord} readOnly={readOnly}
              onSaveProduct={saveProductLine} onSaveSemen={saveSemenLine}
              onToggleProductInvoiced={toggleProductInvoiced}
              onToggleSemenInvoiced={toggleSemenInvoiced}
              onSaveBillingField={saveBillingField}
            />
          )}
        </fieldset>
      </main>

      {/* Save confirmation toast */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
            <Check className="h-4 w-4" /> Saved
          </div>
        </div>
      )}
      <AppFooter />
    </div>
  );
};

export default ProjectBilling;
