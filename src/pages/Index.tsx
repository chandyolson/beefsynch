import { useState, useEffect, useCallback } from "react";

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
  const heiferProjects = projects.filter((p) => p.animalType === "Heifer").length;
  const cowProjects = projects.filter((p) => p.animalType === "Cow").length;

  return (
    <div className="min-h-screen">
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Projects" value={totalProjects} subtitle={`${totalProjects} projects`} delay={0} index={0} />
          <StatCard title="Total Head" value={totalHead} subtitle="across all projects" delay={100} index={1} />
          <StatCard title="Heifer Projects" value={heiferProjects} subtitle={`${heiferProjects} projects`} delay={200} index={2} />
          <StatCard title="Cow Projects" value={cowProjects} subtitle={`${cowProjects} projects`} delay={300} index={3} />
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
