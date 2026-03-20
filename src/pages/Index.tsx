import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, differenceInDays } from "date-fns";
import { Beef, Calendar, Star } from "lucide-react";

import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import ProjectsTable from "@/components/ProjectsTable";
import BulkActionToolbar from "@/components/BulkActionToolbar";
import NewProjectDialog from "@/components/NewProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { BreedingProject } from "@/data/mockData";
import { useBullFavorites } from "@/hooks/useBullFavorites";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useQuery } from "@tanstack/react-query";

interface DbProject {
  id: string;
  name: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  user_id: string | null;
  last_contacted_date: string | null;
}

const Index = () => {
  const navigate = useNavigate();
  const { userId, orgId, role: myRole } = useOrgRole();
  const [projects, setProjects] = useState<BreedingProject[]>([]);
  const [dbProjects, setDbProjects] = useState<DbProject[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAnonymous, setIsAnonymous] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(!user || !!user.is_anonymous);
    });
  }, []);

  const { favoritedIds } = useBullFavorites();

  // Fetch catalog bulls for favorite chips
  const { data: catalogBulls = [] } = useQuery({
    queryKey: ["bulls_catalog_all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bulls_catalog")
        .select("id, bull_name, company")
        .eq("active", true);
      return data ?? [];
    },
  });

  const favoriteBulls = useMemo(() => {
    return catalogBulls.filter((b) => favoritedIds.has(b.id));
  }, [catalogBulls, favoritedIds]);

  const [bullsByProject, setBullsByProject] = useState<Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]>>({});

  const fetchProjects = useCallback(async () => {
    let query = supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (orgId) {
      query = query.eq("organization_id", orgId);
    } else if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data } = await query;

    if (data) {
      setDbProjects(data as DbProject[]);
      const mapped: BreedingProject[] = data.map((p) => ({
        id: p.id,
        name: p.name,
        animalType: p.cattle_type === "Cows" ? "Cow" : "Heifer",
        protocol: p.protocol,
        headCount: p.head_count,
        startDate: "",
        breedDate: p.breeding_date ?? "",
        status: p.status as any,
        location: "",
        userId: p.user_id,
        lastContactedDate: p.last_contacted_date ?? null,
      }));
      setProjects(mapped);

      // Fetch earliest protocol event date per project
      const projectIds = data.map((p) => p.id);
      let earliestDateMap: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: eventsData } = await supabase
          .from("protocol_events")
          .select("project_id, event_date")
          .in("project_id", projectIds)
          .order("event_date", { ascending: true });

        if (eventsData) {
          for (const ev of eventsData) {
            if (!earliestDateMap[ev.project_id]) {
              earliestDateMap[ev.project_id] = ev.event_date;
            }
          }
        }
      }

      // Update startDate with earliest protocol event date
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          startDate: earliestDateMap[p.id] || p.startDate,
        }))
      );
      if (projectIds.length > 0) {
        const { data: bullsData } = await supabase
          .from("project_bulls")
          .select("project_id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name, registration_number, breed)")
          .in("project_id", projectIds);

        if (bullsData) {
          const map: Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]> = {};
          for (const b of bullsData as any[]) {
            const pid = b.project_id;
            if (!map[pid]) map[pid] = [];
            const name = b.bulls_catalog?.bull_name || b.custom_bull_name || "Unknown";
            const regNum = b.bulls_catalog?.registration_number || undefined;
            const breed = b.bulls_catalog?.breed || undefined;
            map[pid].push({ name, units: b.units, registrationNumber: regNum, breed });
          }
          setBullsByProject(map);
        }
      }
    }
  }, [orgId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const selectedProjects = dbProjects
    .filter((p) => selectedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      cattleType: p.cattle_type,
      protocol: p.protocol,
      breedingTime: p.breeding_time,
    }));

  const totalProjects = projects.length;
  const totalHead = projects.reduce((sum, p) => sum + p.headCount, 0);
  const heiferProjects = projects.filter((p) => p.animalType === "Heifer");
  const cowProjects = projects.filter((p) => p.animalType === "Cow");
  const heiferHead = heiferProjects.reduce((s, p) => s + p.headCount, 0);
  const cowHead = cowProjects.reduce((s, p) => s + p.headCount, 0);

  // Bulls stats
  const bullStats = useMemo(() => {
    const names = new Set<string>();
    const catalogIds = new Set<string>();
    let totalUnits = 0;
    for (const bulls of Object.values(bullsByProject)) {
      for (const b of bulls) {
        names.add(b.name);
        totalUnits += b.units;
      }
    }
    // We don't have catalog vs custom separation here, so catalogIds stays 0
    return { distinct: names.size, catalogCount: names.size, totalUnits };
  }, [bullsByProject]);

  // Breeding season
  const breedingSeason = useMemo(() => {
    const dates = dbProjects
      .map((p) => p.breeding_date)
      .filter((d): d is string => !!d)
      .sort();
    if (dates.length === 0) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const same = first === last;
    const span = same ? 1 : differenceInDays(parseISO(last), parseISO(first));
    return { first, last, same, span };
  }, [dbProjects]);

  return (
    <div className="min-h-screen">
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Projects"
            value={totalProjects}
            delay={0}
            index={0}
            breakdown={<>
              <p className="flex justify-between">Heifers <span style={{ color: "#5de8d0" }}>{heiferProjects.length} projects</span></p>
              <p className="flex justify-between">Cows <span style={{ color: "#5de8d0" }}>{cowProjects.length} projects</span></p>
            </>}
          />
          <StatCard
            title="Total Head"
            value={totalHead}
            delay={100}
            index={1}
            breakdown={<>
              <p className="flex justify-between">Heifers <span style={{ color: "#5de8d0" }}>{heiferHead} head</span></p>
              <p className="flex justify-between">Cows <span style={{ color: "#5de8d0" }}>{cowHead} head</span></p>
            </>}
          />
          <StatCard
            title="Bulls in Use"
            value={bullStats.distinct}
            delay={200}
            index={2}
            icon={Beef}
            breakdown={<>
              <p className="flex justify-between">Catalog Bulls <span style={{ color: "#5de8d0" }}>{bullStats.catalogCount}</span></p>
              <p className="flex justify-between">Total Units <span style={{ color: "#5de8d0" }}>{bullStats.totalUnits}</span></p>
            </>}
          />
          <StatCard
            title="Breeding Season"
            value={breedingSeason ? `${breedingSeason.span} day${breedingSeason.span !== 1 ? "s" : ""}` : "—"}
            delay={300}
            index={3}
            icon={Calendar}
            breakdown={breedingSeason ? (
              breedingSeason.same ? (
                <p className="flex justify-between">Date <span style={{ color: "#5de8d0" }}>{format(parseISO(breedingSeason.first), "MMM d, yyyy")}</span></p>
              ) : (<>
                <p className="flex justify-between">First <span style={{ color: "#5de8d0" }}>{format(parseISO(breedingSeason.first), "MMM d, yyyy")}</span></p>
                <p className="flex justify-between">Last <span style={{ color: "#5de8d0" }}>{format(parseISO(breedingSeason.last), "MMM d, yyyy")}</span></p>
              </>)
            ) : undefined}
          />
        </div>


        {selectedProjects.length > 0 && (
          <BulkActionToolbar
            selectedProjects={selectedProjects}
            onClear={() => setSelectedIds(new Set())}
            onComplete={() => {
              setSelectedIds(new Set());
              fetchProjects();
            }}
            canDelete={true}
          />
        )}
        <ProjectsTable
          projects={projects}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bullsByProject={bullsByProject}
          canEditAll={myRole === "owner" || myRole === "admin"}
          currentUserId={userId}
        />
      </main>
      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onProjectCreated={fetchProjects}
      />
    </div>
  );
};

export default Index;
