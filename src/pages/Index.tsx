import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Beef, Calendar } from "lucide-react";

import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import ProjectsTable from "@/components/ProjectsTable";
import BulkActionToolbar from "@/components/BulkActionToolbar";
import NewProjectDialog from "@/components/NewProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { BreedingProject } from "@/data/mockData";

interface DbProject {
  id: string;
  name: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
}

const Index = () => {
  const [projects, setProjects] = useState<BreedingProject[]>([]);
  const [dbProjects, setDbProjects] = useState<DbProject[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [bullsByProject, setBullsByProject] = useState<Record<string, { name: string; units: number }[]>>({});

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setDbProjects(data as DbProject[]);
      const mapped: BreedingProject[] = data.map((p) => ({
        id: p.id,
        name: p.name,
        animalType: p.cattle_type === "Cows" ? "Cow" : "Heifer",
        protocol: p.protocol,
        headCount: p.head_count,
        startDate: p.breeding_date ?? "",
        breedDate: p.breeding_date ?? "",
        status: p.status === "Complete" ? "Completed" : p.status === "Confirmed" ? "Active" : "Scheduled",
        location: "",
      }));
      setProjects(mapped);

      // Fetch bulls for all projects
      const projectIds = data.map((p) => p.id);
      if (projectIds.length > 0) {
        const { data: bullsData } = await supabase
          .from("project_bulls")
          .select("project_id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name)")
          .in("project_id", projectIds);

        if (bullsData) {
          const map: Record<string, { name: string; units: number }[]> = {};
          for (const b of bullsData as any[]) {
            const pid = b.project_id;
            if (!map[pid]) map[pid] = [];
            const name = b.bulls_catalog?.bull_name || b.custom_bull_name || "Unknown";
            map[pid].push({ name, units: b.units });
          }
          setBullsByProject(map);
        }
      }
    }
  }, []);

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

  // Bulls in use: count distinct catalog IDs + distinct custom names
  const bullsInUse = useMemo(() => {
    const catalogIds = new Set<string>();
    const customNames = new Set<string>();
    for (const bulls of Object.values(bullsByProject)) {
      for (const b of bulls) {
        // We stored name from catalog or custom — use name as unique key
        customNames.add(b.name);
      }
    }
    return catalogIds.size + customNames.size;
  }, [bullsByProject]);

  // Breeding season date range
  const breedingDateRange = useMemo(() => {
    const dates = dbProjects
      .map((p) => p.breeding_date)
      .filter((d): d is string => !!d)
      .sort();
    if (dates.length === 0) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    return { first, last, same: first === last };
  }, [dbProjects]);

  const breedingSeasonContent = breedingDateRange ? (
    breedingDateRange.same ? (
      <div>
        <p className="text-xs text-white/70 font-medium">Breeding Date:</p>
        <p className="text-xl font-bold font-display text-white">{format(parseISO(breedingDateRange.first), "MMM d, yyyy")}</p>
      </div>
    ) : (
      <div className="space-y-1">
        <div>
          <p className="text-xs text-white/70 font-medium">First Breed:</p>
          <p className="text-lg font-bold font-display text-white">{format(parseISO(breedingDateRange.first), "MMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-xs text-white/70 font-medium">Last Breed:</p>
          <p className="text-lg font-bold font-display text-white">{format(parseISO(breedingDateRange.last), "MMM d, yyyy")}</p>
        </div>
      </div>
    )
  ) : (
    <p className="text-lg font-bold font-display text-white/50">No dates set</p>
  );

  return (
    <div className="min-h-screen">
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Projects" value={totalProjects} subtitle={`${totalProjects} projects`} delay={0} index={0} />
          <StatCard title="Total Head" value={totalHead} subtitle="across all projects" delay={100} index={1} />
          <StatCard title="Bulls in Use" value={bullsInUse} subtitle="across all projects" delay={200} index={2} icon={Beef} />
          <StatCard title="Breeding Season" customContent={breedingSeasonContent} subtitle="active project range" delay={300} index={3} icon={Calendar} />
        </div>
        {selectedProjects.length > 0 && (
          <BulkActionToolbar
            selectedProjects={selectedProjects}
            onClear={() => setSelectedIds(new Set())}
            onComplete={() => {
              setSelectedIds(new Set());
              fetchProjects();
            }}
          />
        )}
        <ProjectsTable
          projects={projects}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bullsByProject={bullsByProject}
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
