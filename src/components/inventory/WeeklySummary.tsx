import { useMemo, useState } from "react";
import {
  addDays,
  endOfDay,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";
import { useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Package,
  Printer,
  Snowflake,
  Truck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import StatCard from "@/components/StatCard";
import ExportMenu from "@/components/ExportMenu";
import type { ExportConfig } from "@/lib/exports";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  orgId: string;
  onNavigateToTimeline?: () => void;
};

/* ──────────────────────────────────────────────────────────
   Row shapes
   ────────────────────────────────────────────────────────── */

type InvoicedRow = {
  id: string;
  kind: "Project" | "Order";
  subject: string;
  invoice_numbers: string;
  date: string;
};

type CompletedProjectRow = {
  id: string;
  name: string;
  cattle_type: string | null;
  head_count: number | null;
  completed_at: string;
};

type NewProjectRow = {
  id: string;
  name: string;
  status: string;
  cattle_type: string | null;
  head_count: number | null;
  breeding_date: string | null;
  created_at: string;
};

type NewOrderRow = {
  id: string;
  order_type: string;
  customer: string;
  company: string;
  units: number;
  needed_by: string | null;
  created_at: string;
};

type ProjectWorkedOnRow = {
  project_id: string;
  project_name: string;
  activities: string;
};

type PackRow = {
  id: string;
  field_tank: string;
  destination: string;
  pack_type: string;
  bull_count: number;
  units: number;
  packed_at: string;
};

type FillRow = {
  id: string;
  tank: string;
  fill_type: string;
  notes: string;
  fill_date: string;
};

type ShipmentRow = {
  id: string;
  company: string;
  customer: string;
  received_by: string;
  received_date: string;
  notes: string;
};

const WeeklySummary = ({ orgId, onNavigateToTimeline }: Props) => {
  // ── Rolling 7-day window ──
  const [windowEnd, setWindowEnd] = useState<Date>(startOfDay(new Date()));
  const windowStart = useMemo(() => subDays(windowEnd, 6), [windowEnd]);
  const windowEndInclusive = useMemo(() => endOfDay(windowEnd), [windowEnd]);
  const isCurrentWeek = isSameDay(windowEnd, startOfDay(new Date()));
  const windowLabel = `${format(windowStart, "MMM d")} — ${format(windowEnd, "MMM d, yyyy")}`;

  const startIso = windowStart.toISOString();
  const endIso = windowEndInclusive.toISOString();
  const startDate = format(windowStart, "yyyy-MM-dd");
  const endDate = format(windowEnd, "yyyy-MM-dd");

  const stepBackward = () => setWindowEnd((d) => subDays(d, 7));
  const stepForward = () => {
    const next = addDays(windowEnd, 7);
    setWindowEnd(next > new Date() ? startOfDay(new Date()) : next);
  };
  const resetToCurrent = () => setWindowEnd(startOfDay(new Date()));

  /* ──────────────────────────────────────────────────────────
     11 queries
     ────────────────────────────────────────────────────────── */

  const { data: invoicedProjects = [] } = useQuery({
    queryKey: ["ws_invoiced_projects", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing")
        .select(
          "id, billing_completed_at, catl_invoice_number, select_sires_invoice_number, projects(id, name)",
        )
        .eq("organization_id", orgId)
        .gte("billing_completed_at", startIso)
        .lte("billing_completed_at", endIso)
        .order("billing_completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: invoicedOrders = [] } = useQuery({
    queryKey: ["ws_invoiced_orders", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select(
          "id, invoiced_at, order_type, placed_by, customers!semen_orders_customer_id_fkey(name), semen_companies!semen_orders_semen_company_id_fkey(name)",
        )
        .eq("organization_id", orgId)
        .gte("invoiced_at", startIso)
        .lte("invoiced_at", endIso)
        .order("invoiced_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: completedProjects = [] } = useQuery({
    queryKey: ["ws_completed_projects", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, cattle_type, head_count, completed_at")
        .eq("organization_id", orgId)
        .gte("completed_at", startIso)
        .lte("completed_at", endIso)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: newProjects = [] } = useQuery({
    queryKey: ["ws_new_projects", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, name, status, cattle_type, head_count, breeding_date, created_at",
        )
        .eq("organization_id", orgId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: newOrders = [] } = useQuery({
    queryKey: ["ws_new_orders", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select(
          "id, order_type, needed_by, created_at, customers!semen_orders_customer_id_fkey(name), semen_companies!semen_orders_semen_company_id_fkey(name), semen_order_items(units)",
        )
        .eq("organization_id", orgId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: packsPacked = [] } = useQuery({
    queryKey: ["ws_packs_packed", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select(
          `id, pack_type, destination_name, status, packed_at,
           field_tank:tanks!tank_packs_field_tank_id_fkey(tank_number, tank_name),
           tank_pack_projects(projects(id, name)),
           tank_pack_lines(units, bull_catalog_id)`,
        )
        .eq("organization_id", orgId)
        .gte("packed_at", startIso)
        .lte("packed_at", endIso)
        .order("packed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: packsTouched = [] } = useQuery({
    queryKey: ["ws_packs_touched", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select(
          `id, unpacked_at, closed_at,
           tank_pack_projects(projects(id, name))`,
        )
        .eq("organization_id", orgId)
        .or(
          `and(unpacked_at.gte.${startIso},unpacked_at.lte.${endIso}),and(closed_at.gte.${startIso},closed_at.lte.${endIso})`,
        );
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: tankFills = [] } = useQuery({
    queryKey: ["ws_tank_fills", orgId, startDate, endDate],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select(
          `id, fill_date, fill_type, notes,
           tanks(tank_number, tank_name)`,
        )
        .eq("organization_id", orgId)
        .gte("fill_date", startDate)
        .lte("fill_date", endDate)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: shipments = [] } = useQuery({
    queryKey: ["ws_shipments", orgId, startDate, endDate],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select(
          `id, received_date, received_by, notes,
           semen_companies!shipments_semen_company_id_fkey(name),
           customers!shipments_customer_id_fkey(name),
           semen_orders!shipments_semen_order_id_fkey(id, customers!semen_orders_customer_id_fkey(name))`,
        )
        .eq("organization_id", orgId)
        .eq("status", "confirmed")
        .gte("received_date", startDate)
        .lte("received_date", endDate)
        .order("received_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: inventoryEventCount = 0 } = useQuery({
    queryKey: ["ws_inv_events_count", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("inventory_transactions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: orgMembers = [] } = useQuery({
    queryKey: ["ws_org_members", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_org_members", {
        _organization_id: orgId,
      });
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        id: m.id as string,
        label: (m.email || m.invited_email || "Unknown member") as string,
      }));
    },
  });

  const memberLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of orgMembers as any[]) m.set(row.id, row.label);
    return m;
  }, [orgMembers]);

  /* ──────────────────────────────────────────────────────────
     Derived shapes — all 8 sections
     ────────────────────────────────────────────────────────── */

  const invoicedRows: InvoicedRow[] = useMemo(() => {
    const projectRows: InvoicedRow[] = (invoicedProjects as any[]).map((pb) => {
      const inv = [
        pb.catl_invoice_number ? `CATL ${pb.catl_invoice_number}` : null,
        pb.select_sires_invoice_number ? `Select ${pb.select_sires_invoice_number}` : null,
      ]
        .filter(Boolean)
        .join(" / ");
      return {
        id: `proj_${pb.id}`,
        kind: "Project" as const,
        subject: pb.projects?.name ?? "(unknown project)",
        invoice_numbers: inv || "—",
        date: pb.billing_completed_at,
      };
    });
    const orderRows: InvoicedRow[] = (invoicedOrders as any[]).map((o) => ({
      id: `ord_${o.id}`,
      kind: "Order" as const,
      subject: `${o.customers?.name ?? "(no customer)"} — ${o.semen_companies?.name ?? "(no company)"}`,
      invoice_numbers: "—",
      date: o.invoiced_at,
    }));
    return [...projectRows, ...orderRows].sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? ""),
    );
  }, [invoicedProjects, invoicedOrders]);

  const completedProjectRows: CompletedProjectRow[] = useMemo(
    () =>
      (completedProjects as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        cattle_type: p.cattle_type,
        head_count: p.head_count,
        completed_at: p.completed_at,
      })),
    [completedProjects],
  );

  const newProjectRows: NewProjectRow[] = useMemo(
    () =>
      (newProjects as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        cattle_type: p.cattle_type,
        head_count: p.head_count,
        breeding_date: p.breeding_date,
        created_at: p.created_at,
      })),
    [newProjects],
  );

  const newOrderRows: NewOrderRow[] = useMemo(
    () =>
      (newOrders as any[]).map((o) => {
        const units = (o.semen_order_items ?? []).reduce(
          (sum: number, it: any) => sum + (it.units ?? 0),
          0,
        );
        return {
          id: o.id,
          order_type: o.order_type,
          customer: o.customers?.name ?? "—",
          company: o.semen_companies?.name ?? "—",
          units,
          needed_by: o.needed_by,
          created_at: o.created_at,
        };
      }),
    [newOrders],
  );

  // Projects worked on — dedup by project_id, label with activities
  const projectsWorkedOnRows: ProjectWorkedOnRow[] = useMemo(() => {
    const byProject = new Map<string, Set<string>>();
    const addActivity = (pid: string, pname: string, activity: string) => {
      const key = `${pid}::${pname}`;
      if (!byProject.has(key)) byProject.set(key, new Set());
      byProject.get(key)!.add(activity);
    };
    for (const p of packsPacked as any[]) {
      for (const tpp of p.tank_pack_projects ?? []) {
        if (tpp.projects?.id) {
          addActivity(tpp.projects.id, tpp.projects.name, "packed");
        }
      }
    }
    for (const p of packsTouched as any[]) {
      for (const tpp of p.tank_pack_projects ?? []) {
        if (tpp.projects?.id) {
          if (p.unpacked_at) addActivity(tpp.projects.id, tpp.projects.name, "unpacked");
          if (p.closed_at) addActivity(tpp.projects.id, tpp.projects.name, "closed");
        }
      }
    }
    const rows: ProjectWorkedOnRow[] = [];
    for (const [key, activities] of byProject) {
      const [project_id, project_name] = key.split("::");
      rows.push({
        project_id,
        project_name,
        activities: Array.from(activities).sort().join(", "),
      });
    }
    return rows.sort((a, b) => a.project_name.localeCompare(b.project_name));
  }, [packsPacked, packsTouched]);

  const packRows: PackRow[] = useMemo(
    () =>
      (packsPacked as any[]).map((p) => {
        const ft = p.field_tank;
        const fieldTankLabel = ft
          ? ft.tank_name
            ? `#${ft.tank_number} ${ft.tank_name}`
            : `#${ft.tank_number}`
          : "—";
        const projectDest =
          (p.tank_pack_projects ?? [])
            .map((tpp: any) => tpp.projects?.name)
            .filter(Boolean)
            .join(", ") || null;
        const destination = projectDest ?? p.destination_name ?? "—";
        const bullIds = new Set(
          (p.tank_pack_lines ?? [])
            .map((l: any) => l.bull_catalog_id)
            .filter(Boolean),
        );
        const totalUnits = (p.tank_pack_lines ?? []).reduce(
          (sum: number, l: any) => sum + (l.units ?? 0),
          0,
        );
        return {
          id: p.id,
          field_tank: fieldTankLabel,
          destination,
          pack_type: p.pack_type ?? "—",
          bull_count: bullIds.size,
          units: totalUnits,
          packed_at: p.packed_at,
        };
      }),
    [packsPacked],
  );

  const fillRows: FillRow[] = useMemo(
    () =>
      (tankFills as any[]).map((f) => ({
        id: f.id,
        tank: f.tanks
          ? f.tanks.tank_name
            ? `#${f.tanks.tank_number} ${f.tanks.tank_name}`
            : `#${f.tanks.tank_number}`
          : "—",
        fill_type: f.fill_type ?? "—",
        notes: f.notes ?? "",
        fill_date: f.fill_date,
      })),
    [tankFills],
  );

  const shipmentRows: ShipmentRow[] = useMemo(
    () =>
      (shipments as any[]).map((s) => {
        const customerFromOrder = s.semen_orders?.customers?.name ?? null;
        const directCustomer = s.customers?.name ?? null;
        return {
          id: s.id,
          company: s.semen_companies?.name ?? "—",
          customer: customerFromOrder ?? directCustomer ?? "—",
          received_by: s.received_by ? memberLabelById.get(s.received_by) ?? "—" : "—",
          received_date: s.received_date,
          notes: s.notes ?? "",
        };
      }),
    [shipments, memberLabelById],
  );

  /* ──────────────────────────────────────────────────────────
     ExportConfig per section
     ────────────────────────────────────────────────────────── */

  const invoicedExport: ExportConfig<InvoicedRow> = {
    title: "Invoiced this week",
    subtitle: windowLabel,
    filenameBase: "weekly_invoiced",
    columns: [
      { label: "Type", value: (r) => r.kind },
      { label: "Subject", value: (r) => r.subject },
      { label: "Invoice #s", value: (r) => r.invoice_numbers },
      { label: "Date", value: (r) => format(parseISO(r.date), "yyyy-MM-dd") },
    ],
  };

  const completedExport: ExportConfig<CompletedProjectRow> = {
    title: "Projects completed this week",
    subtitle: windowLabel,
    filenameBase: "weekly_completed_projects",
    columns: [
      { label: "Project", value: (r) => r.name },
      { label: "Type", value: (r) => r.cattle_type ?? "—" },
      { label: "Head", value: (r) => r.head_count ?? 0 },
      { label: "Completed", value: (r) => format(parseISO(r.completed_at), "yyyy-MM-dd") },
    ],
  };

  const workedOnExport: ExportConfig<ProjectWorkedOnRow> = {
    title: "Projects worked on this week",
    subtitle: windowLabel,
    filenameBase: "weekly_projects_worked_on",
    columns: [
      { label: "Project", value: (r) => r.project_name },
      { label: "Activities", value: (r) => r.activities },
    ],
  };

  const newProjectsExport: ExportConfig<NewProjectRow> = {
    title: "New projects created this week",
    subtitle: windowLabel,
    filenameBase: "weekly_new_projects",
    columns: [
      { label: "Project", value: (r) => r.name },
      { label: "Status", value: (r) => r.status },
      { label: "Type", value: (r) => r.cattle_type ?? "—" },
      { label: "Head", value: (r) => r.head_count ?? 0 },
      { label: "Breeding Date", value: (r) => r.breeding_date ?? "—" },
      { label: "Created", value: (r) => format(parseISO(r.created_at), "yyyy-MM-dd") },
    ],
  };

  const newOrdersExport: ExportConfig<NewOrderRow> = {
    title: "New orders created this week",
    subtitle: windowLabel,
    filenameBase: "weekly_new_orders",
    columns: [
      { label: "Type", value: (r) => r.order_type },
      { label: "Customer", value: (r) => r.customer },
      { label: "Company", value: (r) => r.company },
      { label: "Units", value: (r) => r.units },
      { label: "Needed By", value: (r) => r.needed_by ?? "—" },
      { label: "Created", value: (r) => format(parseISO(r.created_at), "yyyy-MM-dd") },
    ],
  };

  const packsExport: ExportConfig<PackRow> = {
    title: "Tanks packed this week",
    subtitle: windowLabel,
    filenameBase: "weekly_tanks_packed",
    columns: [
      { label: "Field Tank", value: (r) => r.field_tank },
      { label: "Destination", value: (r) => r.destination },
      { label: "Type", value: (r) => r.pack_type },
      { label: "Bulls", value: (r) => r.bull_count },
      { label: "Units", value: (r) => r.units },
      { label: "Packed", value: (r) => format(parseISO(r.packed_at), "yyyy-MM-dd") },
    ],
  };

  const fillsExport: ExportConfig<FillRow> = {
    title: "Tank fills this week",
    subtitle: windowLabel,
    filenameBase: "weekly_tank_fills",
    columns: [
      { label: "Tank", value: (r) => r.tank },
      { label: "Fill Type", value: (r) => r.fill_type },
      { label: "Notes", value: (r) => r.notes },
      { label: "Date", value: (r) => r.fill_date },
    ],
  };

  const shipmentsExport: ExportConfig<ShipmentRow> = {
    title: "Shipments received this week",
    subtitle: windowLabel,
    filenameBase: "weekly_shipments",
    columns: [
      { label: "Company", value: (r) => r.company },
      { label: "Customer", value: (r) => r.customer },
      { label: "Received By", value: (r) => r.received_by },
      { label: "Received", value: (r) => r.received_date },
      { label: "Notes", value: (r) => r.notes },
    ],
  };

  /* ──────────────────────────────────────────────────────────
     Print Week — single PDF with all 8 sections
     ────────────────────────────────────────────────────────── */

  function printWeek() {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Weekly Summary", margin, 48);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(windowLabel, margin, 66);
    doc.text(`BeefSynch • ${format(new Date(), "MMM d, yyyy")}`, pageWidth - margin, 48, {
      align: "right",
    });
    doc.setTextColor(0);

    let cursorY = 90;

    const addSection = (
      title: string,
      head: string[][],
      body: (string | number)[][],
    ) => {
      if (cursorY > 680) {
        doc.addPage();
        cursorY = 48;
      }
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`${title} (${body.length})`, margin, cursorY);
      cursorY += 8;
      if (body.length === 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(120);
        doc.text("Nothing during this window.", margin, cursorY + 12);
        doc.setTextColor(0);
        cursorY += 28;
        return;
      }
      autoTable(doc, {
        head,
        body,
        startY: cursorY + 4,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [38, 70, 83], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 20;
    };

    addSection(
      "Invoiced",
      [["Type", "Subject", "Invoice #s", "Date"]],
      invoicedRows.map((r) => [
        r.kind,
        r.subject,
        r.invoice_numbers,
        format(parseISO(r.date), "MMM d"),
      ]),
    );

    addSection(
      "Projects completed",
      [["Project", "Type", "Head", "Completed"]],
      completedProjectRows.map((r) => [
        r.name,
        r.cattle_type ?? "—",
        r.head_count ?? 0,
        format(parseISO(r.completed_at), "MMM d"),
      ]),
    );

    addSection(
      "Projects worked on",
      [["Project", "Activities"]],
      projectsWorkedOnRows.map((r) => [r.project_name, r.activities]),
    );

    addSection(
      "New projects created",
      [["Project", "Status", "Type", "Head", "Breeding", "Created"]],
      newProjectRows.map((r) => [
        r.name,
        r.status,
        r.cattle_type ?? "—",
        r.head_count ?? 0,
        r.breeding_date ?? "—",
        format(parseISO(r.created_at), "MMM d"),
      ]),
    );

    addSection(
      "New orders created",
      [["Type", "Customer", "Company", "Units", "Needed By", "Created"]],
      newOrderRows.map((r) => [
        r.order_type,
        r.customer,
        r.company,
        r.units,
        r.needed_by ?? "—",
        format(parseISO(r.created_at), "MMM d"),
      ]),
    );

    addSection(
      "Tanks packed",
      [["Field Tank", "Destination", "Type", "Bulls", "Units", "Packed"]],
      packRows.map((r) => [
        r.field_tank,
        r.destination,
        r.pack_type,
        r.bull_count,
        r.units,
        format(parseISO(r.packed_at), "MMM d"),
      ]),
    );

    addSection(
      "Tank fills",
      [["Tank", "Fill Type", "Notes", "Date"]],
      fillRows.map((r) => [r.tank, r.fill_type, r.notes, r.fill_date]),
    );

    addSection(
      "Shipments received",
      [["Company", "Customer", "Received By", "Received"]],
      shipmentRows.map((r) => [r.company, r.customer, r.received_by, r.received_date]),
    );

    doc.save(
      `weekly_summary_${format(windowStart, "yyyyMMdd")}_${format(windowEnd, "yyyyMMdd")}.pdf`,
    );
  }

  /* ──────────────────────────────────────────────────────────
     Render
     ────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header: week picker + Print Week (enabled) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={stepBackward} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium tabular-nums min-w-[180px] text-center">
            {windowLabel}
          </p>
          <Button
            variant="outline"
            size="icon"
            onClick={stepForward}
            disabled={isCurrentWeek}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={resetToCurrent}>
              This Week
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={printWeek}>
          <Printer className="h-4 w-4 mr-2" />
          Print Week
        </Button>
      </div>

      {/* Five stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Invoices" value={invoicedRows.length} delay={0} index={0} icon={DollarSign} />
        <StatCard title="Projects worked on" value={projectsWorkedOnRows.length} delay={50} index={1} icon={ClipboardList} />
        <StatCard title="Tanks packed" value={packRows.length} delay={100} index={2} icon={Package} />
        <StatCard title="Shipments received" value={shipmentRows.length} delay={150} index={3} icon={Truck} />
        <StatCard
          title="Inventory events"
          value={inventoryEventCount}
          delay={200}
          index={0}
          icon={Activity}
          onClick={onNavigateToTimeline}
        />
      </div>

      {/* Section 1 — Invoiced */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Invoiced ({invoicedRows.length})
          </CardTitle>
          <ExportMenu config={invoicedExport} rows={invoicedRows} />
        </CardHeader>
        <CardContent>
          {invoicedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing invoiced during this window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Invoice #s</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.kind}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.subject}</TableCell>
                    <TableCell className="text-muted-foreground">{r.invoice_numbers}</TableCell>
                    <TableCell>{format(parseISO(r.date), "MMM d")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Projects completed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Projects completed ({completedProjectRows.length})
          </CardTitle>
          <ExportMenu config={completedExport} rows={completedProjectRows} />
        </CardHeader>
        <CardContent>
          {completedProjectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects marked Complete during this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedProjectRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.cattle_type ?? "—"}</TableCell>
                    <TableCell>{r.head_count ?? 0}</TableCell>
                    <TableCell>{format(parseISO(r.completed_at), "MMM d")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Projects worked on */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Projects worked on ({projectsWorkedOnRows.length})
          </CardTitle>
          <ExportMenu config={workedOnExport} rows={projectsWorkedOnRows} />
        </CardHeader>
        <CardContent>
          {projectsWorkedOnRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No packing or unpacking activity this week.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Activities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectsWorkedOnRows.map((r) => (
                  <TableRow key={r.project_id}>
                    <TableCell className="font-medium">{r.project_name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {r.activities}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 4 — New projects created */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            New projects created ({newProjectRows.length})
          </CardTitle>
          <ExportMenu config={newProjectsExport} rows={newProjectRows} />
        </CardHeader>
        <CardContent>
          {newProjectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects created during this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Breeding Date</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newProjectRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.cattle_type ?? "—"}</TableCell>
                    <TableCell>{r.head_count ?? 0}</TableCell>
                    <TableCell>{r.breeding_date ?? "—"}</TableCell>
                    <TableCell>{format(parseISO(r.created_at), "MMM d")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 5 — New orders created */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            New orders created ({newOrderRows.length})
          </CardTitle>
          <ExportMenu config={newOrdersExport} rows={newOrderRows} />
        </CardHeader>
        <CardContent>
          {newOrderRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders created during this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Needed By</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newOrderRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.order_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.customer}</TableCell>
                    <TableCell>{r.company}</TableCell>
                    <TableCell>{r.units}</TableCell>
                    <TableCell>{r.needed_by ?? "—"}</TableCell>
                    <TableCell>{format(parseISO(r.created_at), "MMM d")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 6 — Tanks packed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-muted-foreground" />
            Tanks packed ({packRows.length})
          </CardTitle>
          <ExportMenu config={packsExport} rows={packRows} />
        </CardHeader>
        <CardContent>
          {packRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tanks packed during this window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field Tank</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bulls</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Packed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.field_tank}</TableCell>
                    <TableCell>{r.destination}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.pack_type}</Badge>
                    </TableCell>
                    <TableCell>{r.bull_count}</TableCell>
                    <TableCell>{r.units}</TableCell>
                    <TableCell>{format(parseISO(r.packed_at), "MMM d")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 7 — Tank fills */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Snowflake className="h-4 w-4 text-muted-foreground" />
            Tank fills ({fillRows.length})
          </CardTitle>
          <ExportMenu config={fillsExport} rows={fillRows} />
        </CardHeader>
        <CardContent>
          {fillRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tank fills during this window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tank</TableHead>
                  <TableHead>Fill Type</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fillRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.tank}</TableCell>
                    <TableCell className="capitalize">{r.fill_type}</TableCell>
                    <TableCell className="text-muted-foreground">{r.notes || "—"}</TableCell>
                    <TableCell>{r.fill_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 8 — Shipments received */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Shipments received ({shipmentRows.length})
          </CardTitle>
          <ExportMenu config={shipmentsExport} rows={shipmentRows} />
        </CardHeader>
        <CardContent>
          {shipmentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shipments received during this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Received By</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipmentRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.company}</TableCell>
                    <TableCell>{r.customer}</TableCell>
                    <TableCell className="text-muted-foreground">{r.received_by}</TableCell>
                    <TableCell>{r.received_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WeeklySummary;
