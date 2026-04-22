import { useState, useMemo } from "react";
import {
  format,
  subDays,
  addDays,
  startOfDay,
  endOfDay,
  isSameDay,
  parseISO,
} from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ClipboardList,
  Package,
  Truck,
  Activity,
  Printer,
  FilePlus2,
  ShoppingCart,
  CheckCircle2,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import ExportMenu from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { ExportConfig } from "@/lib/exports";

type Props = {
  orgId: string;
  onNavigateToTimeline?: () => void;
};

// ── Row types used by Part 2A-rendered sections ──
type InvoicedRow = {
  id: string;
  kind: "Project" | "Order";
  name: string;
  customer: string;
  invoice_numbers: string;
  date: string;
};
type CompletedProjectRow = {
  id: string;
  name: string;
  cattle_type: string;
  head_count: number;
  completed_at: string;
};
type NewProjectRow = {
  id: string;
  name: string;
  status: string;
  cattle_type: string;
  head_count: number;
  breeding_date: string;
  created_at: string;
};
type NewOrderRow = {
  id: string;
  order_type: string;
  customer_or_company: string;
  units: number;
  needed_by: string;
  created_at: string;
};

const WeeklySummary = ({ orgId, onNavigateToTimeline }: Props) => {
  // Rolling 7-day window, end-inclusive. Arrows step by 7 days.
  const [windowEnd, setWindowEnd] = useState(startOfDay(new Date()));
  const windowStart = useMemo(() => subDays(windowEnd, 6), [windowEnd]);
  const windowEndInclusive = useMemo(() => endOfDay(windowEnd), [windowEnd]);
  const isCurrentWeek = isSameDay(windowEnd, startOfDay(new Date()));
  const windowLabel = `${format(windowStart, "MMM d")} — ${format(windowEnd, "MMM d, yyyy")}`;
  const startIso = windowStart.toISOString();
  const endIso = windowEndInclusive.toISOString();
  const startDateOnly = format(windowStart, "yyyy-MM-dd");
  const endDateOnly = format(windowEnd, "yyyy-MM-dd");

  const stepBackward = () => setWindowEnd((d) => subDays(d, 7));
  const stepForward = () => {
    const next = addDays(windowEnd, 7);
    setWindowEnd(next > new Date() ? startOfDay(new Date()) : next);
  };
  const resetToCurrent = () => setWindowEnd(startOfDay(new Date()));

  // ── Query 1: Invoiced projects (project_billing.billing_completed_at in range) ──
  const { data: invoicedProjects = [] } = useQuery({
    queryKey: ["ws_invoiced_projects", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_billing")
        .select("id, billing_completed_at, catl_invoice_number, select_sires_invoice_number, projects(id, name)")
        .eq("organization_id", orgId)
        .gte("billing_completed_at", startIso)
        .lte("billing_completed_at", endIso)
        .order("billing_completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 2: Invoiced orders (semen_orders.invoiced_at in range) ──
  const { data: invoicedOrders = [] } = useQuery({
    queryKey: ["ws_invoiced_orders", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("semen_orders")
        .select("id, invoiced_at, order_type, placed_by, customers(name), semen_companies(name)")
        .eq("organization_id", orgId)
        .gte("invoiced_at", startIso)
        .lte("invoiced_at", endIso)
        .order("invoiced_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 3: Projects completed (projects.completed_at in range) ──
  const { data: completedProjects = [] } = useQuery({
    queryKey: ["ws_completed_projects", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
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

  // ── Query 4: New projects created (projects.created_at in range) ──
  const { data: newProjects = [] } = useQuery({
    queryKey: ["ws_new_projects", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("id, name, status, cattle_type, head_count, breeding_date, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 5: New orders created (both types; semen_orders.created_at in range) ──
  const { data: newOrders = [] } = useQuery({
    queryKey: ["ws_new_orders", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("semen_orders")
        .select("id, order_type, needed_by, created_at, customers(name), semen_companies(name), semen_order_items(units)")
        .eq("organization_id", orgId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 6: Packs packed in range (for Tanks Packed stat + Part 2B section) ──
  const { data: packsPacked = [] } = useQuery({
    queryKey: ["ws_packs_packed", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tank_packs")
        .select(`
          id, packed_at, pack_type, destination_name, status,
          field_tank:tanks!tank_packs_field_tank_id_fkey(tank_number, tank_name),
          tank_pack_projects(projects(id, name, cattle_type, breeding_date)),
          tank_pack_lines(units)
        `)
        .eq("organization_id", orgId)
        .gte("packed_at", startIso)
        .lte("packed_at", endIso)
        .order("packed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 7: Packs with unpacked_at or closed_at activity in range (Projects Worked On dedup) ──
  const { data: packsTouched = [] } = useQuery({
    queryKey: ["ws_packs_touched", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tank_packs")
        .select(`
          id, unpacked_at, closed_at, status,
          tank_pack_projects(projects(id, name, cattle_type, breeding_date))
        `)
        .eq("organization_id", orgId)
        .or(`and(unpacked_at.gte.${startIso},unpacked_at.lte.${endIso}),and(closed_at.gte.${startIso},closed_at.lte.${endIso})`);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 8: Shipments received (date-only column) ──
  const { data: shipments = [] } = useQuery({
    queryKey: ["ws_shipments", orgId, startDateOnly, endDateOnly],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shipments")
        .select("id, received_date, received_by, notes, customers(name), semen_companies(name)")
        .eq("organization_id", orgId)
        .eq("status", "confirmed")
        .gte("received_date", startDateOnly)
        .lte("received_date", endDateOnly)
        .order("received_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 9: Tank fills (date-only column) ──
  const { data: tankFills = [] } = useQuery({
    queryKey: ["ws_tank_fills", orgId, startDateOnly, endDateOnly],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tank_fills")
        .select("id, fill_date, fill_type, notes, tanks(tank_number, tank_name)")
        .eq("organization_id", orgId)
        .gte("fill_date", startDateOnly)
        .lte("fill_date", endDateOnly)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Query 10: Inventory events count (head-only for stat card) ──
  const { data: invEventsCount = 0 } = useQuery({
    queryKey: ["ws_inv_events_count", orgId, startIso, endIso],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("inventory_transactions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ── Query 11: Org members (for Part 2B shipment received_by label resolution) ──
  const { data: orgMembers = [] } = useQuery({
    queryKey: ["ws_org_members", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_org_members", {
        _organization_id: orgId,
      });
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        id: m.id as string,
        label: (m.email || m.invited_email || "Unknown member") as string,
      }));
    },
  });

  // Keep references so Part 2B's additive edits find them; silences unused warnings.
  void packsTouched;
  void shipments;
  void tankFills;
  void orgMembers;

  // ── Shape: Invoiced (project billings + invoiced orders, interleaved by date) ──
  const invoicedRows: InvoicedRow[] = useMemo(() => {
    const fromProjects: InvoicedRow[] = invoicedProjects.map((r: any) => ({
      id: `proj_${r.id}`,
      kind: "Project",
      name: r.projects?.name ?? "—",
      customer: "—",
      invoice_numbers:
        [r.catl_invoice_number, r.select_sires_invoice_number].filter(Boolean).join(" / ") || "—",
      date: r.billing_completed_at,
    }));
    const fromOrders: InvoicedRow[] = invoicedOrders.map((r: any) => ({
      id: `ord_${r.id}`,
      kind: "Order",
      name:
        r.order_type === "inventory"
          ? "Inventory order"
          : `Customer order`,
      customer: r.customers?.name ?? r.semen_companies?.name ?? "—",
      invoice_numbers: "—",
      date: r.invoiced_at,
    }));
    return [...fromProjects, ...fromOrders].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [invoicedProjects, invoicedOrders]);

  // ── Shape: Projects completed ──
  const completedProjectRows: CompletedProjectRow[] = useMemo(
    () =>
      completedProjects.map((p: any) => ({
        id: p.id,
        name: p.name ?? "—",
        cattle_type: p.cattle_type ?? "—",
        head_count: p.head_count ?? 0,
        completed_at: p.completed_at,
      })),
    [completedProjects],
  );

  // ── Shape: New projects ──
  const newProjectRows: NewProjectRow[] = useMemo(
    () =>
      newProjects.map((p: any) => ({
        id: p.id,
        name: p.name ?? "—",
        status: p.status ?? "—",
        cattle_type: p.cattle_type ?? "—",
        head_count: p.head_count ?? 0,
        breeding_date: p.breeding_date ?? "",
        created_at: p.created_at,
      })),
    [newProjects],
  );

  // ── Shape: New orders ──
  const newOrderRows: NewOrderRow[] = useMemo(
    () =>
      newOrders.map((o: any) => ({
        id: o.id,
        order_type: o.order_type ?? "—",
        customer_or_company:
          o.order_type === "inventory"
            ? o.semen_companies?.name ?? "—"
            : o.customers?.name ?? "—",
        units: (o.semen_order_items ?? []).reduce(
          (sum: number, li: any) => sum + (li.units ?? 0),
          0,
        ),
        needed_by: o.needed_by ?? "",
        created_at: o.created_at,
      })),
    [newOrders],
  );

  // ── Stat-card values (all 5 live) ──
  const invoicesCount = invoicedRows.length;
  const tanksPackedCount = packsPacked.length;
  const shipmentsCount = shipments.length;

  // Projects worked on = unique project IDs across packsPacked + packsTouched
  const projectsWorkedOnCount = useMemo(() => {
    const ids = new Set();
    for (const p of packsPacked) {
      for (const link of p.tank_pack_projects ?? []) {
        if (link?.projects?.id) ids.add(link.projects.id);
      }
    }
    for (const p of packsTouched) {
      for (const link of p.tank_pack_projects ?? []) {
        if (link?.projects?.id) ids.add(link.projects.id);
      }
    }
    return ids.size;
  }, [packsPacked, packsTouched]);

  // ── Export configs for the 4 rendered sections ──
  const invoicedConfig: ExportConfig<InvoicedRow> = {
    title: `Invoiced • ${windowLabel}`,
    filenameBase: "invoiced",
    columns: [
      { label: "Date", value: (r) => format(parseISO(r.date), "yyyy-MM-dd") },
      { label: "Kind", value: (r) => r.kind },
      { label: "Name", value: (r) => r.name },
      { label: "Customer", value: (r) => r.customer },
      { label: "Invoice #s", value: (r) => r.invoice_numbers },
    ],
  };
  const completedConfig: ExportConfig<CompletedProjectRow> = {
    title: `Projects completed • ${windowLabel}`,
    filenameBase: "projects_completed",
    columns: [
      { label: "Completed At", value: (r) => format(parseISO(r.completed_at), "yyyy-MM-dd") },
      { label: "Project", value: (r) => r.name },
      { label: "Type", value: (r) => r.cattle_type },
      { label: "Head", value: (r) => r.head_count },
    ],
  };
  const newProjectsConfig: ExportConfig<NewProjectRow> = {
    title: `New projects • ${windowLabel}`,
    filenameBase: "new_projects",
    columns: [
      { label: "Created At", value: (r) => format(parseISO(r.created_at), "yyyy-MM-dd") },
      { label: "Project", value: (r) => r.name },
      { label: "Status", value: (r) => r.status },
      { label: "Type", value: (r) => r.cattle_type },
      { label: "Head", value: (r) => r.head_count },
      { label: "Breeding Date", value: (r) => r.breeding_date },
    ],
  };
  const newOrdersConfig: ExportConfig<NewOrderRow> = {
    title: `New orders • ${windowLabel}`,
    filenameBase: "new_orders",
    columns: [
      { label: "Created At", value: (r) => format(parseISO(r.created_at), "yyyy-MM-dd") },
      { label: "Type", value: (r) => r.order_type },
      { label: "Customer / Company", value: (r) => r.customer_or_company },
      { label: "Units", value: (r) => r.units },
      { label: "Needed By", value: (r) => r.needed_by },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header: week picker + Print Week */}
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

        <Button variant="outline" size="sm" disabled>
          <Printer className="h-4 w-4 mr-2" />
          Print Week
        </Button>
      </div>

      {/* Five stat cards — all live in 2A */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Invoices" value={invoicesCount} delay={0} index={0} icon={DollarSign} />
        <StatCard title="Projects worked on" value={projectsWorkedOnCount} delay={50} index={1} icon={ClipboardList} />
        <StatCard title="Tanks packed" value={tanksPackedCount} delay={100} index={2} icon={Package} />
        <StatCard title="Shipments received" value={shipmentsCount} delay={150} index={3} icon={Truck} />
        <StatCard
          title="Inventory events"
          value={invEventsCount}
          delay={200}
          index={0}
          icon={Activity}
          onClick={onNavigateToTimeline}
        />
      </div>

      {/* ── Section 1: Invoiced (wired) ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Invoiced ({invoicedRows.length})
          </CardTitle>
          <ExportMenu config={invoicedConfig} rows={invoicedRows} />
        </CardHeader>
        <CardContent>
          {invoicedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing invoiced this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice #s</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {format(parseISO(r.date), "MMM d")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.kind}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.customer}</TableCell>
                    <TableCell className="text-muted-foreground">{r.invoice_numbers}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Projects completed (wired) ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Projects completed ({completedProjectRows.length})
          </CardTitle>
          <ExportMenu config={completedConfig} rows={completedProjectRows} />
        </CardHeader>
        <CardContent>
          {completedProjectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects marked Complete this week. (This column populates going forward.)
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Completed</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Head</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedProjectRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {format(parseISO(r.completed_at), "MMM d")}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.cattle_type}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.head_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: New projects created (wired) ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FilePlus2 className="h-4 w-4 text-muted-foreground" />
            New projects created ({newProjectRows.length})
          </CardTitle>
          <ExportMenu config={newProjectsConfig} rows={newProjectRows} />
        </CardHeader>
        <CardContent>
          {newProjectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new projects this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Head</TableHead>
                  <TableHead>Breeding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newProjectRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {format(parseISO(r.created_at), "MMM d")}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.cattle_type}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.head_count}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.breeding_date ? format(parseISO(r.breeding_date), "MMM d") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: New orders created (wired) ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            New orders created ({newOrderRows.length})
          </CardTitle>
          <ExportMenu config={newOrdersConfig} rows={newOrderRows} />
        </CardHeader>
        <CardContent>
          {newOrderRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new orders this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer / Company</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead>Needed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newOrderRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {format(parseISO(r.created_at), "MMM d")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.order_type}</Badge>
                    </TableCell>
                    <TableCell>{r.customer_or_company}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.units}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.needed_by ? format(parseISO(r.needed_by), "MMM d, yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Sections 5-8 placeholders — Part 2B wires these ── */}
      <SectionPlaceholder title="Projects worked on" marker="2B" />
      <SectionPlaceholder title="Tanks packed" marker="2B" />
      <SectionPlaceholder title="Tank fills" marker="2B" />
      <SectionPlaceholder title="Shipments received" marker="2B" />
    </div>
  );
};

const SectionPlaceholder = ({ title, marker }: { title: string; marker: string }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">Wired up in Part {marker}…</p>
    </CardContent>
  </Card>
);

export default WeeklySummary;
