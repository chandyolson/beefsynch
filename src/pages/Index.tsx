import { useState, useEffect, useCallback } from "react";
import { FolderKanban, Users, Beef, MilkOff } from "lucide-react";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import ProjectsTable from "@/components/ProjectsTable";
import NewProjectDialog from "@/components/NewProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { BreedingProject } from "@/data/mockData";

const Index = () => {
  const [projects, setProjects] = useState<BreedingProject[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      // Map DB rows to the shape the table expects
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

  const totalProjects = projects.length;
  const totalHead = projects.reduce((sum, p) => sum + p.headCount, 0);
  const heiferProjects = projects.filter((p) => p.animalType === "Heifer").length;
  const cowProjects = projects.filter((p) => p.animalType === "Cow").length;

  return (
    <div className="min-h-screen">
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Projects" value={totalProjects} icon={FolderKanban} delay={0} />
          <StatCard title="Total Head" value={totalHead} icon={Users} delay={100} />
          <StatCard title="Heifer Projects" value={heiferProjects} icon={Beef} delay={200} />
          <StatCard title="Cow Projects" value={cowProjects} icon={MilkOff} delay={300} />
        </div>
        <ProjectsTable projects={projects} />
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
