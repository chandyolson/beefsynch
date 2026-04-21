import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, addDays, startOfDay } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, Package, AlertTriangle, DollarSign,
  Droplets, Truck, ChevronRight, Clock, CheckCircle2, XCircle,
} from "lucide-react";

interface HubTabProps {
  orgId: string;
  onSwitchTab: (tab: string, extra?: Record<string, string>) => void;
}

interface UpcomingProject {
  id: string;
  name: string;
  breeding_date: string;
  head_count: number;
  status: string;
  cattle_type: string;
  protocol: string;
  pack_id: string | null;
  pack_status: string | null;
  packed_units: number | null;
  bull_names: string[];
}

interface ActionCounts {
  pendingCustomerOrders: number;
  pendingCustomerUnits: number;
  pendingInventoryOrders: number;
  tanksOut: number;
  tankNames: string[];
  unbilledProjects: number;
  unbilledNames: string[];
  tanksDueForFill: number;
  shippedNotReceived: number;
  inventoryShortages: { projectName: string; projectId: string; bulls: { bullName: string; needed: number; available: number }[] }[];
}

const HubTab = ({ orgId, onSwitchTab }: HubTabProps) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<UpcomingProject[]>([]);
  const [actions, setActions] = useState<ActionCounts>({
    pendingCustomerOrders: 0, pendingCustomerUnits: 0,
    pendingInventoryOrders: 0, tanksOut: 0, tankNames: [],
    unbilledProjects: 0, unbilledNames: [],
    tanksDueForFill: 0, shippedNotReceived: 0,
    inventoryShortages: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const day14 = format(addDays(new Date(), 14), "yyyy-MM-dd");

      // 1. Upcoming projects (14 days)
      const { data: projData } = await supabase
        .from("projects")
        .select("id, name, breeding_date, head_count, status, cattle_type, protocol")
        .eq("organization_id", orgId)
        .neq("status", "Complete")
        .gte("breeding_date", today)
        .lte("breeding_date", day14)
        .order("breeding_date");

      const projectsWithPacks: UpcomingProject[] = [];
      if (projData) {
        const projIds = (projData as any[]).map((p) => p.id);
        const { data: packLinks } = await supabase
          .from("tank_pack_projects")
          .select("project_id, tank_pack_id, tank_packs(id, status, tank_pack_lines(units))")
          .in("project_id", projIds.length > 0 ? projIds : ["00000000-0000-0000-0000-000000000000"]);

        const packMap = new Map<string, { pack_id: string; pack_status: string; packed_units: number }>();
        if (packLinks) {
          for (const link of packLinks as any[]) {
            const tp = link.tank_packs;
            if (tp) {
              const units = (tp.tank_pack_lines || []).reduce((s: number, l: any) => s + (l.units || 0), 0);
              packMap.set(link.project_id, { pack_id: tp.id, pack_status: tp.status, packed_units: units });
            }
          }
        }

        // Fetch bull names for all upcoming projects
        const bullNameMap = new Map<string, string[]>();
        if (projIds.length > 0) {
          const { data: projBullsData } = await supabase
            .from("project_bulls")
            .select("project_id, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name)")
            .in("project_id", projIds);
          if (projBullsData) {
            for (const pb of projBullsData as any[]) {
              const name = pb.bulls_catalog?.bull_name || pb.custom_bull_name || "Unknown";
              const existing = bullNameMap.get(pb.project_id) || [];
              if (!existing.includes(name)) existing.push(name);
              bullNameMap.set(pb.project_id, existing);
            }
          }
        }

        for (const p of projData as any[]) {
          const pack = packMap.get(p.id);
          projectsWithPacks.push({
            ...p,
            pack_id: pack?.pack_id || null,
            pack_status: pack?.pack_status || null,
            packed_units: pack?.packed_units ?? null,
            bull_names: bullNameMap.get(p.id) || [],
          });
        }
      }
      setProjects(projectsWithPacks);

      // 2. Action counts
      const { data: custOrders } = await supabase
        .from("semen_orders")
        .select("id, semen_order_items(units)")
        .eq("organization_id", orgId)
        .eq("order_type", "customer")
        .not("fulfillment_status", "in", '("delivered","cancelled")');

      const pendingCustCount = custOrders?.length || 0;
      const pendingCustUnits = (custOrders || []).reduce((s: number, o: any) =>
        s + (o.semen_order_items || []).reduce((s2: number, i: any) => s2 + (i.units || 0), 0), 0);

      const { data: invOrders } = await supabase
        .from("semen_orders")
        .select("id")
        .eq("organization_id", orgId)
        .eq("order_type", "inventory")
        .not("fulfillment_status", "in", '("delivered","cancelled")');

      const { data: tanksOutData } = await supabase
        .from("tank_packs")
        .select("id, field_tank_id, tanks!tank_packs_field_tank_id_fkey(tank_number, tank_name)")
        .eq("organization_id", orgId)
        .not("status", "in", '("unpacked","tank_returned","cancelled")');

      const tankNames = (tanksOutData || []).map((t: any) => {
        const tank = t.tanks;
        return tank ? `${tank.tank_number}${tank.tank_name ? " " + tank.tank_name : ""}` : "Unknown";
      });

      const { data: unbilled } = await supabase
        .from("projects")
        .select("id, name, project_billing(billing_completed_at)")
        .eq("organization_id", orgId)
        .eq("status", "Complete");

      const unbilledList = (unbilled || []).filter((p: any) => {
        const billing = Array.isArray(p.project_billing) ? p.project_billing[0] : p.project_billing;
        return !billing?.billing_completed_at;
      });

      // Tanks on site (status not 'shipped_out' / 'picked_up' style)
      const { data: fillData } = await supabase
        .from("tanks")
        .select("id, status")
        .eq("organization_id", orgId);
      const wetHere = (fillData || []).filter((t: any) =>
        !["shipped_out", "picked_up", "out", "with_customer"].includes(t.status)
      ).length;

      // 3. Inventory shortage check for upcoming unpacked projects
      const unpackedProjects = projectsWithPacks.filter(p => !p.pack_id);
      const shortages: ActionCounts["inventoryShortages"] = [];

      if (unpackedProjects.length > 0) {
        const unpackedIds = unpackedProjects.map(p => p.id);
        const { data: projBulls } = await supabase
          .from("project_bulls")
          .select("project_id, bull_catalog_id, custom_bull_name, units")
          .in("project_id", unpackedIds);

        if (projBulls && projBulls.length > 0) {
          // Get all bull_catalog_ids we need to check
          const catalogIds = (projBulls as any[])
            .map(pb => pb.bull_catalog_id)
            .filter(Boolean);

          // Sum available inventory per bull from tanks that are here
          const { data: hereTanks } = await (supabase as any)
            .from("tanks")
            .select("id")
            .eq("organization_id", orgId)
            .eq("location_status", "here");
          const hereTankIds = (hereTanks || []).map((t: any) => t.id);

          const { data: invData } = await (supabase.from as any)("tank_inventory")
            .select("bull_catalog_id, units")
            .in("bull_catalog_id", catalogIds.length > 0 ? catalogIds : ["00000000-0000-0000-0000-000000000000"])
            .in("tank_id", hereTankIds.length > 0 ? hereTankIds : ["00000000-0000-0000-0000-000000000000"]);

          const availableByBull = new Map<string, number>();
          for (const inv of (invData || []) as any[]) {
            if (inv.bull_catalog_id) {
              availableByBull.set(inv.bull_catalog_id, (availableByBull.get(inv.bull_catalog_id) || 0) + (inv.units || 0));
            }
          }

          // Get bull names from catalog
          const { data: bullNames } = await supabase
            .from("bulls_catalog")
            .select("id, bull_name")
            .in("id", catalogIds.length > 0 ? catalogIds : ["00000000-0000-0000-0000-000000000000"]);
          const nameMap = new Map<string, string>();
          for (const b of (bullNames || []) as any[]) nameMap.set(b.id, b.bull_name);

          // Check each project
          for (const proj of unpackedProjects) {
            const bulls = (projBulls as any[]).filter(pb => pb.project_id === proj.id);
            const shortBulls: { bullName: string; needed: number; available: number }[] = [];

            for (const pb of bulls) {
              const needed = pb.units || 0;
              if (needed <= 0) continue;
              const available = pb.bull_catalog_id ? (availableByBull.get(pb.bull_catalog_id) || 0) : 0;
              if (available < needed) {
                shortBulls.push({
                  bullName: nameMap.get(pb.bull_catalog_id) || pb.custom_bull_name || "Unknown",
                  needed,
                  available,
                });
              }
            }

            if (shortBulls.length > 0) {
              shortages.push({ projectName: proj.name, projectId: proj.id, bulls: shortBulls });
            }
          }
        }
      }

      setActions({
        pendingCustomerOrders: pendingCustCount,
        pendingCustomerUnits: pendingCustUnits,
        pendingInventoryOrders: invOrders?.length || 0,
        tanksOut: tanksOutData?.length || 0,
        tankNames,
        unbilledProjects: unbilledList.length,
        unbilledNames: unbilledList.map((p: any) => p.name),
        tanksDueForFill: wetHere,
        shippedNotReceived: 0,
        inventoryShortages: shortages,
      });

      setLoading(false);
    };

    load();
  }, [orgId]);

  const today = startOfDay(new Date());
  const day7 = addDays(today, 7);

  const thisWeek = useMemo(() => projects.filter((p) => {
    const d = startOfDay(parseISO(p.breeding_date));
    return d >= today && d < day7;
  }), [projects]);

  const nextWeek = useMemo(() => projects.filter((p) => {
    const d = startOfDay(parseISO(p.breeding_date));
    return d >= day7;
  }), [projects]);

  const laborConflicts = useMemo(() => {
    const byDate = new Map<string, UpcomingProject[]>();
    for (const p of thisWeek) {
      const key = p.breeding_date;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(p);
    }
    return [...byDate.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([date, list]) => ({ date, count: list.length, totalHead: list.reduce((s, p) => s + p.head_count, 0) }));
  }, [thisWeek]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading hub…</div>;
  }

  const PackStatus = ({ project }: { project: UpcomingProject }) => {
    if (!project.pack_id) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> Not Packed
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-transparent">
        <CheckCircle2 className="h-3 w-3" /> Packed · {project.packed_units} units
      </Badge>
    );
  };

  const DaysUntil = ({ date }: { date: string }) => {
    const d = startOfDay(parseISO(date));
    const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return <Badge className="bg-primary text-primary-foreground">TODAY</Badge>;
    if (diff === 1) return <Badge variant="secondary">Tomorrow</Badge>;
    return <Badge variant="outline">{diff}d</Badge>;
  };

  return (
    <div className="space-y-8">
      {/* THIS WEEK */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold font-display">This Week</h2>
            <span className="text-xs text-muted-foreground">
              {format(today, "MMM d")} – {format(addDays(today, 6), "MMM d")}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {thisWeek.length} project{thisWeek.length !== 1 ? "s" : ""}
          </span>
        </div>

        {thisWeek.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No projects breeding this week.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {thisWeek.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer transition-colors hover:bg-secondary/40"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{p.name}</h3>
                        <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{format(parseISO(p.breeding_date), "EEE, MMM d")}</span>
                        <span>·</span>
                        <span>{p.protocol}</span>
                        <span>·</span>
                        <span>{p.cattle_type}</span>
                        <span>·</span>
                        <span>{p.head_count} hd</span>
                      </div>
                      {p.bull_names.length > 0 && (
                        <p className="mt-0.5 text-xs text-primary/80 truncate">
                          {p.bull_names.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PackStatus project={p} />
                      <DaysUntil date={p.breeding_date} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {laborConflicts.length > 0 && (
          <div className="space-y-2">
            {laborConflicts.map((c) => (
              <div
                key={c.date}
                className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {format(parseISO(c.date), "EEE, MMM d")}: {c.count} projects, {c.totalHead.toLocaleString()} total head — check labor
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* COMING UP */}
      {nextWeek.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold font-display">Coming Up</h2>
            <span className="text-xs text-muted-foreground">
              {format(day7, "MMM d")} – {format(addDays(today, 13), "MMM d")}
            </span>
          </div>
          <Card>
            <CardContent className="p-2">
              <div className="divide-y divide-border/50">
                {nextWeek.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-3 py-2 cursor-pointer hover:bg-secondary/40 rounded-md"
                    onClick={() => navigate(`/project/${p.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                        {format(parseISO(p.breeding_date), "EEE M/d")}
                      </span>
                      <span className="font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      {p.bull_names.length > 0 && (
                        <span className="text-primary/80 truncate max-w-[150px]">{p.bull_names.join(", ")}</span>
                      )}
                      <span>{p.head_count} hd</span>
                      <span>·</span>
                      <span>{p.cattle_type}</span>
                      {!p.pack_id && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                      {p.pack_id && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ACTION ITEMS */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold font-display">Action Items</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.pendingCustomerOrders > 0 && (
            <Card
              className="cursor-pointer border-destructive/40 bg-destructive/5 transition-colors hover:bg-destructive/10"
              onClick={() => onSwitchTab("orders")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.pendingCustomerOrders} customer order{actions.pendingCustomerOrders !== 1 ? "s" : ""} to fill
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {actions.pendingCustomerUnits.toLocaleString()} units to pack
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          {actions.inventoryShortages.length > 0 && (
            actions.inventoryShortages.map((shortage) => (
              <Card
                key={shortage.projectId}
                className="cursor-pointer border-destructive/40 bg-destructive/5 transition-colors hover:bg-destructive/10"
                onClick={() => navigate(`/project/${shortage.projectId}/billing`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">
                        {shortage.projectName} — semen short
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {shortage.bulls.map(b =>
                          `${b.bullName}: need ${b.needed}, have ${b.available}`
                        ).join("; ")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {actions.tanksOut > 0 && (
            <Card
              className="cursor-pointer border-amber-500/40 bg-amber-500/5 transition-colors hover:bg-amber-500/10"
              onClick={() => onSwitchTab("packing")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.tanksOut} tank{actions.tanksOut !== 1 ? "s" : ""} still out
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {actions.tankNames.join(", ")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          {actions.unbilledProjects > 0 && (
            <Card
              className="cursor-pointer border-amber-500/40 bg-amber-500/5 transition-colors hover:bg-amber-500/10"
              onClick={() => onSwitchTab("projects")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.unbilledProjects} project{actions.unbilledProjects !== 1 ? "s" : ""} need billing
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {actions.unbilledNames.join(", ")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          {actions.pendingInventoryOrders > 0 && (
            <Card
              className="cursor-pointer border-blue-500/40 bg-blue-500/5 transition-colors hover:bg-blue-500/10"
              onClick={() => onSwitchTab("receiving")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.pendingInventoryOrders} order{actions.pendingInventoryOrders !== 1 ? "s" : ""} awaiting shipment
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Company semen on the way
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          <Card
            className="cursor-pointer transition-colors hover:bg-secondary/40"
            onClick={() => onSwitchTab("tanks")}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Droplets className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">
                    {actions.tanksDueForFill} tank{actions.tanksDueForFill !== 1 ? "s" : ""} on site
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Check fills tab for overdue
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>

          {actions.pendingCustomerOrders === 0 && actions.tanksOut === 0 && actions.unbilledProjects === 0 && actions.pendingInventoryOrders === 0 && actions.inventoryShortages.length === 0 && (
            <Card className="border-emerald-500/40 bg-emerald-500/5 sm:col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="font-semibold text-sm">All caught up!</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
};

export default HubTab;
