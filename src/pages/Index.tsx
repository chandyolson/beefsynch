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
          <StatCard title="Total Projects" value={totalProjects} delay={0} />
          <StatCard title="Total Head" value={totalHead} delay={100} />
          <StatCard title="Heifer Projects" value={heiferProjects} delay={200} />
          <StatCard title="Cow Projects" value={cowProjects} delay={300} />
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
